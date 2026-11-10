import { NextResponse } from "next/server";
import { processRazorpayWebhook } from "@/lib/integrations/razorpay/webhook";
import { checkRateLimit, rateLimitExceededResponse, getClientIp } from "@/lib/security/rate-limit";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rl = await checkRateLimit(clientIp, "webhook");
    if (!rl.allowed) {
      logger.warn("Rate limit exceeded for Razorpay webhook", { clientIp });
      return rateLimitExceededResponse(rl);
    }

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
        { status: 400 }
      );
    }

    const rawBody = await req.text();
    const result = await processRazorpayWebhook(rawBody, signature);

    return NextResponse.json(result);
  } catch (error: any) {
    logger.alert(
      "CRITICAL",
      "Razorpay Webhook Failure",
      error?.message || "Webhook processing failed",
      { endpoint: "/api/webhooks/razorpay" },
      error
    );
    return NextResponse.json(
      { error: error?.message || "Webhook processing failed" },
      { status: 400 }
    );
  }
}

