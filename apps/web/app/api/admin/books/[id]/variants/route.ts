import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { getBookVariants, createBookVariant } from "@/lib/catalog/variants";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdminApi("books.view");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:variants:get:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { id } = await params;
    if (!isValidUuid(id)) {
      return NextResponse.json(
        { error: "Invalid book ID format." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const variants = await getBookVariants(id);
    return NextResponse.json({ variants }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/admin/books/[id]/variants",
      err,
      "Failed to load variants.",
      req
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await verifyAdminApi("inventory.manage");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:variants:post:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { id } = await params;
    if (!isValidUuid(id)) {
      return NextResponse.json(
        { error: "Invalid book ID format." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const parsedBody = await readBoundedJsonBody(req);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { title, sku, price, stock, variantType, variantValue, isActive } = parsedBody.data;

    const result = await createBookVariant({
      bookId: id,
      title,
      sku,
      price,
      stock,
      variantType,
      variantValue,
      isActive,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/admin/books/[id]/variants",
      err,
      "Failed to create variant.",
      req
    );
  }
}
