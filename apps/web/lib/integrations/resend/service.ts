import { getResendClient } from "./client";
import { getIntegrationsConfig } from "../config";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  renderOrderConfirmationHtml,
  renderPaymentSuccessHtml,
  renderOrderCancellationHtml,
  type EmailOrderDetails,
  type EmailOrderItem,
} from "./templates";

export interface SendOrderEmailsParams {
  orderId: string;
  userId: string;
  eventType: "order_confirmation" | "payment_success" | "order_cancellation";
  cancelReason?: string;
}

export async function sendOrderEmails(params: SendOrderEmailsParams) {
  const { orderId, userId, eventType, cancelReason } = params;
  const adminDb = createAdminClient();
  const { resend } = getIntegrationsConfig();

  // 1. Fetch user email and profile name
  const { data: profile } = await adminDb
    .from("profiles")
    .select("name, email")
    .eq("id", userId)
    .single();

  const recipientEmail = profile?.email;
  const customerName = profile?.name || "Customer";

  if (!recipientEmail) {
    console.error(`Cannot send email: user ${userId} has no email address`);
    return { success: false, reason: "No recipient email found" };
  }

  // 2. Fetch order details
  const { data: order } = await adminDb
    .from("orders")
    .select("id, total_amount, payment_method, created_at, address_snapshot")
    .eq("id", orderId)
    .single();

  if (!order) {
    console.error(`Cannot send email: order ${orderId} not found`);
    return { success: false, reason: "Order not found" };
  }

  // 3. Fetch order items
  const { data: rawItems } = await adminDb
    .from("order_items")
    .select("title, price, quantity")
    .eq("order_id", orderId);

  const items: EmailOrderItem[] = (rawItems || []).map((it) => ({
    title: it.title,
    quantity: it.quantity,
    price: Number(it.price),
  }));

  const orderDetails: EmailOrderDetails = {
    id: order.id,
    total_amount: Number(order.total_amount),
    payment_method: order.payment_method,
    created_at: order.created_at,
    address_snapshot: order.address_snapshot as any,
  };

  // 4. Generate subject and HTML content based on eventType
  let subject = "";
  let html = "";

  switch (eventType) {
    case "order_confirmation":
      subject = `Order Confirmation #${order.id.slice(0, 8)} — MD Shakib Islamic Books`;
      html = renderOrderConfirmationHtml(orderDetails, items, customerName);
      break;
    case "payment_success":
      subject = `Payment Received for Order #${order.id.slice(0, 8)} — MD Shakib Islamic Books`;
      html = renderPaymentSuccessHtml(orderDetails, customerName);
      break;
    case "order_cancellation":
      subject = `Order #${order.id.slice(0, 8)} Cancelled — MD Shakib Islamic Books`;
      html = renderOrderCancellationHtml(orderDetails, customerName, cancelReason || "");
      break;
  }

  // 5. Insert queued log into email_logs
  const { data: logEntry, error: logErr } = await adminDb
    .from("email_logs")
    .insert({
      order_id: order.id,
      recipient: recipientEmail,
      event_type: eventType,
      status: "queued",
    })
    .select("id")
    .single();

  const logId = logEntry?.id;

  // 6. Send via Resend client
  const client = getResendClient();

  if (!client || !resend.isConfigured) {
    // Graceful offline / test logging mode
    const mockResponse = JSON.stringify({
      mode: "mock_test_dispatch",
      to: recipientEmail,
      subject,
      timestamp: new Date().toISOString(),
    });

    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          provider_response: mockResponse,
        })
        .eq("id", logId);
    }

    return { success: true, mode: "mock", logId };
  }

  try {
    const { data: resendRes, error: sendErr } = await client.emails.send({
      from: resend.fromEmail,
      to: recipientEmail,
      subject,
      html,
    });

    if (sendErr) {
      throw new Error(sendErr.message);
    }

    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          provider_response: JSON.stringify(resendRes),
        })
        .eq("id", logId);
    }

    return { success: true, messageId: resendRes?.id, logId };
  } catch (error: any) {
    console.error("Resend delivery failed:", error?.message || error);

    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "failed",
          provider_response: String(error?.message || error),
        })
        .eq("id", logId);
    }

    return { success: false, error: error?.message || error, logId };
  }
}

