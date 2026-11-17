import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { confirmCodReturnRefundPayout } from "@/lib/commerce/returns";
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

    const rl = await checkRateLimit(`admin:returns-refund-confirm:${auth.user.id}`, "admin");
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

    const {
      refundRecordId,
      returnId,
      payoutChannel,
      payoutReference,
      destinationHint,
      notes,
    } = parsedBody.data;

    if (!payoutChannel || !payoutReference) {
      return NextResponse.json(
        { error: "payoutChannel and payoutReference are required to confirm COD refund payout." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (
      (refundRecordId && !isValidUuid(refundRecordId)) ||
      (returnId && !isValidUuid(returnId))
    ) {
      return NextResponse.json(
        { error: "Invalid refundRecordId or returnId format." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await confirmCodReturnRefundPayout({
      refundRecordId,
      returnId,
      adminId: auth.profile.id,
      payoutChannel,
      payoutReference,
      destinationHint,
      notes,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    logger.alert("HIGH", "COD Return Refund Confirmation Failed", err?.message || String(err), {}, err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
