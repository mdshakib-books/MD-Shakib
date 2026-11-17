import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getCustomerOrderDeliveryOtp } from "@/lib/delivery/otp";
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

    const rl = await checkRateLimit(`delivery:otp:${user.id}`, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing orderId parameter" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isValidUuid(orderId)) {
      return NextResponse.json(
        { error: "Invalid orderId format" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await getCustomerOrderDeliveryOtp(orderId, user.id);
    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/delivery/otp",
      err,
      "Failed to retrieve delivery OTP.",
      req
    );
  }
}
