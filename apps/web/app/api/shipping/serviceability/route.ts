import { NextResponse } from "next/server";
import { checkPincodeServiceability } from "@/lib/integrations/delhivery/service";
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
        { error: "Query parameter 'pincode' is required." },
        { status: 400, headers: createRateLimitHeaders(rl) }
      );
    }

    const result = await checkPincodeServiceability(pincode);
    return NextResponse.json(result, {
      headers: createRateLimitHeaders(rl),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to check pincode serviceability." },
      { status: 400 }
    );
  }
}

