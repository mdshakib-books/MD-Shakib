import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getOrderRefundCreditNote } from "@/lib/commerce/invoices";
import { escapeHtml } from "@/lib/integrations/resend/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/admin/permissions";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { isValidUuid, NO_STORE_HEADERS } from "@/lib/security/http";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ refundId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE_HEADERS });
    }

    const rl = await checkRateLimit(`doc:refund:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { refundId } = await params;
    if (!isValidUuid(refundId)) {
      return new NextResponse("Invalid refund ID format", { status: 400, headers: NO_STORE_HEADERS });
    }
    const adminDb = createAdminClient();

    const res = await getOrderRefundCreditNote(refundId);
    if (!res.success || !res.creditNote) {
      return new NextResponse(res.error || "Refund documentation not found", {
        status: res.statusCode || 404,
      });
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
      .select("role, is_blocked, is_deleted")
      .eq("id", user.id)
      .single();

    const isStaff =
      profile &&
      !profile.is_blocked &&
      !profile.is_deleted &&
      hasPermission(profile.role, "orders.view");
    const isOwner = order && order.user_id === user.id;

    if (!isOwner && !isStaff) {
      return new NextResponse("Forbidden: You cannot view this credit note.", { status: 403 });
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Refund Credit Note - ${escapeHtml(cn.orderNumber)}</title>
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
      <span class="badge">Status: ${escapeHtml(cn.refundStatus)}</span>
    </div>

    <div class="row">
      <span style="color: #6b7280;">Customer:</span>
      <span style="font-weight: 500;">${escapeHtml(cn.customerName)}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Original Order:</span>
      <span style="font-weight: 500;">#${escapeHtml(cn.orderNumber)}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Refund Reference:</span>
      <span style="font-family: monospace; font-size: 11px;">${escapeHtml(cn.gatewayRefundId)}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Channel:</span>
      <span style="font-size: 12px;">${escapeHtml(cn.paymentChannel === "cod_offline" ? "COD Offline Payout" : "Razorpay Online")}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Refund Date:</span>
      <span>${escapeHtml(cn.refundDate)}</span>
    </div>
    <div class="row">
      <span style="color: #6b7280;">Reason:</span>
      <span>${escapeHtml(cn.reason)}</span>
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
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...NO_STORE_HEADERS,
      },
    });
  } catch (err: any) {
    console.error("Refund credit note error:", err?.message || err);
    return new NextResponse("Internal server error", { status: 500 });
  }
}
