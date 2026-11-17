import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { verifyDeliveryOtp } from "@/lib/delivery/otp";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("delivery.verify");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:verify-otp:${auth.user.id}`, "auth");
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

    const { orderId, otp, awb } = parsedBody.data;

    if (!orderId || !otp) {
      return NextResponse.json(
        { error: "orderId and otp are required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isValidUuid(orderId)) {
      return NextResponse.json(
        { error: "Invalid orderId format." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await verifyDeliveryOtp({
      orderId,
      candidateOtp: String(otp),
      actorId: auth.profile.id,
      actorRole: auth.profile.role,
      awb: typeof awb === "string" ? awb : undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          outcome: result.outcome,
          attemptsLeft: result.attemptsLeft,
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/admin/delivery/verify-otp",
      err,
      "Internal server error during verification.",
      req
    );
  }
}
