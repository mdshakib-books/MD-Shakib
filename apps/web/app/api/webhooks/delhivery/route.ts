import { NextResponse } from "next/server";
import {
  processDelhiveryWebhook,
  verifyDelhiveryWebhookAuth,
} from "@/lib/integrations/delhivery/service";

export async function POST(req: Request) {
  try {
    // 1. Authenticate request credentials before processing
    const authHeader = req.headers.get("authorization");
    const customSecretHeader =
      req.headers.get("x-delhivery-secret") || req.headers.get("x-delhivery-token");

    const authCheck = verifyDelhiveryWebhookAuth(authHeader, customSecretHeader);

    if (!authCheck.authorized) {
      const isMissingConfig =
        authCheck.reason?.includes("is not configured") ?? false;
      const statusCode = isMissingConfig ? 500 : 401;

      return NextResponse.json(
        {
          error: isMissingConfig
            ? "Delhivery webhook authentication is not configured on server (fail closed)."
            : "Unauthorized: Invalid or missing Delhivery webhook authentication credentials.",
        },
        { status: statusCode }
      );
    }

    // 2. Parse payload safely
    let payload: any;
    try {
      payload = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Malformed JSON payload in webhook request" },
        { status: 400 }
      );
    }

    // 3. Process delivery event with strict state-transition enforcement
    const result = await processDelhiveryWebhook(payload);

    if (result.status === "rejected_illegal_transition") {
      return NextResponse.json(
        {
          error: "Illegal order status transition requested.",
          details: result,
        },
        { status: 422 }
      );
    }

    return NextResponse.json(result);
  } catch (error: any) {
    console.error("Delhivery webhook processing error:", error?.message || error);
    return NextResponse.json(
      { error: error?.message || "Delhivery webhook processing failed" },
      { status: 400 }
    );
  }
}
