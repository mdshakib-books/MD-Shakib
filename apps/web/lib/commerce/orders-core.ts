import {
  cancelDelhiveryShipment,
  checkPincodeServiceability,
  verifyCodServiceabilityStrict,
} from "@/lib/integrations/delhivery/service";
import { DISPATCHED_ORDER_STATUSES, isDelhiveryShipment } from "@/lib/admin/constants";
import { resolveRazorpayExecution } from "@/lib/integrations/razorpay/client";
import {
  createRazorpayOrder,
  initiateRazorpayRefund,
  type CreatePaymentOrderResult,
  type InitiateRefundResult,
  type RefundLifecycleState,
} from "@/lib/integrations/razorpay/service";
import {
  sendAdminNewOrderNotification,
  sendOrderEmails,
} from "@/lib/integrations/resend/service";
import { checkAndTriggerLowStockAlerts } from "@/lib/admin/inventory";
import { checkRateLimit } from "@/lib/security/rate-limit";
import type { CustomerCartSummary } from "./cart";

export interface CheckoutConsentPayload {
  termsAccepted: boolean;
  termsVersion?: string;
  privacyVersion?: string;
  shippingVersion?: string;
  returnsVersion?: string;
}

export interface OrderCheckoutResult {
  success: boolean;
  error?: string;
  code?: string;
  orderId?: string;
  razorpayOrder?: CreatePaymentOrderResult;
  paymentInitFailed?: boolean;
  reused?: boolean;
}

export interface OrderCancellationResult {
  success: boolean;
  orderCancelled?: boolean;
  courierCancelled?: boolean;
  courierCancelFailed?: boolean;
  refundStatus?: RefundLifecycleState;
  refundId?: string;
  error?: string;
}

export interface OrderCheckoutDeps {
  user: { id: string } | null;
  adminDb: any;
  getCart: () => Promise<CustomerCartSummary | null>;
  verifyCodServiceability?: typeof verifyCodServiceabilityStrict;
  checkOnlineServiceability?: typeof checkPincodeServiceability;
  resolveRazorpay?: typeof resolveRazorpayExecution;
  checkRateLimitFn?: typeof checkRateLimit;
  createRazorpayOrderFn?: typeof createRazorpayOrder;
  sendOrderEmailsFn?: typeof sendOrderEmails;
  sendAdminAlertFn?: typeof sendAdminNewOrderNotification;
  checkLowStockFn?: typeof checkAndTriggerLowStockAlerts;
  revalidateFn?: (paths: string[]) => void;
}

/**
 * Shared hardened checkout orchestrator for both COD and ONLINE flows.
 * Enforces:
 * - Statutory checkout consent
 * - Authenticated user & address ownership
 * - Strict fail-closed COD Delhivery serviceability (H-1)
 * - Scoped idempotency checking payment method, address, and coupon parity (H-8)
 * - Server-only create_order_atomic RPC derivation without trusting client prices/totals (H-2)
 */
export async function executeOrderCheckout(
  input: {
    paymentMethod: "COD" | "ONLINE";
    addressId: string;
    idempotencyKey?: string;
    couponCode?: string;
    consent?: CheckoutConsentPayload;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
  deps: OrderCheckoutDeps
): Promise<OrderCheckoutResult> {
  const {
    paymentMethod,
    addressId,
    idempotencyKey,
    couponCode,
    consent,
    ipAddress = null,
    userAgent = null,
  } = input;

  if (!consent || !consent.termsAccepted) {
    return {
      success: false,
      code: "CONSENT_REQUIRED",
      error:
        "Statutory purchase consent is required. You must review and agree to the Terms & Conditions and Policies before completing your order.",
    };
  }

  if (!deps.user?.id) {
    return {
      success: false,
      code: "UNAUTHENTICATED",
      error: "Authentication required to place order.",
    };
  }
  const userId = deps.user.id;

  const resolveRzp = deps.resolveRazorpay || resolveRazorpayExecution;
  if (paymentMethod === "ONLINE") {
    try {
      resolveRzp("online checkout");
    } catch (err: any) {
      return {
        success: false,
        code: "RAZORPAY_UNAVAILABLE",
        error: err?.message || "Online payment is currently unavailable.",
      };
    }
  }

  const rlFn = deps.checkRateLimitFn || checkRateLimit;
  const rl = await rlFn(`checkout:${userId}`, "checkout");
  if (!rl.allowed) {
    return {
      success: false,
      code: "RATE_LIMITED",
      error: "You are placing orders too quickly. Please wait a moment.",
    };
  }

  const cleanIdempotencyKey = idempotencyKey?.trim() || undefined;
  const cleanCoupon = couponCode?.trim() ? couponCode.trim().toUpperCase() : "";

  // 1. Validate owned delivery address strictly from database
  const { data: address, error: addrErr } = await deps.adminDb
    .from("addresses")
    .select("*")
    .eq("id", addressId)
    .eq("user_id", userId)
    .single();

  if (addrErr || !address) {
    return {
      success: false,
      code: "INVALID_ADDRESS",
      error: "Please select a valid delivery address.",
    };
  }

  const pincode = String(address.pincode || "").trim();
  if (!/^\d{6}$/.test(pincode)) {
    return {
      success: false,
      code: "INVALID_PINCODE",
      error: "Selected delivery address does not have a valid 6-digit Indian pincode.",
    };
  }

  const createRzpOrder = deps.createRazorpayOrderFn || createRazorpayOrder;

  // 2. Scoped Idempotency Verification (H-8): Prevent cross-method or changed-payload reuse
  if (cleanIdempotencyKey) {
    const { data: existingOrder } = await deps.adminDb
      .from("orders")
      .select(
        "id, payment_method, order_status, payment_status, address_id, coupon_code, razorpay_order_id, total_amount"
      )
      .eq("user_id", userId)
      .eq("idempotency_key", cleanIdempotencyKey)
      .maybeSingle();

    if (existingOrder?.id) {
      if (existingOrder.payment_method !== paymentMethod) {
        return {
          success: false,
          code: "IDEMPOTENCY_CONFLICT",
          error: `This checkout attempt is bound to ${existingOrder.payment_method}. Please retry with a fresh attempt when switching to ${paymentMethod}.`,
        };
      }

      const existingCoupon = (existingOrder.coupon_code || "").trim().toUpperCase();
      if (
        (existingOrder.address_id && existingOrder.address_id !== address.id) ||
        existingCoupon !== cleanCoupon
      ) {
        return {
          success: false,
          code: "IDEMPOTENCY_CONFLICT",
          error: "Checkout details changed after the previous submission. Please place a fresh order.",
        };
      }

      if (existingOrder.order_status === "Cancelled") {
        return {
          success: false,
          code: "ORDER_CANCELLED",
          error: "This order attempt was already cancelled or expired. Please start a fresh checkout.",
        };
      }

      if (paymentMethod === "COD") {
        return { success: true, orderId: existingOrder.id, reused: true };
      }

      try {
        const razorpayOrder = await createRzpOrder(existingOrder.id, userId, {
          forceNewAttempt: false,
          idempotencyKey: cleanIdempotencyKey,
          adminDb: deps.adminDb,
        });
        return {
          success: true,
          orderId: existingOrder.id,
          razorpayOrder,
          reused: true,
        };
      } catch (err: any) {
        return {
          success: false,
          orderId: existingOrder.id,
          paymentInitFailed: true,
          error: err?.message || "Failed to initialize Razorpay payment for existing pending order.",
        };
      }
    }
  }

  // 3. Validate customer cart BEFORE courier checks / order creation
  const cart = await deps.getCart();
  if (!cart || cart.items.length === 0) {
    return {
      success: false,
      code: "EMPTY_CART",
      error: "Your shopping cart is empty.",
    };
  }

  for (const item of cart.items) {
    if (!item.isActive) {
      return {
        success: false,
        code: "ITEM_INACTIVE",
        error: `"${item.title}" is no longer available.`,
      };
    }
    if (item.stock < item.quantity) {
      return {
        success: false,
        code: "INSUFFICIENT_STOCK",
        error: `Insufficient stock for "${item.title}". Available: ${item.stock}.`,
      };
    }
  }

  // 4. H-1 Destination Serviceability Gate (Fail-Closed for COD; Independent Resilience for Online)
  if (paymentMethod === "COD") {
    const verifyCod = deps.verifyCodServiceability || verifyCodServiceabilityStrict;
    const codCheck = await verifyCod(pincode);
    if (!codCheck.eligible) {
      return {
        success: false,
        code: codCheck.code || "COD_UNAVAILABLE",
        error:
          codCheck.reason ||
          `Cash on Delivery is unavailable for pincode ${pincode}. Please choose Online Payment.`,
      };
    }
  } else {
    const checkOnline = deps.checkOnlineServiceability || checkPincodeServiceability;
    try {
      const pinCheck = await checkOnline(pincode);
      if (pinCheck && (!pinCheck.serviceable || !pinCheck.prepaid)) {
        return {
          success: false,
          code: "PINCODE_NOT_SERVICEABLE",
          error: `Courier delivery is not serviceable for pincode ${pincode}. Please select another delivery address.`,
        };
      }
    } catch (pinErr: any) {
      // Keep Online checkout independent if live Delhivery serviceability check is disabled/unreachable
      console.warn("Online pincode check notice (checkout permitted):", pinErr?.message);
    }
  }

  // 5. H-2 Call server-restricted create_order_atomic (no client-trusted price/total)
  const addressSnapshot = {
    full_name: address.full_name,
    phone: address.phone,
    house_no: address.house_no,
    area: address.area,
    city: address.city,
    state: address.state,
    pincode,
    landmark: address.landmark,
    address_type: address.address_type,
  };

  const orderItemsPayload = cart.items.map((item) => ({
    book_id: item.bookId,
    quantity: item.quantity,
  }));

  const { data: orderId, error: rpcErr } = await deps.adminDb.rpc("create_order_atomic", {
    p_user_id: userId,
    p_items: orderItemsPayload,
    p_address_snapshot: addressSnapshot,
    p_payment_method: paymentMethod,
    p_total_amount: null,
    p_idempotency_key: cleanIdempotencyKey || null,
    p_coupon_code: cleanCoupon || null,
    p_address_id: address.id,
    p_cod_verified: paymentMethod === "COD",
    p_require_cart: true,
  });

  if (rpcErr || !orderId) {
    const msg = rpcErr?.message || "Failed to create order.";
    const isConflict = /idempotency conflict/i.test(msg);
    console.error("Atomic order creation failed:", msg);
    return {
      success: false,
      code: isConflict ? "IDEMPOTENCY_CONFLICT" : "ORDER_CREATION_FAILED",
      error: msg,
    };
  }

  // 6. Record statutory checkout consent cleanly via service_role RPC
  try {
    await deps.adminDb.rpc("record_order_consent_atomic", {
      p_order_id: orderId as string,
      p_user_id: userId,
      p_terms_accepted: true,
      p_terms_version: consent?.termsVersion || "2026.11-v1",
      p_privacy_version: consent?.privacyVersion || "2026.11-v1",
      p_shipping_version: consent?.shippingVersion || "2026.11-v1",
      p_returns_version: consent?.returnsVersion || "2026.11-v1",
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });
  } catch (consentErr: any) {
    console.warn("Consent record persistence notice:", consentErr?.message);
  }

  // 7. For ONLINE orders, initialize Razorpay payment order
  let razorpayOrder: CreatePaymentOrderResult | undefined;
  if (paymentMethod === "ONLINE") {
    try {
      razorpayOrder = await createRzpOrder(orderId as string, userId, {
        forceNewAttempt: false,
        idempotencyKey: cleanIdempotencyKey,
        adminDb: deps.adminDb,
      });
    } catch (err: any) {
      console.error("Razorpay order creation error:", err?.message || err);
      deps.revalidateFn?.(["/orders", "/cart", "/checkout"]);
      return {
        success: false,
        code: "PAYMENT_INIT_FAILED",
        error: `Order created (${orderId}) but payment initialization failed: ${err?.message || err}`,
        orderId: orderId as string,
        paymentInitFailed: true,
      };
    }
  }

  deps.revalidateFn?.(["/orders", "/cart", "/checkout"]);

  const sendEmails = deps.sendOrderEmailsFn || sendOrderEmails;
  const sendAdminAlert = deps.sendAdminAlertFn || sendAdminNewOrderNotification;
  const checkLowStock = deps.checkLowStockFn || checkAndTriggerLowStockAlerts;

  if (paymentMethod === "COD") {
    sendEmails({
      orderId: orderId as string,
      userId,
      eventType: "order_confirmation",
    }).catch((e) => console.error("Async COD order email dispatch error:", e));

    sendAdminAlert(orderId as string).catch((e) =>
      console.error("Async admin new order alert error:", e)
    );
  }

  checkLowStock(cart.items.map((i) => i.bookId)).catch((e) =>
    console.error("Async low stock alert check error:", e)
  );

  return {
    success: true,
    orderId: orderId as string,
    razorpayOrder,
  };
}

/**
 * Retries payment for an eligible unpaid online order (reusing active pending Razorpay session
 * or generating a new attempt while verifying reservation has not expired).
 */
export async function executeRetryOrderPayment(
  input: { orderIdentifier: string; userId: string; forceNewAttempt?: boolean },
  deps: {
    adminDb: any;
    resolveRazorpay?: typeof resolveRazorpayExecution;
    createRazorpayOrderFn?: typeof createRazorpayOrder;
  }
): Promise<{
  success: boolean;
  error?: string;
  orderId?: string;
  razorpayOrder?: CreatePaymentOrderResult;
}> {
  const resolveRzp = deps.resolveRazorpay || resolveRazorpayExecution;
  try {
    resolveRzp("payment retry");
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Online payment retry is currently unavailable.",
    };
  }

  const cleanIdentifier = String(input.orderIdentifier || "").trim();
  if (!cleanIdentifier) {
    return { success: false, error: "Invalid order identifier." };
  }

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let query = deps.adminDb.from("orders").select("*").eq("user_id", input.userId);
  if (uuidRegex.test(cleanIdentifier)) {
    query = query.eq("id", cleanIdentifier);
  } else {
    query = query.eq("order_number", cleanIdentifier);
  }

  const { data: order, error: orderErr } = await query.maybeSingle();
  if (orderErr || !order) {
    return { success: false, error: "Order not found or unauthorized." };
  }

  if (order.payment_method !== "ONLINE") {
    return {
      success: false,
      error: "Only online payment orders are eligible for payment retry.",
    };
  }

  if (order.payment_status === "Paid" || order.is_paid) {
    return { success: false, error: "This order is already marked as paid." };
  }

  if (order.order_status !== "Pending") {
    return {
      success: false,
      error: `Payment cannot be retried for order in "${order.order_status}" status.`,
    };
  }

  const createRzpOrder = deps.createRazorpayOrderFn || createRazorpayOrder;
  try {
    const razorpayOrder = await createRzpOrder(order.id, input.userId, {
      forceNewAttempt: Boolean(input.forceNewAttempt),
      adminDb: deps.adminDb,
    });
    return {
      success: true,
      orderId: order.id,
      razorpayOrder,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || "Payment initialization failed.",
      orderId: order.id,
    };
  }
}

async function processPostCancellationRefundAndEmail(
  params: {
    orderId: string;
    order: {
      user_id: string;
      order_status: string;
      payment_status: string;
      payment_method: string;
      is_paid: boolean;
    };
    actorUserId: string;
    reason: string;
    isAdmin: boolean;
    courierCancelled?: boolean;
  },
  deps: {
    adminDb: any;
    initiateRefundFn?: typeof initiateRazorpayRefund;
    sendOrderEmailsFn?: typeof sendOrderEmails;
    revalidateFn?: (paths: string[]) => void;
  }
): Promise<OrderCancellationResult> {
  const wasPaidOnline =
    params.order.payment_method === "ONLINE" &&
    (params.order.is_paid === true ||
      params.order.payment_status === "Paid" ||
      params.order.payment_status === "Partially Refunded");

  let refundLifecycleState: RefundLifecycleState = "NOT_REQUIRED";
  let refundIdResult: string | undefined;
  let refundErrorMsg: string | undefined;

  if (wasPaidOnline) {
    const initiateRefund = deps.initiateRefundFn || initiateRazorpayRefund;
    try {
      const refundResult: InitiateRefundResult = await initiateRefund(
        {
          orderId: params.orderId,
          reason: params.reason,
          refundType: "cancellation",
          authorizedBy: params.isAdmin ? params.actorUserId : undefined,
          idempotencyKey: `refund:cancel:${params.orderId}`,
        },
        { adminDb: deps.adminDb }
      );

      refundLifecycleState = refundResult.lifecycleState;
      refundIdResult = refundResult.refundId;
      if (!refundResult.success) {
        refundErrorMsg = refundResult.error || "Gateway refund failed.";
        refundLifecycleState = "FAILED";
      }
    } catch (refundErr: any) {
      refundLifecycleState = "FAILED";
      refundErrorMsg = refundErr?.message || String(refundErr);
    }
  }

  if (params.isAdmin) {
    await deps.adminDb.from("audit_logs").insert({
      action: params.courierCancelled ? "ADMIN_CANCEL_DISPATCHED_ORDER" : "ADMIN_CANCEL_ORDER",
      model_name: "orders",
      model_id: params.orderId,
      user_id: params.actorUserId,
      old_values: {
        order_status: params.order.order_status,
        payment_status: params.order.payment_status,
      },
      new_values: {
        order_status: "Cancelled",
        cancel_reason: params.reason,
        refund_status: refundLifecycleState,
        refund_id: refundIdResult || null,
      },
      changes: {
        reason: params.reason,
        courier_cancelled: Boolean(params.courierCancelled),
        prepaid_refund_attempted: wasPaidOnline,
        refund_error: refundErrorMsg || null,
      },
    });
  }

  deps.revalidateFn?.([
    `/admin/orders`,
    `/admin/orders/${params.orderId}`,
    `/orders/${params.orderId}`,
    `/orders`,
  ]);

  const sendEmails = deps.sendOrderEmailsFn || sendOrderEmails;
  sendEmails({
    orderId: params.orderId,
    userId: params.order.user_id,
    eventType: "order_cancellation",
    cancelReason: params.reason,
  }).catch((e) => console.error("Async cancel order email dispatch error:", e));

  if (refundErrorMsg) {
    return {
      success: false,
      orderCancelled: true,
      courierCancelled: params.courierCancelled,
      refundStatus: "FAILED",
      refundId: refundIdResult,
      error: `Order was cancelled${params.courierCancelled ? "" : " and inventory restored"}, but gateway refund failed: ${refundErrorMsg}. Please review and retry refund.`,
    };
  }

  return {
    success: true,
    orderCancelled: true,
    courierCancelled: params.courierCancelled,
    refundStatus: refundLifecycleState,
    refundId: refundIdResult,
  };
}

/**
 * Shared cancellation orchestrator for pre-dispatch customer & admin cancellations (C-1 & H-2).
 * Rejects direct cancellation once an order is Shipped or Out for Delivery.
 */
export async function executeOrderCancellation(
  input: {
    orderId: string;
    actorUserId: string;
    reason: string;
    isAdmin: boolean;
  },
  deps: {
    adminDb: any;
    initiateRefundFn?: typeof initiateRazorpayRefund;
    sendOrderEmailsFn?: typeof sendOrderEmails;
    revalidateFn?: (paths: string[]) => void;
  }
): Promise<OrderCancellationResult> {
  const trimmedReason = String(input.reason || "").trim();
  if (input.isAdmin && !trimmedReason) {
    return { success: false, error: "A cancellation reason is required." };
  }
  const finalReason =
    trimmedReason || (input.isAdmin ? "Cancelled by admin" : "Cancelled by customer");

  const { data: order, error: fetchErr } = await deps.adminDb
    .from("orders")
    .select("id, user_id, payment_status, payment_method, order_status, is_paid, total_amount, razorpay_payment_id, shipping_awb")
    .eq("id", input.orderId)
    .single();

  if (fetchErr || !order) {
    return { success: false, error: "Order not found." };
  }

  if (!input.isAdmin && order.user_id !== input.actorUserId) {
    return { success: false, error: "Not authorized to cancel this order." };
  }

  if (DISPATCHED_ORDER_STATUSES.has(order.order_status)) {
    return {
      success: false,
      orderCancelled: false,
      error: input.isAdmin
        ? `Order is in "${order.order_status}" status and cannot be cancelled directly. Confirm courier shipment cancellation first.`
        : `Order has already been dispatched with courier${order.shipping_awb ? ` (AWB: ${order.shipping_awb})` : ""} and cannot be cancelled directly. Please request a return upon delivery.`,
    };
  }

  const { data: cancelOk, error: rpcErr } = await deps.adminDb.rpc("cancel_order_atomic", {
    p_order_id: input.orderId,
    p_user_id: input.actorUserId,
    p_cancel_reason: finalReason,
    p_is_admin: input.isAdmin,
  });

  if (rpcErr || !cancelOk) {
    return { success: false, error: rpcErr?.message || "Unable to cancel order." };
  }

  return processPostCancellationRefundAndEmail(
    {
      orderId: input.orderId,
      order,
      actorUserId: input.actorUserId,
      reason: finalReason,
      isAdmin: input.isAdmin,
      courierCancelled: false,
    },
    deps
  );
}

/**
 * Courier-aware administrative cancellation workflow for Shipped / Out for Delivery orders.
 * Confirms Delhivery API cancellation (or explicitly confirmed manual courier halt) BEFORE
 * cancelling the order in PostgreSQL, preserving order state on any courier failure/timeout.
 */
export async function executeDispatchedOrderCancellation(
  input: {
    orderId: string;
    adminUserId: string;
    reason: string;
    confirmManualCourierCancellation?: boolean;
    manualConfirmationRef?: string;
  },
  deps: {
    adminDb: any;
    cancelDelhiveryShipmentFn?: typeof cancelDelhiveryShipment;
    initiateRefundFn?: typeof initiateRazorpayRefund;
    sendOrderEmailsFn?: typeof sendOrderEmails;
    revalidateFn?: (paths: string[]) => void;
  }
): Promise<OrderCancellationResult> {
  const trimmedReason = String(input.reason || "").trim();
  if (!trimmedReason) {
    return { success: false, error: "A cancellation reason is required." };
  }

  const { data: order, error: fetchErr } = await deps.adminDb
    .from("orders")
    .select(
      "id, user_id, payment_status, payment_method, order_status, is_paid, total_amount, razorpay_payment_id, shipping_courier, shipping_awb, shipping_booking_mode, shipping_tracking_url"
    )
    .eq("id", input.orderId)
    .single();

  if (fetchErr || !order) {
    return { success: false, error: "Order not found." };
  }

  if (!DISPATCHED_ORDER_STATUSES.has(order.order_status)) {
    return {
      success: false,
      error: `Dispatched courier cancellation only applies to Shipped or Out for Delivery orders (current: ${order.order_status}).`,
    };
  }

  const isDelhivery = isDelhiveryShipment({
    courier: order.shipping_courier,
    bookingMode: order.shipping_booking_mode,
    trackingUrl: order.shipping_tracking_url,
  });

  let cancellationMode: "delhivery_api" | "manual_confirmed";
  let providerResponse: Record<string, any> = {};
  const manualRef = String(input.manualConfirmationRef || "").trim();

  if (isDelhivery) {
    if (!order.shipping_awb || !String(order.shipping_awb).trim()) {
      return {
        success: false,
        orderCancelled: false,
        error:
          "Cannot confirm Delhivery cancellation because this order is missing a valid AWB tracking number.",
      };
    }

    const cancelDelhiveryFn = deps.cancelDelhiveryShipmentFn || cancelDelhiveryShipment;
    const delhiveryRes = await cancelDelhiveryFn(order.shipping_awb, {
      reason: trimmedReason,
    });

    if (!delhiveryRes.success) {
      try {
        await deps.adminDb.from("shipment_events").insert({
          order_id: order.id,
          event_type: "courier_cancel_failed",
          source: "delhivery_api",
          previous_status: order.order_status,
          new_status: order.order_status,
          actor_id: input.adminUserId,
          carrier_name: order.shipping_courier || "Delhivery",
          awb: order.shipping_awb,
          note: delhiveryRes.error || "Delhivery cancellation failed",
          metadata: {
            timedOut: Boolean(delhiveryRes.timedOut),
            providerResponse: delhiveryRes.providerResponse || null,
          },
        });
      } catch {
        // Non-blocking in mock DBs
      }

      await deps.adminDb.from("audit_logs").insert({
        action: "COURIER_CANCEL_FAILED",
        model_name: "orders",
        model_id: order.id,
        user_id: input.adminUserId,
        old_values: { order_status: order.order_status, shipping_awb: order.shipping_awb },
        new_values: { order_status: order.order_status },
        changes: {
          error: delhiveryRes.error,
          timedOut: Boolean(delhiveryRes.timedOut),
        },
      });

      return {
        success: false,
        orderCancelled: false,
        courierCancelled: false,
        courierCancelFailed: true,
        error: `${delhiveryRes.error || "Courier cancellation failed."} Order status remains "${order.order_status}".`,
      };
    }

    cancellationMode = "delhivery_api";
    providerResponse = delhiveryRes.providerResponse || { confirmed: true };
  } else {
    if (!input.confirmManualCourierCancellation || !manualRef) {
      return {
        success: false,
        orderCancelled: false,
        error:
          "Manual shipment cancellation requires confirming that the external courier halted dispatch and entering a confirmation reference/note.",
      };
    }

    cancellationMode = "manual_confirmed";
    providerResponse = {
      manual_confirmed: true,
      manual_confirmation_ref: manualRef,
      carrier_name: order.shipping_courier || null,
    };
  }

  const { data: rpcRes, error: rpcErr } = await deps.adminDb.rpc(
    "cancel_dispatched_order_atomic",
    {
      p_order_id: input.orderId,
      p_admin_id: input.adminUserId,
      p_cancel_reason: trimmedReason,
      p_cancellation_mode: cancellationMode,
      p_courier_confirmed: true,
      p_provider_response: providerResponse,
      p_manual_confirmation_ref: manualRef || null,
    }
  );

  if (rpcErr || !rpcRes || (rpcRes as any)?.success !== true) {
    return {
      success: false,
      orderCancelled: false,
      error:
        (rpcRes as any)?.error ||
        rpcErr?.message ||
        "Courier cancellation was attempted, but finalizing order cancellation failed.",
    };
  }

  return processPostCancellationRefundAndEmail(
    {
      orderId: input.orderId,
      order,
      actorUserId: input.adminUserId,
      reason: trimmedReason,
      isAdmin: true,
      courierCancelled: true,
    },
    deps
  );
}

/**
 * Retries or reconciles a failed/pending refund on a cancelled prepaid ONLINE order (admin recovery).
 */
export async function executeAdminRefundRetry(
  input: { orderId: string; adminUserId: string; amount?: number; reason?: string },
  deps: {
    adminDb: any;
    initiateRefundFn?: typeof initiateRazorpayRefund;
    revalidateFn?: (paths: string[]) => void;
  }
): Promise<{
  success: boolean;
  refundStatus?: RefundLifecycleState;
  refundId?: string;
  amount?: number;
  error?: string;
}> {
  const { data: order, error: fetchErr } = await deps.adminDb
    .from("orders")
    .select("id, payment_method, payment_status, order_status, cancel_reason, total_amount")
    .eq("id", input.orderId)
    .single();

  if (fetchErr || !order) {
    return { success: false, error: "Order not found." };
  }

  if (order.payment_method !== "ONLINE") {
    return { success: false, error: "Refund retry is only supported for ONLINE prepaid orders." };
  }

  const initiateRefund = deps.initiateRefundFn || initiateRazorpayRefund;
  const refundResult = await initiateRefund(
    {
      orderId: input.orderId,
      amount: input.amount,
      reason: input.reason || order.cancel_reason || "Admin manual refund retry",
      refundType: "cancellation",
      authorizedBy: input.adminUserId,
    },
    { adminDb: deps.adminDb }
  );

  await deps.adminDb.from("audit_logs").insert({
    action: "ADMIN_RETRY_REFUND",
    model_name: "orders",
    model_id: input.orderId,
    user_id: input.adminUserId,
    old_values: { payment_status: order.payment_status },
    new_values: {
      refund_status: refundResult.lifecycleState,
      refund_id: refundResult.refundId || null,
      amount: refundResult.amount || null,
    },
    changes: {
      success: refundResult.success,
      error: refundResult.error || null,
    },
  });

  deps.revalidateFn?.([`/admin/orders/${input.orderId}`, `/orders/${input.orderId}`, `/orders`]);

  return {
    success: refundResult.success,
    refundStatus: refundResult.lifecycleState,
    refundId: refundResult.refundId,
    amount: refundResult.amount,
    error: refundResult.error,
  };
}
