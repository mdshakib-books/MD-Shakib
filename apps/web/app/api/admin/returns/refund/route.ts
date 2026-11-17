import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { processReturnRefund } from "@/lib/commerce/returns";
import { logger } from "@/lib/logger";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
} from "@/lib/security/http";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("orders.refund");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:returns-refund:${auth.user.id}`, "admin");
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

    const { returnId, amount, reason } = parsedBody.data;
    if (!returnId || !isValidUuid(returnId)) {
      return NextResponse.json(
        { error: "Valid returnId is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await processReturnRefund({
      returnId,
      adminId: auth.profile.id,
      amount: amount ? Number(amount) : undefined,
      reason,
    });

    if (!result.success) {
      logger.alert("HIGH", "Return Refund Failed", result.error || "Refund processing error", {
        returnId,
        adminId: auth.profile.id,
      });
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    logger.alert("CRITICAL", "Return Refund Uncaught Exception", err?.message || String(err), {}, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
