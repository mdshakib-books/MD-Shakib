export interface EmailOrderItem {
  title: string;
  quantity: number;
  price: number;
}

export interface EmailOrderDetails {
  id: string;
  total_amount: number;
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

const BRAND_HEADER = `
<div style="background-color: #064e3b; padding: 28px 24px; text-align: center; border-radius: 8px 8px 0 0;">
  <h1 style="color: #fef3c7; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Amiri', serif, Georgia;">
    MD Shakib Islamic Books
  </h1>
  <p style="color: #a7f3d0; font-size: 13px; margin: 6px 0 0 0; letter-spacing: 0.5px;">
    Authentic Islamic Literature & Scholarly Resources
  </p>
</div>
`;

const BRAND_FOOTER = `
<div style="background-color: #f8fafc; padding: 24px; text-align: center; border-top: 1px solid #e2e8f0; border-radius: 0 0 8px 8px; font-size: 12px; color: #64748b;">
  <p style="margin: 0 0 4px 0;">Thank you for choosing MD Shakib Islamic Books.</p>
  <p style="margin: 0 0 4px 0;">Need help? Contact support at <a href="mailto:support@mdshakib.com" style="color: #047857; text-decoration: none;">support@mdshakib.com</a></p>
  <p style="margin: 0; color: #94a3b8;">Delhi, India • Authentic Publications & Verified Shipments</p>
</div>
`;

export function renderOrderConfirmationHtml(
  order: EmailOrderDetails,
  items: EmailOrderItem[],
  customerName: string
): string {
  const itemsHtml = items
    .map(
      (item) => `
      <tr style="border-bottom: 1px solid #f1f5f9;">
        <td style="padding: 12px 8px; font-size: 14px; color: #1e293b; font-weight: 500;">${item.title}</td>
        <td style="padding: 12px 8px; font-size: 14px; color: #64748b; text-align: center;">${item.quantity}</td>
        <td style="padding: 12px 8px; font-size: 14px; color: #047857; text-align: right; font-weight: 600;">₹${(item.price * item.quantity).toFixed(2)}</td>
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
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 20px 0; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #0f172a; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">Order Confirmed!</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
        Assalamu Alaikum <strong>${customerName}</strong>,<br>
        Thank you for your order. We are carefully preparing your books for dispatch.
      </p>

      <div style="background-color: #f8fafc; border-left: 4px solid #047857; padding: 14px 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Order ID:</strong> ${order.id}</p>
        <p style="margin: 4px 0 0 0; font-size: 14px; color: #334155;"><strong>Payment Method:</strong> ${order.payment_method}</p>
      </div>

      <h3 style="color: #0f172a; font-size: 16px; font-weight: 600; margin: 0 0 12px 0; border-bottom: 2px solid #047857; padding-bottom: 6px;">
        Purchased Titles
      </h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f8fafc; color: #475569; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
            <th style="padding: 10px 8px; text-align: left;">Book</th>
            <th style="padding: 10px 8px; text-align: center;">Qty</th>
            <th style="padding: 10px 8px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>

      <div style="background-color: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 16px; margin-bottom: 24px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 14px; color: #064e3b;">
          <span>Delivery Fee:</span> <span>₹35.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; color: #064e3b;">
          <span>Platform Fee:</span> <span>₹10.00</span>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 16px; font-weight: 700; color: #064e3b; border-top: 1px solid #6ee7b7; padding-top: 8px;">
          <span>Total Paid/Payable:</span> <span>₹${Number(order.total_amount).toFixed(2)}</span>
        </div>
      </div>

      <h3 style="color: #0f172a; font-size: 15px; font-weight: 600; margin: 0 0 8px 0;">Shipping Address</h3>
      <p style="color: #475569; font-size: 14px; line-height: 1.5; margin: 0;">
        ${order.address_snapshot.full_name}<br>
        ${order.address_snapshot.house_no}, ${order.address_snapshot.area}<br>
        ${order.address_snapshot.city}, ${order.address_snapshot.state} - ${order.address_snapshot.pincode}<br>
        Phone: ${order.address_snapshot.phone}
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
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Payment Received - MD Shakib Islamic Books</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 20px 0; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background-color: #d1fae5; border-radius: 50%; padding: 12px; margin-bottom: 12px;">
          <span style="color: #047857; font-size: 28px;">✓</span>
        </div>
        <h2 style="color: #064e3b; font-size: 20px; font-weight: 700; margin: 0 0 4px 0;">Payment Received Successfully</h2>
        <p style="color: #64748b; font-size: 14px; margin: 0;">Razorpay Transaction Verified</p>
      </div>

      <p style="color: #334155; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
        Assalamu Alaikum <strong>${customerName}</strong>,<br>
        We have verified your online payment of <strong>₹${Number(order.total_amount).toFixed(2)}</strong> for Order ID <code>${order.id}</code>.
      </p>

      <div style="background-color: #f8fafc; border-radius: 6px; padding: 16px; border: 1px solid #e2e8f0; margin-bottom: 24px;">
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #334155;"><strong>Order ID:</strong> ${order.id}</p>
        <p style="margin: 0 0 6px 0; font-size: 14px; color: #334155;"><strong>Amount:</strong> ₹${Number(order.total_amount).toFixed(2)}</p>
        <p style="margin: 0; font-size: 14px; color: #334155;"><strong>Status:</strong> Confirmed & Preparing for Dispatch</p>
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
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Order Cancelled - MD Shakib Islamic Books</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; padding: 20px 0; margin: 0;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden;">
    ${BRAND_HEADER}

    <div style="padding: 32px 24px;">
      <h2 style="color: #b91c1c; font-size: 20px; font-weight: 700; margin: 0 0 12px 0;">Order Cancellation Confirmation</h2>
      <p style="color: #334155; font-size: 15px; line-height: 1.5; margin: 0 0 20px 0;">
        Assalamu Alaikum <strong>${customerName}</strong>,<br>
        Your order <code>${order.id}</code> has been cancelled as requested.
      </p>

      <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 16px; margin-bottom: 24px; border-radius: 0 4px 4px 0;">
        <p style="margin: 0; font-size: 14px; color: #991b1b;"><strong>Cancellation Reason:</strong> ${reason || "Customer requested cancellation"}</p>
      </div>
    </div>

    ${BRAND_FOOTER}
  </div>
</body>
</html>
  `;
}

