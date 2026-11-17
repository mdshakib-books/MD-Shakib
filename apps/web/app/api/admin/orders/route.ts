import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { isValidUuid, NO_STORE_HEADERS, serverErrorResponse } from "@/lib/security/http";

export async function GET(req: NextRequest) {
  const auth = await verifyAdminApi("orders.view");
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    const rl = await checkRateLimit(`admin:orders:search:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const search = String(searchParams.get("search") || "").trim().slice(0, 80);
    const rawLimit = Number(searchParams.get("limit") || 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.max(1, Math.min(50, Math.floor(rawLimit)))
      : 10;

    const adminDb = createAdminClient();
    let query = adminDb
      .from("orders")
      .select(
        "id, order_number, order_status, payment_method, payment_status, is_paid, total_amount, shipping_awb, shipping_courier, cod_collection_status, cod_settlement_status, address_snapshot, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(limit);

    if (search) {
      const sanitized = search.replace(/[,()%._\\]/g, "").trim();
      if (sanitized) {
        if (isValidUuid(search)) {
          query = query.or(
            `id.eq.${search},order_number.ilike.%${sanitized}%,shipping_awb.ilike.%${sanitized}%`
          );
        } else {
          query = query.or(
            `order_number.ilike.%${sanitized}%,shipping_awb.ilike.%${sanitized}%`
          );
        }
      }
    }

    const { data: orders, error } = await query;
    if (error) {
      return serverErrorResponse("/api/admin/orders", error, "Failed to search orders.", req);
    }

    return NextResponse.json({ orders: orders || [] }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/admin/orders", err, "Internal server error", req);
  }
}
