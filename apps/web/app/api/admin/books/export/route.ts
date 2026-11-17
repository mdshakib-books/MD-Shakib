import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { exportBooksToCsv } from "@/lib/admin/catalog-io";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { NO_STORE_HEADERS, serverErrorResponse } from "@/lib/security/http";

export async function GET(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("books.view");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:books-export:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const csvData = await exportBooksToCsv();

    return new NextResponse(csvData, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="md-shakib-catalog-export-${new Date().toISOString().slice(0, 10)}.csv"`,
        ...NO_STORE_HEADERS,
      },
    });
  } catch (err: any) {
    return serverErrorResponse("/api/admin/books/export", err, "Catalog export failed.", req);
  }
}
