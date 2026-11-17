import { NextResponse } from "next/server";
import { processRazorpayWebhook } from "@/lib/integrations/razorpay/webhook";
import {
  RazorpayConfigurationError,
  RazorpayDisabledError,
} from "@/lib/integrations/razorpay/client";
import { checkRateLimit, rateLimitExceededResponse, getClientIp } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";
import {
  DEFAULT_MAX_WEBHOOK_BODY_BYTES,
  NO_STORE_HEADERS,
  readBoundedTextBody,
  sanitizeClientErrorMessage,
} from "@/lib/security/http";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const signature = req.headers.get("x-razorpay-signature");

    if (!signature) {
      logger.alert(
        "HIGH",
        "Razorpay Webhook Missing Signature",
        "Incoming webhook omitted required x-razorpay-signature header",
        { clientIp, endpoint: "/api/webhooks/razorpay" }
      );
      return NextResponse.json(
        { error: "Missing x-razorpay-signature header" },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const rl = await checkRateLimit(clientIp, "webhook");
    if (!rl.allowed) {
      logger.warn("Rate limit exceeded for Razorpay webhook", { clientIp });
      return rateLimitExceededResponse(rl);
    }

    const boundedBody = await readBoundedTextBody(req, DEFAULT_MAX_WEBHOOK_BODY_BYTES);
    if (!boundedBody.ok) {
      return NextResponse.json(
        { error: boundedBody.error },
        { status: boundedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const result = await processRazorpayWebhook(boundedBody.text, signature);

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    if (error instanceof RazorpayDisabledError || error instanceof RazorpayConfigurationError) {
      return NextResponse.json(
        { configured: false, error: error.message },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    logger.alert(
      "CRITICAL",
      "Razorpay Webhook Failure",
      error?.message || "Webhook processing failed",
      { endpoint: "/api/webhooks/razorpay" },
      error
    );
    return NextResponse.json(
      { error: sanitizeClientErrorMessage(error, "Webhook processing failed") },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}

