import { createAdminClient } from "@/lib/supabase/admin";
import { initiateRazorpayRefund } from "@/lib/integrations/razorpay/service";
import { getDelhiveryConfig } from "@/lib/integrations/delhivery/client";

export const RETURN_WINDOW_DAYS = 7;

export const RETURN_STATUS_TRANSITIONS: Record<string, readonly string[]> = {
  submitted: ["under_review", "info_requested", "approved", "rejected", "cancelled"],
  under_review: ["info_requested", "approved", "rejected", "cancelled"],
  info_requested: ["submitted", "under_review", "approved", "rejected", "cancelled"],
  approved: ["received", "refund_pending", "completed", "cancelled"],
  pickup_scheduled: ["pickup_completed", "received", "refund_pending", "completed", "cancelled"],
  pickup_completed: ["received", "refund_pending", "completed"],
  received: ["refund_pending", "completed"],
  refund_pending: ["completed"],
  rejected: [],
  completed: [],
  cancelled: [],
};

export function isAllowedReturnStatusTransition(currentStatus: string, nextStatus: string): boolean {
  if (currentStatus === nextStatus) return true;
  const allowed = RETURN_STATUS_TRANSITIONS[currentStatus] || [];
  return allowed.includes(nextStatus);
}

const SYNTHETIC_REFUND_ID_REGEX = /^(COD-REFUND-|MOCK|FAKE|TEST-REFUND)/i;

export function isSyntheticRefundReference(value?: string | null): boolean {
  if (!value || typeof value !== "string") return false;
  return SYNTHETIC_REFUND_ID_REGEX.test(value.trim());
}

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
  userId: string,
  deps?: { adminDb?: any }
): Promise<ReturnEligibilityResult> {
  const adminDb = deps?.adminDb || createAdminClient();

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

  const eligibilityItems: ReturnEligibilityItem[] = (orderItems || []).map((item: any) => {
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
  params: CreateReturnRequestParams,
  deps?: { adminDb?: any }
): Promise<{ success: boolean; returnRequestId?: string; returnNumber?: string; error?: string }> {
  const { orderId, userId, requestType, reason, description, items, evidenceUrls, pickupAddress } = params;

  if (!items || items.length === 0) {
    return { success: false, error: "At least one item must be selected for return." };
  }

  // 1. Verify eligibility
  const eligibility = await checkOrderReturnEligibility(orderId, userId, deps);
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

  const adminDb = deps?.adminDb || createAdminClient();

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
export async function adminReviewReturnRequest(
  params: {
    returnId: string;
    adminId: string;
    action: "approve" | "reject" | "request_info" | "mark_received";
    rejectionReason?: string;
    adminNotes?: string;
  },
  deps?: { adminDb?: any }
): Promise<{ success: boolean; status?: string; error?: string }> {
  const { returnId, adminId, action, rejectionReason, adminNotes } = params;
  const adminDb = deps?.adminDb || createAdminClient();

  const { data: retReq, error } = await adminDb
    .from("return_requests")
    .select("*, return_request_items(*)")
    .eq("id", returnId)
    .single();

  if (error || !retReq) {
    return { success: false, error: "Return request not found." };
  }

  const targetStatus =
    action === "reject"
      ? "rejected"
      : action === "request_info"
      ? "info_requested"
      : action === "mark_received"
      ? "received"
      : "approved";

  if (!isAllowedReturnStatusTransition(retReq.status, targetStatus)) {
    return {
      success: false,
      error: `Cannot transition return request from "${retReq.status}" to "${targetStatus}".`,
    };
  }

  const nowIso = new Date().toISOString();

  if (action === "reject") {
    if (!rejectionReason || !rejectionReason.trim()) {
      return { success: false, error: "Rejection reason is mandatory." };
    }

    const { error: updErr } = await adminDb
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

    if (updErr) {
      return { success: false, error: updErr.message || "Failed to reject return request." };
    }
  } else if (action === "request_info") {
    const { error: updErr } = await adminDb
      .from("return_requests")
      .update({
        status: "info_requested",
        admin_notes: adminNotes || null,
        updated_at: nowIso,
      })
      .eq("id", returnId);

    if (updErr) {
      return { success: false, error: updErr.message || "Failed to update return request." };
    }
  } else if (action === "mark_received") {
    const { error: updErr } = await adminDb
      .from("return_requests")
      .update({
        status: "received",
        pickup_status: retReq.pickup_status || "received_at_warehouse",
        admin_notes: adminNotes || retReq.admin_notes || null,
        resolved_by: adminId,
        updated_at: nowIso,
      })
      .eq("id", returnId);

    if (updErr) {
      return { success: false, error: updErr.message || "Failed to mark return as received." };
    }
  } else {
    // Approval flow: Approved for return receipt/inspection and eligible refund workflow
    const { error: updErr } = await adminDb
      .from("return_requests")
      .update({
        status: "approved",
        admin_notes: adminNotes || null,
        resolved_by: adminId,
        updated_at: nowIso,
      })
      .eq("id", returnId);

    if (updErr) {
      return { success: false, error: updErr.message || "Failed to approve return request." };
    }
  }

  try {
    await adminDb.from("audit_logs").insert({
      action: "RETURN_REQUEST_REVIEWED",
      model_name: "return_requests",
      model_id: returnId,
      user_id: adminId,
      old_values: { status: retReq.status },
      new_values: {
        status: targetStatus,
        action,
        rejection_reason: rejectionReason?.trim() || null,
        admin_notes: adminNotes || null,
      },
    });
  } catch {
    // Non-blocking for minimal mock tables
  }

  return { success: true, status: targetStatus };
}

/**
 * Automated Delhivery reverse pickup is NOT integrated/verified in this codebase.
 * Never fabricates synthetic REV-* AWBs or fake pickup confirmations in any environment.
 */
export async function scheduleReturnPickup(
  _returnId: string,
  _params?: { pickupDate?: string }
): Promise<{
  success: boolean;
  pickupAwb?: string;
  status?: string;
  unavailable?: boolean;
  error?: string;
}> {
  const config = getDelhiveryConfig();
  if (config.validationErrors.length > 0) {
    return {
      success: false,
      unavailable: true,
      error: config.validationErrors[0],
    };
  }

  if (!config.enabled || !config.isConfigured) {
    return {
      success: false,
      unavailable: true,
      error:
        "Automated Delhivery reverse pickup is unavailable: Delhivery is not configured and automated reverse-pickup booking is not implemented. Arrange return collection manually without generating synthetic AWBs.",
    };
  }

  return {
    success: false,
    unavailable: true,
    error:
      "Automated Delhivery reverse pickup is unavailable and not implemented for this store; arrange manual courier return collection without generating synthetic AWBs.",
  };
}

export type CodPayoutChannel = "cod_bank_transfer" | "cod_upi" | "cod_offline";

async function hasConfirmedCodPaymentForOrder(adminDb: any, order: any): Promise<boolean> {
  if (
    order.is_paid === true ||
    order.payment_status === "Paid" ||
    order.payment_status === "Partially Refunded" ||
    order.payment_status === "Refund Pending" ||
    order.cod_settlement_status === "reconciled" ||
    order.cod_collection_status === "collected" ||
    order.cod_collection_status === "excess"
  ) {
    return true;
  }

  try {
    const { data: collections } = await adminDb
      .from("cod_collections")
      .select("id, collection_status, collected_amount")
      .eq("order_id", order.id);

    if (
      Array.isArray(collections) &&
      collections.some(
        (c: any) =>
          (c.collection_status === "collected" || c.collection_status === "excess") &&
          Number(c.collected_amount) > 0
      )
    ) {
      return true;
    }
  } catch {
    // Ignore when legacy mock DB omits cod_collections
  }

  return false;
}

/**
 * Authoritatively initiates an approved return refund:
 * - ONLINE orders: validates captured Razorpay payment and dispatches gateway refund.
 * - COD orders: requires confirmed COD payment collection first, records a pending offline
 *   payout authorization (never fabricating COD-REFUND-* or marking completed prematurely).
 */
export async function processReturnRefund(
  params: {
    returnId: string;
    adminId: string;
    amount?: number;
    reason?: string;
  },
  deps?: {
    adminDb?: any;
    initiateRazorpayRefundFn?: typeof initiateRazorpayRefund;
  }
): Promise<{
  success: boolean;
  refundRecordId?: string;
  gatewayRefundId?: string;
  amount?: number;
  status?: string;
  payoutRequired?: boolean;
  paymentChannel?: string;
  error?: string;
}> {
  const { returnId, adminId, amount, reason } = params;
  const adminDb = deps?.adminDb || createAdminClient();
  const initiateRefundFn = deps?.initiateRazorpayRefundFn || initiateRazorpayRefund;

  const { data: retReq, error } = await adminDb
    .from("return_requests")
    .select("*")
    .eq("id", returnId)
    .single();

  if (error || !retReq) {
    return { success: false, error: "Return request not found." };
  }

  const eligibleReturnStatuses = [
    "approved",
    "received",
    "pickup_scheduled",
    "pickup_completed",
    "refund_pending",
    "completed",
  ];
  if (!eligibleReturnStatuses.includes(retReq.status)) {
    return {
      success: false,
      error: `Return request must be approved or received before authorizing a refund (current status: ${retReq.status}).`,
    };
  }

  const { data: order, error: ordErr } = await adminDb
    .from("orders")
    .select(
      "id, total_amount, payment_method, payment_status, is_paid, razorpay_payment_id, cod_settlement_status, cod_collection_status, cod_collected_amount, cod_settled_amount"
    )
    .eq("id", retReq.order_id)
    .single();

  if (ordErr || !order) {
    return { success: false, error: "Associated order not found." };
  }

  const isCodOrder = String(order.payment_method || "").toUpperCase() === "COD";

  if (isCodOrder) {
    const codCollected = await hasConfirmedCodPaymentForOrder(adminDb, order);
    if (!codCollected) {
      return {
        success: false,
        error:
          "COD payment collection has not been confirmed for this order; a refund cannot be authorized prior to doorstep collection or courier remittance.",
      };
    }
  } else {
    if (!order.razorpay_payment_id) {
      return {
        success: false,
        error: "Cannot process prepaid refund: missing Razorpay payment ID on order.",
      };
    }
    if (order.is_paid !== true && order.payment_status !== "Paid" && order.payment_status !== "Partially Refunded") {
      return {
        success: false,
        error: `Prepaid order payment must be Paid before return refund (current: ${order.payment_status}).`,
      };
    }
  }

  const refundAmount = amount ?? (Number(retReq.refund_amount) || Number(order.total_amount));
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

  // Idempotency: if already processed, return existing record cleanly
  if ((rpcRes as any)?.already_initiated) {
    const existingStatus = (rpcRes as any).status;
    const existingRecId = (rpcRes as any).refund_record_id;
    const { data: rec } = await adminDb
      .from("refund_records")
      .select("gateway_refund_id, payout_reference, payment_channel, amount, status")
      .eq("id", existingRecId)
      .maybeSingle();

    if (existingStatus === "processed") {
      return {
        success: true,
        refundRecordId: existingRecId,
        gatewayRefundId: rec?.gateway_refund_id || rec?.payout_reference || undefined,
        amount: Number(rec?.amount || refundAmount),
        status: "already_processed",
        paymentChannel: rec?.payment_channel || (isCodOrder ? "cod_offline" : "razorpay"),
      };
    }

    if (isCodOrder && existingStatus === "pending") {
      return {
        success: true,
        refundRecordId: existingRecId,
        amount: Number(rec?.amount || refundAmount),
        status: "pending",
        payoutRequired: true,
        paymentChannel: rec?.payment_channel || "cod_offline",
      };
    }
  }

  const refundRecordId = (rpcRes as any).refund_record_id;
  const nowIso = new Date().toISOString();

  // 2. Dispatch ONLINE gateway refund OR authorize pending offline COD payout
  if (!isCodOrder) {
    const gwRes = await initiateRefundFn(
      {
        orderId: order.id,
        amount: refundAmount,
        reason: refundReason,
        idempotencyKey: `refund:return:${returnId}`,
        refundType: "return",
        authorizedBy: adminId,
        refundRecordId,
        notes: {
          order_id: order.id,
          return_id: returnId,
          refund_record_id: refundRecordId,
        },
      },
      { adminDb }
    );

    if (!gwRes.success || !gwRes.refundId) {
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
        error: `Gateway refund failed: ${gwRes.error || "Unknown Razorpay error"}`,
      };
    }

    const gatewayRefundId = gwRes.refundId;
    const gatewayFinalStatus: "processed" | "processing" =
      gwRes.status === "processed" || gwRes.status === "already_processed"
        ? "processed"
        : "processing";

    await adminDb
      .from("refund_records")
      .update({
        status: gatewayFinalStatus,
        gateway_refund_id: gatewayRefundId,
        gateway_status: gatewayFinalStatus,
        processed_at: gatewayFinalStatus === "processed" ? nowIso : null,
        updated_at: nowIso,
      })
      .eq("id", refundRecordId);

    await adminDb
      .from("return_requests")
      .update(
        gatewayFinalStatus === "processed"
          ? {
              status: "completed",
              resolved_by: adminId,
              resolved_at: nowIso,
              updated_at: nowIso,
            }
          : {
              status: "refund_pending",
              updated_at: nowIso,
            }
      )
      .eq("id", returnId);

    return {
      success: true,
      refundRecordId,
      gatewayRefundId,
      amount: refundAmount,
      status: gatewayFinalStatus,
      paymentChannel: "razorpay",
    };
  }

  // COD Offline Return Refund: Record authorization ONLY as 'pending' awaiting confirmed bank/UPI/cash payout.
  // Never fabricate synthetic COD-REFUND-* IDs and never mark completed prematurely.
  await adminDb
    .from("return_requests")
    .update({
      status: "refund_pending",
      refund_amount: refundAmount,
      resolved_by: adminId,
      updated_at: nowIso,
    })
    .eq("id", returnId);

  await adminDb
    .from("orders")
    .update({
      refund_status: "pending",
      refund_amount: refundAmount,
      payment_status: "Refund Pending",
      updated_at: nowIso,
    })
    .eq("id", order.id);

  try {
    await adminDb.from("audit_logs").insert({
      action: "AUTHORIZE_COD_RETURN_REFUND",
      model_name: "orders",
      model_id: order.id,
      user_id: adminId,
      new_values: {
        return_id: returnId,
        refund_record_id: refundRecordId,
        amount: refundAmount,
        status: "pending",
        payment_channel: "cod_offline",
      },
    });
  } catch {
    // Non-blocking for minimal mock DBs
  }

  return {
    success: true,
    refundRecordId,
    amount: refundAmount,
    status: "pending",
    payoutRequired: true,
    paymentChannel: "cod_offline",
  };
}

/**
 * Explicitly completes an offline COD refund AFTER actual payout (Bank transfer / UPI / cash)
 * has been verified with a real external reference (UTR / UPI ref / signed voucher).
 */
export async function confirmCodReturnRefundPayout(
  params: {
    refundRecordId?: string;
    returnId?: string;
    adminId: string;
    payoutChannel: CodPayoutChannel;
    payoutReference: string;
    destinationHint?: string;
    notes?: string;
  },
  deps?: { adminDb?: any }
): Promise<{
  success: boolean;
  refundRecordId?: string;
  payoutReference?: string;
  amount?: number;
  paymentStatus?: string;
  alreadyProcessed?: boolean;
  error?: string;
}> {
  const adminDb = deps?.adminDb || createAdminClient();
  const cleanRef = String(params.payoutReference || "").trim();

  if (cleanRef.length < 4 || isSyntheticRefundReference(cleanRef)) {
    return {
      success: false,
      error:
        "A genuine external payout reference (UTR, UPI transaction ref, or voucher number) is required; synthetic references are prohibited.",
    };
  }

  if (!["cod_bank_transfer", "cod_upi", "cod_offline"].includes(params.payoutChannel)) {
    return { success: false, error: "Invalid COD payout channel." };
  }

  let targetRefundRecordId = params.refundRecordId;
  if (!targetRefundRecordId && params.returnId) {
    const { data: rec } = await adminDb
      .from("refund_records")
      .select("id")
      .eq("return_request_id", params.returnId)
      .in("status", ["pending", "processing", "processed"])
      .maybeSingle();
    targetRefundRecordId = rec?.id;
  }

  if (!targetRefundRecordId) {
    return {
      success: false,
      error: "No authorized pending COD refund record found to confirm payout.",
    };
  }

  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("complete_cod_refund_atomic", {
    p_refund_record_id: targetRefundRecordId,
    p_admin_id: params.adminId,
    p_payout_channel: params.payoutChannel,
    p_payout_reference: cleanRef,
    p_destination_hint: params.destinationHint?.trim() || null,
    p_notes: params.notes?.trim() || null,
  });

  if (rpcErr || !(rpcRes as any)?.success) {
    return {
      success: false,
      error: (rpcRes as any)?.error || rpcErr?.message || "Failed to confirm COD refund payout.",
    };
  }

  return {
    success: true,
    refundRecordId: (rpcRes as any).refund_record_id || targetRefundRecordId,
    payoutReference: (rpcRes as any).payout_reference || cleanRef,
    amount: Number((rpcRes as any).amount || 0),
    paymentStatus: (rpcRes as any).payment_status,
    alreadyProcessed: Boolean((rpcRes as any).already_processed),
  };
}
