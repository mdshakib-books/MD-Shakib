import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  RazorpayConfigurationError,
  RazorpayDisabledError,
  verifyAndSettlePayment,
} from "@/lib/integrations/razorpay/service";
import { checkRateLimit, rateLimitExceededResponse, getClientIp } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  sanitizeClientErrorMessage,
} from "@/lib/security/http";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: "Authentication required to verify payment." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    // Rate limit payment verification attempts per user / IP
    const clientIp = getClientIp(req);
    const rlKey = user.id || clientIp;
    const rl = await checkRateLimit(rlKey, "payment");
    if (!rl.allowed) {
      logger.warn("Rate limit exceeded for /api/payments/verify", { userId: user.id, clientIp });
      return rateLimitExceededResponse(rl);
    }

    const parsedBody = await readBoundedJsonBody(req);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsedBody.data;

    if (
      !razorpay_order_id ||
      typeof razorpay_order_id !== "string" ||
      !razorpay_payment_id ||
      typeof razorpay_payment_id !== "string" ||
      !razorpay_signature ||
      typeof razorpay_signature !== "string"
    ) {
      return NextResponse.json(
        { error: "Missing required Razorpay payment signature parameters." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await verifyAndSettlePayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId: user.id,
    });

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    if (error instanceof RazorpayDisabledError || error instanceof RazorpayConfigurationError) {
      return NextResponse.json(
        { configured: false, error: error.message },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    logger.error("API /payments/verify payment settlement failed", { endpoint: "/api/payments/verify" }, error);
    return NextResponse.json(
      { error: sanitizeClientErrorMessage(error, "Payment signature verification failed.") },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}

