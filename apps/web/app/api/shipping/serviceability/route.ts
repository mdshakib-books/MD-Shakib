import { NextResponse } from "next/server";
import {
  checkPincodeServiceability,
  DelhiveryConfigurationError,
  DelhiveryDisabledError,
  DelhiveryServiceabilityTimeoutError,
} from "@/lib/integrations/delhivery/service";
import { sanitizeClientErrorMessage } from "@/lib/security/http";
import { checkRateLimit, rateLimitExceededResponse, createRateLimitHeaders, getClientIp } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rl = await checkRateLimit(clientIp, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const pincode = searchParams.get("pincode");

    if (!pincode) {
      return NextResponse.json(
        { error: "Query parameter 'pincode' is required.", serviceable: false, prepaid: false, cod: false },
        { status: 400, headers: createRateLimitHeaders(rl) }
      );
    }

    const result = await checkPincodeServiceability(pincode);
    return NextResponse.json(
      {
        success: true,
        data: result,
        ...result,
      },
      {
        headers: createRateLimitHeaders(rl),
      }
    );
  } catch (error: any) {
    if (error instanceof DelhiveryDisabledError || error instanceof DelhiveryConfigurationError) {
      return NextResponse.json(
        {
          success: false,
          configured: false,
          serviceable: false,
          prepaid: false,
          cod: false,
          error: error.message,
        },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (error instanceof DelhiveryServiceabilityTimeoutError) {
      return NextResponse.json(
        {
          success: false,
          serviceable: false,
          prepaid: false,
          cod: false,
          error: error.message,
        },
        { status: 504, headers: { "Cache-Control": "no-store" } }
      );
    }

    return NextResponse.json(
      {
        success: false,
        serviceable: false,
        prepaid: false,
        cod: false,
        error: sanitizeClientErrorMessage(error, "Failed to check pincode serviceability."),
      },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  }
}

