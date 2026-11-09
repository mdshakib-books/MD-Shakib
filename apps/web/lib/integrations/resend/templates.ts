export interface EmailOrderItem {
  title: string;
  quantity: number;
  price: number;
}

export interface EmailOrderDetails {
  id: string;
  order_number?: string | null;
  total_amount: number;
  subtotal?: number;
  delivery_fee?: number;
  platform_fee?: number;
  discount_amount?: number;
  coupon_code?: string | null;
  payment_method: string;
  created_at: string;
  address_snapshot: {
    full_name: string;
    phone: string;
    house_no: string;
    area: string;
    city: string;
    state: string;
    pincode: string;
  };
}

/**
 * Escapes HTML characters to prevent XSS in email bodies.
 */
export function escapeHtml(str: string | null | undefined): string {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const BRAND_HEADER = `
<div style="background-color: #0B0B0B; border-bottom: 2px solid #C9A24A; padding: 28px 24px; text-align: center; border-radius: 8px 8px 0 0;">
  <h1 style="color: #C9A24A; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Cinzel', serif, Georgia;">
    MD SHAKIB ISLAMIC BOOKS
  </h1>
  <p style="color: #E5C87B; font-size: 12px; margin: 6px 0 0 0; letter-spacing: 1px; text-transform: uppercase;">
    Authentic Islamic Literature &amp; Scholarly Resources
  </p>
</div>
`;

const BRAND_FOOTER = `
<div style="background-color: #111111; padding: 24px; text-align: center; border-top: 1px solid #222222; border-radius: 0 0 8px 8px; font-size: 12px; color: #888888;">
  <p style="margin: 0 0 4px 0; color: #cccccc;">Thank you for choosing MD Shakib Islamic Books.</p>
  <p style="margin: 0 0 4px 0;">Need assistance? Contact our verified helpdesk at <a href="mailto:support@mdshakib.com" style="color: #C9A24A; text-decoration: none;">support@mdshakib.com</a></p>
  <p style="margin: 0; color: #666666;">Delhi, India • Secure Payments &amp; Delhivery Fulfilled Logistics</p>
</div>
`;

export function renderOrderConfirmationHtml(
  order: EmailOrderDetails,
  items: EmailOrderItem[],
  customerName: string
): string {
  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();
  const safeCustomer = escapeHtml(customerName);

  const itemsHtml = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #222222;">
        <td style="padding: 12px 8px; font-size: 14px; color: #F5F5F5; font-weight: 500;">${escapeHtml(item.title)}</td>
        <td style="padding: 12px 8px; font-size: 14px; color: #888888; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px 8px; font-size: 14px; color: #C9A24A; text-align: right; font-weight: 600;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order Confirmation - MD Shakib Islamic Books</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; padding: 20px 0; margin: 0; color: #E0E0E0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">Order Confirmed!</h2>
      <p style="color: #B0B0B0; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
        Assalamu Alaikum <strong>${safeCustomer}</strong>,<br>
        Thank you for your order. We are carefully preparing your books for dispatch.
      </p>

      <div style="background-color: #1A1A1A; border-left: 4px solid #C9A24A; padding: 14px 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; font-size: 14px; color: #E0E0E0;"><strong>Order Number:</strong> ${escapeHtml(displayOrderNum)}</p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #E0E0E0;"><strong>Payment Method:</strong> ${escapeHtml(order.payment_method)}</p>
      </div>

      <h3 style="color: #FFFFFF; font-size: 16px; font-weight: 600; margin: 0 0 12px 0; border-bottom: 1px solid #2A2A2A; padding-bottom: 6px;">
        Purchased Titles
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #1A1A1A; color: #888888; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            <th style="padding: 10px 8px; text-align: left;">Book</th>
            <th style="padding: 10px 8px; text-align: center;">Qty</th>
            <th style="padding: 10px 8px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="background-color: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; color: #B0B0B0;">
          <span>Delivery Charge:</span> <span>₹${Number(order.delivery_fee || 35).toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #B0B0B0;">
          <span>Platform Fee:</span> <span>₹${Number(order.platform_fee || 10).toFixed(2)}</span>
        </div>
        ${
          order.discount_amount && order.discount_amount > 0
            ? `<div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #E5C87B;">
                <span>Coupon Discount (${escapeHtml(order.coupon_code || "APPLIED")}):</span> <span>-₹${Number(order.discount_amount).toFixed(2)}</span>
              </div>`
            : ""
        }
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; color: #C9A24A; border-top: 1px solid #333333; padding-top: 8px;">
          <span>Total:</span> <span>₹${Number(order.total_amount).toFixed(2)}</span>
        </div>
      </div>

      <h3 style="color: #FFFFFF; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Shipping Address</h3>
      <p style="color: #B0B0B0; font-size: 14px; line-height: 1.5; margin: 0;">
        ${escapeHtml(order.address_snapshot.full_name)}<br>
        ${escapeHtml(order.address_snapshot.house_no)}, ${escapeHtml(order.address_snapshot.area)}<br>
        ${escapeHtml(order.address_snapshot.city)}, ${escapeHtml(order.address_snapshot.state)} - ${escapeHtml(order.address_snapshot.pincode)}<br>
        Phone: ${escapeHtml(order.address_snapshot.phone)}
      </p>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}

export function renderPaymentSuccessHtml(
  order: EmailOrderDetails,
  customerName: string
): string {
  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();
  const safeCustomer = escapeHtml(customerName);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Received - MD Shakib Islamic Books</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; padding: 20px 0; margin: 0; color: #E0E0E0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background-color: rgba(201, 162, 74, 0.15); border: 1px solid #C9A24A; border-radius: 50%; padding: 12px; margin-bottom: 12px;">
          <span style="color: #C9A24A; font-size: 28px;">✓</span>
        </div>
        <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">Payment Verified</h2>
        <p style="color: #888888; font-size: 14px; margin: 0;">Razorpay Secure Transaction Approved</p>
      </div>

      <p style="color: #B0B0B0; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
        Assalamu Alaikum <strong>${safeCustomer}</strong>,<br>
        We have verified your online payment of <strong>₹${Number(order.total_amount).toFixed(2)}</strong> for Order <code>${escapeHtml(displayOrderNum)}</code>.
      </p>

      <div style="background-color: #1A1A1A; border-radius: 6px; padding: 16px; border: 1px solid #2A2A2A; margin-bottom: 24px;">
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #E0E0E0;"><strong>Order:</strong> ${escapeHtml(displayOrderNum)}</p>
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #E0E0E0;"><strong>Amount Paid:</strong> ₹${Number(order.total_amount).toFixed(2)}</p>
        <p style="margin: 0; font-size: 14px; color: #C9A24A;"><strong>Status:</strong> Confirmed &amp; Preparing for Courier Dispatch</p>
      </div>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}

export function renderOrderCancellationHtml(
  order: EmailOrderDetails,
  customerName: string,
  reason: string
): string {
  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();
  const safeCustomer = escapeHtml(customerName);
  const safeReason = escapeHtml(reason);

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order Cancelled - MD Shakib Islamic Books</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #000000; padding: 20px 0; margin: 0; color: #E0E0E0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #EF4444; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">Order Cancellation Confirmation</h2>
      <p style="color: #B0B0B0; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
        Assalamu Alaikum <strong>${safeCustomer}</strong>,<br>
        Your order <code>${escapeHtml(displayOrderNum)}</code> has been cancelled. Any reserved stock has been safely restored.
      </p>

      <div style="background-color: #1A1A1A; border-left: 4px solid #EF4444; padding: 14px 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; font-size: 14px; color: #FCA5A5;"><strong>Cancellation Reason:</strong> ${safeReason || "Customer requested cancellation"}</p>
      </div>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}

export function renderAdminNewOrderHtml(
  order: EmailOrderDetails,
  items: EmailOrderItem[],
  customerName: string,
  customerEmail: string
): string {
  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

  const itemsHtml = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #222222;">
        <td style="padding: 10px 8px; font-size: 13px; color: #F5F5F5;">${escapeHtml(item.title)}</td>
        <td style="padding: 10px 8px; font-size: 13px; color: #888888; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px 8px; font-size: 13px; color: #C9A24A; text-align: right; font-weight: 600;">₹${(item.price * item.quantity).toFixed(2)}</td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Order Alert - Admin</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; padding: 20px 0; margin: 0; color: #E0E0E0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #C9A24A; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">New Order Placed: #${escapeHtml(displayOrderNum)}</h2>
      <p style="color: #B0B0B0; font-size: 14px; margin: 0 0 20px 0;">
        Customer: <strong>${escapeHtml(customerName)}</strong> (${escapeHtml(customerEmail)})<br>
        Payment: <strong>${escapeHtml(order.payment_method)}</strong> | Total: <strong>₹${Number(order.total_amount).toFixed(2)}</strong>
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #1A1A1A; color: #888888; font-size: 12px; text-transform: uppercase;">
            <th style="padding: 8px; text-align: left;">Item</th>
            <th style="padding: 8px; text-align: center;">Qty</th>
            <th style="padding: 8px; text-align: right;">Total</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="background-color: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 6px; padding: 14px;">
        <p style="margin: 0; font-size: 13px; color: #888888;">Destination: ${escapeHtml(order.address_snapshot.city)}, ${escapeHtml(order.address_snapshot.state)} (${escapeHtml(order.address_snapshot.pincode)})</p>
      </div>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}

export function renderShipmentNotificationHtml(
  order: EmailOrderDetails,
  customerName: string,
  eventType: "shipped" | "out_for_delivery" | "delivered",
  awb?: string,
  courier?: string,
  trackingUrl?: string
): string {
  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();
  const safeCustomer = escapeHtml(customerName);
  const safeAwb = escapeHtml(awb || "Tracking in progress");
  const safeCourier = escapeHtml(courier || "Delhivery");
  const safeTrackingUrl = escapeHtml(trackingUrl || `https://track.delhivery.com/p/${awb || ""}`);

  const titleMap = {
    shipped: "Your Books Have Shipped!",
    out_for_delivery: "Out for Delivery Today",
    delivered: "Shipment Successfully Delivered",
  };

  const descMap = {
    shipped: "Your order has been handed over to our verified logistics partner for express transit.",
    out_for_delivery: "Our courier delivery associate is in your area today to complete your doorstep delivery.",
    delivered: "Your package has been successfully delivered. We hope these scholarly books enrich your study and library.",
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${titleMap[eventType]} - MD Shakib Islamic Books</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; padding: 20px 0; margin: 0; color: #E0E0E0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #C9A24A; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">${titleMap[eventType]}</h2>
      <p style="color: #B0B0B0; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
        Assalamu Alaikum <strong>${safeCustomer}</strong>,<br>
        ${descMap[eventType]}
      </p>

      <div style="background-color: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 6px; padding: 18px; margin-bottom: 24px;">
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #E0E0E0;"><strong>Order:</strong> ${escapeHtml(displayOrderNum)}</p>
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #E0E0E0;"><strong>Logistics Partner:</strong> ${safeCourier}</p>
        <p style="margin: 0 0 12px 0; font-size: 14px; color: #E0E0E0;"><strong>AWB Number:</strong> <code>${safeAwb}</code></p>
        <a href="${safeTrackingUrl}" target="_blank" style="display: inline-block; background-color: #C9A24A; color: #000000; font-weight: 700; font-size: 13px; text-decoration: none; padding: 10px 18px; border-radius: 6px;">
          Track Shipment Live →
        </a>
      </div>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}

export function renderContactAcknowledgementHtml(
  name: string,
  subject: string,
  message: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Message Received - MD Shakib Islamic Books</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; padding: 20px 0; margin: 0; color: #E0E0E0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #FFFFFF; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">We Have Received Your Message</h2>
      <p style="color: #B0B0B0; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
        Assalamu Alaikum <strong>${escapeHtml(name)}</strong>,<br>
        Thank you for contacting MD Shakib Islamic Books. Our support team has logged your inquiry and will respond within 24 business hours.
      </p>

      <div style="background-color: #1A1A1A; border-left: 4px solid #C9A24A; padding: 14px 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0;">
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #E0E0E0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p style="margin: 0; font-size: 13px; color: #888888;"><strong>Your message:</strong></p>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #CCCCCC; white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}

export function renderContactAdminAlertHtml(
  name: string,
  email: string,
  phone: string | null | undefined,
  subject: string,
  message: string
): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New Customer Inquiry</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; padding: 20px 0; margin: 0; color: #E0E0E0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #C9A24A; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">New Support Contact Submission</h2>
      <div style="background-color: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 6px; padding: 16px; margin-bottom: 20px; font-size: 14px; color: #E0E0E0;">
        <p style="margin: 0 0 6px 0;"><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p style="margin: 0 0 6px 0;"><strong>Email:</strong> ${escapeHtml(email)}</p>
        ${phone ? `<p style="margin: 0 0 6px 0;"><strong>Phone:</strong> ${escapeHtml(phone)}</p>` : ""}
        <p style="margin: 0 0 6px 0;"><strong>Subject:</strong> ${escapeHtml(subject)}</p>
        <p style="margin: 0; font-size: 13px; color: #888888;"><strong>Message:</strong></p>
        <p style="margin: 6px 0 0 0; font-size: 13px; color: #CCCCCC; white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}

export function renderLowStockAlertHtml(
  alerts: Array<{ bookId: string; title: string; stock: number }>
): string {
  const rows = alerts
    .map(
      (a) => `
      <tr style="border-bottom: 1px solid #222222;">
        <td style="padding: 10px 8px; font-size: 13px; color: #F5F5F5;">${escapeHtml(a.title)}</td>
        <td style="padding: 10px 8px; font-size: 13px; color: #EF4444; text-align: center; font-weight: 700;">${a.stock} left</td>
        <td style="padding: 10px 8px; font-size: 11px; color: #888888; font-mono: true;">${escapeHtml(a.bookId)}</td>
      </tr>`
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Low Stock Alert - Inventory</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #000000; padding: 20px 0; margin: 0; color: #E0E0E0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #141414; border: 1px solid #262626; border-radius: 8px; overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #EF4444; font-size: 18px; font-weight: 700; margin: 0 0 12px 0;">⚠️ Low Inventory Alert</h2>
      <p style="color: #B0B0B0; font-size: 14px; margin: 0 0 20px 0;">
        The following book catalog items have reached or fallen below the minimum safety threshold (5 units):
      </p>

      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #1A1A1A; color: #888888; font-size: 12px; text-transform: uppercase;">
            <th style="padding: 8px; text-align: left;">Book Title</th>
            <th style="padding: 8px; text-align: center;">Units</th>
            <th style="padding: 8px; text-align: left;">Book ID</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}
