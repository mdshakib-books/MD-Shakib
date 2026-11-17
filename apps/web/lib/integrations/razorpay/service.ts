import crypto from "crypto";
import {
  getRazorpayClient,
  RazorpayConfigurationError,
  RazorpayDisabledError,
  resolveRazorpayExecution,
} from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { toPaise } from "@/lib/commerce/pricing";
import { sendOrderEmails } from "../resend/service";
import { logger } from "@/lib/logger";
import type { ServiceExecutionMode } from "@/lib/env/shared";

export { RazorpayConfigurationError, RazorpayDisabledError };

export type RefundLifecycleState =
  | "NOT_REQUIRED"
  | "PENDING"
  | "PROCESSING"
  | "PROCESSED"
  | "FAILED";

export function mapDbRefundStatusToLifecycle(status?: string | null): RefundLifecycleState {
  switch ((status || "").toLowerCase()) {
    case "not_required":
      return "NOT_REQUIRED";
    case "processing":
      return "PROCESSING";
    case "processed":
      return "PROCESSED";
    case "failed":
      return "FAILED";
    case "pending":
    default:
      return "PENDING";
  }
}

export class RazorpayTimeoutError extends Error {
  constructor(operation: string, timeoutMs: number) {
    super(`Razorpay ${operation} timed out after ${timeoutMs}ms.`);
    this.name = "RazorpayTimeoutError";
  }
}

const DEFAULT_RAZORPAY_TIMEOUT_MS = 10000;

async function withGatewayTimeout<T>(
  promise: Promise<T>,
  operation: string,
  timeoutMs = DEFAULT_RAZORPAY_TIMEOUT_MS
): Promise<T> {
  const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_RAZORPAY_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new RazorpayTimeoutError(operation, effectiveTimeout)),
          effectiveTimeout
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface CreatePaymentOrderResult {
  razorpayOrderId: string;
  amount: number; // in paise
  currency: string;
  keyId: string;
  orderId: string;
  attemptNumber?: number;
  reused?: boolean;
  mode?: Exclude<ServiceExecutionMode, "disabled">;
  isMock?: boolean;
}

export interface CreatePaymentOrderOptions {
  forceNewAttempt?: boolean;
  idempotencyKey?: string;
  adminDb?: any;
  razorpayClient?: any;
  timeoutMs?: number;
}

export interface VerifySignatureParams {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  userId?: string;
}

/**
 * Creates (or safely reuses) a Razorpay payment order for an eligible pending application order.
 * Strictly derives the payment amount from the database record to prevent client tampering,
 * and serializes attempts via prepare_payment_attempt_atomic so parallel tabs never race.
 */
export async function createRazorpayOrder(
  orderId: string,
  userId: string,
  options: CreatePaymentOrderOptions = {}
): Promise<CreatePaymentOrderResult> {
  const { mode, config: razorpay } = resolveRazorpayExecution("order creation");
  const adminDb = options.adminDb || createAdminClient();
  const effectiveKeyId =
    mode === "mock" ? razorpay.keyId || "rzp_test_mock_dev_only" : razorpay.keyId;

  // 1. Reserve or reuse active attempt atomically inside PostgreSQL
  const { data: prepRes, error: prepErr } = await adminDb.rpc("prepare_payment_attempt_atomic", {
    p_order_id: orderId,
    p_user_id: userId,
    p_force_new_attempt: Boolean(options.forceNewAttempt),
  });

  if (prepErr) {
    throw new Error(prepErr.message || "Failed to prepare payment attempt.");
  }

  const prep = prepRes as any;
  if (!prep?.success) {
    throw new Error(prep?.error || "Order is not eligible for payment initiation.");
  }

  const amountInPaise = toPaise(Number(prep.amount));
  if (!Number.isFinite(amountInPaise) || amountInPaise <= 0) {
    throw new Error("Order payable amount must be greater than zero to initialize Razorpay checkout.");
  }
  const attemptNumber = Number(prep.attempt_number || 1);

  if (prep.action === "reuse" && prep.provider_order_id) {
    return {
      razorpayOrderId: prep.provider_order_id,
      amount: amountInPaise,
      currency: "INR",
      keyId: effectiveKeyId,
      orderId,
      attemptNumber,
      reused: true,
      mode,
      isMock: mode === "mock",
    };
  }

  // 2. Create Razorpay order via SDK or explicit dev/test mock mode (never silent fallback)
  let rzpOrderId: string;
  const receiptRef = attemptNumber > 1 ? `${orderId.slice(0, 32)}_a${attemptNumber}` : orderId;

  if (mode === "mock") {
    rzpOrderId = `order_mock_${Date.now()}_${attemptNumber}`;
    logger.info("[MOCK][Razorpay] Simulated Razorpay order created (no external API call)", {
      orderId,
      razorpayOrderId: rzpOrderId,
      attemptNumber,
      mode: "mock",
    });
  } else {
    const client = options.razorpayClient || getRazorpayClient();
    const rzpOrder = await withGatewayTimeout<any>(
      client.orders.create({
        amount: amountInPaise,
        currency: "INR",
        receipt: receiptRef,
        notes: {
          application_order_id: orderId,
          user_id: userId,
          attempt_number: String(attemptNumber),
        },
      }),
      "order creation",
      options.timeoutMs
    );

    if (!rzpOrder?.id || typeof rzpOrder.id !== "string" || !rzpOrder.id.trim()) {
      throw new Error("Razorpay order creation returned an invalid or empty order ID.");
    }

    if (rzpOrder.currency && String(rzpOrder.currency).toUpperCase() !== "INR") {
      throw new Error(`Razorpay order currency mismatch: expected INR, got ${rzpOrder.currency}.`);
    }

    if (rzpOrder.amount !== undefined && Number(rzpOrder.amount) !== amountInPaise) {
      throw new Error(
        `Razorpay order amount mismatch: expected ${amountInPaise} paise, got ${rzpOrder.amount}.`
      );
    }

    rzpOrderId = rzpOrder.id.trim();
  }

  // 3. Persist payment record cleanly (fail loudly on DB error — never orphan a Razorpay order)
  const { error: paymentError } = await adminDb.from("payments").insert({
    order_id: orderId,
    user_id: userId,
    payment_id: rzpOrderId,
    provider_order_id: rzpOrderId,
    idempotency_key: options.idempotencyKey || null,
    attempt_number: attemptNumber,
    is_active: true,
    amount: prep.amount,
    currency: "INR",
    provider: "Razorpay",
    status: "Pending",
  });

  if (paymentError) {
    throw new Error(`Failed to persist payment attempt record: ${paymentError.message}`);
  }

  await adminDb.from("payment_attempts").insert({
    order_id: orderId,
    user_id: userId,
    attempt_number: attemptNumber,
    payment_method: "ONLINE",
    idempotency_key: options.idempotencyKey || null,
    provider_order_id: rzpOrderId,
    status: "pending",
  });

  // 4. Sync active razorpay_order_id onto order
  const { error: orderUpdateErr } = await adminDb
    .from("orders")
    .update({ razorpay_order_id: rzpOrderId })
    .eq("id", orderId);

  if (orderUpdateErr) {
    throw new Error(`Failed to bind payment order to order ${orderId}: ${orderUpdateErr.message}`);
  }

  return {
    razorpayOrderId: rzpOrderId,
    amount: amountInPaise,
    currency: "INR",
    keyId: effectiveKeyId,
    orderId,
    attemptNumber,
    reused: false,
    mode,
    isMock: mode === "mock",
  };
}

/**
 * Validates the cryptographic HMAC SHA-256 signature from Razorpay.
 */
export function validateRazorpaySignature(
  razorpayOrderId: string,
  razorpayPaymentId: string,
  razorpaySignature: string,
  secret: string
): boolean {
  if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !secret) {
    return false;
  }

  const body = `${razorpayOrderId}|${razorpayPaymentId}`;
  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(razorpaySignature, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Verifies Razorpay payment signature and transitions order and payment records to 'Paid'.
 * Fully idempotent to prevent duplicate stock or status mutations.
 */
export async function verifyAndSettlePayment(
  params: VerifySignatureParams,
  options: { adminDb?: any; razorpayClient?: any; timeoutMs?: number } = {}
) {
  const { mode, config: razorpay } = resolveRazorpayExecution("payment verification");
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = params;

  const cleanOrderId = String(razorpay_order_id || "").trim();
  const cleanPaymentId = String(razorpay_payment_id || "").trim();
  const cleanSignature = String(razorpay_signature || "").trim();

  if (!cleanOrderId || !cleanPaymentId || !cleanSignature) {
    throw new Error("Missing required Razorpay verification parameters.");
  }

  const verificationSecret =
    mode === "mock"
      ? razorpay.keySecret || "dev_only_mock_razorpay_secret"
      : razorpay.keySecret;

  const isValid = validateRazorpaySignature(
    cleanOrderId,
    cleanPaymentId,
    cleanSignature,
    verificationSecret
  );

  if (!isValid) {
    throw new Error("Invalid Razorpay payment signature.");
  }

  const adminDb = options.adminDb || createAdminClient();

  // Resolve order directly or via payments.provider_order_id (supports multi-attempt retries)
  let order: any = null;
  const { data: directOrder } = await adminDb
    .from("orders")
    .select("id, user_id, payment_method, payment_status, total_amount, address_snapshot, is_paid")
    .eq("razorpay_order_id", cleanOrderId)
    .maybeSingle();

  order = directOrder;

  if (!order) {
    const { data: paymentMatch } = await adminDb
      .from("payments")
      .select("order_id")
      .eq("provider_order_id", cleanOrderId)
      .maybeSingle();

    if (paymentMatch?.order_id) {
      const { data: linkedOrder } = await adminDb
        .from("orders")
        .select("id, user_id, payment_method, payment_status, total_amount, address_snapshot, is_paid")
        .eq("id", paymentMatch.order_id)
        .maybeSingle();
      order = linkedOrder;
    }
  }

  if (!order) {
    throw new Error(`Order associated with Razorpay Order ID ${cleanOrderId} not found.`);
  }

  if (userId && order.user_id !== userId) {
    throw new Error("Unauthorized: Order does not belong to the authenticated user.");
  }

  if (String(order.payment_method || "").toUpperCase() !== "ONLINE") {
    throw new Error("Payment verification rejected: Order does not use Online Payment.");
  }

  const expectedPaise = toPaise(Number(order.total_amount));
  if (!Number.isFinite(expectedPaise) || expectedPaise <= 0) {
    throw new Error("Order payable amount is invalid for settlement.");
  }

  let providerEvidence: Record<string, unknown>;

  if (mode === "mock") {
    providerEvidence = {
      id: cleanPaymentId,
      order_id: cleanOrderId,
      currency: "INR",
      amount: expectedPaise,
      status: "captured",
      method: "mock_simulation",
      mode,
      is_mock: true,
    };
    logger.info("[MOCK][Razorpay] Simulated payment settlement verified", {
      orderId: order.id,
      razorpayOrderId: cleanOrderId,
      mode: "mock",
    });
  } else {
    // Fail-closed: require authoritative Razorpay capture confirmation before DB settlement
    const client = options.razorpayClient || getRazorpayClient();
    let remotePayment: any;
    try {
      remotePayment = await withGatewayTimeout(
        client.payments.fetch(cleanPaymentId),
        "payment fetch",
        options.timeoutMs
      );
    } catch (fetchErr: any) {
      throw new Error(
        `Authoritative Razorpay payment verification failed (${fetchErr?.message || "gateway unavailable"}). Settlement rejected.`
      );
    }

    if (!remotePayment || typeof remotePayment !== "object") {
      throw new Error("Authoritative Razorpay payment fetch returned an empty payload. Settlement rejected.");
    }

    if (remotePayment.id && String(remotePayment.id).trim() !== cleanPaymentId) {
      throw new Error(
        `Payment ID mismatch: expected ${cleanPaymentId}, gateway returned ${remotePayment.id}.`
      );
    }

    if (!remotePayment.order_id || String(remotePayment.order_id).trim() !== cleanOrderId) {
      throw new Error(
        `Payment order mismatch: Razorpay payment ${cleanPaymentId} belongs to ${remotePayment.order_id || "unknown"}, expected ${cleanOrderId}.`
      );
    }

    const remoteStatus = String(remotePayment.status || "").trim().toLowerCase();
    if (remoteStatus !== "captured") {
      throw new Error(
        `Payment ${cleanPaymentId} is not captured (gateway status: "${remoteStatus || "unknown"}"). Settlement rejected.`
      );
    }

    const remoteCurrency = String(remotePayment.currency || "").trim().toUpperCase();
    if (remoteCurrency !== "INR") {
      throw new Error(
        `Payment currency mismatch: expected INR, gateway returned "${remoteCurrency || "NONE"}".`
      );
    }

    const remoteAmountPaise = Number(remotePayment.amount);
    if (!Number.isFinite(remoteAmountPaise) || remoteAmountPaise !== expectedPaise) {
      throw new Error(
        `Payment amount mismatch: expected ${expectedPaise} paise, gateway returned ${remotePayment.amount}.`
      );
    }

    providerEvidence = remotePayment as unknown as Record<string, unknown>;
  }

  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: cleanOrderId,
    p_razorpay_payment_id: cleanPaymentId,
    p_signature: cleanSignature,
    p_raw_response: providerEvidence as any,
  });

  if (rpcErr) {
    throw new Error(`Atomic settlement failed: ${rpcErr.message}`);
  }

  const result = rpcRes as any;
  if (!result?.success) {
    throw new Error(result?.message || "Failed to settle payment");
  }

  if (result.settled) {
    sendOrderEmails(
      {
        orderId: order.id,
        userId: order.user_id,
        eventType: "payment_success",
      },
      options.adminDb ? { adminDb: options.adminDb } : undefined
    ).catch((err) => console.error("Async email dispatch error:", err));
  }

  return {
    success: true,
    alreadySettled: !result.settled,
    orderId: order.id,
    mode,
    isMock: mode === "mock",
  };
}

export interface InitiateRefundParams {
  orderId: string;
  amount?: number; // In Rupees (supports partial refunds)
  reason?: string;
  notes?: Record<string, string>;
  idempotencyKey?: string;
  refundType?: "cancellation" | "return" | "manual";
  authorizedBy?: string;
  refundRecordId?: string;
}

export interface InitiateRefundResult {
  success: boolean;
  refundId?: string;
  refundRecordId?: string;
  status: "processed" | "processing" | "pending" | "failed" | "already_processed" | "not_eligible";
  lifecycleState: RefundLifecycleState;
  amount?: number;
  retryable?: boolean;
  error?: string;
  mode?: Exclude<ServiceExecutionMode, "disabled"> | "disabled";
  isMock?: boolean;
}

export interface RazorpayRefundDeps {
  adminDb?: any;
  razorpayClient?: any;
  timeoutMs?: number;
  simulateMockStatus?: "processed" | "processing" | "pending";
}

function makeRefundReceipt(idempotencyKey: string): string {
  return `rcpt_${crypto.createHash("sha256").update(idempotencyKey).digest("hex").slice(0, 32)}`;
}

function isRealGatewayRefundId(id?: string | null): id is string {
  return Boolean(id && id.trim() && !id.trim().startsWith("rfnd_err_"));
}

async function reconcileExistingActiveRefundRecord(params: {
  record: any;
  orderId: string;
  paymentId: string;
  refundType: "cancellation" | "return" | "manual";
  reason?: string;
  authorizedBy?: string;
  mode: Exclude<ServiceExecutionMode, "disabled">;
  adminDb: any;
  client: any;
  timeoutMs?: number;
  allowFailedFallback?: boolean;
}): Promise<InitiateRefundResult | null> {
  const { record, orderId, paymentId, refundType, reason, authorizedBy, mode, adminDb, client } = params;
  if (record.status === "processed") {
    return {
      success: true,
      refundId: record.gateway_refund_id || undefined,
      refundRecordId: record.id,
      status: "already_processed",
      lifecycleState: "PROCESSED",
      amount: Number(record.amount),
      mode,
      isMock: mode === "mock",
    };
  }

  if (!["pending", "processing"].includes(record.status) || !isRealGatewayRefundId(record.gateway_refund_id)) {
    return null;
  }

  if (mode !== "mock" && client) {
    try {
      const remoteRefund = await withGatewayTimeout<any>(
        client.refunds.fetch(record.gateway_refund_id, { payment_id: paymentId }),
        "refund fetch",
        params.timeoutMs
      );
      const reconciledStatus =
        remoteRefund?.status === "processed"
          ? "processed"
          : remoteRefund?.status === "failed"
          ? "failed"
          : "processing";
      await adminDb.rpc("record_refund_atomic", {
        p_order_id: orderId,
        p_refund_id: record.gateway_refund_id,
        p_refund_amount: Number(record.amount),
        p_refund_status: reconciledStatus,
        p_raw_response: remoteRefund || {},
        p_idempotency_key: record.idempotency_key || null,
        p_refund_type: refundType,
        p_reason: reason || "Refund status synchronization",
        p_authorized_by: authorizedBy || null,
        p_refund_record_id: record.id,
      });
      if (reconciledStatus !== "failed" || params.allowFailedFallback) {
        return {
          success: reconciledStatus !== "failed",
          refundId: record.gateway_refund_id,
          refundRecordId: record.id,
          status: reconciledStatus,
          lifecycleState: mapDbRefundStatusToLifecycle(reconciledStatus),
          amount: Number(record.amount),
          mode,
          isMock: false,
          ...(reconciledStatus === "failed" ? { error: "Existing refund failed at gateway." } : {}),
        };
      }
      return null;
    } catch {
      return {
        success: true,
        refundId: record.gateway_refund_id,
        refundRecordId: record.id,
        status: record.status === "processing" ? "processing" : "pending",
        lifecycleState: mapDbRefundStatusToLifecycle(record.status),
        amount: Number(record.amount),
        mode,
        isMock: false,
      };
    }
  }

  return {
    success: true,
    refundId: record.gateway_refund_id,
    refundRecordId: record.id,
    status: record.status === "processing" ? "processing" : "pending",
    lifecycleState: mapDbRefundStatusToLifecycle(record.status),
    amount: Number(record.amount),
    mode,
    isMock: mode === "mock",
  };
}

async function lookupAndSyncRemoteRefundByReceipt(params: {
  orderId: string;
  paymentId: string;
  stableIdempotencyKey: string;
  refundReceipt: string;
  targetRefundAmount: number;
  refundType: "cancellation" | "return" | "manual";
  reason?: string;
  authorizedBy?: string;
  priorMatchId?: string;
  mode: Exclude<ServiceExecutionMode, "disabled">;
  adminDb: any;
  client: any;
  timeoutMs?: number;
}): Promise<InitiateRefundResult | null> {
  const { client, paymentId, refundReceipt, stableIdempotencyKey, adminDb, mode } = params;
  if (!client || typeof client.payments?.fetchMultipleRefund !== "function") {
    return null;
  }

  try {
    const remoteList = await withGatewayTimeout<any>(
      client.payments.fetchMultipleRefund(paymentId, { count: 100 }),
      "refund list lookup",
      params.timeoutMs
    );
    const items: any[] = remoteList?.items || [];
    const matched = items.find(
      (item) =>
        item.receipt === refundReceipt ||
        item.receipt === makeRefundReceipt(stableIdempotencyKey) ||
        item.notes?.idempotency_key === stableIdempotencyKey
    );

    if (!matched || !matched.id || matched.status === "failed") {
      return null;
    }

    const reconciledStatus = matched.status === "processed" ? "processed" : "processing";
    const reconciledAmount =
      typeof matched.amount === "number" && matched.amount > 0
        ? Number((matched.amount / 100).toFixed(2))
        : params.targetRefundAmount;

    const { data: recRpc } = await adminDb.rpc("record_refund_atomic", {
      p_order_id: params.orderId,
      p_refund_id: matched.id,
      p_refund_amount: reconciledAmount,
      p_refund_status: reconciledStatus,
      p_raw_response: matched,
      p_idempotency_key: stableIdempotencyKey,
      p_refund_type: params.refundType,
      p_reason: params.reason || "Order refund",
      p_authorized_by: params.authorizedBy || null,
      p_refund_record_id: params.priorMatchId || null,
    });

    return {
      success: true,
      refundId: matched.id,
      refundRecordId: (recRpc as any)?.refund_record_id || params.priorMatchId,
      status: reconciledStatus,
      lifecycleState: mapDbRefundStatusToLifecycle(reconciledStatus),
      amount: reconciledAmount,
      mode,
      isMock: false,
    };
  } catch {
    return null;
  }
}

/**
 * Initiates an authoritative, idempotent refund via Razorpay for an online prepaid order.
 * Validates payment capture state, ownership, cumulative refundable cap, and idempotency;
 * distinguishes accepted/processing refunds from completed refunds; and never fabricates
 * success or synthetic error refund IDs.
 */
export async function initiateRazorpayRefund(
  params: InitiateRefundParams,
  deps: RazorpayRefundDeps = {}
): Promise<InitiateRefundResult> {
  let execution: ReturnType<typeof resolveRazorpayExecution>;
  try {
    execution = resolveRazorpayExecution("refund initiation");
  } catch (err: any) {
    return {
      success: false,
      status: "failed",
      lifecycleState: "FAILED",
      retryable: false,
      mode: "disabled",
      error: err?.message || "Razorpay refund service is unavailable.",
    };
  }

  const { mode } = execution;
  const { orderId, amount, reason, notes, authorizedBy, refundRecordId } = params;
  const refundType = params.refundType || (notes?.return_id ? "return" : "cancellation");
  const adminDb = deps.adminDb || createAdminClient();
  const client = mode === "mock" ? null : deps.razorpayClient || getRazorpayClient();

  // 1. Fetch authoritative order
  const { data: order, error: orderError } = await adminDb
    .from("orders")
    .select(
      "id, user_id, payment_status, payment_method, is_paid, razorpay_order_id, razorpay_payment_id, razorpay_refund_id, refund_status, total_amount, order_status"
    )
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 2. Payment method eligibility (COD cancellation does not require gateway refund)
  if (order.payment_method !== "ONLINE") {
    return {
      success: false,
      status: "not_eligible",
      lifecycleState: "NOT_REQUIRED",
      error: "Only ONLINE prepaid orders are eligible for automated Razorpay refunds.",
    };
  }

  // Only captured/settled (or already in-refund) online payments can be refunded
  const eligibleStatuses = new Set(["Paid", "Partially Refunded", "Refund Pending"]);
  if (order.payment_status === "Refunded") {
    return {
      success: true,
      status: "already_processed",
      lifecycleState: "PROCESSED",
      refundId: isRealGatewayRefundId(order.razorpay_refund_id) ? order.razorpay_refund_id : undefined,
      amount: Number(order.total_amount),
      mode,
      isMock: mode === "mock",
    };
  }

  if (!eligibleStatuses.has(order.payment_status) && order.is_paid !== true) {
    return {
      success: false,
      status: "not_eligible",
      lifecycleState: "NOT_REQUIRED",
      error: `Order payment status is "${order.payment_status}" (not paid); refund is not eligible.`,
    };
  }

  // 3. Load refund_records & payment record for cumulative accounting and idempotency
  const { data: refundRows } = await adminDb
    .from("refund_records")
    .select("id, gateway_refund_id, amount, status, idempotency_key, attempt_count, return_request_id")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  const allRefunds: any[] = refundRows || [];
  const settledAmount = allRefunds
    .filter((r) => r.status === "processed")
    .reduce((sum, r) => sum + Number(r.amount || 0), 0);

  const explicitPriorMatch =
    params.idempotencyKey || refundRecordId
      ? allRefunds.find(
          (r) =>
            (params.idempotencyKey && r.idempotency_key === params.idempotencyKey) ||
            (refundRecordId && r.id === refundRecordId)
        )
      : undefined;

  // Exclude specific pending record passed by returns.ts reservation OR explicit idempotent retry before checking remaining
  const activeGatewayRefunds = allRefunds.filter(
    (r) =>
      (r.status === "pending" || r.status === "processing") &&
      isRealGatewayRefundId(r.gateway_refund_id) &&
      r.id !== refundRecordId &&
      r.id !== explicitPriorMatch?.id
  );

  const inFlightAmount = activeGatewayRefunds.reduce((sum, r) => sum + Number(r.amount || 0), 0);

  // Fetch authoritative payment row (prefer Paid / Refund Pending / Partially Refunded)
  const { data: paymentRows } = await adminDb
    .from("payments")
    .select("id, order_id, user_id, payment_id, provider_order_id, provider_payment_id, amount, currency, status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  const paymentList: any[] = paymentRows || [];
  const paymentRecord =
    paymentList.find((p) => ["Paid", "Refund Pending", "Partially Refunded"].includes(p.status)) ||
    paymentList[0] ||
    null;

  if (paymentRecord && paymentRecord.order_id !== order.id) {
    return {
      success: false,
      status: "not_eligible",
      lifecycleState: "FAILED",
      error: "Payment record order ownership mismatch.",
    };
  }

  const paymentId = paymentRecord?.provider_payment_id || order.razorpay_payment_id;
  if (!paymentId) {
    await adminDb.rpc("record_refund_atomic", {
      p_order_id: orderId,
      p_refund_id: null,
      p_refund_amount: Number(order.total_amount),
      p_refund_status: "failed",
      p_raw_response: { error: "Missing Razorpay payment ID (provider_payment_id)" },
      p_idempotency_key: params.idempotencyKey || `refund:cancel:${orderId}`,
      p_refund_type: refundType,
      p_reason: reason || "Missing provider payment ID",
      p_authorized_by: authorizedBy || null,
      p_error_message: "Missing Razorpay payment ID (provider_payment_id). Cannot issue refund.",
      p_refund_record_id: refundRecordId || null,
    });
    return {
      success: false,
      status: "failed",
      lifecycleState: "FAILED",
      retryable: false,
      error: "Missing Razorpay payment ID (provider_payment_id). Cannot issue refund.",
    };
  }

  // Reconcile explicit idempotent match before cumulative capacity check
  if (explicitPriorMatch) {
    const resolved = await reconcileExistingActiveRefundRecord({
      record: explicitPriorMatch,
      orderId,
      paymentId,
      refundType,
      reason,
      authorizedBy,
      mode,
      adminDb,
      client,
      timeoutMs: deps.timeoutMs,
    });
    if (resolved) return resolved;
  }

  const capturedAmount = Number(paymentRecord?.amount ?? order.total_amount);
  const remainingRefundable = Number(Math.max(0, capturedAmount - settledAmount - inFlightAmount).toFixed(2));

  if (remainingRefundable <= 0) {
    if (settledAmount >= capturedAmount - 0.01) {
      return {
        success: true,
        status: "already_processed",
        lifecycleState: "PROCESSED",
        refundId: isRealGatewayRefundId(order.razorpay_refund_id) ? order.razorpay_refund_id : undefined,
        amount: settledAmount,
        mode,
        isMock: mode === "mock",
      };
    }
    const existingActive = activeGatewayRefunds[0];
    if (existingActive) {
      const activeResolved = await reconcileExistingActiveRefundRecord({
        record: existingActive,
        orderId,
        paymentId,
        refundType,
        reason,
        authorizedBy,
        mode,
        adminDb,
        client,
        timeoutMs: deps.timeoutMs,
        allowFailedFallback: true,
      });
      if (activeResolved) return activeResolved;
    }
  }

  // 4. Determine validated refund amount
  let targetRefundAmount: number;
  if (amount !== undefined) {
    if (typeof amount !== "number" || isNaN(amount) || amount <= 0) {
      return {
        success: false,
        status: "failed",
        lifecycleState: "FAILED",
        error: "Refund amount must be a positive number.",
      };
    }
    if (amount > remainingRefundable + 0.01) {
      return {
        success: false,
        status: "not_eligible",
        lifecycleState: "FAILED",
        error: `Requested refund amount ₹${amount} exceeds available refundable balance ₹${remainingRefundable}.`,
      };
    }
    targetRefundAmount = Number(amount.toFixed(2));
  } else {
    targetRefundAmount = remainingRefundable;
  }

  const amountInPaise = Math.round(targetRefundAmount * 100);
  const stableIdempotencyKey =
    params.idempotencyKey ||
    (notes?.return_id
      ? `refund:return:${notes.return_id}`
      : Math.abs(targetRefundAmount - capturedAmount) <= 0.01 && settledAmount === 0
      ? `refund:cancel:${orderId}`
      : `refund:partial:${orderId}:${amountInPaise}:${allRefunds.filter((r) => r.status === "processed").length + 1}`);

  const priorMatch =
    explicitPriorMatch || allRefunds.find((r) => r.idempotency_key === stableIdempotencyKey);

  if (priorMatch && !explicitPriorMatch) {
    const resolved = await reconcileExistingActiveRefundRecord({
      record: priorMatch,
      orderId,
      paymentId,
      refundType,
      reason,
      authorizedBy,
      mode,
      adminDb,
      client,
      timeoutMs: deps.timeoutMs,
    });
    if (resolved) return resolved;
  }

  const retrySeq = priorMatch?.status === "failed" ? Math.max(1, Number(priorMatch.attempt_count || 1)) : 1;
  const attemptIdempotencyKey =
    retrySeq > 1 ? `${stableIdempotencyKey}:attempt_${retrySeq}` : stableIdempotencyKey;
  const refundReceipt = makeRefundReceipt(attemptIdempotencyKey);

  // 5. Remote Payment Capture & Idempotency Pre-flight (Live/Sandbox Mode)
  if (mode !== "mock" && client) {
    let remotePayment: any;
    try {
      remotePayment = await withGatewayTimeout<any>(
        client.payments.fetch(paymentId),
        "payment eligibility fetch",
        deps.timeoutMs
      );
    } catch (fetchErr: any) {
      const errMsg = `Failed to verify Razorpay payment eligibility before refund: ${fetchErr?.message || fetchErr}`;
      await adminDb.rpc("record_refund_atomic", {
        p_order_id: orderId,
        p_refund_id: null,
        p_refund_amount: targetRefundAmount,
        p_refund_status: "failed",
        p_raw_response: { error: errMsg },
        p_idempotency_key: stableIdempotencyKey,
        p_refund_type: refundType,
        p_reason: reason || "Order refund",
        p_authorized_by: authorizedBy || null,
        p_error_message: errMsg,
        p_refund_record_id: priorMatch?.id || refundRecordId || null,
      });
      return {
        success: false,
        status: "failed",
        lifecycleState: "FAILED",
        retryable: true,
        mode,
        error: errMsg,
      };
    }

    const expectedRzpOrderId = order.razorpay_order_id || paymentRecord?.provider_order_id;
    if (remotePayment?.order_id && expectedRzpOrderId && remotePayment.order_id !== expectedRzpOrderId) {
      return {
        success: false,
        status: "not_eligible",
        lifecycleState: "FAILED",
        mode,
        error: `Payment ownership mismatch: Razorpay payment ${paymentId} belongs to ${remotePayment.order_id}, not ${expectedRzpOrderId}.`,
      };
    }

    if (remotePayment?.status === "authorized") {
      return {
        success: false,
        status: "not_eligible",
        lifecycleState: "FAILED",
        mode,
        error: "Payment is only authorized and has not been captured. Capture or void instead of refunding.",
      };
    }

    if (remotePayment?.status !== "captured" && remotePayment?.status !== "refunded") {
      return {
        success: false,
        status: "not_eligible",
        lifecycleState: "FAILED",
        mode,
        error: `Payment is in "${remotePayment?.status || "unknown"}" state and cannot be refunded.`,
      };
    }

    // Check existing refunds on Razorpay first (recovers timed-out calls and prevents over-refund)
    const existingRemoteMatch = await lookupAndSyncRemoteRefundByReceipt({
      orderId,
      paymentId,
      stableIdempotencyKey,
      refundReceipt,
      targetRefundAmount,
      refundType,
      reason,
      authorizedBy,
      priorMatchId: priorMatch?.id || refundRecordId,
      mode,
      adminDb,
      client,
      timeoutMs: deps.timeoutMs,
    });
    if (existingRemoteMatch) return existingRemoteMatch;

    const remoteAvailablePaise =
      Number(remotePayment.amount || amountInPaise) - Number(remotePayment.amount_refunded || 0);
    if (remoteAvailablePaise < amountInPaise) {
      return {
        success: false,
        status: "not_eligible",
        lifecycleState: "FAILED",
        mode,
        error: `Gateway payment remaining refundable balance (${(remoteAvailablePaise / 100).toFixed(2)}) is less than ₹${targetRefundAmount.toFixed(2)}.`,
      };
    }
  }

  // 6. Execute gateway refund call (or explicit dev/test mock simulation)
  let refundId: string;
  let gatewayStatus: "processed" | "processing" | "pending" | "failed" = "processed";
  let rawRefundResponse: any = {};

  try {
    if (mode === "mock") {
      refundId = `rfnd_mock_${crypto.randomBytes(6).toString("hex")}`;
      gatewayStatus = deps.simulateMockStatus || "processed";
      rawRefundResponse = {
        id: refundId,
        payment_id: paymentId,
        amount: amountInPaise,
        currency: "INR",
        status: gatewayStatus === "processing" ? "pending" : gatewayStatus,
        receipt: refundReceipt,
        mode: "mock",
        is_mock: true,
        notes: {
          order_id: orderId,
          idempotency_key: stableIdempotencyKey,
          reason: reason || "Order cancellation",
          ...(notes || {}),
        },
      };
      logger.info("[MOCK][Razorpay] Simulated Razorpay refund issued (no external API call)", {
        orderId,
        refundId,
        status: gatewayStatus,
        mode: "mock",
      });
    } else {
      const res = await withGatewayTimeout<any>(
        client.payments.refund(paymentId, {
          amount: amountInPaise,
          receipt: refundReceipt,
          notes: {
            order_id: orderId,
            idempotency_key: stableIdempotencyKey,
            reason: reason || "Order cancellation",
            ...(notes || {}),
          },
        }),
        "refund creation",
        deps.timeoutMs
      );

      if (!res?.id) {
        throw new Error("Razorpay refund response missing refund ID.");
      }

      if (res.currency && String(res.currency).toUpperCase() !== "INR") {
        throw new Error(`Unexpected refund currency returned by Razorpay: ${res.currency}`);
      }

      if (res.amount !== undefined && Math.abs(Number(res.amount) - amountInPaise) > 1) {
        throw new Error(
          `Refund amount mismatch: requested ${amountInPaise} paise, Razorpay returned ${res.amount}.`
        );
      }

      refundId = res.id;
      if (res.status === "processed") {
        gatewayStatus = "processed";
      } else if (res.status === "failed") {
        gatewayStatus = "failed";
      } else {
        // 'pending' / 'created' / accepted -> distinguish PROCESSING from PROCESSED
        gatewayStatus = "processing";
      }
      rawRefundResponse = res;
    }
  } catch (err: any) {
    const isTimeout = err instanceof RazorpayTimeoutError || /timed?\s*out/i.test(String(err?.message));
    const errMsg = err?.message || String(err);
    console.error("Razorpay refund API call failed:", errMsg);

    // Best-effort uncertain-timeout reconciliation before marking failed
    if (mode !== "mock" && (isTimeout || Number(err?.statusCode) >= 500)) {
      const probeTimeoutMs = Math.min(deps.timeoutMs && deps.timeoutMs > 0 ? deps.timeoutMs : 3000, 3000);
      const recovered = await lookupAndSyncRemoteRefundByReceipt({
        orderId,
        paymentId,
        stableIdempotencyKey,
        refundReceipt,
        targetRefundAmount,
        refundType,
        reason,
        authorizedBy,
        priorMatchId: priorMatch?.id || refundRecordId,
        mode,
        adminDb,
        client,
        timeoutMs: probeTimeoutMs,
      });
      if (recovered) return recovered;
    }

    await adminDb.rpc("record_refund_atomic", {
      p_order_id: orderId,
      p_refund_id: null,
      p_refund_amount: targetRefundAmount,
      p_refund_status: "failed",
      p_raw_response: { error: errMsg, timeout: isTimeout },
      p_idempotency_key: stableIdempotencyKey,
      p_refund_type: refundType,
      p_reason: reason || "Order refund",
      p_authorized_by: authorizedBy || null,
      p_error_message: `Razorpay refund failed: ${errMsg}`,
      p_refund_record_id: priorMatch?.id || refundRecordId || null,
    });

    return {
      success: false,
      status: "failed",
      lifecycleState: "FAILED",
      retryable: isTimeout || Number(err?.statusCode) >= 500,
      mode,
      error: `Razorpay refund failed: ${errMsg}`,
    };
  }

  // 7. Record gateway outcome atomically in PostgreSQL (orders, payments, refund_records)
  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("record_refund_atomic", {
    p_order_id: orderId,
    p_refund_id: refundId,
    p_refund_amount: targetRefundAmount,
    p_refund_status: gatewayStatus,
    p_raw_response: rawRefundResponse,
    p_idempotency_key: stableIdempotencyKey,
    p_refund_type: refundType,
    p_reason: reason || "Order refund",
    p_authorized_by: authorizedBy || null,
    p_error_message: gatewayStatus === "failed" ? "Razorpay returned failed refund status." : null,
    p_refund_record_id: priorMatch?.id || refundRecordId || null,
  });

  if (rpcErr) {
    console.error("Failed to record refund atomically in database:", rpcErr.message);
    throw new Error(
      `Refund issued at gateway (${refundId}) but database update failed: ${rpcErr.message}`
    );
  }

  if (gatewayStatus === "failed") {
    return {
      success: false,
      refundId,
      refundRecordId: (rpcRes as any)?.refund_record_id,
      status: "failed",
      lifecycleState: "FAILED",
      amount: targetRefundAmount,
      retryable: true,
      mode,
      isMock: mode === "mock",
      error: "Razorpay rejected or failed the refund request.",
    };
  }

  return {
    success: true,
    refundId,
    refundRecordId: (rpcRes as any)?.refund_record_id,
    status: gatewayStatus,
    lifecycleState: mapDbRefundStatusToLifecycle(gatewayStatus),
    amount: targetRefundAmount,
    mode,
    isMock: mode === "mock",
  };
}
