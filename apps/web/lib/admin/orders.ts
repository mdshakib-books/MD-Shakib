"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { sendOrderEmails, sendShipmentNotification } from "@/lib/integrations/resend/service";
import { initiateRazorpayRefund } from "@/lib/integrations/razorpay/service";
import {
  createShipmentForOrder,
  scheduleDelhiveryPickup,
  getShippingLabel,
  reconcileDelhiveryCODRemittance,
} from "@/lib/integrations/delhivery/service";
import { ORDER_STATUS_TRANSITIONS } from "./constants";
import type { Database } from "@/types/database.types";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type OrderStatusHistoryRow = Database["public"]["Tables"]["order_status_history"]["Row"];

export interface EnrichedAdminOrder extends OrderRow {
  items: OrderItemRow[];
  history: OrderStatusHistoryRow[];
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
  await requireAdmin();
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
  await requireAdmin();

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

  // Fetch line items
  const { data: items } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

  // Fetch status history
  const { data: history } = await supabase
    .from("order_status_history")
    .select("*")
    .eq("order_id", orderId)
    .order("created_at", { ascending: false });

  // Fetch customer profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("name, email")
    .eq("id", order.user_id)
    .maybeSingle();

  return {
    ...order,
    items: items || [],
    history: history || [],
    customer: profile ? { name: profile.name || "Customer", email: profile.email || "" } : undefined,
  };
}

/**
 * Advances an order to the next status according to business-rule lifecycle transitions.
 */
export async function updateAdminOrderStatus(payload: {
  orderId: string;
  nextStatus: string;
  notes?: string;
  courier?: string;
  awb?: string;
}): Promise<{ success: boolean; error?: string; order?: OrderRow }> {
  const { user } = await requireAdmin();

  const { orderId, nextStatus, notes, courier, awb } = payload;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!orderId || !uuidRegex.test(orderId)) {
    return { success: false, error: "Invalid Order ID." };
  }

  const supabase = await createClient();

  // 1. Fetch current order state
  const { data: order, error: fetchErr } = await supabase
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

  // 2. Business rule invariant: Online prepaid orders must be Paid before Confirmation
  const normalizedMethod = String(order.payment_method || "").toUpperCase();
  if (
    nextStatus === "Confirmed" &&
    normalizedMethod === "ONLINE" &&
    order.payment_status !== "Paid"
  ) {
    return {
      success: false,
      error: "Online prepaid orders can be confirmed only after successful payment.",
    };
  }

  // 3. Business rule invariant: Shipped requires courier and AWB
  const finalCourier = courier || order.shipping_courier || "Delhivery";
  const finalAwb = awb || order.shipping_awb;

  if (nextStatus === "Shipped" && (!finalCourier || !finalAwb)) {
    return {
      success: false,
      error: "Courier and AWB tracking number are required to transition order to Shipped.",
    };
  }

  // 4. Assemble updates
  const updates: Partial<OrderRow> = {
    order_status: nextStatus,
    updated_at: new Date().toISOString(),
  };

  if (nextStatus === "Shipped") {
    updates.shipping_courier = finalCourier;
    updates.shipping_awb = finalAwb;
    updates.shipping_shipped_at = new Date().toISOString();
  }

  if (nextStatus === "Delivered") {
    const nowIso = new Date().toISOString();
    updates.delivered_at = nowIso;
    updates.shipping_delivered_at = nowIso;

    // Feature 1.15: Delivery decoupling from COD cash settlement.
    // When delivered, COD settlement status transitions to pending awaiting bank remittance reconciliation.
    if (normalizedMethod === "COD") {
      updates.cod_settlement_status = "pending";
    }
  }

  // 5. Update order (trg_order_status_history trigger will record transition in order_status_history)
  const { data: updatedOrder, error: updateErr } = await supabase
    .from("orders")
    .update(updates)
    .eq("id", orderId)
    .select("*")
    .single();

  if (updateErr || !updatedOrder) {
    return { success: false, error: updateErr?.message || "Failed to update order status." };
  }

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

  // 6. Record audit log
  await supabase.from("audit_logs").insert({
    action: "UPDATE_ORDER_STATUS",
    model_name: "orders",
    model_id: orderId,
    user_id: user.id,
    old_values: { order_status: currentStatus, payment_status: order.payment_status },
    new_values: { order_status: nextStatus, payment_status: updatedOrder.payment_status, notes },
    changes: { transition: `${currentStatus} -> ${nextStatus}`, notes: notes || null },
  });

  revalidatePath(`/admin/orders`);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders`);

  return { success: true, order: updatedOrder };
}

/**
 * Administratively cancels an order, atomically restoring stock and initiating gateway refund if paid.
 */
export async function cancelAdminOrder(payload: {
  orderId: string;
  reason: string;
}): Promise<{
  success: boolean;
  error?: string;
  refundStatus?: string;
  refundId?: string;
}> {
  const { user } = await requireAdmin();
  const { orderId, reason } = payload;

  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    return { success: false, error: "A cancellation reason is required." };
  }

  const supabase = await createClient();

  // 1. Fetch current order state before cancellation
  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("id, payment_status, payment_method, order_status, total_amount, razorpay_payment_id")
    .eq("id", orderId)
    .single();

  if (fetchErr || !order) {
    return { success: false, error: "Order not found." };
  }

  // 2. Call atomic cancel RPC with p_is_admin = true (restores stock, sets order_status = 'Cancelled')
  const { data: success, error: rpcErr } = await supabase.rpc("cancel_order_atomic", {
    p_order_id: orderId,
    p_user_id: user.id,
    p_cancel_reason: trimmedReason,
    p_is_admin: true,
  });

  if (rpcErr || !success) {
    return { success: false, error: rpcErr?.message || "Failed to cancel order." };
  }

  // 3. Separate refund settlement from cancellation: initiate Razorpay gateway refund for prepaid orders
  let refundStatusResult: string | undefined = undefined;
  let refundIdResult: string | undefined = undefined;
  let refundErrorMsg: string | undefined = undefined;

  if (order.payment_method === "ONLINE" && order.payment_status === "Paid") {
    try {
      const refundResult = await initiateRazorpayRefund({
        orderId,
        reason: trimmedReason,
      });

      refundStatusResult = refundResult.status;
      refundIdResult = refundResult.refundId;
      if (!refundResult.success) {
        refundErrorMsg = refundResult.error;
        console.error("Razorpay refund initiation failed:", refundResult.error);
      }
    } catch (refundError: any) {
      refundErrorMsg = refundError?.message || String(refundError);
      console.error("Unexpected error in refund initiation:", refundErrorMsg);
    }
  }

  // 4. Record audit log
  await supabase.from("audit_logs").insert({
    action: "ADMIN_CANCEL_ORDER",
    model_name: "orders",
    model_id: orderId,
    user_id: user.id,
    old_values: { order_status: order.order_status, payment_status: order.payment_status },
    new_values: {
      order_status: "Cancelled",
      cancel_reason: trimmedReason,
      refund_status: refundStatusResult || null,
      refund_id: refundIdResult || null,
    },
    changes: {
      reason: trimmedReason,
      prepaid_refund_attempted: order.payment_method === "ONLINE" && order.payment_status === "Paid",
      refund_error: refundErrorMsg || null,
    },
  });

  revalidatePath(`/admin/orders`);
  revalidatePath(`/admin/orders/${orderId}`);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath(`/orders`);

  if (refundErrorMsg) {
    return {
      success: true,
      error: `Order was cancelled and inventory restored, but gateway refund failed: ${refundErrorMsg}. Please review in payments dashboard.`,
      refundStatus: "failed",
    };
  }

  return {
    success: true,
    refundStatus: refundStatusResult,
    refundId: refundIdResult,
  };
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
 * Books a real or deterministic mock Delhivery shipment for a confirmed order (Feature 1.10).
 */
export async function bookAdminOrderShipment(orderId: string): Promise<{
  success: boolean;
  awb?: string;
  trackingUrl?: string;
  courier?: string;
  error?: string;
}> {
  const { user } = await requireAdmin();
  try {
    const result = await createShipmentForOrder(orderId);

    // Record audit log
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      action: "BOOK_DELHIVERY_SHIPMENT",
      model_name: "orders",
      model_id: orderId,
      user_id: user.id,
      new_values: {
        shipping_awb: result.awb,
        shipping_courier: result.courier,
        order_status: "Shipped",
      },
      changes: { awb: result.awb, trackingUrl: result.trackingUrl },
    });

    // Asynchronously dispatch shipment notification email
    sendShipmentNotification(orderId, "shipped").catch((err) =>
      console.error("Async shipment email error:", err)
    );

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
    revalidatePath(`/orders/${orderId}`);
    return { success: true, ...result };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to book shipment." };
  }
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
  const { user } = await requireAdmin();
  try {
    const result = await scheduleDelhiveryPickup(orderId, params);

    if (!result.success) {
      return { success: false, error: result.error || "Failed to schedule pickup." };
    }

    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      action: "SCHEDULE_DELHIVERY_PICKUP",
      model_name: "orders",
      model_id: orderId,
      user_id: user.id,
      new_values: {
        shipping_pickup_request_id: result.pickupRequestId,
        shipping_pickup_scheduled_at: result.pickupScheduledAt,
      },
    });

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
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
  await requireAdmin();
  try {
    const result = await getShippingLabel(awb);
    return { success: true, labelUrl: result.labelUrl };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to generate shipping label." };
  }
}

/**
 * Reconciles Cash on Delivery (COD) remittance from courier partner (Feature 1.15).
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
  const { user } = await requireAdmin();
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
    const supabase = await createClient();
    await supabase.from("audit_logs").insert({
      action: "RECONCILE_COD_REMITTANCE",
      model_name: "orders",
      model_id: orderId,
      user_id: user.id,
      new_values: {
        cod_settlement_status: "reconciled",
        cod_settlement_ref: settlementRef,
        cod_settled_amount: amount,
        payment_status: "Paid",
      },
      changes: { settlementRef, amount, notes: notes || null },
    });

    revalidatePath("/admin/orders");
    revalidatePath(`/admin/orders/${orderId}`);
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
