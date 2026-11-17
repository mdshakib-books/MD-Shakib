import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { exportCustomersToCsv } from "@/lib/admin/reports";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/security/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("customers.export");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:customers-export:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const csvData = await exportCustomersToCsv();

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="md-shakib-customers-${new Date().toISOString().slice(0, 10)}.csv"`,
        ...NO_STORE_HEADERS,
      },
    });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/admin/customers/export",
      err,
      "Customer export failed.",
      req
    );
  }
}
