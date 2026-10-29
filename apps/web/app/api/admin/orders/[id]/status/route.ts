import { NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { updateAdminOrderStatus } from "@/lib/admin/orders";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminApi();
  if (!authResult.authorized) {
    return authResult.response;
  }

  const { id: orderId } = await context.params;

  try {
    const body = await request.json();
    const { nextStatus, notes, courier, awb } = body;

    if (!nextStatus || typeof nextStatus !== "string") {
      return NextResponse.json(
        { error: "Invalid request: nextStatus is required." },
        { status: 400 }
      );
    }

    const result = await updateAdminOrderStatus({
      orderId,
      nextStatus,
      notes,
      courier,
      awb,
    });

    if (!result.success) {
      return NextResponse.json(
        { error: result.error || "Failed to update order status." },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      order: result.order,
    });
  } catch (err: any) {
    console.error("Admin order status API error:", err);
    return NextResponse.json(
      { error: err?.message || "Internal server error." },
      { status: 500 }
    );
  }
}

