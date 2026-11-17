import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { checkOrderReturnEligibility } from "@/lib/commerce/returns";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import { isValidUuid, NO_STORE_HEADERS, serverErrorResponse } from "@/lib/security/http";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rl = await checkRateLimit(`returns:eligibility:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json(
        { error: "orderId is required" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isValidUuid(orderId)) {
      return NextResponse.json(
        { error: "Invalid orderId format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const eligibility = await checkOrderReturnEligibility(orderId, user.id);
    return NextResponse.json(eligibility, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/returns/eligibility", err, "Internal server error", req);
  }
}
