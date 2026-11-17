import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { submitProductReview, getBookReviews, checkReviewEligibility } from "@/lib/commerce/reviews";
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function GET(req: NextRequest) {
  try {
    const rl = await checkRateLimit(`reviews:get:${getClientIp(req)}`, "search");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const bookId = searchParams.get("bookId");
    const checkEligibility = searchParams.get("checkEligibility") === "true";

    if (!bookId) {
      return NextResponse.json(
        { error: "bookId is required" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isValidUuid(bookId)) {
      return NextResponse.json(
        { error: "Invalid bookId format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (checkEligibility) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json(
          { isEligible: false, reason: "Please sign in to write a review." },
          { headers: NO_STORE_HEADERS }
        );
      }

      const eligibility = await checkReviewEligibility(user.id, bookId);
      return NextResponse.json(eligibility, { headers: NO_STORE_HEADERS });
    }

    const rawPage = Number(searchParams.get("page") || "1");
    const rawLimit = Number(searchParams.get("limit") || "10");
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const limit =
      Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(50, Math.floor(rawLimit)) : 10;

    const data = await getBookReviews(bookId, page, limit);
    return NextResponse.json(data);
  } catch (err: any) {
    return serverErrorResponse("/api/reviews", err, "Failed to fetch reviews.", req);
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

    const rl = await checkRateLimit(`reviews:post:${user.id}`, "api");
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

    const { bookId, rating, title, comment } = parsedBody.data;
    if (!isValidUuid(bookId)) {
      return NextResponse.json(
        { error: "Invalid bookId format." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const res = await submitProductReview({
      userId: user.id,
      bookId,
      rating: Number(rating),
      title: typeof title === "string" ? title : "",
      comment: typeof comment === "string" ? comment : "",
    });

    if (!res.success) {
      return NextResponse.json(
        { error: res.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(res, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/reviews", err, "Failed to submit review.", req);
  }
}
