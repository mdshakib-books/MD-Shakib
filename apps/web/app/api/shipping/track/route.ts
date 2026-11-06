import { NextResponse } from "next/server";
import { trackShipment } from "@/lib/integrations/delhivery/service";
import { checkRateLimit, rateLimitExceededResponse, createRateLimitHeaders, getClientIp } from "@/lib/security/rate-limit";

export async function GET(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rl = await checkRateLimit(clientIp, "api");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const awb = searchParams.get("awb");

    if (!awb) {
      return NextResponse.json(
        { error: "Query parameter 'awb' is required." },
        { status: 400, headers: createRateLimitHeaders(rl) }
      );
    }

    const result = await trackShipment(awb);
    return NextResponse.json(result, {
      headers: createRateLimitHeaders(rl),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Failed to track shipment." },
      { status: 400 }
    );
  }
}

