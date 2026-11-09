import { getResendClient } from "./client";
import { getIntegrationsConfig } from "../config";
import { createAdminClient } from "@/lib/supabase/admin";
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
    .select("id, order_number, total_amount, subtotal, delivery_fee, platform_fee, discount_amount, coupon_code, payment_method, created_at, address_snapshot")
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
    order_number: order.order_number,
    total_amount: Number(order.total_amount),
    subtotal: Number(order.subtotal || order.total_amount),
    delivery_fee: Number(order.delivery_fee || 35),
    platform_fee: Number(order.platform_fee || 10),
    discount_amount: Number(order.discount_amount || 0),
    coupon_code: order.coupon_code,
    payment_method: order.payment_method,
    created_at: order.created_at,
    address_snapshot: order.address_snapshot as any,
  };

  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

  // 4. Generate subject and HTML content based on eventType
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

  // 5. Insert queued log into email_logs
  const { data: logEntry } = await adminDb
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
          provider_response: error?.message || String(error),
        })
        .eq("id", logId);
    }

    return { success: false, error: error?.message };
  }
}

/**
 * Sends a new order notification to the store administrator (Feature 1.18).
 */
export async function sendAdminNewOrderNotification(orderId: string) {
  const adminDb = createAdminClient();
  const { resend } = getIntegrationsConfig();

  // Deduplicate: avoid sending multiple admin order alerts for same order
  const { data: existingLog } = await adminDb
    .from("email_logs")
    .select("id")
    .eq("order_id", orderId)
    .eq("event_type", "admin_new_order")
    .maybeSingle();

  if (existingLog) {
    return { success: true, alreadySent: true };
  }

  // 1. Fetch order details
  const { data: order } = await adminDb
    .from("orders")
    .select("id, order_number, user_id, total_amount, payment_method, created_at, address_snapshot")
    .eq("id", orderId)
    .single();

  if (!order) return { success: false, error: "Order not found" };

  // 2. Fetch customer details
  const { data: profile } = await adminDb
    .from("profiles")
    .select("name, email")
    .eq("id", order.user_id)
    .maybeSingle();

  const customerName = profile?.name || "Customer";
  const customerEmail = profile?.email || "Unknown";

  // 3. Fetch line items
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
    order_number: order.order_number,
    total_amount: Number(order.total_amount),
    payment_method: order.payment_method,
    created_at: order.created_at,
    address_snapshot: order.address_snapshot as any,
  };

  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "orders@mdshakib.com";
  const subject = `[New Order] #${displayOrderNum} — ₹${Number(order.total_amount).toFixed(2)} (${order.payment_method})`;
  const html = renderAdminNewOrderHtml(orderDetails, items, customerName, customerEmail);

  // 4. Log and dispatch
  const { data: logEntry } = await adminDb
    .from("email_logs")
    .insert({
      order_id: order.id,
      recipient: adminEmail,
      event_type: "admin_new_order",
      status: "queued",
    })
    .select("id")
    .single();

  const logId = logEntry?.id;
  const client = getResendClient();

  if (!client || !resend.isConfigured) {
    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          provider_response: JSON.stringify({ mode: "mock", to: adminEmail, subject }),
        })
        .eq("id", logId);
    }
    return { success: true, mode: "mock", logId };
  }

  try {
    const { data: resendRes, error: sendErr } = await client.emails.send({
      from: resend.fromEmail,
      to: adminEmail,
      subject,
      html,
    });

    if (sendErr) throw new Error(sendErr.message);

    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          provider_response: JSON.stringify(resendRes),
        })
        .eq("id", logId);
    }

    return { success: true, messageId: resendRes?.id };
  } catch (error: any) {
    if (logId) {
      await adminDb
        .from("email_logs")
        .update({ status: "failed", provider_response: error?.message || String(error) })
        .eq("id", logId);
    }
    return { success: false, error: error?.message };
  }
}

/**
 * Sends shipment status notifications (shipped, out_for_delivery, delivered) to customer (Feature 1.19).
 */
export async function sendShipmentNotification(
  orderId: string,
  eventType: "shipped" | "out_for_delivery" | "delivered"
) {
  const adminDb = createAdminClient();
  const { resend } = getIntegrationsConfig();

  // Deduplicate
  const { data: existingLog } = await adminDb
    .from("email_logs")
    .select("id")
    .eq("order_id", orderId)
    .eq("event_type", eventType)
    .maybeSingle();

  if (existingLog) {
    return { success: true, alreadySent: true };
  }

  const { data: order } = await adminDb
    .from("orders")
    .select("id, order_number, user_id, total_amount, payment_method, created_at, address_snapshot, shipping_awb, shipping_courier, shipping_tracking_url")
    .eq("id", orderId)
    .single();

  if (!order) return { success: false, error: "Order not found" };

  const { data: profile } = await adminDb
    .from("profiles")
    .select("name, email")
    .eq("id", order.user_id)
    .maybeSingle();

  const recipientEmail = profile?.email;
  const customerName = profile?.name || "Customer";

  if (!recipientEmail) return { success: false, error: "No recipient email found" };

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
    order.shipping_courier || "Delhivery",
    order.shipping_tracking_url || undefined
  );

  const { data: logEntry } = await adminDb
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
  const client = getResendClient();

  if (!client || !resend.isConfigured) {
    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          provider_response: JSON.stringify({ mode: "mock", to: recipientEmail, subject }),
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

    if (sendErr) throw new Error(sendErr.message);

    if (logId) {
      await adminDb
        .from("email_logs")
        .update({ status: "sent", provider_response: JSON.stringify(resendRes) })
        .eq("id", logId);
    }

    return { success: true, messageId: resendRes?.id };
  } catch (error: any) {
    if (logId) {
      await adminDb
        .from("email_logs")
        .update({ status: "failed", provider_response: error?.message || String(error) })
        .eq("id", logId);
    }
    return { success: false, error: error?.message };
  }
}

/**
 * Sends customer acknowledgement and admin alerts for contact form submissions (Feature 1.20).
 */
export async function sendContactFormAcknowledgement(submission: {
  name: string;
  email: string;
  phone?: string;
  subject: string;
  message: string;
}) {
  const adminDb = createAdminClient();
  const { resend } = getIntegrationsConfig();

  // 1. Send customer acknowledgement
  const custSubject = `Inquiry Received: "${submission.subject}" — MD Shakib Islamic Books`;
  const custHtml = renderContactAcknowledgementHtml(
    submission.name,
    submission.subject,
    submission.message
  );

  const { data: custLog } = await adminDb
    .from("email_logs")
    .insert({
      recipient: submission.email,
      event_type: "contact_acknowledgement",
      status: "queued",
    })
    .select("id")
    .single();

  // 2. Send admin notification
  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "support@mdshakib.com";
  const adminSubject = `[Inquiry] ${submission.subject} — ${submission.name}`;
  const adminHtml = renderContactAdminAlertHtml(
    submission.name,
    submission.email,
    submission.phone,
    submission.subject,
    submission.message
  );

  const { data: adminLog } = await adminDb
    .from("email_logs")
    .insert({
      recipient: adminEmail,
      event_type: "contact_admin_alert",
      status: "queued",
    })
    .select("id")
    .single();

  const client = getResendClient();

  if (!client || !resend.isConfigured) {
    if (custLog?.id) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          provider_response: JSON.stringify({ mode: "mock", to: submission.email, subject: custSubject }),
        })
        .eq("id", custLog.id);
    }
    if (adminLog?.id) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          provider_response: JSON.stringify({ mode: "mock", to: adminEmail, subject: adminSubject }),
        })
        .eq("id", adminLog.id);
    }
    return { success: true, mode: "mock" };
  }

  try {
    await Promise.all([
      client.emails.send({
        from: resend.fromEmail,
        to: submission.email,
        subject: custSubject,
        html: custHtml,
      }),
      client.emails.send({
        from: resend.fromEmail,
        to: adminEmail,
        subject: adminSubject,
        html: adminHtml,
      }),
    ]);

    if (custLog?.id) {
      await adminDb.from("email_logs").update({ status: "sent" }).eq("id", custLog.id);
    }
    if (adminLog?.id) {
      await adminDb.from("email_logs").update({ status: "sent" }).eq("id", adminLog.id);
    }

    return { success: true };
  } catch (error: any) {
    if (custLog?.id) {
      await adminDb.from("email_logs").update({ status: "failed", provider_response: error?.message }).eq("id", custLog.id);
    }
    if (adminLog?.id) {
      await adminDb.from("email_logs").update({ status: "failed", provider_response: error?.message }).eq("id", adminLog.id);
    }
    return { success: false, error: error?.message };
  }
}

/**
 * Sends a low inventory alert email to admin staff (Feature 1.22).
 */
export async function sendLowStockAlertEmail(
  alerts: Array<{ bookId: string; title: string; stock: number }>
) {
  if (!alerts || alerts.length === 0) return { success: true };

  const adminDb = createAdminClient();
  const { resend } = getIntegrationsConfig();

  const adminEmail = process.env.ADMIN_ALERT_EMAIL || "inventory@mdshakib.com";
  const subject = `⚠️ Low Inventory Alert: ${alerts.length} title(s) below threshold`;
  const html = renderLowStockAlertHtml(alerts);

  const { data: logEntry } = await adminDb
    .from("email_logs")
    .insert({
      recipient: adminEmail,
      event_type: "low_stock_alert",
      status: "queued",
    })
    .select("id")
    .single();

  const logId = logEntry?.id;
  const client = getResendClient();

  if (!client || !resend.isConfigured) {
    if (logId) {
      await adminDb
        .from("email_logs")
        .update({
          status: "sent",
          provider_response: JSON.stringify({ mode: "mock", to: adminEmail, subject, count: alerts.length }),
        })
        .eq("id", logId);
    }
    return { success: true, mode: "mock", logId };
  }

  try {
    const { data: resendRes, error: sendErr } = await client.emails.send({
      from: resend.fromEmail,
      to: adminEmail,
      subject,
      html,
    });

    if (sendErr) throw new Error(sendErr.message);

    if (logId) {
      await adminDb
        .from("email_logs")
        .update({ status: "sent", provider_response: JSON.stringify(resendRes) })
        .eq("id", logId);
    }

    return { success: true, messageId: resendRes?.id };
  } catch (error: any) {
    if (logId) {
      await adminDb
        .from("email_logs")
        .update({ status: "failed", provider_response: error?.message || String(error) })
        .eq("id", logId);
    }
    return { success: false, error: error?.message };
  }
}
