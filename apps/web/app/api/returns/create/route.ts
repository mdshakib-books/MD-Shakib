import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { createCustomerReturnRequest } from "@/lib/commerce/returns";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized: Please log in." }, { status: 401 });
    }

    const body = await req.json();
    const { orderId, requestType, reason, description, items, evidenceUrls, pickupAddress } = body;

    if (!orderId || !reason || !items || !items.length) {
      return NextResponse.json(
        { error: "orderId, reason, and items are required." },
        { status: 400 }
      );
    }

    const result = await createCustomerReturnRequest({
      orderId,
      userId: user.id,
      requestType: "return_refund",
      reason,
      description,
      items,
      evidenceUrls,
      pickupAddress,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("Return creation error:", err?.message || err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
