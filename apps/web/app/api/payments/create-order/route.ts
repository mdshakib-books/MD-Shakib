import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createRazorpayOrder } from "@/lib/integrations/razorpay/service";
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
        { error: "Authentication required to initiate payment." },
        { status: 401 }
      );
    }

    // Rate limit checkout payment attempts per user / IP
    const clientIp = getClientIp(req);
    const rlKey = user.id || clientIp;
    const rl = await checkRateLimit(rlKey, "payment");
    if (!rl.allowed) {
      logger.warn("Rate limit exceeded for /api/payments/create-order", { userId: user.id, clientIp });
      return rateLimitExceededResponse(rl);
    }

    const body = await req.json();
    const { orderId } = body;

    if (!orderId) {
      return NextResponse.json(
        { error: "Missing required parameter: orderId" },
        { status: 400 }
      );
    }

    const result = await createRazorpayOrder(orderId, user.id);

    return NextResponse.json(result);
  } catch (error: any) {
    logger.error("API /payments/create-order failure", { endpoint: "/api/payments/create-order" }, error);
    return NextResponse.json(
      { error: error?.message || "Internal server error creating payment order." },
      { status: 400 }
    );
  }
}

