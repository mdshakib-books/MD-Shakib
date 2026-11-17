import crypto from "crypto";
import { resolveRazorpayExecution } from "./client";
import { initiateRazorpayRefund, mapDbRefundStatusToLifecycle } from "./service";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderEmails } from "../resend/service";
import { isMockTokenValue, isPlaceholderValue } from "@/lib/env/shared";

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
export async function processRazorpayWebhook(
  rawBody: string,
  signature: string,
  options: { adminDb?: any; razorpayClient?: any } = {}
) {
  const { mode, config: razorpay } = resolveRazorpayExecution("webhook processing");

  if (
    !razorpay.webhookSecret ||
    isPlaceholderValue(razorpay.webhookSecret) ||
    (mode === "live" && isMockTokenValue(razorpay.webhookSecret))
  ) {
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

  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new Error("Malformed webhook JSON payload: expected JSON object.");
  }

  const adminDb = options.adminDb || createAdminClient();
  const eventType = typeof event.event === "string" ? event.event.trim() : "";
  const payload = event.payload;
  const eventId = typeof event.id === "string" && event.id.trim() ? event.id.trim() : null;

  // Durable Webhook Idempotency & In-Flight Lock Check
  if (eventId) {
    const { data: existingEvent } = await adminDb
      .from("webhook_events")
      .select("id, status")
      .eq("event_id", eventId)
      .maybeSingle();

    if (existingEvent) {
      if (existingEvent.status === "completed") {
        return { status: "idempotent_ok", reason: "Webhook event already processed" };
      }
      if (existingEvent.status === "processing") {
        return {
          status: "in_flight_duplicate",
          reason: "Webhook event is currently being processed by another worker",
        };
      }
      await adminDb
        .from("webhook_events")
        .update({
          status: "processing",
          updated_at: new Date().toISOString(),
        })
        .eq("event_id", eventId);
    } else {
      await adminDb.from("webhook_events").insert({
        event_id: eventId,
        provider: "Razorpay",
        event_type: eventType || "unknown",
        status: "processing",
        payload: event,
      });
    }
  }

  const markEventCompleted = async () => {
    if (eventId) {
      await adminDb
        .from("webhook_events")
        .update({ status: "completed", updated_at: new Date().toISOString() })
        .eq("event_id", eventId);
    }
  };

  const finalizeOutcome = async <T extends Record<string, any>>(outcome: T): Promise<T> => {
    await markEventCompleted();
    return outcome;
  };

  try {
    switch (eventType) {
      case "order.paid":
      case "payment.captured": {
        const paymentEntity = payload?.payment?.entity;
        const orderEntity = payload?.order?.entity;

        const rzpOrderId = paymentEntity?.order_id || orderEntity?.id;
        const rzpPaymentId = paymentEntity?.id;

        if (!rzpOrderId || typeof rzpOrderId !== "string" || !rzpOrderId.trim()) {
          return finalizeOutcome({
            status: "ignored",
            reason: "Missing or invalid Razorpay order ID in payload",
          });
        }

        if (!rzpPaymentId || typeof rzpPaymentId !== "string" || !rzpPaymentId.trim()) {
          return finalizeOutcome({
            status: "ignored",
            reason: "Missing or invalid Razorpay payment ID in payload",
          });
        }

        if (paymentEntity?.order_id && orderEntity?.id && paymentEntity.order_id !== orderEntity.id) {
          return finalizeOutcome({
            status: "rejected",
            reason: "Payment order ID mismatch with webhook order entity",
          });
        }

        const entityStatus = String(paymentEntity?.status || "").trim().toLowerCase();
        if (entityStatus && entityStatus !== "captured") {
          return finalizeOutcome({
            status: "rejected",
            reason: `Payment entity status "${entityStatus}" is not captured.`,
          });
        }

        const currency = (paymentEntity?.currency || orderEntity?.currency || "").toUpperCase();
        if (!currency || currency !== "INR") {
          return finalizeOutcome({
            status: "rejected",
            reason: `Unsupported payment currency: ${currency || "NONE"}. Only INR is accepted.`,
          });
        }

        const amountPaise = paymentEntity?.amount ?? orderEntity?.amount;
        if (typeof amountPaise !== "number" || !Number.isFinite(amountPaise) || amountPaise <= 0) {
          return finalizeOutcome({
            status: "rejected",
            reason: "Missing or non-positive payment amount in webhook payload",
          });
        }

        const { data: rpcRes, error: rpcErr } = await adminDb.rpc("settle_payment_atomic", {
          p_razorpay_order_id: rzpOrderId.trim(),
          p_razorpay_payment_id: rzpPaymentId.trim(),
          p_signature: signature,
          p_raw_response: payload,
        });

        if (rpcErr) {
          throw new Error(`Atomic webhook settlement failed: ${rpcErr.message}`);
        }

        const result = rpcRes as any;

        // If late/duplicate capture arrived on an unrecoverable cancelled or stock-exhausted order,
        // automatically initiate tracked refund instead of leaving captured funds orphaned.
        if (!result?.success && result?.requires_refund && result?.order_id) {
          await markEventCompleted();
          const refundRes = await initiateRazorpayRefund(
            {
              orderId: result.order_id,
              reason: result.message || "Automatic refund for unrecoverable late payment capture",
              idempotencyKey: `refund:late_capture:${result.order_id}:${rzpPaymentId}`,
              refundType: "cancellation",
            },
            { adminDb, razorpayClient: options.razorpayClient }
          ).catch((err) => ({
            success: false,
            status: "failed" as const,
            lifecycleState: "FAILED" as const,
            error: err?.message || String(err),
          }));

          return {
            status: "refund_triggered",
            orderId: result.order_id,
            reason: result.message,
            refundResult: refundRes,
          };
        }

        if (!result?.success) {
          return finalizeOutcome({
            status: "ignored",
            reason: result?.message || "Settlement failed",
          });
        }

        await markEventCompleted();

        if (result.status === "already_paid" || !result.settled) {
          return { status: "idempotent_ok", orderId: result.order_id };
        }

        sendOrderEmails(
          {
            orderId: result.order_id,
            userId: result.user_id,
            eventType: "payment_success",
          },
          options.adminDb ? { adminDb: options.adminDb } : undefined
        ).catch((err) => console.error("Webhook async email error:", err));

        return { status: "settled", orderId: result.order_id };
      }

      case "payment.failed": {
        const paymentEntity = payload?.payment?.entity;
        const rzpOrderId = paymentEntity?.order_id;

        if (!rzpOrderId || typeof rzpOrderId !== "string" || !rzpOrderId.trim()) {
          return finalizeOutcome({
            status: "ignored",
            reason: "Missing order_id in payment.failed payload",
          });
        }

        const { data: rpcRes, error: rpcErr } = await adminDb.rpc("record_payment_failure_atomic", {
          p_razorpay_order_id: rzpOrderId.trim(),
          p_raw_response: payload,
        });

        if (rpcErr) {
          throw new Error(`Atomic payment failure recording failed: ${rpcErr.message}`);
        }

        await markEventCompleted();

        return rpcRes as any;
      }

      case "refund.processed":
      case "refund.created":
      case "refund.failed": {
        const refundEntity = payload?.refund?.entity;
        const paymentEntity = payload?.payment?.entity;
        const rzpPaymentId = refundEntity?.payment_id || paymentEntity?.id;
        const refundId = refundEntity?.id;

        if (!rzpPaymentId || typeof rzpPaymentId !== "string" || !rzpPaymentId.trim() || !refundId || typeof refundId !== "string" || !refundId.trim()) {
          return finalizeOutcome({
            status: "ignored",
            reason: "Missing payment_id or refund_id in refund webhook payload",
          });
        }

        if (refundEntity?.currency && String(refundEntity.currency).toUpperCase() !== "INR") {
          return finalizeOutcome({
            status: "rejected",
            reason: `Unsupported refund currency: ${refundEntity.currency}`,
          });
        }

        const refundStatus =
          eventType === "refund.processed"
            ? "processed"
            : eventType === "refund.failed"
            ? "failed"
            : "processing";

        const failureReason =
          eventType === "refund.failed"
            ? refundEntity?.failure_reason ||
              payload?.error?.description ||
              "Refund failed at payment gateway"
            : null;

        let targetOrderId: string | undefined;
        let targetAmount = 0;
        let targetMethod = "ONLINE";

        const { data: order } = await adminDb
          .from("orders")
          .select("id, total_amount, payment_method")
          .eq("razorpay_payment_id", rzpPaymentId.trim())
          .maybeSingle();

        if (order) {
          targetOrderId = order.id;
          targetAmount = Number(order.total_amount);
          targetMethod = String(order.payment_method || "ONLINE").toUpperCase();
        } else {
          const { data: payment } = await adminDb
            .from("payments")
            .select("order_id, amount")
            .eq("provider_payment_id", rzpPaymentId.trim())
            .maybeSingle();

          if (payment) {
            targetOrderId = payment.order_id;
            targetAmount = Number(payment.amount);
          } else {
            const { data: rec } = await adminDb
              .from("refund_records")
              .select("order_id, amount")
              .eq("gateway_refund_id", refundId.trim())
              .maybeSingle();

            if (!rec) {
              return finalizeOutcome({
                status: "ignored",
                reason: `Order for payment ${rzpPaymentId} not found`,
              });
            }
            targetOrderId = rec.order_id;
            targetAmount = Number(rec.amount);
          }
        }

        if (targetMethod === "COD") {
          return finalizeOutcome({
            status: "rejected",
            reason: "Razorpay refund webhook rejected for non-ONLINE (COD) order.",
          });
        }

        const finalAmount =
          refundEntity?.amount !== undefined && refundEntity?.amount !== null
            ? Number((Number(refundEntity.amount) / 100).toFixed(2))
            : targetAmount;

        if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
          return finalizeOutcome({
            status: "rejected",
            reason: "Invalid or non-positive refund amount in webhook payload.",
          });
        }

        if (targetAmount > 0 && finalAmount > targetAmount + 0.01) {
          return finalizeOutcome({
            status: "rejected",
            reason: `Refund webhook amount (${finalAmount}) exceeds order/payment amount (${targetAmount}).`,
          });
        }

        const { data: rpcRes, error: rpcErr } = await adminDb.rpc("record_refund_atomic", {
          p_order_id: targetOrderId,
          p_refund_id: refundId.trim(),
          p_refund_amount: finalAmount,
          p_refund_status: refundStatus,
          p_raw_response: payload,
          p_idempotency_key: refundEntity?.notes?.idempotency_key || null,
          p_error_message: failureReason,
        });

        if (rpcErr) {
          throw new Error(`Atomic refund webhook recording failed: ${rpcErr.message}`);
        }

        const rpcOutcome = rpcRes as any;
        if (rpcOutcome && rpcOutcome.success === false) {
          return finalizeOutcome({
            status: "ignored",
            reason: rpcOutcome.message || "Refund webhook rejected due to conflict or downgrade guard",
            orderId: targetOrderId,
            rpcResult: rpcOutcome,
          });
        }

        // Sync return_requests if this refund belongs to a return request
        if (refundStatus === "processed" && targetOrderId) {
          const { data: retRefundRec } = await adminDb
            .from("refund_records")
            .select("return_request_id")
            .eq("gateway_refund_id", refundId.trim())
            .maybeSingle();

          if (retRefundRec?.return_request_id) {
            await adminDb
              .from("return_requests")
              .update({
                status: "completed",
                resolved_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", retRefundRec.return_request_id)
              .neq("status", "completed");
          }
        }

        await markEventCompleted();

        return {
          status: "refund_recorded",
          orderId: targetOrderId,
          refundStatus,
          lifecycleState: mapDbRefundStatusToLifecycle(refundStatus),
          rpcResult: rpcRes,
        };
      }

      default:
        return finalizeOutcome({ status: "unhandled_event", event: eventType });
    }
  } catch (err: any) {
    if (eventId) {
      await adminDb
        .from("webhook_events")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("event_id", eventId);
    }
    throw err;
  }
}
