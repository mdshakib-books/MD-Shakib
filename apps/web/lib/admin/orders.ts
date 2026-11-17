"use server";

import { revalidatePath } from "next/cache";
import { invalidateCatalogCache } from "@/lib/cache/catalog";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStaffPermission, verifyStaffActionPermission } from "./auth";
import { hasPermission } from "./permissions";
import { sendShipmentNotification } from "@/lib/integrations/resend/service";
import {
  executeAdminRefundRetry,
  executeDispatchedOrderCancellation,
  executeOrderCancellation,
} from "@/lib/commerce/orders-core";
import {
  createShipmentForOrder,
  reconcileUncertainDelhiveryBooking,
  scheduleDelhiveryPickup,
  getShippingLabel,
  reconcileDelhiveryCODRemittance,
} from "@/lib/integrations/delhivery/service";
import {
  DISPATCHED_ORDER_STATUSES,
  FULFILLMENT_SHIPPING_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  isDelhiveryShipment,
  isSyntheticPlaceholderAwb,
  resolveOrderTrackingUrl,
} from "./constants";
import type { Database } from "@/types/database.types";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderStatusHistoryRow = Database["public"]["Tables"]["order_status_history"]["Row"];
export type RefundRecordRow = Database["public"]["Tables"]["refund_records"]["Row"];
export type ShipmentRow = Database["public"]["Tables"]["shipments"]["Row"];
export type ShipmentEventRow = Database["public"]["Tables"]["shipment_events"]["Row"];

export interface AdminEmailLogSummary {
  id: string;
  event_type: string;
  recipient: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  failure_type: string | null;
  suppressed_reason: string | null;
  last_error: string | null;
  sent_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export interface EnrichedAdminOrder extends OrderRow {
  items: OrderItemRow[];
  history: OrderStatusHistoryRow[];
  shipments?: ShipmentRow[];
  shipmentEvents?: ShipmentEventRow[];
  refunds?: RefundRecordRow[];
  emailLogs?: AdminEmailLogSummary[];
  customer?: {
    name: string;
    email: string;
    phone?: string;
  };
}

/**
 * Lists orders for admin management with filtering, searching, and pagination.
 */
export async function getAdminOrders(params?: {
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  search?: string;
  page?: number;
  limit?: number;
}): Promise<{
  orders: Array<
    OrderRow & {
      customerName: string;
      customerEmail: string;
      itemCount: number;
    }
  >;
  total: number;
  page: number;
  totalPages: number;
}> {
  await requireStaffPermission("orders.view");
  const supabase = await createClient();

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 20));
  const offset = (page - 1) * limit;

  let query = supabase
    .from("orders")
    .select("*, order_items(id)", { count: "exact" });

  if (params?.status && params.status !== "ALL") {
    query = query.eq("order_status", params.status);
  }

  if (params?.paymentStatus && params.paymentStatus !== "ALL") {
    query = query.eq("payment_status", params.paymentStatus);
  }

  if (params?.paymentMethod && params.paymentMethod !== "ALL") {
    query = query.eq("payment_method", params.paymentMethod.toUpperCase());
  }

  // Ordering: newest first
  query = query.order("created_at", { ascending: false });

  // Pagination range
  query = query.range(offset, offset + limit - 1);

  const { data: rawOrders, error, count } = await query;

  if (error) {
    console.error("Error fetching admin orders:", error.message);
    throw new Error(`Failed to load orders: ${error.message}`);
  }

  const allOrders = rawOrders || [];
  const userIds = [...new Set(allOrders.map((o) => o.user_id).filter(Boolean))];

  let profileMap: Record<string, { name: string; email: string }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds);

    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, { name: p.name || "Customer", email: p.email || "" }])
      );
    }
  }

  let formatted = allOrders.map((order: any) => {
    let customerName = profileMap[order.user_id]?.name;
    const customerEmail = profileMap[order.user_id]?.email || "";

    if (!customerName && order.address_snapshot && typeof order.address_snapshot === "object") {
      const snap = order.address_snapshot as Record<string, any>;
      if (snap.full_name) customerName = snap.full_name;
    }

    return {
      ...order,
      customerName: customerName || "Customer",
      customerEmail,
      itemCount: Array.isArray(order.order_items) ? order.order_items.length : 0,
    };
  });

  // Client-side text search across ID, order_number, customer name, and email if search term provided
  if (params?.search && params.search.trim()) {
    const term = params.search.trim().toLowerCase();
    formatted = formatted.filter(
      (o) =>
        o.id.toLowerCase().includes(term) ||
        (o.order_number && o.order_number.toLowerCase().includes(term)) ||
        o.customerName.toLowerCase().includes(term) ||
        o.customerEmail.toLowerCase().includes(term)
    );
  }

  const total = count || formatted.length;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    orders: formatted,
    total,
    page,
    totalPages,
  };
}

/**
 * Retrieves a single order in full detail for admin inspection.
 * Supports lookup by internal UUID or human-readable order number (Feature 1.3).
 */
export async function getAdminOrderById(orderIdentifier: string): Promise<EnrichedAdminOrder | null> {
  await requireStaffPermission("orders.view");

  if (!orderIdentifier) return null;
  const clean = orderIdentifier.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const supabase = await createClient();

  let query = supabase.from("orders").select("*");
  if (uuidRegex.test(clean)) {
    query = query.eq("id", clean);
  } else {
    query = query.eq("order_number", clean);
  }

  const { data: order, error: orderError } = await query.maybeSingle();

  if (orderError || !order) {
    return null;
  }

  const orderId = order.id;

  // Execute independent detail queries concurrently instead of 7 serial round-trips
  const [
    { data: items },
    { data: history },
    { data: profile },
    { data: refunds },
    { data: shipments },
    { data: shipmentEvents },
    { data: emailLogs },
  ] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", orderId),
    supabase
      .from("order_status_history")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("profiles")
      .select("name, email")
      .eq("id", order.user_id)
      .maybeSingle(),
    supabase
      .from("refund_records")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("shipments")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("shipment_events")
      .select("*")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
    supabase
      .from("email_logs")
      .select(
        "id, event_type, recipient, status, attempt_count, max_attempts, failure_type, suppressed_reason, last_error, sent_at, next_retry_at, created_at"
      )
      .eq("order_id", orderId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    ...order,
    items: items || [],
    history: history || [],
    shipments: shipments || [],
    shipmentEvents: shipmentEvents || [],
    refunds: refunds || [],
    emailLogs: (emailLogs || []) as AdminEmailLogSummary[],
    customer: profile ? { name: profile.name || "Customer", email: profile.email || "" } : undefined,
  };
}

function safeRevalidateOrderPaths(orderId: string): void {
  const paths = ["/admin/orders", `/admin/orders/${orderId}`, `/orders/${orderId}`, "/orders"];
  try {
    for (const p of paths) revalidatePath(p);
  } catch {
    // Safe fallback outside Next.js request lifecycle
  }
  invalidateCatalogCache();
}

/**
 * Advances an order to the next status according to business-rule lifecycle transitions.
 * Requires `orders.ship` for fulfillment shipping states and `orders.manage` for operational states.
 */
export async function updateAdminOrderStatus(payload: {
  orderId: string;
  nextStatus: string;
  notes?: string;
  courier?: string;
  awb?: string;
  trackingUrl?: string;
}): Promise<{ success: boolean; error?: string; order?: OrderRow }> {
  const { orderId, nextStatus, notes, courier, awb, trackingUrl } = payload;

  if (!nextStatus || nextStatus === "Cancelled") {
    return {
      success: false,
      error: "Direct cancellation is not permitted via status updates. Use the order cancellation workflow.",
    };
  }

  const requiredPermission = FULFILLMENT_SHIPPING_STATUSES.has(nextStatus)
    ? "orders.ship"
    : "orders.manage";

  const perm = await verifyStaffActionPermission(requiredPermission);
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }
  const { user } = perm;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!orderId || !uuidRegex.test(orderId)) {
    return { success: false, error: "Invalid Order ID." };
  }

  if (isSyntheticPlaceholderAwb(awb)) {
    return {
      success: false,
      error: "Synthetic DLH-* placeholder AWBs are not allowed.",
    };
  }

  const cleanTrackingUrl = (trackingUrl || "").trim();
  if (cleanTrackingUrl && !/^https?:\/\//i.test(cleanTrackingUrl)) {
    return { success: false, error: "Tracking URL must be a valid http:// or https:// link." };
  }

  const adminDb = createAdminClient();

  // 1. Fetch current order state
  const { data: order, error: fetchErr } = await adminDb
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr || !order) {
    return { success: false, error: "Order not found." };
  }

  const currentStatus = order.order_status;
  const allowedTransitions = ORDER_STATUS_TRANSITIONS[currentStatus] || [];

  if (!allowedTransitions.includes(nextStatus)) {
    return {
      success: false,
      error: `Cannot transition order status from "${currentStatus}" to "${nextStatus}".`,
    };
  }

  // 2. Business rule invariant: Online prepaid orders must be Paid before Confirmation or Dispatch
  const normalizedMethod = String(order.payment_method || "").toUpperCase();
  if (
    (nextStatus === "Confirmed" || nextStatus === "Shipped") &&
    normalizedMethod === "ONLINE" &&
    order.payment_status !== "Paid"
  ) {
    return {
      success: false,
      error: "Online prepaid orders must be Paid before confirming or dispatching.",
    };
  }

  // 3. Business rule invariant: Shipped requires courier (never silently defaults to Delhivery)
  // AWB is mandatory for Delhivery shipments and optional for manual/local carriers.
  const finalCourier = (courier || order.shipping_courier || "").trim() || null;
  const finalAwb = (awb || order.shipping_awb || "").trim() || null;
  const finalTrackingUrl =
    cleanTrackingUrl ||
    resolveOrderTrackingUrl({
      courier: finalCourier,
      awb: finalAwb,
      trackingUrl: order.shipping_tracking_url,
      bookingMode: order.shipping_booking_mode,
    });

  if (nextStatus === "Shipped") {
    if (!finalCourier) {
      return {
        success: false,
        error: "Shipping courier / carrier name is required to transition order to Shipped.",
      };
    }

    const delhiveryMode = isDelhiveryShipment({
      courier: finalCourier,
      bookingMode: order.shipping_booking_mode,
    });

    if (delhiveryMode && !finalAwb) {
      return {
        success: false,
        error: "Delhivery shipments require a valid AWB tracking number.",
      };
    }
  }

  // 4. Execute atomic PostgreSQL transition RPC
  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("update_order_status_atomic", {
    p_order_id: orderId,
    p_actor_id: user.id,
    p_next_status: nextStatus,
    p_notes: notes?.trim() || null,
    p_courier: finalCourier,
    p_awb: finalAwb,
    p_tracking_url: finalTrackingUrl,
  });

  if (rpcErr || !(rpcRes as any)?.success) {
    return {
      success: false,
      error: (rpcRes as any)?.error || rpcErr?.message || "Failed to update order status.",
    };
  }

  const { data: updatedOrder } = await adminDb
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .single();

  // Asynchronously dispatch shipment notification email for customer updates
  if (nextStatus === "Shipped") {
    sendShipmentNotification(orderId, "shipped").catch((err) =>
      console.error("Async shipment notification error:", err)
    );
  } else if (nextStatus === "Out for Delivery") {
    sendShipmentNotification(orderId, "out_for_delivery").catch((err) =>
      console.error("Async out_for_delivery notification error:", err)
    );
  } else if (nextStatus === "Delivered") {
    sendShipmentNotification(orderId, "delivered").catch((err) =>
      console.error("Async delivered notification error:", err)
    );
  }

  safeRevalidateOrderPaths(orderId);

  return { success: true, order: updatedOrder || undefined };
}

/**
 * Mode 2: Records a manual shipment entry for third-party or local carriers without invoking Delhivery API
 * and without ever fabricating synthetic DLH-* AWBs or Delhivery tracking URLs.
 */
export async function createManualOrderShipment(payload: {
  orderId: string;
  carrierName: string;
  awb?: string;
  trackingUrl?: string;
  markAsShipped?: boolean;
  notes?: string;
}): Promise<{
  success: boolean;
  shipmentId?: string;
  carrierName?: string;
  awb?: string | null;
  trackingUrl?: string | null;
  orderStatus?: string;
  error?: string;
}> {
  const perm = await verifyStaffActionPermission("orders.ship");
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }

  const cleanCarrier = String(payload.carrierName || "").trim();
  const cleanAwb = String(payload.awb || "").trim() || null;
  const cleanTrackingUrl = String(payload.trackingUrl || "").trim() || null;

  if (!cleanCarrier) {
    return { success: false, error: "Courier / carrier name is required." };
  }

  if (isSyntheticPlaceholderAwb(cleanAwb)) {
    return {
      success: false,
      error: "Synthetic DLH-* placeholder AWBs are prohibited. Leave AWB empty if unavailable.",
    };
  }

  if (cleanTrackingUrl && !/^https?:\/\//i.test(cleanTrackingUrl)) {
    return {
      success: false,
      error: "Tracking URL must be a valid http:// or https:// URL.",
    };
  }

  const adminDb = createAdminClient();
  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("create_manual_shipment_atomic", {
    p_order_id: payload.orderId,
    p_actor_id: perm.user.id,
    p_carrier_name: cleanCarrier,
    p_awb: cleanAwb,
    p_tracking_url: cleanTrackingUrl,
    p_mark_as_shipped: payload.markAsShipped ?? true,
    p_notes: payload.notes?.trim() || null,
  });

  if (rpcErr || !(rpcRes as any)?.success) {
    return {
      success: false,
      error: (rpcRes as any)?.error || rpcErr?.message || "Failed to record manual shipment.",
    };
  }

  const result = rpcRes as Record<string, any>;

  if (result.order_status === "Shipped") {
    sendShipmentNotification(payload.orderId, "shipped").catch((err) =>
      console.error("Async manual shipment notification error:", err)
    );
  }

  safeRevalidateOrderPaths(payload.orderId);

  return {
    success: true,
    shipmentId: result.shipment_id,
    carrierName: result.carrier_name,
    awb: result.awb ?? null,
    trackingUrl: result.tracking_url ?? null,
    orderStatus: result.order_status,
  };
}

/**
 * Administratively cancels an order.
 * - Pre-dispatch orders require `orders.cancel`.
 * - Shipped / Out for Delivery orders require `orders.cancel_dispatched` AND confirmed
 *   Delhivery cancellation (or explicit manual courier halt confirmation).
 */
export async function cancelAdminOrder(payload: {
  orderId: string;
  reason: string;
  confirmManualCourierCancellation?: boolean;
  manualConfirmationRef?: string;
}): Promise<{
  success: boolean;
  orderCancelled?: boolean;
  courierCancelled?: boolean;
  courierCancelFailed?: boolean;
  error?: string;
  refundStatus?: string;
  refundId?: string;
}> {
  const perm = await verifyStaffActionPermission(["orders.cancel", "orders.cancel_dispatched"]);
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }

  const adminDb = createAdminClient();
  const { data: existingOrder, error: fetchErr } = await adminDb
    .from("orders")
    .select("id, order_status")
    .eq("id", payload.orderId)
    .maybeSingle();

  if (fetchErr || !existingOrder) {
    return { success: false, error: "Order not found." };
  }

  if (DISPATCHED_ORDER_STATUSES.has(existingOrder.order_status)) {
    if (!hasPermission(perm.profile.role, "orders.cancel_dispatched")) {
      return {
        success: false,
        error: `Forbidden: Cancelling an order in "${existingOrder.order_status}" status requires Super Admin or Admin approval.`,
      };
    }

    return executeDispatchedOrderCancellation(
      {
        orderId: payload.orderId,
        adminUserId: perm.user.id,
        reason: payload.reason,
        confirmManualCourierCancellation: payload.confirmManualCourierCancellation,
        manualConfirmationRef: payload.manualConfirmationRef,
      },
      {
        adminDb,
        revalidateFn: () => safeRevalidateOrderPaths(payload.orderId),
      }
    );
  }

  if (!hasPermission(perm.profile.role, "orders.cancel")) {
    return {
      success: false,
      error: `Forbidden: Missing "orders.cancel" permission for role "${perm.profile.role}".`,
    };
  }

  return executeOrderCancellation(
    {
      orderId: payload.orderId,
      actorUserId: perm.user.id,
      reason: payload.reason,
      isAdmin: true,
    },
    {
      adminDb,
      revalidateFn: () => safeRevalidateOrderPaths(payload.orderId),
    }
  );
}

/**
 * Retries or reconciles a failed/pending Razorpay refund on a cancelled prepaid ONLINE order.
 */
export async function retryAdminOrderRefund(payload: {
  orderId: string;
  amount?: number;
  reason?: string;
}): Promise<{
  success: boolean;
  refundStatus?: string;
  refundId?: string;
  amount?: number;
  error?: string;
}> {
  const perm = await verifyStaffActionPermission("orders.refund");
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }
  const adminDb = createAdminClient();

  return executeAdminRefundRetry(
    {
      orderId: payload.orderId,
      adminUserId: perm.user.id,
      amount: payload.amount,
      reason: payload.reason,
    },
    {
      adminDb,
      revalidateFn: () => safeRevalidateOrderPaths(payload.orderId),
    }
  );
}

/**
 * Approves a customer's replacement request.
 * (Deprecated: Replacement workflow is unsupported; all return claims must use Return for Refund).
 */
export async function approveAdminReplacement(_orderId: string): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error: "Replacement fulfillment workflow is unsupported. Please process returns via the Return for Refund workflow.",
  };
}

/**
 * Rejects a customer's replacement request.
 * (Deprecated: Replacement workflow is unsupported; all return claims must use Return for Refund).
 */
export async function rejectAdminReplacement(
  _orderId: string,
  _reason: string
): Promise<{ success: boolean; error?: string }> {
  return {
    success: false,
    error: "Replacement workflow is unsupported. Please manage return claims via the Return for Refund workflow.",
  };
}

/**
 * Mode 1: Books a real or deterministic mock Delhivery shipment for an eligible order (Feature 1.10).
 */
export async function bookAdminOrderShipment(
  orderId: string,
  options?: {
    shippingMode?: "Surface" | "Express";
    weightGrams?: number;
    pickupLocation?: string;
  }
): Promise<{
  success: boolean;
  awb?: string;
  trackingUrl?: string;
  courier?: string;
  alreadyBooked?: boolean;
  error?: string;
}> {
  const perm = await verifyStaffActionPermission("orders.ship");
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }
  const { user, profile } = perm;

  try {
    const result = await createShipmentForOrder(orderId, {
      actorUserId: user.id,
      actorRole: profile.role,
      shippingMode: options?.shippingMode,
      weightGrams: options?.weightGrams,
      pickupLocation: options?.pickupLocation,
    });

    const adminDb = createAdminClient();
    await adminDb.from("audit_logs").insert({
      action: "BOOK_DELHIVERY_SHIPMENT",
      model_name: "orders",
      model_id: orderId,
      user_id: user.id,
      new_values: {
        shipping_awb: result.awb,
        shipping_courier: result.courier,
        shipping_booking_mode: "delhivery",
        order_status: "Shipped",
      },
      changes: { awb: result.awb, trackingUrl: result.trackingUrl },
    });

    safeRevalidateOrderPaths(orderId);
    return { success: true, ...result };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to book shipment." };
  }
}

/**
 * Safely reconciles a timed-out `booking_uncertain` Delhivery order before permitting retry.
 */
export async function verifyUncertainAdminShipment(orderId: string): Promise<{
  success: boolean;
  recovered?: boolean;
  clearedToRetry?: boolean;
  awb?: string;
  bookingStatus?: string;
  error?: string;
}> {
  const perm = await verifyStaffActionPermission("orders.ship");
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }
  const { user, profile } = perm;

  const result = await reconcileUncertainDelhiveryBooking(orderId, {
    actorUserId: user.id,
    actorRole: profile.role,
  });

  if (result.success) {
    safeRevalidateOrderPaths(orderId);
  }

  return result;
}

/**
 * Schedules a pickup request with Delhivery for dispatched shipments (Feature 1.11).
 */
export async function scheduleAdminPickup(
  orderId: string,
  params: { pickupDate: string; pickupTime: string; expectedPackageCount?: number }
): Promise<{
  success: boolean;
  pickupRequestId?: string;
  scheduledAt?: string;
  error?: string;
}> {
  const perm = await verifyStaffActionPermission("orders.ship");
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }
  const { user } = perm;

  try {
    const result = await scheduleDelhiveryPickup(orderId, params);

    if (!result.success) {
      return { success: false, error: result.error || "Failed to schedule pickup." };
    }

    const adminDb = createAdminClient();
    await adminDb.from("audit_logs").insert({
      action: "SCHEDULE_DELHIVERY_PICKUP",
      model_name: "orders",
      model_id: orderId,
      user_id: user.id,
      new_values: {
        shipping_pickup_request_id: result.pickupRequestId,
        shipping_pickup_scheduled_at: result.pickupScheduledAt,
      },
    });

    safeRevalidateOrderPaths(orderId);
    return {
      success: true,
      pickupRequestId: result.pickupRequestId,
      scheduledAt: result.pickupScheduledAt,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to schedule pickup." };
  }
}

/**
 * Downloads or retrieves the shipping label for an AWB (Feature 1.12).
 */
export async function getAdminShippingLabel(awb: string): Promise<{
  success: boolean;
  labelUrl?: string;
  error?: string;
}> {
  const perm = await verifyStaffActionPermission("orders.ship");
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }

  try {
    const result = await getShippingLabel(awb);
    if (!result.success) {
      return { success: false, error: result.error || "Failed to generate shipping label." };
    }
    return { success: true, labelUrl: result.labelUrl };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to generate shipping label." };
  }
}

/**
 * Reconciles Cash on Delivery (COD) remittance from courier partner (Feature 1.15).
 * Restricted strictly to Super Admin & Admin via `orders.settle_cod`.
 */
export async function reconcileAdminCODSettlement(
  orderId: string,
  settlementRef: string,
  amount: number,
  notes?: string
): Promise<{
  success: boolean;
  settlementRef?: string;
  settledAmount?: number;
  settledAt?: string;
  error?: string;
}> {
  const perm = await verifyStaffActionPermission("orders.settle_cod");
  if (!perm.authorized) {
    return { success: false, error: perm.error };
  }
  const { user } = perm;

  try {
    const result = await reconcileDelhiveryCODRemittance({
      orderId,
      settlementRef,
      remittedAmount: amount,
      adminUserId: user.id,
      notes,
    });

    if (!result.success) {
      return { success: false, error: result.error || "Failed to reconcile COD remittance." };
    }

    const nowIso = new Date().toISOString();
    safeRevalidateOrderPaths(orderId);
    return {
      success: true,
      settlementRef,
      settledAmount: amount,
      settledAt: nowIso,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to reconcile COD remittance." };
  }
}
