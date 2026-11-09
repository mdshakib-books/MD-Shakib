import crypto from "crypto";
import { getDelhiveryConfig } from "./client";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendShipmentNotification } from "@/lib/integrations/resend/service";

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
    if (cleanPincode.endsWith("000") || cleanPincode === "999999") {
      return {
        pincode: cleanPincode,
        serviceable: false,
        prepaid: false,
        cod: false,
      };
    }
    if (cleanPincode === "110001") {
      return {
        pincode: cleanPincode,
        serviceable: true,
        prepaid: true,
        cod: false,
        city: "New Delhi",
        state: "Delhi",
      };
    }
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

  // Feature 1.22: Dispatch shipment notification
  sendShipmentNotification(order.id, "shipped").catch((err) =>
    console.error("Async shipment notification dispatch error:", err)
  );

  return {
    orderId: order.id,
    awb,
    trackingUrl,
    courier: "Delhivery",
    alreadyBooked: false,
  };
}

export interface NormalizedTrackingScan {
  timestamp: string;
  location: string;
  status: string;
  statusCode?: string;
}

export interface NormalizedTrackingResult {
  awb: string;
  status: string;
  statusCode: string;
  courier: string;
  origin?: string;
  destination?: string;
  lastUpdated: string;
  scans: NormalizedTrackingScan[];
}

/**
 * Tracks a shipment by its AWB number and normalizes tracking events (Feature 1.14).
 */
export async function trackShipment(awb: string): Promise<NormalizedTrackingResult> {
  const cleanAwb = (awb || "").trim();
  if (!cleanAwb) {
    throw new Error("AWB tracking number is required.");
  }

  const config = getDelhiveryConfig();
  const adminDb = createAdminClient();

  // Fetch associated order to provide contextual scans in mock/test mode
  const { data: order } = await adminDb
    .from("orders")
    .select("order_status, shipping_shipped_at, delivered_at, address_snapshot")
    .eq("shipping_awb", cleanAwb)
    .maybeSingle();

  if (!config.isConfigured) {
    const address = (order?.address_snapshot as any) || {};
    const destination = address.city ? `${address.city}, ${address.state || ""}` : "Customer Location";
    const shippedAt = order?.shipping_shipped_at || new Date(Date.now() - 3600000 * 24).toISOString();
    const orderStatus = order?.order_status || "Shipped";

    const scans: NormalizedTrackingScan[] = [
      {
        timestamp: shippedAt,
        location: "Delhi Warehouse Hub",
        status: "Consignment manifested and dispatched via Delhivery Express",
        statusCode: "MANIFESTED",
      },
    ];

    if (orderStatus === "Shipped" || orderStatus === "Out for Delivery" || orderStatus === "Delivered") {
      scans.push({
        timestamp: new Date(new Date(shippedAt).getTime() + 3600000 * 8).toISOString(),
        location: "Regional Sorting Facility",
        status: "In Transit — Arrived at distribution centre",
        statusCode: "IT",
      });
    }

    if (orderStatus === "Out for Delivery" || orderStatus === "Delivered") {
      scans.push({
        timestamp: new Date(new Date(shippedAt).getTime() + 3600000 * 18).toISOString(),
        location: destination,
        status: "Out for Delivery — Package assigned to local courier agent",
        statusCode: "UD",
      });
    }

    if (orderStatus === "Delivered") {
      scans.push({
        timestamp: order?.delivered_at || new Date().toISOString(),
        location: destination,
        status: "Delivered — Package handed over to recipient",
        statusCode: "DL",
      });
    }

    return {
      awb: cleanAwb,
      status: orderStatus,
      statusCode: orderStatus === "Delivered" ? "DL" : orderStatus === "Out for Delivery" ? "UD" : "IT",
      courier: "Delhivery",
      origin: "New Delhi, DL",
      destination,
      lastUpdated: new Date().toISOString(),
      scans: scans.reverse(),
    };
  }

  const res = await fetch(`${config.apiUrl}/api/v1/packages/json/?waybill=${cleanAwb}`, {
    headers: {
      Authorization: `Token ${config.token}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    throw new Error(`Delhivery tracking request failed: HTTP ${res.status}`);
  }

  const raw = await res.json();
  const shipment = raw?.ShipmentData?.[0]?.Shipment || raw?.packages?.[0];

  const rawScans = shipment?.Scans || shipment?.scans || [];
  const normalizedScans: NormalizedTrackingScan[] = rawScans.map((s: any) => ({
    timestamp: s?.ScanDetail?.ScanDateTime || s?.timestamp || new Date().toISOString(),
    location: s?.ScanDetail?.ScannedLocation || s?.location || "En Route",
    status: s?.ScanDetail?.Instructions || s?.status || s?.Scan || "Scan update",
    statusCode: s?.ScanDetail?.ScanType || s?.statusCode,
  }));

  const rawStatus = shipment?.Status?.Status || shipment?.status || "In Transit";
  const mappedStatus = mapDelhiveryStatusToOrderStatus(rawStatus) || rawStatus;

  return {
    awb: cleanAwb,
    status: mappedStatus,
    statusCode: rawStatus,
    courier: "Delhivery",
    origin: shipment?.PickUpLocation || shipment?.origin,
    destination: shipment?.DeliveryLocation || shipment?.destination,
    lastUpdated: new Date().toISOString(),
    scans: normalizedScans,
  };
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
    .select("id, order_status, shipping_awb, payment_method, payment_status, total_amount, cod_settlement_status")
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

    // Feature 1.15: Delivered and COD Settled are separate events.
    // If COD, mark settlement status as pending collection reconciliation,
    // but do NOT blindly set payment_status = 'Paid'.
    if (order.payment_method === "COD" && order.payment_status !== "Paid") {
      updateData.cod_settlement_status = "pending";
    }
  }

  await adminDb.from("orders").update(updateData).eq("id", order.id);

  // Feature 1.22: Dispatch tracking shipment event notification
  if (internalStatus === "Shipped") {
    sendShipmentNotification(order.id, "shipped").catch((err) =>
      console.error("Async shipment notification error:", err)
    );
  } else if (internalStatus === "Out for Delivery") {
    sendShipmentNotification(order.id, "out_for_delivery").catch((err) =>
      console.error("Async out for delivery notification error:", err)
    );
  } else if (internalStatus === "Delivered") {
    sendShipmentNotification(order.id, "delivered").catch((err) =>
      console.error("Async delivered notification error:", err)
    );
  }

  return { status: "updated", orderId: order.id, newStatus: internalStatus };
}

export interface PickupScheduleParams {
  pickupDate?: string; // YYYY-MM-DD
  pickupTime?: string; // HH:MM:SS
  expectedPackageCount?: number;
  pickupLocation?: string;
}

export interface PickupScheduleResult {
  success: boolean;
  pickupRequestId?: string;
  pickupScheduledAt?: string;
  message?: string;
  error?: string;
}

/**
 * Schedules a Delhivery courier pickup for a booked shipment (Feature 1.11).
 */
export async function scheduleDelhiveryPickup(
  orderId: string,
  params?: PickupScheduleParams
): Promise<PickupScheduleResult> {
  const adminDb = createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, order_status, shipping_awb, shipping_pickup_request_id, shipping_pickup_scheduled_at, address_snapshot")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, error: `Order ${orderId} not found.` };
  }

  if (!order.shipping_awb) {
    return { success: false, error: "Cannot schedule pickup: Order has no AWB consignment booked." };
  }

  if (order.shipping_pickup_request_id) {
    return {
      success: true,
      pickupRequestId: order.shipping_pickup_request_id,
      pickupScheduledAt: order.shipping_pickup_scheduled_at || new Date().toISOString(),
      message: "Pickup has already been scheduled for this shipment.",
    };
  }

  const config = getDelhiveryConfig();
  const pickupDate = params?.pickupDate || new Date().toISOString().split("T")[0];
  const pickupTime = params?.pickupTime || "14:00:00";
  const nowIso = new Date().toISOString();

  let pickupRequestId: string;

  if (!config.isConfigured) {
    pickupRequestId = `PKP-${order.shipping_awb.replace(/\D/g, "").slice(0, 8) || "MOCK"}-${Date.now().toString(36).toUpperCase()}`;
  } else {
    try {
      const res = await fetch(`${config.apiUrl}/fm/request/new/`, {
        method: "POST",
        headers: {
          Authorization: `Token ${config.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          pickup_location: params?.pickupLocation || process.env.DELHIVERY_PICKUP_LOCATION || "Primary Warehouse",
          expected_package_count: params?.expectedPackageCount || 1,
          pickup_date: pickupDate,
          pickup_time: pickupTime,
        }),
      });

      if (!res.ok) {
        throw new Error(`Delhivery pickup request failed: HTTP ${res.status}`);
      }

      const resData = await res.json();
      pickupRequestId = resData?.pr_id || resData?.pickup_id || resData?.request_id;
      if (!pickupRequestId) {
        throw new Error(`No pickup ID returned: ${JSON.stringify(resData)}`);
      }
    } catch (err: any) {
      console.error("Delhivery pickup API error:", err?.message || err);
      return { success: false, error: err?.message || "Failed to communicate with Delhivery pickup API." };
    }
  }

  // Update order record with pickup reference
  await adminDb
    .from("orders")
    .update({
      shipping_pickup_request_id: pickupRequestId,
      shipping_pickup_scheduled: true,
      shipping_pickup_scheduled_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", order.id);

  return {
    success: true,
    pickupRequestId,
    pickupScheduledAt: nowIso,
    message: "Delhivery pickup request confirmed.",
  };
}

/**
 * Retrieves or generates shipping label / packing slip for a booked AWB (Feature 1.13).
 */
export async function getShippingLabel(
  awb: string
): Promise<{ success: boolean; labelUrl?: string; htmlContent?: string; error?: string }> {
  if (!awb || !awb.trim()) {
    return { success: false, error: "AWB tracking number is required." };
  }

  const cleanAwb = awb.trim();
  const config = getDelhiveryConfig();

  if (!config.isConfigured) {
    // Generate authoritative printable packing slip in mock/development mode
    return {
      success: true,
      labelUrl: `https://track.delhivery.com/p/${cleanAwb}?label=pdf`,
      htmlContent: `
        <div style="font-family: sans-serif; padding: 24px; border: 2px solid #000; max-width: 480px; margin: auto;">
          <div style="border-bottom: 2px solid #000; padding-bottom: 12px; margin-bottom: 12px;">
            <h2 style="margin: 0; font-size: 18px; text-transform: uppercase;">MD Shakib Islamic Books</h2>
            <p style="margin: 4px 0 0; font-size: 11px;">Authentic Classical Islamic Literature</p>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 16px;">
            <div>
              <p style="margin: 0; font-size: 10px; color: #555;">COURIER PARTNER</p>
              <h3 style="margin: 2px 0 0; font-size: 16px;">DELHIVERY</h3>
            </div>
            <div style="text-align: right;">
              <p style="margin: 0; font-size: 10px; color: #555;">WAYBILL / AWB</p>
              <h3 style="margin: 2px 0 0; font-size: 16px; font-family: monospace;">${cleanAwb}</h3>
            </div>
          </div>
          <div style="border-top: 1px dashed #999; padding-top: 12px; margin-top: 12px; font-size: 11px;">
            <p style="margin: 0;">Verified Dispatch Package</p>
          </div>
        </div>
      `,
    };
  }

  try {
    const res = await fetch(`${config.apiUrl}/api/p/packing_slip?wbns=${cleanAwb}&pdf=true`, {
      headers: {
        Authorization: `Token ${config.token}`,
        Accept: "application/json",
      },
    });

    if (!res.ok) {
      throw new Error(`Delhivery label request failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const pkg = data?.packages_found?.[0] || data?.packages?.[0];
    const labelUrl = pkg?.pdf_download_link || pkg?.label_url;

    return {
      success: true,
      labelUrl: labelUrl || `https://track.delhivery.com/p/${cleanAwb}`,
    };
  } catch (err: any) {
    console.error("Delhivery label retrieval error:", err?.message || err);
    return { success: false, error: err?.message || "Failed to retrieve shipping label." };
  }
}

/**
 * Reconciles actual COD remittance from courier settlement information (Feature 1.15).
 */
export async function reconcileDelhiveryCODRemittance(params: {
  orderId: string;
  settlementRef: string;
  remittedAmount: number;
  adminUserId: string;
  notes?: string;
}): Promise<{ success: boolean; error?: string; status?: string }> {
  const { orderId, settlementRef, remittedAmount, adminUserId, notes } = params;
  const adminDb = createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, total_amount, payment_method, payment_status, order_status, cod_settlement_status")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, error: `Order ${orderId} not found.` };
  }

  if (order.payment_method !== "COD") {
    return { success: false, error: "Only COD orders can be reconciled through COD remittance." };
  }

  if (order.order_status !== "Delivered") {
    return { success: false, error: `Cannot reconcile COD before verified delivery (current status: ${order.order_status}).` };
  }

  const expectedAmount = Number(order.total_amount);
  const nowIso = new Date().toISOString();

  // Flag mismatch for admin review if remittance doesn't match total order amount
  if (Math.abs(remittedAmount - expectedAmount) > 0.01) {
    await adminDb
      .from("orders")
      .update({
        cod_settlement_status: "disputed",
        cod_settlement_ref: settlementRef,
        cod_settled_amount: remittedAmount,
        updated_at: nowIso,
      })
      .eq("id", order.id);

    await adminDb.from("audit_logs").insert({
      action: "COD_SETTLEMENT_DISPUTE",
      model_name: "orders",
      model_id: order.id,
      user_id: adminUserId,
      new_values: {
        expected: expectedAmount,
        received: remittedAmount,
        dispute: "Amount mismatch",
        settlement_ref: settlementRef,
      },
    });

    return {
      success: false,
      error: `Amount mismatch: expected ₹${expectedAmount}, received ₹${remittedAmount}. Order flagged as disputed.`,
      status: "disputed",
    };
  }

  // Exact match: Reconcile and mark Paid
  await adminDb
    .from("orders")
    .update({
      cod_settlement_status: "reconciled",
      cod_settlement_ref: settlementRef,
      cod_settled_amount: remittedAmount,
      cod_settled_at: nowIso,
      payment_status: "Paid",
      is_paid: true,
      paid_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", order.id);

  await adminDb.from("audit_logs").insert({
    action: "COD_SETTLEMENT_RECONCILED",
    model_name: "orders",
    model_id: order.id,
    user_id: adminUserId,
    new_values: {
      settlement_ref: settlementRef,
      amount: remittedAmount,
      reconciled_at: nowIso,
      notes,
    },
  });

  return { success: true, status: "reconciled" };
}

