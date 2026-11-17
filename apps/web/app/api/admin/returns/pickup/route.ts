import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { scheduleReturnPickup } from "@/lib/commerce/returns";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("orders.ship");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:returns-pickup:${auth.user.id}`, "admin");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const parsedBody = await readBoundedJsonBody(req);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { returnId, pickupDate } = parsedBody.data;
    if (!returnId || !isValidUuid(returnId)) {
      return NextResponse.json(
        { error: "Valid returnId is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await scheduleReturnPickup(returnId, { pickupDate });
    const isNotConfigured = result.error?.toLowerCase().includes("not configured");

    return NextResponse.json(
      {
        success: false,
        available: false,
        configured: isNotConfigured ? false : undefined,
        error: result.error || "Automated reverse pickup scheduling is not implemented.",
      },
      { status: isNotConfigured ? 503 : 501, headers: NO_STORE_HEADERS }
    );
  } catch (err: any) {
    return serverErrorResponse(
      "/api/admin/returns/pickup",
      err,
      "Internal server error",
      req
    );
  }
}
