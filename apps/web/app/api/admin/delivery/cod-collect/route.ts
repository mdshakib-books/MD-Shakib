import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { recordDoorstepCodCollection } from "@/lib/delivery/cod";
import { hasPermission } from "@/lib/admin/permissions";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    if (!hasPermission(auth.profile.role, "orders.settle_cod") && !hasPermission(auth.profile.role, "orders.manage")) {
      return NextResponse.json({ error: "Forbidden: COD collection permission required." }, { status: 403 });
    }

    const body = await req.json();
    const { orderId, expectedAmount, collectedAmount, collectionStatus, collectionReference, notes } = body;

    if (!orderId || expectedAmount === undefined || collectedAmount === undefined) {
      return NextResponse.json({ error: "orderId, expectedAmount, and collectedAmount are required." }, { status: 400 });
    }

    const result = await recordDoorstepCodCollection({
      orderId,
      expectedAmount: Number(expectedAmount),
      collectedAmount: Number(collectedAmount),
      collectorId: auth.profile.id,
      collectionStatus: collectionStatus || (collectedAmount >= expectedAmount ? "collected" : "shortfall"),
      collectionReference,
      notes,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("COD collection endpoint error:", err?.message || err);
    return NextResponse.json({ error: "Internal server error during COD collection." }, { status: 500 });
  }
}
