import crypto from "crypto";
import { getIntegrationsConfig } from "../config";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "../resend/service";

/**
 * Validates the Razorpay webhook signature header against the raw request payload.
 */
export function validateWebhookSignature(
  rawBody: string,
  signatureHeader: string,
  secret: string
): boolean {
  if (!rawBody || !signatureHeader || !secret) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expectedSignature, "utf8"),
      Buffer.from(signatureHeader, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * Idempotently processes Razorpay webhook events.
 */
export async function processRazorpayWebhook(rawBody: string, signature: string) {
  const { razorpay } = getIntegrationsConfig();

  if (!razorpay.webhookSecret) {
    throw new Error("Razorpay webhook secret is not configured.");
  }

  const isValid = validateWebhookSignature(rawBody, signature, razorpay.webhookSecret);
  if (!isValid) {
    throw new Error("Invalid Razorpay webhook signature.");
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    throw new Error("Malformed webhook JSON body.");
  }

  const adminDb = createAdminClient();
  const eventType = event.event;
  const payload = event.payload;

  switch (eventType) {
    case "order.paid":
    case "payment.captured": {
      const paymentEntity = payload?.payment?.entity;
      const orderEntity = payload?.order?.entity;

      const rzpOrderId = paymentEntity?.order_id || orderEntity?.id;
      const rzpPaymentId = paymentEntity?.id;

      if (!rzpOrderId) {
        return { status: "ignored", reason: "Missing Razorpay order ID in payload" };
      }

      // 1. Execute atomic database settlement with pessimistic row-level locking
      const { data: rpcRes, error: rpcErr } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: rzpPaymentId || "webhook_captured",
        p_signature: signature,
        p_raw_response: payload,
      });

      if (rpcErr) {
        throw new Error(`Atomic webhook settlement failed: ${rpcErr.message}`);
      }

      const result = rpcRes as any;
      if (!result?.success) {
        return { status: "ignored", reason: result?.message || "Settlement failed" };
      }

      // 2. Concurrency & Idempotency: if already paid, safely return without duplicate emails
      if (result.status === "already_paid" || !result.settled) {
        return { status: "idempotent_ok", orderId: result.order_id };
      }

      // 3. Trigger email side effect ONLY after confirmed first atomic settlement
      sendOrderEmails({
        orderId: result.order_id,
        userId: result.user_id,
        eventType: "payment_success",
      }).catch((err) => console.error("Webhook async email error:", err));

      return { status: "settled", orderId: result.order_id };
    }

    case "payment.failed": {
      const paymentEntity = payload?.payment?.entity;
      const rzpOrderId = paymentEntity?.order_id;

      if (!rzpOrderId) {
        return { status: "ignored", reason: "Missing order_id in payment.failed payload" };
      }

      // Execute atomic failure recording that rejects downgrading already-paid records
      const { data: rpcRes, error: rpcErr } = await adminDb.rpc("record_payment_failure_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_raw_response: payload,
      });

      if (rpcErr) {
        throw new Error(`Atomic payment failure recording failed: ${rpcErr.message}`);
      }

      const result = rpcRes as any;
      return result;
    }

    case "refund.processed":
    case "refund.created":
    case "refund.failed": {
      const refundEntity = payload?.refund?.entity;
      const paymentEntity = payload?.payment?.entity;
      const rzpPaymentId = refundEntity?.payment_id || paymentEntity?.id;
      const refundId = refundEntity?.id;

      if (!rzpPaymentId || !refundId) {
        return { status: "ignored", reason: "Missing payment_id or refund_id in refund webhook payload" };
      }

      // Look up order matching the payment
      const { data: order } = await adminDb
        .from("orders")
        .select("id, total_amount, payment_status, razorpay_refund_id, refund_status")
        .eq("razorpay_payment_id", rzpPaymentId)
        .maybeSingle();

      const refundStatus =
        eventType === "refund.processed"
          ? "processed"
          : eventType === "refund.failed"
          ? "failed"
          : "pending";

      let targetOrderId = order?.id;
      let targetAmount = order ? Number(order.total_amount) : 0;

      if (!targetOrderId) {
        // Fallback: look up in payments table
        const { data: payment } = await adminDb
          .from("payments")
          .select("order_id, amount")
          .eq("provider_payment_id", rzpPaymentId)
          .maybeSingle();

        if (!payment) {
          return { status: "ignored", reason: `Order for payment ${rzpPaymentId} not found` };
        }
        targetOrderId = payment.order_id;
        targetAmount = Number(payment.amount);
      }

      const finalAmount = refundEntity?.amount ? Number(refundEntity.amount) / 100 : targetAmount;

      const { data: rpcRes, error: rpcErr } = await adminDb.rpc("record_refund_atomic", {
        p_order_id: targetOrderId,
        p_refund_id: refundId,
        p_refund_amount: finalAmount,
        p_refund_status: refundStatus,
        p_raw_response: payload,
      });

      if (rpcErr) {
        throw new Error(`Atomic refund webhook recording failed: ${rpcErr.message}`);
      }

      return { status: "refund_recorded", orderId: targetOrderId, refundStatus };
    }

    default:
      return { status: "unhandled_event", event: eventType };
  }
}

