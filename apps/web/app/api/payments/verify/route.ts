import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { verifyAndSettlePayment } from "@/lib/integrations/razorpay/service";
import { checkRateLimit, rateLimitExceededResponse, getClientIp } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

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
        { status: 401 }
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

    const body = await req.json();
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return NextResponse.json(
        { error: "Missing required Razorpay payment signature parameters." },
        { status: 400 }
      );
    }

    const result = await verifyAndSettlePayment({
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      userId: user.id,
    });

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error("API /payments/verify payment settlement failed", { endpoint: "/api/payments/verify" }, error);
    return NextResponse.json(
      { error: error?.message || "Payment signature verification failed." },
      { status: 400 }
    );
  }
}

