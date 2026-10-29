"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { sendOrderEmails } from "@/lib/integrations/resend/service";
import { initiateRazorpayRefund } from "@/lib/integrations/razorpay/service";
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

  // Client-side text search across ID, customer name, and email if search term provided
  if (params?.search && params.search.trim()) {
    const term = params.search.trim().toLowerCase();
    formatted = formatted.filter(
      (o) =>
        o.id.toLowerCase().includes(term) ||
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
 */
export async function getAdminOrderById(orderId: string): Promise<EnrichedAdminOrder | null> {
  await requireAdmin();

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!orderId || !uuidRegex.test(orderId)) return null;

  const supabase = await createClient();

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (orderError || !order) {
    return null;
  }

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

    // COD settlement on delivery
    if (normalizedMethod === "COD" && order.payment_status !== "Paid") {
      updates.payment_status = "Paid";
      updates.is_paid = true;
      updates.paid_at = nowIso;
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
 */
export async function approveAdminReplacement(orderId: string): Promise<{ success: boolean; error?: string }> {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr || !order) return { success: false, error: "Order not found." };
  if (order.order_status !== "Replacement Requested") {
    return { success: false, error: "No replacement requested for this order." };
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      order_status: "Replacement Approved",
      replacement_status: "Approved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateErr) return { success: false, error: updateErr.message };

  await supabase.from("audit_logs").insert({
    action: "APPROVE_REPLACEMENT",
    model_name: "orders",
    model_id: orderId,
    user_id: user.id,
    new_values: { order_status: "Replacement Approved", replacement_status: "Approved" },
  });

  revalidatePath(`/admin/orders`);
  revalidatePath(`/admin/orders/${orderId}`);
  return { success: true };
}

/**
 * Rejects a customer's replacement request with a mandatory reason.
 */
export async function rejectAdminReplacement(
  orderId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const { user } = await requireAdmin();

  const trimmedReason = String(reason || "").trim();
  if (!trimmedReason) {
    return { success: false, error: "A rejection reason is required." };
  }

  const supabase = await createClient();

  const { data: order, error: fetchErr } = await supabase
    .from("orders")
    .select("order_status")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr || !order) return { success: false, error: "Order not found." };
  if (order.order_status !== "Replacement Requested") {
    return { success: false, error: "No replacement requested for this order." };
  }

  const { error: updateErr } = await supabase
    .from("orders")
    .update({
      order_status: "Replacement Rejected",
      replacement_status: "Rejected",
      replacement_rejection_reason: trimmedReason,
      replacement_rejected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", orderId);

  if (updateErr) return { success: false, error: updateErr.message };

  await supabase.from("audit_logs").insert({
    action: "REJECT_REPLACEMENT",
    model_name: "orders",
    model_id: orderId,
    user_id: user.id,
    new_values: {
      order_status: "Replacement Rejected",
      replacement_status: "Rejected",
      replacement_rejection_reason: trimmedReason,
    },
  });

  revalidatePath(`/admin/orders`);
  revalidatePath(`/admin/orders/${orderId}`);
  return { success: true };
}
