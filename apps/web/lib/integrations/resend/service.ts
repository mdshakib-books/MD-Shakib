import { getResendClient, resolveResendExecution } from "./client";
import { DELIVERY_FEE, PLATFORM_FEE } from "@/lib/commerce/pricing";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  renderOrderConfirmationHtml,
  renderPaymentSuccessHtml,
  renderOrderCancellationHtml,
  renderAdminNewOrderHtml,
  renderShipmentNotificationHtml,
  renderContactAcknowledgementHtml,
  renderContactAdminAlertHtml,
  renderLowStockAlertHtml,
  type EmailOrderDetails,
  type EmailOrderItem,
} from "./templates";

export interface SendOrderEmailsParams {
  orderId: string;
  userId: string;
  eventType: "order_confirmation" | "payment_success" | "order_cancellation";
  cancelReason?: string;
}

export interface EmailServiceOptions {
  adminDb?: any;
  resendClient?: any;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  timeoutMs?: number;
  idempotencyKey?: string;
}

export interface EmailDispatchResult {
  success: boolean;
  disabled?: boolean;
  simulated?: boolean;
  alreadySent?: boolean;
  suppressed?: boolean;
  suppressedReason?: string;
  failureType?: "transient" | "permanent" | "suppressed";
  retryable?: boolean;
  attempts?: number;
  mode?: "disabled" | "mock" | "sandbox" | "live" | "unconfigured";
  messageId?: string;
  logId?: string;
  reason?: string;
  error?: string;
}

export class EmailTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Email gateway request timed out after ${timeoutMs}ms.`);
    this.name = "EmailTimeoutError";
  }
}

export const EMAIL_DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_EMAIL_TIMEOUT_MS = 10000;
const DEFAULT_RETRY_BASE_DELAY_MS = 250;
const EMAIL_ADDRESS_REGEX = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

export function normalizeEmailAddress(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

export function isValidEmailAddress(email?: string | null): boolean {
  const clean = normalizeEmailAddress(email);
  if (!clean || clean.length > 254) return false;
  return EMAIL_ADDRESS_REGEX.test(clean);
}

/**
 * Classifies email dispatch failures so permanent errors (e.g. invalid recipient, 4xx validation,
 * domain/suppression errors) stop retrying immediately while transient failures (429, 5xx, timeout,
 * network reset) remain eligible for bounded backoff retries.
 */
export function classifyEmailError(err: any): {
  failureType: "transient" | "permanent";
  message: string;
} {
  const message = String(err?.message || err || "Unknown email dispatch error").trim();
  const statusCode = Number(err?.statusCode ?? err?.status ?? 0);
  const lower = message.toLowerCase();

  if (err instanceof EmailTimeoutError) {
    return { failureType: "transient", message };
  }

  if (statusCode === 429 || (statusCode >= 500 && statusCode <= 599)) {
    return { failureType: "transient", message };
  }

  if (
    lower.includes("timed out") ||
    lower.includes("timeout") ||
    lower.includes("rate limit") ||
    lower.includes("too many requests") ||
    lower.includes("econnreset") ||
    lower.includes("etimedout") ||
    lower.includes("enotfound") ||
    lower.includes("eai_again") ||
    lower.includes("fetch failed") ||
    lower.includes("service unavailable") ||
    lower.includes("temporarily unavailable")
  ) {
    return { failureType: "transient", message };
  }

  if (
    (statusCode >= 400 && statusCode < 500 && statusCode !== 429) ||
    lower.includes("invalid recipient") ||
    lower.includes("invalid email") ||
    lower.includes("validation_error") ||
    lower.includes("domain") ||
    lower.includes("unverified") ||
    lower.includes("bounced") ||
    lower.includes("complained") ||
    lower.includes("suppressed") ||
    lower.includes("blocked")
  ) {
    return { failureType: "permanent", message };
  }

  return { failureType: "transient", message };
}

async function withEmailTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  const effectiveTimeout = timeoutMs > 0 ? timeoutMs : DEFAULT_EMAIL_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new EmailTimeoutError(effectiveTimeout)), effectiveTimeout);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function buildEmailIdempotencyKey(
  eventType: string,
  recipient: string,
  orderId?: string,
  explicitKey?: string
): string {
  if (explicitKey && explicitKey.trim()) return explicitKey.trim();
  const cleanRecipient = normalizeEmailAddress(recipient) || "unknown";
  if (orderId) {
    return `email:${eventType}:${orderId}:${cleanRecipient}`;
  }
  return `email:${eventType}:${cleanRecipient}:${Date.now()}`;
}

async function sleepMs(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function recordSuppressedEmail(params: {
  adminDb: any;
  recipient: string;
  eventType: string;
  orderId?: string;
  idempotencyKey: string;
  reason: string;
}): Promise<EmailDispatchResult> {
  try {
    const { data: existing } = await params.adminDb
      .from("email_logs")
      .select("id, status, suppressed_reason")
      .eq("idempotency_key", params.idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.id) {
      if (existing.status === "sent") {
        return {
          success: true,
          alreadySent: true,
          logId: existing.id,
        };
      }
      return {
        success: false,
        suppressed: true,
        suppressedReason: existing.suppressed_reason || params.reason,
        failureType: "suppressed",
        reason: existing.suppressed_reason || params.reason,
        logId: existing.id,
      };
    }

    const { data: inserted } = await params.adminDb
      .from("email_logs")
      .insert({
        ...(params.orderId ? { order_id: params.orderId } : {}),
        recipient: params.recipient || "invalid",
        event_type: params.eventType,
        idempotency_key: params.idempotencyKey,
        status: "suppressed",
        attempt_count: 0,
        failure_type: "suppressed",
        suppressed_reason: params.reason,
        provider_response: params.reason,
      })
      .select("id")
      .single();

    return {
      success: false,
      suppressed: true,
      suppressedReason: params.reason,
      failureType: "suppressed",
      reason: params.reason,
      logId: inserted?.id,
    };
  } catch (err: any) {
    console.warn("Failed to persist suppressed email log:", err?.message);
    return {
      success: false,
      suppressed: true,
      suppressedReason: params.reason,
      failureType: "suppressed",
      reason: params.reason,
    };
  }
}

/**
 * Evaluates order lifecycle & preference suppression rules before sending emails.
 */
function resolveOrderEmailSuppressionReason(params: {
  eventType: string;
  order: {
    order_status?: string | null;
    payment_status?: string | null;
    payment_method?: string | null;
    is_paid?: boolean | null;
  };
  profile?: {
    email_notifications_enabled?: boolean | null;
    is_deleted?: boolean | null;
  } | null;
}): string | null {
  const { eventType, order, profile } = params;
  const orderStatus = String(order?.order_status || "");
  const paymentStatus = String(order?.payment_status || "");

  if (profile?.is_deleted) {
    return "recipient_account_deleted";
  }

  // Never send forward confirmation/payment/shipment notices on cancelled or failed orders
  if (
    orderStatus === "Cancelled" &&
    eventType !== "order_cancellation"
  ) {
    return `order_cancelled_suppresses_${eventType}`;
  }

  if (
    paymentStatus === "Failed" &&
    eventType !== "order_cancellation"
  ) {
    return `payment_failed_suppresses_${eventType}`;
  }

  if (eventType === "payment_success") {
    const isConfirmedPaid =
      order?.is_paid === true ||
      paymentStatus === "Paid" ||
      paymentStatus === "Partially Refunded";
    if (!isConfirmedPaid) {
      return `payment_not_confirmed_${paymentStatus || "pending"}`;
    }
  }

  if (eventType === "order_cancellation" && orderStatus !== "Cancelled") {
    return `order_not_cancelled_${orderStatus || "unknown"}`;
  }

  if (
    (eventType === "shipped" || eventType === "out_for_delivery" || eventType === "delivered") &&
    profile?.email_notifications_enabled === false
  ) {
    return "recipient_opted_out_shipment_updates";
  }

  if (
    (eventType === "shipped" || eventType === "out_for_delivery") &&
    (orderStatus === "Pending" || orderStatus === "Returned")
  ) {
    return `order_status_${orderStatus.toLowerCase()}_ineligible_for_${eventType}`;
  }

  if (
    eventType === "delivered" &&
    orderStatus !== "Delivered" &&
    orderStatus !== "Replacement Delivered"
  ) {
    return `order_status_${orderStatus.toLowerCase()}_not_delivered`;
  }

  return null;
}

/**
 * Shared server-side email dispatch pipeline enforcing kill switches,
 * credential validation, deduplication by idempotency key, suppression logging,
 * timeout enforcement, and bounded retries with transient/permanent classification.
 */
async function dispatchEmailWithLogging(params: {
  recipient: string;
  eventType: string;
  subject: string;
  html: string;
  orderId?: string;
  extraMeta?: Record<string, unknown>;
  idempotencyKey?: string;
  deduplicate?: boolean;
  options?: EmailServiceOptions;
}): Promise<EmailDispatchResult> {
  const { mode, config, error: configError } = resolveResendExecution();

  if (configError) {
    logger.error("Email configuration error (fail closed)", {
      eventType: params.eventType,
      orderId: params.orderId,
      mode,
      reason: configError,
    });
    return {
      success: false,
      mode: "unconfigured",
      error: configError,
    };
  }

  if (mode === "disabled") {
    return {
      success: false,
      disabled: true,
      mode: "disabled",
      reason: "Transactional emails are disabled on this server (ENABLE_EMAILS=false).",
    };
  }

  const adminDb = params.options?.adminDb || createAdminClient();
  const cleanRecipient = normalizeEmailAddress(params.recipient);
  const idempotencyKey = buildEmailIdempotencyKey(
    params.eventType,
    cleanRecipient || "invalid",
    params.orderId,
    params.options?.idempotencyKey || params.idempotencyKey
  );

  // Validate recipient syntax before logging or calling provider
  if (!isValidEmailAddress(cleanRecipient)) {
    return recordSuppressedEmail({
      adminDb,
      recipient: cleanRecipient || "invalid",
      eventType: params.eventType,
      orderId: params.orderId,
      idempotencyKey,
      reason: "invalid_recipient_email",
    });
  }

  const maxAttempts = Math.max(1, params.options?.maxAttempts ?? EMAIL_DEFAULT_MAX_ATTEMPTS);
  const retryBaseDelayMs = params.options?.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const timeoutMs = params.options?.timeoutMs ?? DEFAULT_EMAIL_TIMEOUT_MS;
  const shouldDeduplicate = params.deduplicate !== false;

  let logId: string | undefined;
  let startingAttempt = 1;

  // Check existing email_logs entry by idempotency_key (never crash on multiple rows; never block transient retries)
  if (shouldDeduplicate) {
    const { data: existingByKey } = await adminDb
      .from("email_logs")
      .select("id, status, attempt_count, max_attempts, failure_type, last_error, suppressed_reason, provider_message_id")
      .eq("idempotency_key", idempotencyKey)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingByKey) {
      if (existingByKey.status === "sent") {
        return {
          success: true,
          alreadySent: true,
          mode,
          logId: existingByKey.id,
          messageId: existingByKey.provider_message_id || undefined,
          attempts: existingByKey.attempt_count || 1,
        };
      }
      if (existingByKey.status === "suppressed") {
        return {
          success: false,
          suppressed: true,
          failureType: "suppressed",
          suppressedReason: existingByKey.suppressed_reason || "Suppressed",
          reason: existingByKey.suppressed_reason || "Suppressed",
          logId: existingByKey.id,
        };
      }
      if (existingByKey.status === "failed" && existingByKey.failure_type === "permanent") {
        return {
          success: false,
          failureType: "permanent",
          retryable: false,
          mode,
          logId: existingByKey.id,
          attempts: existingByKey.attempt_count || 1,
          error: existingByKey.last_error || "Permanent email failure previously recorded.",
        };
      }
      const priorAttempts = Number(existingByKey.attempt_count || 0);
      const effectiveCap = Math.max(maxAttempts, Number(existingByKey.max_attempts || maxAttempts));
      if (existingByKey.status === "failed" && priorAttempts >= effectiveCap) {
        return {
          success: false,
          failureType: "transient",
          retryable: false,
          mode,
          logId: existingByKey.id,
          attempts: priorAttempts,
          error: `Max email retry attempts (${effectiveCap}) already exhausted.`,
        };
      }
      logId = existingByKey.id;
      startingAttempt = Math.max(1, priorAttempts + 1);
    } else if (params.orderId) {
      // Fallback check for legacy sent logs inserted without idempotency_key
      const { data: legacySent } = await adminDb
        .from("email_logs")
        .select("id")
        .eq("order_id", params.orderId)
        .eq("event_type", params.eventType)
        .eq("status", "sent")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (legacySent?.id) {
        return {
          success: true,
          alreadySent: true,
          mode,
          logId: legacySent.id,
        };
      }
    }
  }

  if (logId) {
    await adminDb
      .from("email_logs")
      .update({
        status: "queued",
        max_attempts: maxAttempts,
        updated_at: new Date().toISOString(),
      })
      .eq("id", logId);
  } else {
    const { data: logEntry } = await adminDb
      .from("email_logs")
      .insert({
        ...(params.orderId ? { order_id: params.orderId } : {}),
        recipient: cleanRecipient,
        event_type: params.eventType,
        idempotency_key: idempotencyKey,
        status: "queued",
        attempt_count: 0,
        max_attempts: maxAttempts,
      })
      .select("id")
      .single();

    logId = logEntry?.id;
  }

  if (mode === "mock") {
    const mockId = `mock_msg_${Date.now()}_${params.eventType}`;
    const mockResponse = JSON.stringify({
      mode: "mock_test_dispatch",
      simulated: true,
      id: mockId,
      to: cleanRecipient,
      subject: params.subject,
      timestamp: new Date().toISOString(),
      ...(params.extraMeta || {}),
    });

    logger.info("[MOCK][Resend] Simulated email dispatch (no external network call)", {
      eventType: params.eventType,
      orderId: params.orderId,
      mode: "mock",
    });

    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          attempt_count: startingAttempt,
          failure_type: null,
          last_error: null,
          next_retry_at: null,
          provider_message_id: mockId,
          sent_at: new Date().toISOString(),
          provider_response: mockResponse,
          updated_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    return {
      success: true,
      simulated: true,
      mode: "mock",
      messageId: mockId,
      attempts: startingAttempt,
      logId,
    };
  }

  const client = params.options?.resendClient || getResendClient();
  if (!client || (!params.options?.resendClient && !config.isConfigured)) {
    const missingMsg = "Resend email client is unconfigured (RESEND_API_KEY missing or invalid).";
    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "failed",
          attempt_count: startingAttempt,
          failure_type: "permanent",
          last_error: missingMsg,
          provider_response: missingMsg,
          updated_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }
    return {
      success: false,
      mode: "unconfigured",
      failureType: "permanent",
      logId,
      error: missingMsg,
    };
  }

  const totalAttemptCap = Math.max(startingAttempt, maxAttempts);

  for (let attempt = startingAttempt; attempt <= totalAttemptCap; attempt++) {
    if (attempt > startingAttempt && retryBaseDelayMs > 0) {
      const delayMs = Math.min(
        retryBaseDelayMs * Math.pow(2, attempt - startingAttempt - 1),
        2000
      );
      await sleepMs(delayMs);
    }

    try {
      const { data: resendRes, error: sendErr } = await withEmailTimeout<any>(
        client.emails.send({
          from: config.fromEmail,
          to: cleanRecipient,
          subject: params.subject,
          html: params.html,
        }),
        timeoutMs
      );

      if (sendErr) {
        const errObj: any = new Error(sendErr.message || "Resend delivery rejected");
        if (sendErr.statusCode !== undefined) errObj.statusCode = sendErr.statusCode;
        if (sendErr.name) errObj.name = sendErr.name;
        throw errObj;
      }

      const messageId = resendRes?.id || `msg_${Date.now()}`;
      if (logId) {
        await adminDb
          .from("email_logs")
          .update({
            status: "sent",
            attempt_count: attempt,
            failure_type: null,
            last_error: null,
            next_retry_at: null,
            provider_message_id: messageId,
            sent_at: new Date().toISOString(),
            provider_response: JSON.stringify(resendRes || { id: messageId }),
            updated_at: new Date().toISOString(),
          })
          .eq("id", logId);
      }

      return {
        success: true,
        mode,
        messageId,
        attempts: attempt,
        logId,
      };
    } catch (err: any) {
      const { failureType, message } = classifyEmailError(err);
      const canRetryWithinRun = failureType === "transient" && attempt < totalAttemptCap;
      const nextRetryAt =
        failureType === "transient"
          ? new Date(Date.now() + Math.min(retryBaseDelayMs * Math.pow(2, attempt - 1), 60000)).toISOString()
          : null;

      console.error(`Resend delivery attempt ${attempt}/${totalAttemptCap} (${failureType}) failed:`, message);

      if (logId) {
        await adminDb
          .from("email_logs")
          .update({
            status: "failed",
            attempt_count: attempt,
            failure_type: failureType,
            last_error: message,
            next_retry_at: canRetryWithinRun ? nextRetryAt : null,
            provider_response: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", logId);
      }

      if (!canRetryWithinRun) {
        return {
          success: false,
          mode,
          logId,
          attempts: attempt,
          failureType,
          retryable: failureType === "transient",
          error: message,
        };
      }
    }
  }

  return {
    success: false,
    mode,
    logId,
    error: "Email delivery failed after bounded retries.",
  };
}

function guardEmailExecutionEarly(): EmailDispatchResult | null {
  const { mode, error } = resolveResendExecution();
  if (error) {
    return { success: false, mode: "unconfigured", error };
  }
  if (mode === "disabled") {
    return {
      success: false,
      disabled: true,
      mode: "disabled",
      reason: "Transactional emails are disabled on this server (ENABLE_EMAILS=false).",
    };
  }
  return null;
}

export async function sendOrderEmails(
  params: SendOrderEmailsParams,
  options: EmailServiceOptions = {}
): Promise<EmailDispatchResult> {
  const earlyExit = guardEmailExecutionEarly();
  if (earlyExit) return earlyExit;

  const { orderId, userId, eventType, cancelReason } = params;
  const adminDb = options.adminDb || createAdminClient();

  const { data: profile } = await adminDb
    .from("profiles")
    .select("name, email, email_notifications_enabled, is_deleted")
    .eq("id", userId)
    .maybeSingle();

  const recipientEmail = profile?.email || "";
  const customerName = profile?.name || "Customer";

  const { data: order } = await adminDb
    .from("orders")
    .select(
      "id, order_number, order_status, payment_status, is_paid, total_amount, subtotal, delivery_fee, platform_fee, discount_amount, coupon_code, payment_method, created_at, address_snapshot"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) {
    console.error(`Cannot send email: order ${orderId} not found`);
    return { success: false, reason: "Order not found" };
  }

  const idempotencyKey = buildEmailIdempotencyKey(
    eventType,
    recipientEmail || userId,
    order.id,
    options.idempotencyKey
  );

  const suppressionReason = resolveOrderEmailSuppressionReason({
    eventType,
    order,
    profile,
  });

  if (suppressionReason) {
    return recordSuppressedEmail({
      adminDb,
      recipient: normalizeEmailAddress(recipientEmail) || "unknown",
      eventType,
      orderId: order.id,
      idempotencyKey,
      reason: suppressionReason,
    });
  }

  if (!isValidEmailAddress(recipientEmail)) {
    return recordSuppressedEmail({
      adminDb,
      recipient: normalizeEmailAddress(recipientEmail) || "missing",
      eventType,
      orderId: order.id,
      idempotencyKey,
      reason: "invalid_recipient_email",
    });
  }

  const { data: rawItems } = await adminDb
    .from("order_items")
    .select("title, price, quantity")
    .eq("order_id", orderId);

  const items: EmailOrderItem[] = (rawItems || []).map((it: any) => ({
    title: it.title,
    quantity: it.quantity,
    price: Number(it.price),
  }));

  const orderDetails: EmailOrderDetails = {
    id: order.id,
    order_number: order.order_number,
    total_amount: Number(order.total_amount),
    subtotal: Number(order.subtotal ?? order.total_amount),
    delivery_fee: Number(order.delivery_fee ?? DELIVERY_FEE),
    platform_fee: Number(order.platform_fee ?? PLATFORM_FEE),
    discount_amount: Number(order.discount_amount ?? 0),
    coupon_code: order.coupon_code,
    payment_method: order.payment_method,
    created_at: order.created_at,
    address_snapshot: order.address_snapshot as any,
  };

  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

  let subject = "";
  let html = "";

  switch (eventType) {
    case "order_confirmation":
      subject = `Order Confirmation #${displayOrderNum} — MD Shakib Islamic Books`;
      html = renderOrderConfirmationHtml(orderDetails, items, customerName);
      break;
    case "payment_success":
      subject = `Payment Received for Order #${displayOrderNum} — MD Shakib Islamic Books`;
      html = renderPaymentSuccessHtml(orderDetails, customerName);
      break;
    case "order_cancellation":
      subject = `Order #${displayOrderNum} Cancelled — MD Shakib Islamic Books`;
      html = renderOrderCancellationHtml(orderDetails, customerName, cancelReason || "");
      break;
  }

  return dispatchEmailWithLogging({
    recipient: recipientEmail,
    eventType,
    subject,
    html,
    orderId: order.id,
    idempotencyKey,
    options,
  });
}

/**
 * Sends a new order notification to the store administrator (Feature 1.18).
 */
export async function sendAdminNewOrderNotification(
  orderId: string,
  options: EmailServiceOptions = {}
): Promise<EmailDispatchResult> {
  const earlyExit = guardEmailExecutionEarly();
  if (earlyExit) return earlyExit;

  const { config } = resolveResendExecution();
  const adminDb = options.adminDb || createAdminClient();
  const adminEmail = config.adminAlertEmail || "orders@mdshakib.com";

  const { data: order } = await adminDb
    .from("orders")
    .select(
      "id, order_number, order_status, payment_status, is_paid, user_id, total_amount, payment_method, created_at, address_snapshot"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { success: false, error: "Order not found" };

  const idempotencyKey = buildEmailIdempotencyKey(
    "admin_new_order",
    adminEmail,
    order.id,
    options.idempotencyKey
  );

  const suppressionReason = resolveOrderEmailSuppressionReason({
    eventType: "admin_new_order",
    order,
  });

  if (suppressionReason) {
    return recordSuppressedEmail({
      adminDb,
      recipient: normalizeEmailAddress(adminEmail),
      eventType: "admin_new_order",
      orderId: order.id,
      idempotencyKey,
      reason: suppressionReason,
    });
  }

  const { data: profile } = await adminDb
    .from("profiles")
    .select("name, email")
    .eq("id", order.user_id)
    .maybeSingle();

  const customerName = profile?.name || "Customer";
  const customerEmail = profile?.email || "Unknown";

  const { data: rawItems } = await adminDb
    .from("order_items")
    .select("title, price, quantity")
    .eq("order_id", orderId);

  const items: EmailOrderItem[] = (rawItems || []).map((it: any) => ({
    title: it.title,
    quantity: it.quantity,
    price: Number(it.price),
  }));

  const orderDetails: EmailOrderDetails = {
    id: order.id,
    order_number: order.order_number,
    total_amount: Number(order.total_amount),
    payment_method: order.payment_method,
    created_at: order.created_at,
    address_snapshot: order.address_snapshot as any,
  };

  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();
  const subject = `[New Order] #${displayOrderNum} — ₹${Number(order.total_amount).toFixed(2)} (${order.payment_method})`;
  const html = renderAdminNewOrderHtml(orderDetails, items, customerName, customerEmail);

  return dispatchEmailWithLogging({
    recipient: adminEmail,
    eventType: "admin_new_order",
    subject,
    html,
    orderId: order.id,
    idempotencyKey,
    options,
  });
}

/**
 * Sends shipment status notifications (shipped, out_for_delivery, delivered) to customer (Feature 1.19).
 */
export async function sendShipmentNotification(
  orderId: string,
  eventType: "shipped" | "out_for_delivery" | "delivered",
  options: EmailServiceOptions = {}
): Promise<EmailDispatchResult> {
  const earlyExit = guardEmailExecutionEarly();
  if (earlyExit) return earlyExit;

  const adminDb = options.adminDb || createAdminClient();

  const { data: order } = await adminDb
    .from("orders")
    .select(
      "id, order_number, order_status, payment_status, is_paid, user_id, total_amount, payment_method, created_at, address_snapshot, shipping_awb, shipping_courier, shipping_tracking_url"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return { success: false, error: "Order not found" };

  const { data: profile } = await adminDb
    .from("profiles")
    .select("name, email, email_notifications_enabled, is_deleted")
    .eq("id", order.user_id)
    .maybeSingle();

  const recipientEmail = profile?.email || "";
  const customerName = profile?.name || "Customer";

  const idempotencyKey = buildEmailIdempotencyKey(
    eventType,
    recipientEmail || order.user_id,
    order.id,
    options.idempotencyKey
  );

  const suppressionReason = resolveOrderEmailSuppressionReason({
    eventType,
    order,
    profile,
  });

  if (suppressionReason) {
    return recordSuppressedEmail({
      adminDb,
      recipient: normalizeEmailAddress(recipientEmail) || "unknown",
      eventType,
      orderId: order.id,
      idempotencyKey,
      reason: suppressionReason,
    });
  }

  if (!isValidEmailAddress(recipientEmail)) {
    return recordSuppressedEmail({
      adminDb,
      recipient: normalizeEmailAddress(recipientEmail) || "missing",
      eventType,
      orderId: order.id,
      idempotencyKey,
      reason: "invalid_recipient_email",
    });
  }

  const orderDetails: EmailOrderDetails = {
    id: order.id,
    order_number: order.order_number,
    total_amount: Number(order.total_amount),
    payment_method: order.payment_method,
    created_at: order.created_at,
    address_snapshot: order.address_snapshot as any,
  };

  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();
  const subjectMap = {
    shipped: `Your Order #${displayOrderNum} Has Shipped — MD Shakib Islamic Books`,
    out_for_delivery: `Your Order #${displayOrderNum} is Out for Delivery Today`,
    delivered: `Your Order #${displayOrderNum} Has Been Delivered — MD Shakib Islamic Books`,
  };

  const subject = subjectMap[eventType];
  const html = renderShipmentNotificationHtml(
    orderDetails,
    customerName,
    eventType,
    order.shipping_awb || undefined,
    order.shipping_courier || undefined,
    order.shipping_tracking_url || undefined
  );

  return dispatchEmailWithLogging({
    recipient: recipientEmail,
    eventType,
    subject,
    html,
    orderId: order.id,
    idempotencyKey,
    options,
  });
}

/**
 * Sends customer acknowledgement and admin alerts for contact form submissions (Feature 1.20).
 */
export async function sendContactFormAcknowledgement(
  submission: {
    name: string;
    email: string;
    phone?: string;
    subject: string;
    message: string;
  },
  options: EmailServiceOptions = {}
): Promise<EmailDispatchResult> {
  const earlyExit = guardEmailExecutionEarly();
  if (earlyExit) return earlyExit;

  const { config } = resolveResendExecution();

  const custSubject = `Inquiry Received: "${submission.subject}" — MD Shakib Islamic Books`;
  const custHtml = renderContactAcknowledgementHtml(
    submission.name,
    submission.subject,
    submission.message
  );

  const adminEmail = config.adminAlertEmail || config.supportEmail || "support@mdshakib.com";
  const adminSubject = `[Inquiry] ${submission.subject} — ${submission.name}`;
  const adminHtml = renderContactAdminAlertHtml(
    submission.name,
    submission.email,
    submission.phone,
    submission.subject,
    submission.message
  );

  const [custRes, adminRes] = await Promise.all([
    dispatchEmailWithLogging({
      recipient: submission.email,
      eventType: "contact_acknowledgement",
      subject: custSubject,
      html: custHtml,
      deduplicate: false,
      options,
    }),
    dispatchEmailWithLogging({
      recipient: adminEmail,
      eventType: "contact_admin_alert",
      subject: adminSubject,
      html: adminHtml,
      deduplicate: false,
      options,
    }),
  ]);

  if (!custRes.success && !adminRes.success) {
    return custRes;
  }

  return {
    success: custRes.success || adminRes.success,
    simulated: custRes.simulated || adminRes.simulated,
    mode: custRes.mode || adminRes.mode,
    error: !custRes.success ? custRes.error : !adminRes.success ? adminRes.error : undefined,
  };
}

/**
 * Sends a low inventory alert email to admin staff (Feature 1.22).
 */
export async function sendLowStockAlertEmail(
  alerts: Array<{ bookId: string; title: string; stock: number }>,
  options: EmailServiceOptions = {}
): Promise<EmailDispatchResult> {
  if (!alerts || alerts.length === 0) return { success: true };

  const earlyExit = guardEmailExecutionEarly();
  if (earlyExit) return earlyExit;

  const { config } = resolveResendExecution();
  const adminEmail = config.adminAlertEmail || "inventory@mdshakib.com";
  const subject = `⚠️ Low Inventory Alert: ${alerts.length} title(s) below threshold`;
  const html = renderLowStockAlertHtml(alerts);

  return dispatchEmailWithLogging({
    recipient: adminEmail,
    eventType: "low_stock_alert",
    subject,
    html,
    deduplicate: Boolean(options.idempotencyKey),
    extraMeta: { count: alerts.length },
    options,
  });
}
