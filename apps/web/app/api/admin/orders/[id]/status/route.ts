import { NextResponse } from "next/server";
import { verifyAdminApi } from "@/lib/admin/auth";
import { hasPermission } from "@/lib/admin/permissions";
import { FULFILLMENT_SHIPPING_STATUSES } from "@/lib/admin/constants";
import { updateAdminOrderStatus } from "@/lib/admin/orders";
import { checkRateLimit, rateLimitExceededResponse } from "@/lib/security/rate-limit";
import {
  isValidUuid,
  NO_STORE_HEADERS,
  readBoundedJsonBody,
  serverErrorResponse,
} from "@/lib/security/http";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const authResult = await verifyAdminApi(["orders.manage", "orders.ship"]);
  if (!authResult.authorized) {
    return authResult.response;
  }

  const rl = await checkRateLimit(`admin:order-status:${authResult.user.id}`, "admin");
  if (!rl.allowed) {
    return rateLimitExceededResponse(rl);
  }

  const { id: orderId } = await context.params;
  if (!isValidUuid(orderId)) {
    return NextResponse.json(
      { error: "Invalid order ID format." },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  try {
    const parsedBody = await readBoundedJsonBody(request);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.error },
        { status: parsedBody.status, headers: NO_STORE_HEADERS }
      );
    }

    const { nextStatus, notes, courier, awb, trackingUrl } = parsedBody.data;

    if (!nextStatus || typeof nextStatus !== "string") {
      return NextResponse.json(
        { error: "Invalid request: nextStatus is required." },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    if (nextStatus === "Cancelled") {
      return NextResponse.json(
        {
          error:
            "Order cancellation is not allowed through status update API. Use the cancellation workflow.",
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    const requiredPermission = FULFILLMENT_SHIPPING_STATUSES.has(nextStatus)
      ? "orders.ship"
      : "orders.manage";

    if (!hasPermission(authResult.profile.role, requiredPermission)) {
      return NextResponse.json(
        {
          error: `Forbidden: Missing "${requiredPermission}" permission to set status "${nextStatus}".`,
        },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    const result = await updateAdminOrderStatus({
      orderId,
      nextStatus,
      notes,
      courier,
      awb,
      trackingUrl,
    });

    if (!result.success) {
      const status = result.error?.startsWith("Forbidden:") ? 403 : 400;
      return NextResponse.json(
        { error: result.error || "Failed to update order status." },
        { status, headers: NO_STORE_HEADERS }
      );
    }

    return NextResponse.json(
      {
        success: true,
        order: result.order,
      },
      { headers: NO_STORE_HEADERS }
    );
  } catch (err: any) {
    return serverErrorResponse(
      "/api/admin/orders/[id]/status",
      err,
      "Internal server error.",
      request
    );
  }
}
