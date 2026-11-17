import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { recordDoorstepCodCollection } from "@/lib/delivery/cod";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi("orders.settle_cod");
    if (!auth.authorized) {
      return auth.response;
    }

    const rl = await checkRateLimit(`admin:cod-collect:${auth.user.id}`, "admin");
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

    const { orderId, expectedAmount, collectedAmount, collectionStatus, collectionReference, notes } =
      parsedBody.data;

    if (!orderId || expectedAmount === undefined || collectedAmount === undefined) {
      return NextResponse.json(
        { error: "orderId, expectedAmount, and collectedAmount are required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (!isValidUuid(orderId)) {
      return NextResponse.json(
        { error: "Invalid orderId format." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const result = await recordDoorstepCodCollection({
      orderId,
      expectedAmount: Number(expectedAmount),
      collectedAmount: Number(collectedAmount),
      collectorId: auth.profile.id,
      collectionStatus:
        collectionStatus ||
        (Number(collectedAmount) >= Number(expectedAmount) ? "collected" : "shortfall"),
      collectionReference,
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
    return serverErrorResponse(
      "/api/admin/delivery/cod-collect",
      err,
      "Internal server error during COD collection.",
      req
    );
  }
}
