import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { importBooksFromCsv } from "@/lib/admin/catalog-io";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

const MAX_CSV_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MB

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("books.manage");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:books-import:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    let csvContent = "";
    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (!file) {
        return NextResponse.json(
          { error: "No CSV file provided in upload." },
          { status: 400, headers: NO_STORE_HEADERS }
        );
      }
      if (file.size > MAX_CSV_IMPORT_BYTES) {
        return NextResponse.json(
          { error: "CSV upload exceeds the maximum size limit of 2MB." },
          { status: 413, headers: NO_STORE_HEADERS }
        );
      }
      csvContent = await file.text();
    } else {
      const parsedBody = await readBoundedJsonBody(req, MAX_CSV_IMPORT_BYTES);
      if (!parsedBody.ok) {
        return NextResponse.json(
          { error: parsedBody.error },
          { status: parsedBody.status, headers: NO_STORE_HEADERS }
        );
      }
      csvContent = typeof parsedBody.data.csvContent === "string" ? parsedBody.data.csvContent : "";
    }

    if (!csvContent || !csvContent.trim()) {
      return NextResponse.json(
        { error: "Empty CSV content provided." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await importBooksFromCsv(csvContent, auth.user.id);

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/admin/books/import", err, "CSV import failed.", req);
  }
}
