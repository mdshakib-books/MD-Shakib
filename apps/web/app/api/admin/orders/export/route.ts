import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { exportOrdersToCsv } from "@/lib/admin/reports";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/security/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("orders.export");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:orders-export:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const startDate = searchParams.get("startDate") || undefined;
    const endDate = searchParams.get("endDate") || undefined;
    const orderStatus = searchParams.get("orderStatus") || undefined;
    const paymentStatus = searchParams.get("paymentStatus") || undefined;

    const csvData = await exportOrdersToCsv({
      startDate,
      endDate,
      orderStatus,
      paymentStatus,
    });

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="md-shakib-orders-${new Date().toISOString().slice(0, 10)}.csv"`,
        ...NO_STORE_HEADERS,
      },
    });
  } catch (err: any) {
    return serverErrorResponse("/api/admin/orders/export", err, "Order export failed.", req);
  }
}
