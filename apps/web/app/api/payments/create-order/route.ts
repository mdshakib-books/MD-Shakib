import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  createRazorpayOrder,
  RazorpayConfigurationError,
  RazorpayDisabledError,
} from "@/lib/integrations/razorpay/service";
import { checkRateLimit, rateLimitExceededResponse, getClientIp } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  isValidUuid,
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
        { error: "Authentication required to initiate payment." },
        { status: 401, headers: NO_STORE_HEADERS }
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

    const parsedBody = await readBoundedJsonBody(req);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { orderId, forceNewAttempt } = parsedBody.data;

    if (!orderId || !isValidUuid(orderId)) {
      return NextResponse.json(
        { error: "Missing or invalid parameter: orderId" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await createRazorpayOrder(orderId, user.id, {
      forceNewAttempt: Boolean(forceNewAttempt),
    });

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    if (error instanceof RazorpayDisabledError || error instanceof RazorpayConfigurationError) {
      return NextResponse.json(
        { configured: false, error: error.message },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    logger.error("API /payments/create-order failure", { endpoint: "/api/payments/create-order" }, error);
    return NextResponse.json(
      { error: sanitizeClientErrorMessage(error, "Unable to initiate payment order.") },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}

