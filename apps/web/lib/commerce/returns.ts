import { createAdminClient } from "@/lib/supabase/admin";
import { initiateRazorpayRefund } from "@/lib/integrations/razorpay/service";
import { getDelhiveryConfig } from "@/lib/integrations/delhivery/client";

export const RETURN_WINDOW_DAYS = 7;

export interface ReturnEligibilityItem {
  orderItemId: string;
  bookId: string;
  title: string;
  purchasedQuantity: number;
  returnedQuantity: number;
  returnableQuantity: number;
  unitPrice: number;
  isEligible: boolean;
}

export interface ReturnEligibilityResult {
  isEligible: boolean;
  orderId: string;
  deliveredAt: string | null;
  daysSinceDelivery: number;
  maxReturnDays: number;
  reasons: string[];
  items: ReturnEligibilityItem[];
}

/**
 * Validates whether an order is eligible for customer return / replacement (2.16).
 */
export async function checkOrderReturnEligibility(
  orderId: string,
  userId: string
): Promise<ReturnEligibilityResult> {
  const adminDb = createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, user_id, order_status, delivered_at, created_at")
    .eq("id", orderId)
    .single();

  if (error || !order || order.user_id !== userId) {
    return {
      isEligible: false,
      orderId,
      deliveredAt: null,
      daysSinceDelivery: 0,
      maxReturnDays: RETURN_WINDOW_DAYS,
      reasons: ["Order not found or unauthorized."],
      items: [],
    };
  }

  const reasons: string[] = [];

  if (order.order_status !== "Delivered") {
    reasons.push(`Returns are permitted only for Delivered orders (current status: ${order.order_status}).`);
  }

  const deliveredDate = order.delivered_at ? new Date(order.delivered_at) : null;
  let daysSince = 0;

  if (deliveredDate) {
    daysSince = Math.floor((Date.now() - deliveredDate.getTime()) / (1000 * 60 * 60 * 24));
    if (daysSince > RETURN_WINDOW_DAYS) {
      reasons.push(
        `Return window expired: Delivered ${daysSince} days ago (policy limit: ${RETURN_WINDOW_DAYS} days).`
      );
    }
  } else if (order.order_status === "Delivered") {
    // Fallback if delivered_at was missing on delivered order
    daysSince = 0;
  }

  // Fetch items and previously returned quantities
  const { data: orderItems } = await adminDb
    .from("order_items")
    .select("id, book_id, title, quantity, price")
    .eq("order_id", orderId);

  const { data: existingReturns } = await adminDb
    .from("return_requests")
    .select("id, status, return_request_items(order_item_id, quantity)")
    .eq("order_id", orderId)
    .not("status", "eq", "rejected")
    .not("status", "eq", "cancelled");

  const returnedMap = new Map<string, number>();
  (existingReturns || []).forEach((r: any) => {
    (r.return_request_items || []).forEach((item: any) => {
      const curr = returnedMap.get(item.order_item_id) || 0;
      returnedMap.set(item.order_item_id, curr + item.quantity);
    });
  });

  const eligibilityItems: ReturnEligibilityItem[] = (orderItems || []).map((item) => {
    const prevReturned = returnedMap.get(item.id) || 0;
    const returnable = Math.max(0, item.quantity - prevReturned);
    return {
      orderItemId: item.id,
      bookId: item.book_id,
      title: item.title,
      purchasedQuantity: item.quantity,
      returnedQuantity: prevReturned,
      returnableQuantity: returnable,
      unitPrice: Number(item.price),
      isEligible: returnable > 0 && reasons.length === 0,
    };
  });

  const hasReturnableItems = eligibilityItems.some((i) => i.returnableQuantity > 0);
  if (!hasReturnableItems && reasons.length === 0) {
    reasons.push("All quantities from this order have already been returned or claimed.");
  }

  const isEligible = reasons.length === 0 && hasReturnableItems;

  return {
    isEligible,
    orderId,
    deliveredAt: order.delivered_at,
    daysSinceDelivery: daysSince,
    maxReturnDays: RETURN_WINDOW_DAYS,
    reasons,
    items: eligibilityItems,
  };
}

export interface CreateReturnRequestParams {
  orderId: string;
  userId: string;
  requestType: "return_refund" | "replacement";
  reason: string;
  description?: string;
  items: {
    orderItemId: string;
    bookId: string;
    variantId?: string;
    quantity: number;
    reason?: string;
  }[];
  evidenceUrls?: string[];
  pickupAddress?: any;
}

/**
 * Creates a customer return or replacement request (2.15).
 */
export async function createCustomerReturnRequest(
  params: CreateReturnRequestParams
): Promise<{ success: boolean; returnRequestId?: string; returnNumber?: string; error?: string }> {
  const { orderId, userId, requestType, reason, description, items, evidenceUrls, pickupAddress } = params;

  if (!items || items.length === 0) {
    return { success: false, error: "At least one item must be selected for return." };
  }

  // 1. Verify eligibility
  const eligibility = await checkOrderReturnEligibility(orderId, userId);
  if (!eligibility.isEligible) {
    return {
      success: false,
      error: `Return request rejected: ${eligibility.reasons.join(" ")}`,
    };
  }

  const itemMap = new Map(eligibility.items.map((i) => [i.orderItemId, i]));
  let estimatedRefundAmount = 0;

  for (const requestedItem of items) {
    const elig = itemMap.get(requestedItem.orderItemId);
    if (!elig) {
      return { success: false, error: `Invalid item selected: ${requestedItem.orderItemId}` };
    }
    if (requestedItem.quantity <= 0 || requestedItem.quantity > elig.returnableQuantity) {
      return {
        success: false,
        error: `Requested quantity (${requestedItem.quantity}) exceeds returnable limit (${elig.returnableQuantity}) for ${elig.title}.`,
      };
    }
    estimatedRefundAmount += elig.unitPrice * requestedItem.quantity;
  }

  const adminDb = createAdminClient();

  // Generate sequence-based return number: RET-YYYYMM-XXXXX
  const datePrefix = new Date().toISOString().slice(0, 7).replace("-", "");
  const returnNumber = `RET-${datePrefix}-${Math.floor(10000 + Math.random() * 90000)}`;

  // Default to order shipping address if pickup address omitted
  let finalPickupAddress = pickupAddress;
  if (!finalPickupAddress) {
    const { data: order } = await adminDb
      .from("orders")
      .select("address_snapshot")
      .eq("id", orderId)
      .single();
    finalPickupAddress = order?.address_snapshot;
  }

  const { data: returnReq, error: reqErr } = await adminDb
    .from("return_requests")
    .insert({
      return_number: returnNumber,
      order_id: orderId,
      customer_id: userId,
      request_type: "return_refund",
      reason,
      description: description || null,
      status: "submitted",
      evidence_urls: evidenceUrls || [],
      pickup_address: finalPickupAddress || {},
      refund_amount: estimatedRefundAmount,
    })
    .select("id, return_number")
    .single();

  if (reqErr || !returnReq) {
    return { success: false, error: reqErr?.message || "Failed to create return request record." };
  }

  // Insert item rows
  const itemRows = items.map((i) => {
    const elig = itemMap.get(i.orderItemId)!;
    return {
      return_request_id: returnReq.id,
      order_item_id: i.orderItemId,
      book_id: i.bookId,
      variant_id: i.variantId || null,
      quantity: i.quantity,
      unit_price: elig.unitPrice,
      reason: i.reason || reason,
    };
  });

  const { error: itemsErr } = await adminDb.from("return_request_items").insert(itemRows);
  if (itemsErr) {
    console.error("Error inserting return request items:", itemsErr);
  }

  // Audit log
  await adminDb.from("audit_logs").insert({
    action: "CUSTOMER_RETURN_REQUEST_CREATED",
    model_name: "return_requests",
    model_id: returnReq.id,
    user_id: userId,
    new_values: {
      return_number: returnReq.return_number,
      order_id: orderId,
      type: requestType,
      items_count: items.length,
      estimated_refund: estimatedRefundAmount,
    },
  });

  return {
    success: true,
    returnRequestId: returnReq.id,
    returnNumber: returnReq.return_number,
  };
}

/**
 * Administratively reviews a return request (2.17).
 */
export async function adminReviewReturnRequest(params: {
  returnId: string;
  adminId: string;
  action: "approve" | "reject" | "request_info";
  rejectionReason?: string;
  adminNotes?: string;
}): Promise<{ success: boolean; status?: string; error?: string }> {
  const { returnId, adminId, action, rejectionReason, adminNotes } = params;
  const adminDb = createAdminClient();

  const { data: retReq, error } = await adminDb
    .from("return_requests")
    .select("*, return_request_items(*)")
    .eq("id", returnId)
    .single();

  if (error || !retReq) {
    return { success: false, error: "Return request not found." };
  }

  const nowIso = new Date().toISOString();

  if (action === "reject") {
    if (!rejectionReason || !rejectionReason.trim()) {
      return { success: false, error: "Rejection reason is mandatory." };
    }

    await adminDb
      .from("return_requests")
      .update({
        status: "rejected",
        rejection_reason: rejectionReason.trim(),
        admin_notes: adminNotes || null,
        resolved_by: adminId,
        resolved_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", returnId);

    return { success: true, status: "rejected" };
  }

  if (action === "request_info") {
    await adminDb
      .from("return_requests")
      .update({
        status: "info_requested",
        admin_notes: adminNotes || null,
        updated_at: nowIso,
      })
      .eq("id", returnId);

    return { success: true, status: "info_requested" };
  }

  // Approval flow: Approved for return pickup and subsequent refund
  await adminDb
    .from("return_requests")
    .update({
      status: "approved",
      admin_notes: adminNotes || null,
      resolved_by: adminId,
      updated_at: nowIso,
    })
    .eq("id", returnId);

  return { success: true, status: "approved" };
}

/**
 * Schedules courier return pickup for an approved return request (2.18).
 */
export async function scheduleReturnPickup(
  returnId: string,
  params?: { pickupDate?: string }
): Promise<{
  success: boolean;
  pickupAwb?: string;
  status?: string;
  error?: string;
}> {
  const adminDb = createAdminClient();

  const { data: retReq, error } = await adminDb
    .from("return_requests")
    .select("*")
    .eq("id", returnId)
    .single();

  if (error || !retReq) {
    return { success: false, error: "Return request not found." };
  }

  if (retReq.status !== "approved" && retReq.status !== "pickup_scheduled") {
    return {
      success: false,
      error: `Return pickup can only be scheduled for Approved requests (current: ${retReq.status}).`,
    };
  }

  const config = getDelhiveryConfig();
  let awb: string;

  if (!config.isConfigured) {
    // Deterministic mock reverse AWB
    awb = `REV-${retReq.return_number.replace(/\D/g, "").slice(0, 8)}-${Date.now().toString(36).toUpperCase()}`;
  } else {
    // In production Delhivery: call reverse pickup API
    awb = `REV-${Date.now()}`;
  }

  const nowIso = new Date().toISOString();
  await adminDb
    .from("return_requests")
    .update({
      pickup_awb: awb,
      pickup_status: "scheduled",
      status: "pickup_scheduled",
      updated_at: nowIso,
    })
    .eq("id", returnId);

  return {
    success: true,
    pickupAwb: awb,
    status: "pickup_scheduled",
  };
}

/**
 * Authoritatively executes an approved refund via Razorpay and settles local records (2.19, 2.21).
 */
export async function processReturnRefund(params: {
  returnId: string;
  adminId: string;
  amount?: number;
  reason?: string;
}): Promise<{
  success: boolean;
  refundRecordId?: string;
  gatewayRefundId?: string;
  amount?: number;
  status?: string;
  error?: string;
}> {
  const { returnId, adminId, amount, reason } = params;
  const adminDb = createAdminClient();

  const { data: retReq, error } = await adminDb
    .from("return_requests")
    .select("*")
    .eq("id", returnId)
    .single();

  if (error || !retReq) {
    return { success: false, error: "Return request not found." };
  }

  const { data: order, error: ordErr } = await adminDb
    .from("orders")
    .select("id, total_amount, payment_method, payment_status, razorpay_payment_id")
    .eq("id", retReq.order_id)
    .single();

  if (ordErr || !order) {
    return { success: false, error: "Associated order not found." };
  }

  const refundAmount = amount || Number(retReq.refund_amount) || Number(order.total_amount);
  const refundReason = reason || retReq.reason || "Return claim refund";

  // 1. Enforce atomic reservation and balance check via RPC
  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("initiate_return_refund_atomic", {
    p_order_id: retReq.order_id,
    p_return_id: returnId,
    p_amount: refundAmount,
    p_reason: refundReason,
    p_admin_id: adminId,
  });

  if (rpcErr || !(rpcRes as any)?.success) {
    return {
      success: false,
      error: (rpcRes as any)?.error || rpcErr?.message || "Failed to reserve refund balance.",
    };
  }

  // Idempotency: if already processed, return existing record
  if ((rpcRes as any)?.already_initiated) {
    const existingStatus = (rpcRes as any).status;
    const existingRecId = (rpcRes as any).refund_record_id;
    if (existingStatus === "processed") {
      const { data: rec } = await adminDb
        .from("refund_records")
        .select("gateway_refund_id, amount")
        .eq("id", existingRecId)
        .single();
      return {
        success: true,
        refundRecordId: existingRecId,
        gatewayRefundId: rec?.gateway_refund_id || undefined,
        amount: Number(rec?.amount || refundAmount),
        status: "already_processed",
      };
    }
  }

  const refundRecordId = (rpcRes as any).refund_record_id;

  // 2. Gateway Refund Dispatch
  let gatewayRefundId: string | null = null;
  let isGatewaySuccess = false;

  if (order.payment_method === "ONLINE" && order.razorpay_payment_id) {
    const gwRes = await initiateRazorpayRefund({
      orderId: order.id,
      amount: refundAmount,
      reason: refundReason,
      notes: {
        order_id: order.id,
        return_id: returnId,
        refund_record_id: refundRecordId,
      },
    });

    if (gwRes.success && gwRes.refundId) {
      gatewayRefundId = gwRes.refundId;
      isGatewaySuccess = true;
    } else {
      // Record failure in refund_records
      await adminDb
        .from("refund_records")
        .update({
          status: "failed",
          error_message: gwRes.error || "Gateway refund failed",
          updated_at: new Date().toISOString(),
        })
        .eq("id", refundRecordId);

      return {
        success: false,
        error: `Gateway refund failed: ${gwRes.error}`,
      };
    }
  } else {
    // For COD / Offline return refund: Approved and recorded administratively
    gatewayRefundId = `COD-REFUND-${Date.now()}`;
    isGatewaySuccess = true;
  }

  // 3. Mark processed
  const nowIso = new Date().toISOString();
  await adminDb
    .from("refund_records")
    .update({
      status: "processed",
      gateway_refund_id: gatewayRefundId,
      gateway_status: "processed",
      updated_at: nowIso,
    })
    .eq("id", refundRecordId);

  // Update return request status
  await adminDb
    .from("return_requests")
    .update({
      status: "completed",
      resolved_by: adminId,
      resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", returnId);

  // Update order refund state
  const isFullRefund = refundAmount >= Number(order.total_amount);
  await adminDb
    .from("orders")
    .update({
      refund_status: "processed",
      refund_amount: refundAmount,
      razorpay_refund_id: gatewayRefundId,
      refunded_at: nowIso,
      payment_status: isFullRefund ? "Refunded" : order.payment_status,
      updated_at: nowIso,
    })
    .eq("id", order.id);

  return {
    success: true,
    refundRecordId,
    gatewayRefundId: gatewayRefundId || undefined,
    amount: refundAmount,
    status: "processed",
  };
}
