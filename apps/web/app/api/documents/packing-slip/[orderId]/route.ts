import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getOrderPackingSlip } from "@/lib/commerce/invoices";
import { escapeHtml } from "@/lib/integrations/resend/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAnyPermission } from "@/lib/admin/permissions";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { isValidUuid, NO_STORE_HEADERS, serverErrorResponse } from "@/lib/security/http";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ orderId: string }> }
) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401, headers: NO_STORE_HEADERS });
    }

    const rl = await checkRateLimit(`doc:packing-slip:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { orderId } = await params;
    if (!isValidUuid(orderId)) {
      return new NextResponse("Invalid order ID format", { status: 400, headers: NO_STORE_HEADERS });
    }

    const adminDb = createAdminClient();

    const { data: profile } = await adminDb
      .from("profiles")
      .select("role, is_blocked, is_deleted")
      .eq("id", user.id)
      .single();

    if (
      !profile ||
      profile.is_blocked ||
      profile.is_deleted ||
      !hasAnyPermission(profile.role, ["orders.ship", "orders.manage"])
    ) {
      return new NextResponse("Forbidden: Fulfilment staff access required.", {
        status: 403,
        headers: NO_STORE_HEADERS,
      });
    }

    const res = await getOrderPackingSlip(orderId);
    if (!res.success || !res.packingSlip) {
      return new NextResponse(res.error || "Packing slip not found", {
        status: 404,
        headers: NO_STORE_HEADERS,
      });
    }

    const slip = res.packingSlip;
    const addr = slip.shippingAddress || {};

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Packing Slip - ${escapeHtml(slip.orderNumber)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #111; line-height: 1.4; font-size: 13px; padding: 24px; max-width: 700px; margin: auto; }
    .header { border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 20px; display: flex; justify-content: space-between; }
    .title { font-size: 20px; font-weight: bold; margin: 0; text-transform: uppercase; }
    .box { border: 1px solid #000; padding: 12px; border-radius: 4px; margin-bottom: 20px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { border-bottom: 2px solid #000; text-align: left; padding: 8px 4px; font-size: 12px; text-transform: uppercase; }
    td { border-bottom: 1px solid #ddd; padding: 10px 4px; }
    .barcode { font-family: monospace; font-size: 16px; font-weight: bold; letter-spacing: 2px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 16px; text-align: right;">
    <button onclick="window.print()" style="padding: 6px 14px; background: #000; color: #fff; font-weight: bold; cursor: pointer;">Print Packing Slip</button>
  </div>

  <div class="header">
    <div>
      <h1 class="title">MD SHAKIB ISLAMIC BOOKS</h1>
      <p style="margin: 2px 0 0; font-size: 11px; color: #555;">WAREHOUSE FULFILLMENT SLIP</p>
    </div>
    <div style="text-align: right;">
      <p style="margin: 0; font-size: 11px; color: #555;">ORDER REF</p>
      <p style="margin: 0; font-size: 16px; font-weight: bold;">#${escapeHtml(slip.orderNumber)}</p>
      <p style="margin: 2px 0 0; font-size: 10px; color: #666;">Date: ${escapeHtml(slip.createdDate)}</p>
    </div>
  </div>

  <div class="box">
    <div style="display: flex; justify-content: space-between;">
      <div>
        <p style="margin: 0 0 4px; font-size: 10px; text-transform: uppercase; color: #555;">Ship To:</p>
        <p style="margin: 0; font-size: 14px; font-weight: bold;">${escapeHtml(slip.customerName)}</p>
        <p style="margin: 2px 0 0;">${escapeHtml(addr.house_no || "")}, ${escapeHtml(addr.area || "")}</p>
        <p style="margin: 0;">${escapeHtml(addr.city || "")}, ${escapeHtml(addr.state || "")} - <strong>${escapeHtml(addr.pincode || "")}</strong></p>
        <p style="margin: 2px 0 0; font-size: 11px;">Contact: ${escapeHtml(addr.phone || "N/A")}</p>
      </div>
      <div style="text-align: right;">
        <p style="margin: 0 0 4px; font-size: 10px; text-transform: uppercase; color: #555;">Logistics Partner:</p>
        <p style="margin: 0; font-size: 13px; font-weight: bold;">${escapeHtml(slip.courier || "Delhivery")}</p>
        <p style="margin: 8px 0 2px; font-size: 10px; text-transform: uppercase; color: #555;">Waybill / AWB:</p>
        <p class="barcode" style="margin: 0;">${escapeHtml(slip.awb || "UNASSIGNED")}</p>
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 40px;">#</th>
        <th>Product Title</th>
        <th>SKU</th>
        <th style="text-align: center; width: 60px;">Qty</th>
        <th style="width: 80px; text-align: center;">Verified</th>
      </tr>
    </thead>
    <tbody>
      ${slip.items
        .map(
          (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${escapeHtml(item.title)}</strong></td>
          <td><code style="font-size: 11px;">${escapeHtml(item.sku || "MDS-DEFAULT")}</code></td>
          <td style="text-align: center; font-size: 14px; font-weight: bold;">${Number(item.quantity)}</td>
          <td style="text-align: center;"><span style="display: inline-block; width: 14px; height: 14px; border: 1px solid #777;"></span></td>
        </tr>
      `
        )
        .join("")}
    </tbody>
  </table>

  <div style="border-top: 1px dashed #777; padding-top: 12px; margin-top: 20px; font-size: 11px; display: flex; justify-content: space-between;">
    <div>
      <p style="margin: 0;">Packer Signature: _____________________</p>
    </div>
    <div>
      <p style="margin: 0;">QC Checked: [  ] Pass   [  ] Fail</p>
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
    return serverErrorResponse("/api/documents/packing-slip", err, "Internal server error", req);
  }
}
