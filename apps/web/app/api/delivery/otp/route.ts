import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getCustomerOrderDeliveryOtp } from "@/lib/delivery/otp";

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const orderId = searchParams.get("orderId");

    if (!orderId) {
      return NextResponse.json({ error: "Missing orderId parameter" }, { status: 400 });
    }

    const result = await getCustomerOrderDeliveryOtp(orderId, user.id);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Delivery OTP fetch error:", err?.message || err);
    return NextResponse.json({ error: "Failed to retrieve delivery OTP" }, { status: 500 });
  }
}
