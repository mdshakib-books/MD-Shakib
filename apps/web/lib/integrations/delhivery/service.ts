import crypto from "crypto";
import { getDelhiveryConfig } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";

export interface PincodeServiceabilityResult {
  pincode: string;
  serviceable: boolean;
  prepaid: boolean;
  cod: boolean;
  city?: string;
  state?: string;
}

export interface ShipmentBookingResult {
  orderId: string;
  awb: string;
  trackingUrl: string;
  courier: string;
  alreadyBooked?: boolean;
}

/**
 * Validates and checks serviceability for an Indian pincode.
 */
export async function checkPincodeServiceability(
  pincode: string
): Promise<PincodeServiceabilityResult> {
  const cleanPincode = pincode.trim();

  // Validate standard 6-digit Indian postal code
  if (!/^\d{6}$/.test(cleanPincode)) {
    throw new Error("Invalid pincode format. Must be exactly 6 digits.");
  }

  const config = getDelhiveryConfig();

  // If in mock or test mode
  if (!config.isConfigured) {
    return {
      pincode: cleanPincode,
      serviceable: true,
      prepaid: true,
      cod: true,
      city: "Delhi",
      state: "Delhi",
    };
  }

  try {
    const res = await fetch(
      `${config.apiUrl}/c/api/pin-codes/json/?filter_codes=${cleanPincode}`,
      {
        headers: {
          Authorization: `Token ${config.token}`,
          Accept: "application/json",
        },
      }
    );

    if (!res.ok) {
      throw new Error(`Delhivery serviceability check failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const pinData = data?.delivery_codes?.[0]?.postal_code;

    if (!pinData) {
      return {
        pincode: cleanPincode,
        serviceable: false,
        prepaid: false,
        cod: false,
      };
    }

    return {
      pincode: cleanPincode,
      serviceable: pinData.is_serviceable ?? true,
      prepaid: pinData.pre_paid === "Y",
      cod: pinData.cod === "Y",
      city: pinData.city,
      state: pinData.state_code,
    };
  } catch (error: any) {
    console.error("Delhivery pincode lookup error:", error?.message || error);
    // Graceful fallback to serviceable for resilient UX
    return {
      pincode: cleanPincode,
      serviceable: true,
      prepaid: true,
      cod: true,
    };
  }
}

/**
 * Idempotently books a Delhivery consignment shipment for a confirmed/paid order.
 */
export async function createShipmentForOrder(
  orderId: string
): Promise<ShipmentBookingResult> {
  const adminDb = createAdminClient();

  // 1. Fetch order details
  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, order_status, payment_status, payment_method, shipping_awb, shipping_tracking_url, address_snapshot, total_amount")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    throw new Error(`Order not found: ${orderId}`);
  }

  // 2. Idempotency Check: if already has shipping_awb, return existing tracking details
  if (order.shipping_awb) {
    return {
      orderId: order.id,
      awb: order.shipping_awb,
      trackingUrl: order.shipping_tracking_url || `https://track.delhivery.com/p/${order.shipping_awb}`,
      courier: "Delhivery",
      alreadyBooked: true,
    };
  }

  // 3. Validate order status eligibility
  const isEligible =
    order.order_status === "Confirmed" ||
    order.order_status === "Packed" ||
    order.payment_status === "Paid" ||
    order.payment_method === "COD";

  if (!isEligible) {
    throw new Error(
      `Order is not eligible for shipment booking in status ${order.order_status} / payment ${order.payment_status}`
    );
  }

  const config = getDelhiveryConfig();
  const address: any = order.address_snapshot;

  let awb: string;
  let trackingUrl: string;

  if (!config.isConfigured) {
    // Deterministic mock AWB for local testing
    awb = `DLV${order.id.replace(/-/g, "").slice(0, 11).toUpperCase()}`;
    trackingUrl = `https://track.delhivery.com/p/${awb}`;
  } else {
    // Delhivery production consignment payload
    const consignmentData = {
      shipments: [
        {
          name: address.full_name,
          add: `${address.house_no}, ${address.area}`,
          pin: address.pincode,
          city: address.city,
          state: address.state,
          country: "India",
          phone: address.phone,
          order: order.id,
          payment_mode: order.payment_method === "COD" ? "COD" : "Prepaid",
          total_amount: Number(order.total_amount),
          cod_amount: order.payment_method === "COD" ? Number(order.total_amount) : 0,
        },
      ],
      pickup_location: {
        name: process.env.DELHIVERY_PICKUP_LOCATION || "Primary Warehouse",
      },
    };

    const formBody = new URLSearchParams();
    formBody.append("format", "json");
    formBody.append("data", JSON.stringify(consignmentData));

    const res = await fetch(`${config.apiUrl}/api/cmu/create.json`, {
      method: "POST",
      headers: {
        Authorization: `Token ${config.token}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: formBody.toString(),
    });

    if (!res.ok) {
      throw new Error(`Delhivery shipment booking failed: HTTP ${res.status}`);
    }

    const resData = await res.json();
    const pkg = resData?.packages?.[0];
    awb = pkg?.waybill || pkg?.upload_wbn;

    if (!awb) {
      throw new Error(`Delhivery booking response missing waybill: ${JSON.stringify(resData)}`);
    }

    trackingUrl = `https://track.delhivery.com/p/${awb}`;
  }

  const now = new Date().toISOString();

  // 4. Update order with tracking information
  await adminDb
    .from("orders")
    .update({
      shipping_awb: awb,
      shipping_tracking_url: trackingUrl,
      shipping_courier: "Delhivery",
      shipping_shipped_at: now,
      shipping_pickup_scheduled: true,
      order_status: "Shipped",
      updated_at: now,
    })
    .eq("id", order.id);

  return {
    orderId: order.id,
    awb,
    trackingUrl,
    courier: "Delhivery",
    alreadyBooked: false,
  };
}

/**
 * Tracks a shipment by its AWB number.
 */
export async function trackShipment(awb: string) {
  const config = getDelhiveryConfig();

  if (!config.isConfigured) {
    return {
      awb,
      status: "In Transit",
      status_code: "IT",
      scans: [
        {
          timestamp: new Date().toISOString(),
          location: "Delhi Hub",
          status: "Package picked up by courier",
        },
      ],
    };
  }

  const res = await fetch(`${config.apiUrl}/api/v1/packages/json/?waybill=${awb}`, {
    headers: {
      Authorization: `Token ${config.token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Delhivery tracking request failed: HTTP ${res.status}`);
  }

  return await res.json();
}

/**
 * Maps Delhivery webhook event codes to internal order status.
 */
export function mapDelhiveryStatusToOrderStatus(delhiveryStatus: string): string | null {
  const statusUpper = (delhiveryStatus || "").toUpperCase().trim();

  switch (statusUpper) {
    case "DL":
    case "DELIVERED":
      return "Delivered";
    case "UD":
    case "OUT FOR DELIVERY":
      return "Out for Delivery";
    case "IT":
    case "IN TRANSIT":
      return "Shipped";
    case "RT":
    case "RTO":
    case "RETURNED":
      return "Returned";
    default:
      return null;
  }
}

/**
 * Validates the authenticity of inbound Delhivery tracking webhooks.
 * Fails closed if DELHIVERY_WEBHOOK_SECRET is missing or empty.
 * Supports:
 * - Authorization: Token <secret>
 * - Authorization: Bearer <secret>
 * - Custom header: x-delhivery-secret or x-delhivery-token
 */
export function verifyDelhiveryWebhookAuth(
  authHeader: string | null,
  customSecretHeader: string | null
): { authorized: boolean; reason?: string } {
  const webhookSecret = process.env.DELHIVERY_WEBHOOK_SECRET;

  if (!webhookSecret || webhookSecret.trim() === "") {
    return {
      authorized: false,
      reason: "DELHIVERY_WEBHOOK_SECRET is not configured on server (fail closed)",
    };
  }

  let candidateToken = "";

  if (customSecretHeader && customSecretHeader.trim()) {
    candidateToken = customSecretHeader.trim();
  } else if (authHeader && authHeader.trim()) {
    const raw = authHeader.trim();
    const parts = raw.split(" ");
    if (parts.length === 2 && (parts[0].toLowerCase() === "token" || parts[0].toLowerCase() === "bearer")) {
      candidateToken = parts[1].trim();
    } else {
      candidateToken = raw;
    }
  }

  if (!candidateToken) {
    return { authorized: false, reason: "Missing authentication token or header" };
  }

  try {
    const candidateBuf = Buffer.from(candidateToken, "utf8");
    const secretBuf = Buffer.from(webhookSecret, "utf8");

    if (candidateBuf.length !== secretBuf.length) {
      return { authorized: false, reason: "Invalid credential length" };
    }

    const isValid = crypto.timingSafeEqual(candidateBuf, secretBuf);
    return { authorized: isValid, reason: isValid ? undefined : "Incorrect secret token" };
  } catch {
    return { authorized: false, reason: "Verification failure" };
  }
}

/**
 * Validates whether transitioning an order from currentStatus to nextStatus is permitted.
 */
export function isAllowedStatusTransition(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === nextStatus) return true;

  // Terminal states cannot be changed by courier updates
  if (currentStatus === "Cancelled" || currentStatus === "Delivered" || currentStatus === "Returned") {
    return false;
  }

  const forwardTransitions: Record<string, string[]> = {
    Pending: ["Shipped", "Returned"],
    Confirmed: ["Shipped", "Returned"],
    Packed: ["Shipped", "Returned"],
    Shipped: ["Out for Delivery", "Delivered", "Returned"],
    "Out for Delivery": ["Delivered", "Returned"],
  };

  const allowed = forwardTransitions[currentStatus] || [];
  return allowed.includes(nextStatus);
}

/**
 * Processes inbound Delhivery tracking webhooks with strict transition and association validation.
 */
export async function processDelhiveryWebhook(payload: any) {
  const waybill = payload?.waybill || payload?.awb || payload?.Shipment?.AWB;
  const rawStatus = payload?.status || payload?.Shipment?.Status?.Status;

  if (!waybill || !rawStatus) {
    return { status: "ignored", reason: "Missing waybill or status in payload" };
  }

  const internalStatus = mapDelhiveryStatusToOrderStatus(rawStatus);
  if (!internalStatus) {
    return { status: "unmapped_status", rawStatus };
  }

  const adminDb = createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, order_status, shipping_awb")
    .eq("shipping_awb", waybill)
    .single();

  if (error || !order) {
    return { status: "order_not_found", waybill };
  }

  // Idempotency check: already in requested status
  if (order.order_status === internalStatus) {
    return { status: "already_current", orderId: order.id, statusValue: internalStatus };
  }

  // Strict state machine validation
  const transitionAllowed = isAllowedStatusTransition(order.order_status, internalStatus);
  if (!transitionAllowed) {
    return {
      status: "rejected_illegal_transition",
      orderId: order.id,
      currentStatus: order.order_status,
      attemptedStatus: internalStatus,
    };
  }

  const now = new Date().toISOString();
  const updateData: any = {
    order_status: internalStatus,
    updated_at: now,
  };

  if (internalStatus === "Delivered") {
    updateData.delivered_at = now;
    updateData.shipping_delivered_at = now;
  }

  await adminDb.from("orders").update(updateData).eq("id", order.id);

  return { status: "updated", orderId: order.id, newStatus: internalStatus };
}

