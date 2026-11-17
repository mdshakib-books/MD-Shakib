import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyPhoneVerificationOtp } from "@/lib/auth/phone";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

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

    const rl = await checkRateLimit(`phone:verify-otp:${user.id}`, "auth");
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

    const { phone, otp } = parsedBody.data;
    if (!phone || typeof phone !== "string" || !otp || typeof otp !== "string") {
      return NextResponse.json(
        { error: "Phone number and OTP are required" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const res = await verifyPhoneVerificationOtp(user.id, phone, otp);
    if (!res.success) {
      return NextResponse.json(
        { error: res.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(res, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/auth/phone/verify-otp",
      err,
      "Failed to verify phone OTP.",
      req
    );
  }
}
