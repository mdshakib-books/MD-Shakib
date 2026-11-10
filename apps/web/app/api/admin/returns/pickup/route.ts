import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { scheduleReturnPickup } from "@/lib/commerce/returns";
import { hasPermission } from "@/lib/admin/permissions";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    if (!hasPermission(auth.profile.role, "orders.ship") && !hasPermission(auth.profile.role, "orders.manage")) {
      return NextResponse.json({ error: "Forbidden: Shipping management permission required." }, { status: 403 });
    }

    const body = await req.json();
    const { returnId, pickupDate } = body;

    if (!returnId) {
      return NextResponse.json({ error: "returnId is required." }, { status: 400 });
    }

    const result = await scheduleReturnPickup(returnId, { pickupDate });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Return pickup scheduling error:", err?.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
