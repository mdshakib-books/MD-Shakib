import { NextResponse } from "next/server";
import {
  processDelhiveryWebhook,
  verifyDelhiveryWebhookAuth,
} from "@/lib/integrations/delhivery/service";
import { logger } from "@/lib/logger";
import { checkRateLimit, getClientIp, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  DEFAULT_MAX_WEBHOOK_BODY_BYTES,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  sanitizeClientErrorMessage,
} from "@/lib/security/http";

export async function POST(req: Request) {
  try {
    // 1. Authenticate request credentials BEFORE any DB/rate-limit operations
    const authHeader = req.headers.get("authorization");
    const customSecretHeader =
      req.headers.get("x-delhivery-secret") || req.headers.get("x-delhivery-token");

    const authCheck = verifyDelhiveryWebhookAuth(authHeader, customSecretHeader);

    if (!authCheck.authorized) {
      const isDisabled = authCheck.reason?.includes("is disabled") ?? false;
      const isMissingConfig =
        authCheck.reason?.includes("is not configured") ?? false;
      const statusCode = isDisabled ? 503 : isMissingConfig ? 500 : 401;

      logger.alert(
        "HIGH",
        "Delhivery Webhook Unauthorized Access",
        authCheck.reason || "Unauthorized courier webhook call",
        { endpoint: "/api/webhooks/delhivery" }
      );

      return NextResponse.json(
        {
          error: isDisabled
            ? "Delhivery webhook processing is disabled on server (ENABLE_DELHIVERY=false)."
            : isMissingConfig
            ? "Delhivery webhook authentication is not configured on server (fail closed)."
            : "Unauthorized: Invalid or missing Delhivery webhook authentication credentials.",
        },
        { status: statusCode }
      );
    }

    // 2. Apply webhook tier rate limiting
    const rl = await checkRateLimit(getClientIp(req), "webhook");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    // 3. Parse and validate bounded JSON object payload
    const parsedBody = await readBoundedJsonBody(req, DEFAULT_MAX_WEBHOOK_BODY_BYTES);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }
    const payload = parsedBody.data;

    // 4. Process delivery event with durable deduplication & out-of-order protection
    const result = await processDelhiveryWebhook(payload);

    if (result.status === "rejected_illegal_transition") {
      return NextResponse.json(
        {
          error: "Illegal order status transition requested.",
          details: result,
        },
        { status: 422, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (error: any) {
    console.error("Delhivery webhook processing error:", error?.message || error);
    return NextResponse.json(
      { error: sanitizeClientErrorMessage(error, "Delhivery webhook processing failed") },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
