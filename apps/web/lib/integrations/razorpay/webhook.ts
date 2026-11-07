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

  // Durable Webhook Idempotency Check (Feature 0.5 & Remediation 6)
  if (event?.id) {
    const { data: existingEvent } = await adminDb
      .from("webhook_events")
      .select("id, status")
      .eq("event_id", event.id)
      .maybeSingle();

    if (existingEvent) {
      if (existingEvent.status === "completed") {
        return { status: "idempotent_ok", reason: "Webhook event already processed" };
      }
    } else {
      await adminDb.from("webhook_events").insert({
        event_id: event.id,
        provider: "Razorpay",
        event_type: eventType,
        status: "processing",
        payload: event,
      });
    }
  }

  try {
    switch (eventType) {
      case "order.paid":
      case "payment.captured": {
        const paymentEntity = payload?.payment?.entity;
        const orderEntity = payload?.order?.entity;

        const rzpOrderId = paymentEntity?.order_id || orderEntity?.id;
        const rzpPaymentId = paymentEntity?.id;

        // Strict provider payload validation (Remediation 6)
        if (!rzpOrderId || typeof rzpOrderId !== "string" || !rzpOrderId.trim()) {
          return { status: "ignored", reason: "Missing or invalid Razorpay order ID in payload" };
        }

        if (!rzpPaymentId || typeof rzpPaymentId !== "string" || !rzpPaymentId.trim()) {
          return { status: "ignored", reason: "Missing or invalid Razorpay payment ID in payload" };
        }

        // Verify that payment ID belongs to the expected Razorpay order
        if (paymentEntity?.order_id && orderEntity?.id && paymentEntity.order_id !== orderEntity.id) {
          return { status: "rejected", reason: "Payment order ID mismatch with webhook order entity" };
        }

        // Verify payment currency: INR required
        const currency = (paymentEntity?.currency || orderEntity?.currency || "").toUpperCase();
        if (currency && currency !== "INR") {
          return { status: "rejected", reason: `Unsupported payment currency: ${currency}. Only INR is accepted.` };
        }

        // Verify amount in paise exists and is positive
        const amountPaise = paymentEntity?.amount ?? orderEntity?.amount;
        if (typeof amountPaise !== "number" || amountPaise <= 0) {
          return { status: "rejected", reason: "Missing or non-positive payment amount in webhook payload" };
        }

        // 1. Execute atomic database settlement with pessimistic row-level locking
        const { data: rpcRes, error: rpcErr } = await adminDb.rpc("settle_payment_atomic", {
          p_razorpay_order_id: rzpOrderId,
          p_razorpay_payment_id: rzpPaymentId,
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

        // Mark webhook event completed
        if (event?.id) {
          await adminDb
            .from("webhook_events")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("event_id", event.id);
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

        // Mark webhook event completed
        if (event?.id) {
          await adminDb
            .from("webhook_events")
            .update({ status: "completed", updated_at: new Date().toISOString() })
            .eq("event_id", event.id);
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
  } catch (err: any) {
    if (event?.id) {
      await adminDb
        .from("webhook_events")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("event_id", event.id);
    }
    throw err;
  }
}

