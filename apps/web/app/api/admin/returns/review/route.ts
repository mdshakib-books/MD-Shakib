import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { adminReviewReturnRequest } from "@/lib/commerce/returns";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("returns.manage");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:returns-review:${auth.user.id}`, "admin");
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

    const { returnId, action, rejectionReason, adminNotes } = parsedBody.data;

    if (!returnId || !action || !isValidUuid(returnId)) {
      return NextResponse.json(
        { error: "Valid returnId and action are required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!["approve", "reject", "request_info", "mark_received"].includes(action)) {
      return NextResponse.json(
        { error: `Invalid review action: ${action}` },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await adminReviewReturnRequest({
      returnId,
      adminId: auth.profile.id,
      action,
      rejectionReason,
      adminNotes,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse(
      "/api/admin/returns/review",
      err,
      "Internal server error",
      req
    );
  }
}
