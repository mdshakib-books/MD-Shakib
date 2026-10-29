import crypto from "crypto";
import { getRazorpayClient } from "./client";
import { getIntegrationsConfig } from "../config";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "../resend/service";

export interface CreatePaymentOrderResult {
  razorpayOrderId: string;
  amount: number; // in paise
  currency: string;
  keyId: string;
  orderId: string;
}

export interface VerifySignatureParams {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  userId?: string;
}

/**
 * Creates a Razorpay payment order for an existing pending application order.
 * Strictly derives the payment amount from the database record to prevent client tampering.
 */
export async function createRazorpayOrder(
  orderId: string,
  userId: string
): Promise<CreatePaymentOrderResult> {
  const adminDb = createAdminClient();
  const { razorpay } = getIntegrationsConfig();

  // 1. Fetch authoritative order from database
  const { data: order, error: orderError } = await adminDb
    .from("orders")
    .select("id, user_id, total_amount, payment_status, payment_method, razorpay_order_id")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 2. Validate ownership & state
  if (order.user_id !== userId) {
    throw new Error("Unauthorized: Order does not belong to the authenticated user.");
  }

  if (order.payment_status === "Paid") {
    throw new Error("Order is already paid.");
  }

  // If a Razorpay order was already generated, return the existing provider order
  if (order.razorpay_order_id) {
    const amountInPaise = Math.round(Number(order.total_amount) * 100);
    return {
      razorpayOrderId: order.razorpay_order_id,
      amount: amountInPaise,
      currency: "INR",
      keyId: razorpay.keyId,
      orderId: order.id,
    };
  }

  const amountInPaise = Math.round(Number(order.total_amount) * 100);

  // 3. Create Razorpay order via SDK
  let rzpOrderId: string;
  try {
    const client = getRazorpayClient();
    const rzpOrder = await client.orders.create({
      amount: amountInPaise,
      currency: "INR",
      receipt: order.id,
      notes: {
        application_order_id: order.id,
        user_id: userId,
      },
    });
    rzpOrderId = rzpOrder.id;
  } catch (error: any) {
    // If running in offline test or mock environment without live API keys
    if (razorpay.keyId.startsWith("rzp_test_mock")) {
      rzpOrderId = `order_mock_${Date.now()}`;
    } else {
      throw new Error(`Razorpay order creation failed: ${error?.message || error}`);
    }
  }

  // 4. Record payment intention in public.payments table
  const { error: paymentError } = await adminDb.from("payments").insert({
    order_id: order.id,
    user_id: userId,
    payment_id: rzpOrderId,
    provider_order_id: rzpOrderId,
    amount: order.total_amount,
    currency: "INR",
    provider: "Razorpay",
    status: "Pending",
  });

  if (paymentError) {
    console.error("Failed to insert payment record:", paymentError);
  }

  // 5. Update order with razorpay_order_id
  await adminDb
    .from("orders")
    .update({ razorpay_order_id: rzpOrderId })
    .eq("id", order.id);

  return {
    razorpayOrderId: rzpOrderId,
    amount: amountInPaise,
    currency: "INR",
    keyId: razorpay.keyId,
    orderId: order.id,
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
export async function verifyAndSettlePayment(params: VerifySignatureParams) {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, userId } = params;
  const { razorpay } = getIntegrationsConfig();

  // 1. Verify signature
  const isValid = validateRazorpaySignature(
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    razorpay.keySecret
  );

  if (!isValid) {
    throw new Error("Invalid Razorpay payment signature.");
  }

  const adminDb = createAdminClient();

  // 2. Fetch the corresponding order
  const { data: order, error: orderError } = await adminDb
    .from("orders")
    .select("id, user_id, payment_status, total_amount, address_snapshot, is_paid")
    .eq("razorpay_order_id", razorpay_order_id)
    .single();

  if (orderError || !order) {
    throw new Error(`Order associated with Razorpay Order ID ${razorpay_order_id} not found.`);
  }

  if (userId && order.user_id !== userId) {
    throw new Error("Unauthorized: Order does not belong to the authenticated user.");
  }

  // 3. Call atomic database settlement procedure (pessimistic lock FOR UPDATE)
  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: razorpay_order_id,
    p_razorpay_payment_id: razorpay_payment_id,
    p_signature: razorpay_signature,
    p_raw_response: { method: "browser_signature_verification" },
  });

  if (rpcErr) {
    throw new Error(`Atomic settlement failed: ${rpcErr.message}`);
  }

  const result = rpcRes as any;
  if (!result?.success) {
    throw new Error(result?.message || "Failed to settle payment");
  }

  // 4. Trigger transactional email ONLY if this transaction performed the initial settlement
  if (result.settled) {
    sendOrderEmails({
      orderId: order.id,
      userId: order.user_id,
      eventType: "payment_success",
    }).catch((err) => console.error("Async email dispatch error:", err));
  }

  return {
    success: true,
    alreadySettled: !result.settled,
    orderId: order.id,
  };
}

export interface InitiateRefundParams {
  orderId: string;
  reason?: string;
  notes?: Record<string, string>;
}

export interface InitiateRefundResult {
  success: boolean;
  refundId?: string;
  status: "processed" | "pending" | "failed" | "already_processed" | "not_eligible";
  amount?: number;
  error?: string;
}

/**
 * Initiates an authoritative, idempotent refund via Razorpay for an online prepaid order.
 * Strictly derives the payment ID and refundable amount from the database record.
 * Never marks an order as 'Refunded' without verified gateway settlement.
 */
export async function initiateRazorpayRefund(
  params: InitiateRefundParams
): Promise<InitiateRefundResult> {
  const { orderId, reason, notes } = params;
  const adminDb = createAdminClient();
  const { razorpay } = getIntegrationsConfig();

  // 1. Fetch authoritative order
  const { data: order, error: orderError } = await adminDb
    .from("orders")
    .select("id, user_id, payment_status, payment_method, razorpay_order_id, razorpay_payment_id, razorpay_refund_id, refund_status, total_amount, order_status")
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 2. Validate eligibility
  if (order.payment_method !== "ONLINE") {
    return {
      success: false,
      status: "not_eligible",
      error: "Only ONLINE prepaid orders are eligible for automated Razorpay refunds.",
    };
  }

  // 3. Idempotency check: if already refunded or in progress
  if (order.payment_status === "Refunded" || order.refund_status === "processed") {
    return {
      success: true,
      status: "already_processed",
      refundId: order.razorpay_refund_id || undefined,
      amount: Number(order.total_amount),
    };
  }

  if (order.payment_status === "Refund Pending" || order.refund_status === "pending") {
    return {
      success: true,
      status: "pending",
      refundId: order.razorpay_refund_id || undefined,
      amount: Number(order.total_amount),
    };
  }

  if (order.payment_status !== "Paid") {
    return {
      success: false,
      status: "not_eligible",
      error: `Order payment status is "${order.payment_status}", expected "Paid".`,
    };
  }

  // 4. Fetch authoritative payment record
  const { data: paymentRecord } = await adminDb
    .from("payments")
    .select("id, payment_id, provider_payment_id, amount, currency, status")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const paymentId = paymentRecord?.provider_payment_id || order.razorpay_payment_id;
  if (!paymentId) {
    return {
      success: false,
      status: "failed",
      error: "Missing Razorpay payment ID (provider_payment_id). Cannot issue refund.",
    };
  }

  const authoritativeAmount = paymentRecord?.amount ?? order.total_amount;
  const amountInPaise = Math.round(Number(authoritativeAmount) * 100);

  // 5. Execute gateway refund call
  let refundId: string;
  let gatewayStatus: "processed" | "pending" | "failed" = "processed";
  let rawRefundResponse: any = {};

  try {
    const isMock = razorpay.keyId.startsWith("rzp_test_mock") || razorpay.keyId.startsWith("mock");
    if (isMock) {
      refundId = `rfnd_mock_${Date.now()}`;
      gatewayStatus = "processed";
      rawRefundResponse = {
        id: refundId,
        payment_id: paymentId,
        amount: amountInPaise,
        currency: "INR",
        status: "processed",
        notes: { order_id: orderId, reason: reason || "Admin order cancellation" },
      };
    } else {
      const client = getRazorpayClient();
      const res = await client.payments.refund(paymentId, {
        amount: amountInPaise,
        notes: {
          order_id: orderId,
          reason: reason || "Admin order cancellation",
          ...(notes || {}),
        },
      });
      refundId = res.id;
      gatewayStatus = res.status === "processed" ? "processed" : "pending";
      rawRefundResponse = res;
    }
  } catch (err: any) {
    console.error("Razorpay refund API call failed:", err?.message || err);
    // Mark refund as failed in database without updating order payment_status to Refunded
    await adminDb.rpc("record_refund_atomic", {
      p_order_id: orderId,
      p_refund_id: `rfnd_err_${Date.now()}`,
      p_refund_amount: Number(authoritativeAmount),
      p_refund_status: "failed",
      p_raw_response: { error: err?.message || String(err) },
    });

    return {
      success: false,
      status: "failed",
      error: `Razorpay refund failed: ${err?.message || err}`,
    };
  }

  // 6. Record verified refund atomically in PostgreSQL
  const { error: rpcErr } = await adminDb.rpc("record_refund_atomic", {
    p_order_id: orderId,
    p_refund_id: refundId,
    p_refund_amount: Number(authoritativeAmount),
    p_refund_status: gatewayStatus,
    p_raw_response: rawRefundResponse,
  });

  if (rpcErr) {
    console.error("Failed to record refund atomically in database:", rpcErr.message);
    throw new Error(`Refund issued at gateway (${refundId}) but database update failed: ${rpcErr.message}`);
  }

  return {
    success: true,
    refundId,
    status: gatewayStatus,
    amount: Number(authoritativeAmount),
  };
}

