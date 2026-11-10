import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getOrderPaymentReceipt } from "@/lib/commerce/invoices";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/admin/permissions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { orderId } = await params;
    const adminDb = createAdminClient();

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
      return new NextResponse("Forbidden: You cannot view this payment receipt.", { status: 403 });
    }

    const res = await getOrderPaymentReceipt(orderId);
    if (!res.success || !res.receipt) {
      return new NextResponse(res.error || "Receipt not found", { status: 404 });
    }

    const r = res.receipt;
    const isPaid = r.paymentStatus === "Paid";

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Payment Receipt - ${r.orderNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.5; font-size: 13px; padding: 24px; max-width: 500px; margin: auto; }
    .card { border: 1px solid #ddd; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase; }
    .badge-paid { background: #d1fae5; color: #065f46; }
    .badge-pending { background: #fef3c7; color: #92400e; }
    .row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #f3f4f6; }
    .row:last-child { border-bottom: none; }
    .label { color: #6b7280; }
    .value { font-weight: 500; }
    .amount { font-size: 24px; font-weight: bold; color: #C9A24A; margin: 12px 0 20px; text-align: center; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; text-align: right;">
    <button onclick="window.print()" style="padding: 6px 14px; background: #C9A24A; color: #000; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Print Receipt</button>
  </div>

  <div class="card">
    <div style="text-align: center; margin-bottom: 16px;">
      <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">MD SHAKIB ISLAMIC BOOKS</h2>
      <p style="margin: 2px 0 0; font-size: 11px; color: #6b7280;">Official Payment Acknowledgment</p>
    </div>

    <div class="amount">
      ₹${Number(r.amount).toFixed(2)}
    </div>

    <div style="text-align: center; margin-bottom: 20px;">
      <span class="badge ${isPaid ? "badge-paid" : "badge-pending"}">
        ${isPaid ? "✓ Payment Confirmed" : "⏳ Pending Payment"}
      </span>
      ${
        !isPaid && r.paymentMethod === "COD"
          ? `<p style="margin: 6px 0 0; font-size: 11px; color: #b45309;">Payable upon delivery in cash to courier agent.</p>`
          : ""
      }
    </div>

    <div class="row">
      <span class="label">Customer Name:</span>
      <span class="value">${r.customerName}</span>
    </div>
    <div class="row">
      <span class="label">Order Reference:</span>
      <span class="value">#${r.orderNumber}</span>
    </div>
    <div class="row">
      <span class="label">Payment Provider:</span>
      <span class="value">${r.provider}</span>
    </div>
    <div class="row">
      <span class="label">Payment Method:</span>
      <span class="value">${r.paymentMethod}</span>
    </div>
    <div class="row">
      <span class="label">Transaction Reference:</span>
      <span class="value" style="font-family: monospace; font-size: 11px;">${r.paymentReference}</span>
    </div>
    <div class="row">
      <span class="label">Date:</span>
      <span class="value">${r.paymentDate}</span>
    </div>

    <div style="margin-top: 24px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 12px;">
      MD Shakib Books • Authenticated Electronic Record
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("Payment receipt error:", err?.message || err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
