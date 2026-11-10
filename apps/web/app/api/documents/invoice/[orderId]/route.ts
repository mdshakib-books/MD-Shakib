import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getOrCreateOrderInvoice } from "@/lib/commerce/invoices";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/admin/permissions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return new NextResponse("Unauthorized: Please log in.", { status: 401 });
    }

    const { orderId } = await params;
    const adminDb = createAdminClient();

    // Verify access permission
    const { data: order } = await adminDb
      .from("orders")
      .select("user_id")
      .eq("id", orderId)
      .single();

    if (!order) {
      return new NextResponse("Order not found", { status: 404 });
    }

    const { data: profile } = await adminDb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isStaff = profile && isStaffRole(profile.role);
    const isOwner = order.user_id === user.id;

    if (!isOwner && !isStaff) {
      return new NextResponse("Forbidden: You cannot view this invoice.", { status: 403 });
    }

    const invoiceResult = await getOrCreateOrderInvoice(orderId);
    if (!invoiceResult.success || !invoiceResult.invoice) {
      return new NextResponse(invoiceResult.error || "Failed to generate invoice", { status: 500 });
    }

    const inv = invoiceResult.invoice;
    const billAddr = inv.billing_address || {};
    const shipAddr = inv.shipping_address || {};

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Tax Invoice - ${inv.invoice_number}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.5; font-size: 13px; margin: 0; padding: 24px; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #C9A24A; padding-bottom: 16px; margin-bottom: 24px; }
    .title { font-size: 24px; font-weight: 700; color: #111; margin: 0; }
    .store-sub { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 1px; }
    .badge { background: #F4E8C1; color: #8A6818; padding: 4px 8px; border-radius: 4px; font-weight: 600; font-size: 11px; }
    .grid { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 20px; }
    .card { flex: 1; background: #fafafa; border: 1px solid #eee; padding: 12px 16px; border-radius: 6px; }
    .card h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; color: #777; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #161616; color: #fff; text-align: left; padding: 8px 12px; font-size: 12px; text-transform: uppercase; }
    td { padding: 10px 12px; border-bottom: 1px solid #eee; }
    .totals { width: 280px; margin-left: auto; }
    .totals-row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 12px; }
    .totals-grand { font-size: 15px; font-weight: bold; border-top: 2px solid #C9A24A; padding-top: 8px; margin-top: 6px; color: #C9A24A; }
    .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #777; border-top: 1px dashed #ccc; padding-top: 16px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 20px; text-align: right;">
    <button onclick="window.print()" style="padding: 8px 16px; background: #C9A24A; color: #000; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Print / Save as PDF</button>
  </div>

  <div class="header">
    <div>
      <h1 class="title">MD SHAKIB ISLAMIC BOOKS</h1>
      <p class="store-sub">Authentic Classical Islamic Literature</p>
      <p style="margin: 4px 0 0; font-size: 11px;">GSTIN: ${inv.seller_gstin} | State: Delhi (07)</p>
    </div>
    <div style="text-align: right;">
      <span class="badge">ORIGINAL FOR RECIPIENT</span>
      <h3 style="margin: 8px 0 2px; font-size: 16px;">TAX INVOICE</h3>
      <p style="margin: 0; font-family: monospace; font-size: 12px;">${inv.invoice_number}</p>
      <p style="margin: 2px 0 0; font-size: 11px; color: #666;">Date: ${new Date(inv.invoice_date).toLocaleDateString("en-IN")}</p>
    </div>
  </div>

  <div class="grid">
    <div class="card">
      <h4>Billed To</h4>
      <strong>${inv.billing_name}</strong>
      <p style="margin: 4px 0 0; font-size: 12px;">${billAddr.house_no || ""}, ${billAddr.area || ""}</p>
      <p style="margin: 0; font-size: 12px;">${billAddr.city || ""}, ${billAddr.state || ""} - ${billAddr.pincode || ""}</p>
      <p style="margin: 2px 0 0; font-size: 11px; color: #555;">Phone: ${billAddr.phone || "N/A"}</p>
    </div>
    <div class="card">
      <h4>Shipped To</h4>
      <strong>${shipAddr.full_name || inv.billing_name}</strong>
      <p style="margin: 4px 0 0; font-size: 12px;">${shipAddr.house_no || ""}, ${shipAddr.area || ""}</p>
      <p style="margin: 0; font-size: 12px;">${shipAddr.city || ""}, ${shipAddr.state || ""} - ${shipAddr.pincode || ""}</p>
      <p style="margin: 2px 0 0; font-size: 11px; color: #555;">Phone: ${shipAddr.phone || "N/A"}</p>
    </div>
    <div class="card">
      <h4>Payment & Order Details</h4>
      <p style="margin: 0 0 3px;"><strong>Order ID:</strong> ${inv.order_id.slice(0, 8)}</p>
      <p style="margin: 0 0 3px;"><strong>Method:</strong> ${inv.payment_method}</p>
      <p style="margin: 0 0 3px;"><strong>Status:</strong> ${inv.payment_status}</p>
      <p style="margin: 0;"><strong>Ref:</strong> ${inv.payment_reference || "N/A"}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item Description</th>
        <th style="text-align: center;">Qty</th>
        <th style="text-align: right;">Unit Price</th>
        <th style="text-align: right;">Total (INR)</th>
      </tr>
    </thead>
    <tbody>
      ${(inv.items_snapshot || [])
        .map(
          (item: any) => `
        <tr>
          <td>
            <strong>${item.title}</strong>
            <div style="font-size: 10px; color: #666;">HSN 4901 (Printed Books - GST Exempt 0%)</div>
          </td>
          <td style="text-align: center;">${item.quantity}</td>
          <td style="text-align: right;">₹${Number(item.unit_price).toFixed(2)}</td>
          <td style="text-align: right;">₹${Number(item.total_price || item.unit_price * item.quantity).toFixed(2)}</td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Subtotal:</span>
      <span>₹${Number(inv.subtotal).toFixed(2)}</span>
    </div>
    ${
      inv.discount_amount > 0
        ? `<div class="totals-row" style="color: #059669;">
             <span>Coupon Discount:</span>
             <span>-₹${Number(inv.discount_amount).toFixed(2)}</span>
           </div>`
        : ""
    }
    <div class="totals-row">
      <span>Taxable Value:</span>
      <span>₹${Number(inv.taxable_value).toFixed(2)}</span>
    </div>
    <div class="totals-row">
      <span>Shipping Fee:</span>
      <span>₹${Number(inv.shipping_charges).toFixed(2)}</span>
    </div>
    ${
      inv.cgst_amount > 0
        ? `<div class="totals-row"><span>CGST (9% on shipping):</span><span>₹${Number(inv.cgst_amount).toFixed(2)}</span></div>
           <div class="totals-row"><span>SGST (9% on shipping):</span><span>₹${Number(inv.sgst_amount).toFixed(2)}</span></div>`
        : ""
    }
    ${
      inv.igst_amount > 0
        ? `<div class="totals-row"><span>IGST (18% on shipping):</span><span>₹${Number(inv.igst_amount).toFixed(2)}</span></div>`
        : ""
    }
    <div class="totals-row totals-grand">
      <span>Grand Total:</span>
      <span>₹${Number(inv.grand_total).toFixed(2)}</span>
    </div>
  </div>

  <div class="footer">
    <p>Thank you for choosing MD Shakib Islamic Books.</p>
    <p>This is a computer-generated invoice and does not require a physical signature.</p>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    });
  } catch (err: any) {
    console.error("Invoice route error:", err?.message || err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
