import { NextRequest, NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { verifyDeliveryOtp } from "@/lib/delivery/otp";
import { hasPermission } from "@/lib/admin/permissions";

export async function POST(req: NextRequest) {
  try {
    const auth = await verifyAdminApi();
    if (!auth.authorized) {
      return auth.response;
    }

    if (!hasPermission(auth.profile.role, "orders.ship") && !hasPermission(auth.profile.role, "orders.manage")) {
      return NextResponse.json({ error: "Forbidden: Delivery verification permission required." }, { status: 403 });
    }

    const body = await req.json();
    const { orderId, otp, awb } = body;

    if (!orderId || !otp) {
      return NextResponse.json({ error: "orderId and otp are required." }, { status: 400 });
    }

    const result = await verifyDeliveryOtp({
      orderId,
      candidateOtp: otp,
      actorId: auth.profile.id,
      actorRole: auth.profile.role,
      awb,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          outcome: result.outcome,
          attemptsLeft: result.attemptsLeft,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Delivery OTP verification endpoint error:", err?.message || err);
    return NextResponse.json({ error: "Internal server error during verification." }, { status: 500 });
  }
}
