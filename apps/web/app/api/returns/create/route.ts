import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createCustomerReturnRequest } from "@/lib/commerce/returns";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  sanitizeAttachmentUrls,
  serverErrorResponse,
} from "@/lib/security/http";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized: Please log in." },
        { status: 401, headers: NO_STORE_HEADERS }
      );
    }

    const rl = await checkRateLimit(`returns:create:${user.id}`, "api");
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

    const { orderId, reason, description, items, evidenceUrls, pickupAddress } = parsedBody.data;

    if (!orderId || !reason || !Array.isArray(items) || !items.length) {
      return NextResponse.json(
        { error: "orderId, reason, and items are required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isValidUuid(orderId)) {
      return NextResponse.json(
        { error: "Invalid orderId format." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const evidenceCheck = sanitizeAttachmentUrls(evidenceUrls, 5);
    if (!evidenceCheck.valid) {
      return NextResponse.json(
        { error: evidenceCheck.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await createCustomerReturnRequest({
      orderId,
      userId: user.id,
      requestType: "return_refund",
      reason,
      description,
      items,
      evidenceUrls: evidenceCheck.urls,
      pickupAddress,
    });

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(result, { headers: NO_STORE_HEADERS });
  } catch (err: any) {
    return serverErrorResponse("/api/returns/create", err, "Internal server error", req);
  }
}
