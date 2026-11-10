import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getOrderRefundCreditNote } from "@/lib/commerce/invoices";
import { createAdminClient } from "@/lib/supabase/admin";
import { isStaffRole } from "@/lib/admin/permissions";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ refundId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { refundId } = await params;
    const adminDb = createAdminClient();

    const res = await getOrderRefundCreditNote(refundId);
    if (!res.success || !res.creditNote) {
      return new NextResponse(res.error || "Refund documentation not found", { status: 404 });
    }

    const cn = res.creditNote;

    // Check ownership or staff role
    const { data: order } = await adminDb
      .from("orders")
      .select("user_id")
      .eq("id", cn.orderId)
      .single();

    const { data: profile } = await adminDb
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const isStaff = profile && isStaffRole(profile.role);
    const isOwner = order && order.user_id === user.id;

    if (!isOwner && !isStaff) {
      return new NextResponse("Forbidden: You cannot view this credit note.", { status: 403 });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Refund Credit Note - ${cn.orderNumber}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.5; font-size: 13px; padding: 24px; max-width: 540px; margin: auto; }
    .card { border: 1px solid #ddd; padding: 24px; border-radius: 8px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 11px; text-transform: uppercase; background: #e0e7ff; color: #3730a3; }
    .row { display: flex; justify-content: space-between; padding: 7px 0; border-bottom: 1px solid #f3f4f6; }
    .row:last-child { border-bottom: none; }
    .amount { font-size: 26px; font-weight: bold; color: #059669; margin: 12px 0 16px; text-align: center; }
    @media print { body { padding: 0; } .no-print { display: none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; text-align: right;">
    <button onclick="window.print()" style="padding: 6px 14px; background: #059669; color: #fff; font-weight: bold; border: none; border-radius: 4px; cursor: pointer;">Print Credit Note</button>
  </div>

  <div class="card">
    <div style="text-align: center; margin-bottom: 16px;">
      <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">MD SHAKIB ISLAMIC BOOKS</h2>
      <p style="margin: 2px 0 0; font-size: 11px; color: #6b7280;">Official Refund Credit Note</p>
    </div>

    <div class="amount">
      ₹${Number(cn.refundAmount).toFixed(2)}
    </div>

    <div style="text-align: center; margin-bottom: 18px;">
      <span class="badge">Status: ${cn.refundStatus}</span>
    </div>

    <div class="row">
      <span style="color: #6b7280;">Customer:</span>
      <span style="font-weight: 500;">${cn.customerName}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Original Order:</span>
      <span style="font-weight: 500;">#${cn.orderNumber}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Gateway Refund ID:</span>
      <span style="font-family: monospace; font-size: 11px;">${cn.gatewayRefundId}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Refund Date:</span>
      <span>${cn.refundDate}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Reason:</span>
      <span>${cn.reason}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Remaining Refundable Balance:</span>
      <span style="font-weight: 600;">₹${Number(cn.remainingRefundableBalance).toFixed(2)}</span>
    </div>

    <div style="margin-top: 24px; text-align: center; font-size: 11px; color: #9ca3af; border-top: 1px dashed #e5e7eb; padding-top: 12px;">
      Electronic credit memo issued in compliance with settlement invariants.
    </div>
  </div>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err: any) {
    console.error("Refund credit note error:", err?.message || err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
