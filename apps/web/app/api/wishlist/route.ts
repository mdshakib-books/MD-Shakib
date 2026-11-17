import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCustomerWishlist, addToWishlist, removeFromWishlist } from "@/lib/commerce/wishlist";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rl = await checkRateLimit(`wishlist:get:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const items = await getCustomerWishlist(user.id);
    return NextResponse.json({ items }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/wishlist", err, "Failed to load wishlist.", req);
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rl = await checkRateLimit(`wishlist:post:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const parsedBody = await readBoundedJsonBody(req);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { bookId } = parsedBody.data;
    if (!bookId || !isValidUuid(bookId)) {
      return NextResponse.json(
        { error: "Valid bookId is required" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const res = await addToWishlist(user.id, bookId);
    if (!res.success) {
      return NextResponse.json(
        { error: res.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(res, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/wishlist", err, "Failed to add to wishlist.", req);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rl = await checkRateLimit(`wishlist:delete:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get("bookId");

    if (!bookId || !isValidUuid(bookId)) {
      return NextResponse.json(
        { error: "Valid bookId is required" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const res = await removeFromWishlist(user.id, bookId);
    if (!res.success) {
      return NextResponse.json(
        { error: res.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/wishlist", err, "Failed to remove from wishlist.", req);
  }
}
