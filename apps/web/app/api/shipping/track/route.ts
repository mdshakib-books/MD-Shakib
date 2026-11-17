import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasPermission } from "@/lib/admin/permissions";
import { isDelhiveryShipment } from "@/lib/admin/constants";
import {
  trackShipment,
  resolveDelhiveryExecution,
  DelhiveryConfigurationError,
  DelhiveryDisabledError,
  DelhiveryRequestTimeoutError,
} from "@/lib/integrations/delhivery/service";
import {
  checkRateLimit,
  createRateLimitHeaders,
  getClientIp,
  rateLimitExceededResponse,
} from "@/lib/security/rate-limit";
import { isValidAwb, NO_STORE_HEADERS, sanitizeClientErrorMessage } from "@/lib/security/http";

export async function GET(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rl = await checkRateLimit(`track:${clientIp}`, "search");
    if (!rl.allowed) {
      return rateLimitExceededResponse(rl);
    }

    const { searchParams } = new URL(req.url);
    const rawAwb = searchParams.get("awb");

    if (!rawAwb) {
      return NextResponse.json(
        { error: "Query parameter 'awb' (Air Waybill tracking number) is required." },
        { status: 400, headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rl) } }
      );
    }

    const awb = rawAwb.trim();
    if (!isValidAwb(awb)) {
      return NextResponse.json(
        { error: "Invalid AWB tracking number format." },
        { status: 400, headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rl) } }
      );
    }

    // Fail closed with 503 BEFORE querying DB/requiring session if courier tracking is disabled/unconfigured
    resolveDelhiveryExecution("shipment tracking");

    // Authenticate caller to prevent open-proxy abuse and arbitrary AWB enumeration
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: "Unauthorized: Sign in to track your order shipment." },
        { status: 401, headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rl) } }
      );
    }

    const adminDb = createAdminClient();

    // Check caller staff permission and find matching order / active shipment
    const [{ data: profile }, { data: matchedOrder }, { data: matchedShipment }] =
      await Promise.all([
        adminDb
          .from("profiles")
          .select("role, is_blocked, is_deleted")
          .eq("id", user.id)
          .maybeSingle(),
        adminDb
          .from("orders")
          .select("id, user_id, shipping_courier, shipping_awb, shipping_tracking_url")
          .eq("shipping_awb", awb)
          .maybeSingle(),
        adminDb
          .from("shipments")
          .select("order_id, carrier_name, booking_mode, tracking_url, awb")
          .eq("awb", awb)
          .maybeSingle(),
      ]);

    const isStaff =
      Boolean(profile) &&
      !profile?.is_blocked &&
      !profile?.is_deleted &&
      hasPermission(profile?.role || "", "orders.view");

    let targetOrder = matchedOrder;
    if (!targetOrder && matchedShipment?.order_id) {
      const { data: orderByShipment } = await adminDb
        .from("orders")
        .select("id, user_id, shipping_courier, shipping_awb, shipping_tracking_url")
        .eq("id", matchedShipment.order_id)
        .maybeSingle();
      targetOrder = orderByShipment;
    }

    if (!targetOrder) {
      return NextResponse.json(
        {
          error: isStaff
            ? "No shipment matching this AWB exists in store records."
            : "Forbidden: You are not authorized to track this AWB.",
        },
        {
          status: isStaff ? 404 : 403,
          headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rl) },
        }
      );
    }

    if (!isStaff && targetOrder.user_id !== user.id) {
      return NextResponse.json(
        { error: "Forbidden: You can only track shipments for your own orders." },
        { status: 403, headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rl) } }
      );
    }

    const effectiveCourier =
      matchedShipment?.carrier_name || targetOrder.shipping_courier || "Delhivery";

    if (
      !isDelhiveryShipment({
        courier: effectiveCourier,
        bookingMode: matchedShipment?.booking_mode,
        trackingUrl: matchedShipment?.tracking_url || targetOrder.shipping_tracking_url,
      })
    ) {
      return NextResponse.json(
        {
          awb,
          courier: effectiveCourier,
          trackingAvailable: false,
          error: `Live Delhivery tracking is unavailable for manual carrier "${effectiveCourier}".`,
        },
        { status: 422, headers: { ...NO_STORE_HEADERS, ...createRateLimitHeaders(rl) } }
      );
    }

    const result = await trackShipment(awb);
    return NextResponse.json(
      {
        awb: result.awb,
        status: result.status,
        statusCode: result.statusCode,
        courier: result.courier,
        origin: result.origin,
        destination: result.destination,
        lastUpdated: result.lastUpdated,
        scans: result.scans,
        ...(result.isMock ? { isMock: true, mode: result.mode } : {}),
      },
      {
        headers: {
          ...NO_STORE_HEADERS,
          ...createRateLimitHeaders(rl),
        },
      }
    );
  } catch (error: any) {
    if (
      error instanceof DelhiveryDisabledError ||
      error instanceof DelhiveryConfigurationError
    ) {
      return NextResponse.json(
        { configured: false, error: error.message },
        { status: 503, headers: NO_STORE_HEADERS }
      );
    }
    if (error instanceof DelhiveryRequestTimeoutError) {
      return NextResponse.json(
        { error: error.message },
        { status: 504, headers: NO_STORE_HEADERS }
      );
    }
    return NextResponse.json(
      { error: sanitizeClientErrorMessage(error, "Failed to track shipment.") },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }
}
