"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { invalidateCatalogCache } from "@/lib/cache/catalog";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { requireAdmin } from "@/lib/admin/auth";
import { getCustomerCart } from "./cart";
import { runReleaseExpiredReservationsWorker } from "./reservations";
import {
  executeOrderCancellation,
  executeOrderCheckout,
  executeRetryOrderPayment,
  type CheckoutConsentPayload,
  type OrderCancellationResult,
  type OrderCheckoutResult,
} from "./orders-core";
import type { CreatePaymentOrderResult } from "@/lib/integrations/razorpay/service";
import type { Database } from "@/types/database.types";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];
export type { CheckoutConsentPayload, OrderCancellationResult, OrderCheckoutResult };

export interface EnrichedOrder extends OrderRow {
  items: OrderItemRow[];
}

async function readRequestClientMeta(): Promise<{ ipAddress: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwardedFor = h.get("x-forwarded-for");
    const realIp = h.get("x-real-ip");
    const ipAddress = (forwardedFor ? forwardedFor.split(",")[0].trim() : realIp?.trim()) || null;
    const userAgent = h.get("user-agent") || null;
    return { ipAddress, userAgent };
  } catch {
    return { ipAddress: null, userAgent: null };
  }
}

function safeRevalidate(paths: string[]) {
  try {
    for (const p of paths) revalidatePath(p);
  } catch {
    // No-op outside Next.js request context
  }
  invalidateCatalogCache();
}

/**
 * Places a Cash on Delivery (COD) order atomically with strict fail-closed Delhivery verification.
 */
export async function placeOrderCOD(
  addressId: string,
  idempotencyKey?: string,
  couponCode?: string,
  consent?: CheckoutConsentPayload
): Promise<OrderCheckoutResult> {
  const user = await getAuthenticatedUser();
  const meta = await readRequestClientMeta();
  const adminDb = createAdminClient();

  return executeOrderCheckout(
    {
      paymentMethod: "COD",
      addressId,
      idempotencyKey,
      couponCode,
      consent,
      ...meta,
    },
    {
      user,
      adminDb,
      getCart: getCustomerCart,
      revalidateFn: safeRevalidate,
    }
  );
}

/**
 * Places an Online order atomically and initializes the Razorpay payment session.
 */
export async function placeOrderOnline(
  addressId: string,
  idempotencyKey?: string,
  couponCode?: string,
  consent?: CheckoutConsentPayload
): Promise<OrderCheckoutResult> {
  const user = await getAuthenticatedUser();
  const meta = await readRequestClientMeta();
  const adminDb = createAdminClient();

  return executeOrderCheckout(
    {
      paymentMethod: "ONLINE",
      addressId,
      idempotencyKey,
      couponCode,
      consent,
      ...meta,
    },
    {
      user,
      adminDb,
      getCart: getCustomerCart,
      revalidateFn: safeRevalidate,
    }
  );
}

/**
 * Retrieves the customer's order history.
 */
export async function getCustomerOrders(): Promise<OrderRow[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching customer orders:", error.message);
    return [];
  }

  return data || [];
}

/**
 * Retrieves an order and its line items, enforcing customer ownership.
 * Supports lookup by internal UUID or public order number (e.g. MDS-100001).
 */
export async function getCustomerOrderById(orderIdentifier: string): Promise<EnrichedOrder | null> {
  const user = await getAuthenticatedUser();
  if (!user || !orderIdentifier) return null;

  const cleanIdentifier = orderIdentifier.trim();
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const supabase = await createClient();

  let query = supabase.from("orders").select("*").eq("user_id", user.id);
  if (uuidRegex.test(cleanIdentifier)) {
    query = query.eq("id", cleanIdentifier);
  } else {
    query = query.eq("order_number", cleanIdentifier);
  }

  const { data: order, error: orderErr } = await query.maybeSingle();

  if (orderErr || !order) {
    return null;
  }

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);

  if (itemsErr) {
    console.error("Error fetching order items:", itemsErr.message);
    return null;
  }

  return {
    ...order,
    items: items || [],
  };
}

/**
 * Retries payment for an eligible unpaid online order.
 */
export async function retryOrderPayment(
  orderIdentifier: string,
  forceNewAttempt: boolean = false
): Promise<{
  success: boolean;
  error?: string;
  orderId?: string;
  razorpayOrder?: CreatePaymentOrderResult;
}> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: "Authentication required to retry payment." };
  }

  const adminDb = createAdminClient();
  return executeRetryOrderPayment(
    {
      orderIdentifier,
      userId: user.id,
      forceNewAttempt,
    },
    { adminDb }
  );
}

/**
 * Cancels a customer order atomically, restores inventory, and initiates Razorpay refund if paid online.
 */
export async function cancelOrder(
  orderId: string,
  reason: string
): Promise<OrderCancellationResult> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const adminDb = createAdminClient();
  return executeOrderCancellation(
    {
      orderId,
      actorUserId: user.id,
      reason,
      isAdmin: false,
    },
    {
      adminDb,
      revalidateFn: safeRevalidate,
    }
  );
}

/**
 * Deprecated: Direct book replacements are unsupported.
 */
export async function requestOrderReplacement(
  _orderId: string,
  _reason: string,
  _description?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  return {
    success: false,
    error: "Direct book replacements are unsupported. Please submit a Return for Refund request under our 7-day guarantee.",
  };
}

/**
 * Retrieves all replacement requests initiated by the authenticated customer.
 */
export async function getCustomerReplacements(): Promise<EnrichedOrder[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .eq("replacement_requested", true)
    .order("replacement_requested_at", { ascending: false });

  if (ordersErr || !orders) {
    console.error("Error fetching customer replacements:", ordersErr?.message);
    return [];
  }

  const orderIds = orders.map((o) => o.id);
  if (orderIds.length === 0) {
    return [];
  }

  // Single batched query eliminates N+1 per-order queries
  const { data: allItems, error: itemsErr } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds);

  if (itemsErr) {
    console.error("Error batch fetching replacement order items:", itemsErr.message);
  }

  const itemsByOrderId = new Map<string, OrderItemRow[]>();
  for (const item of allItems || []) {
    const existing = itemsByOrderId.get(item.order_id);
    if (existing) existing.push(item);
    else itemsByOrderId.set(item.order_id, [item]);
  }

  return orders.map((order) => ({
    ...order,
    items: itemsByOrderId.get(order.id) || [],
  }));
}

/**
 * Admin-gated server action wrapper to release expired unpaid online inventory reservations.
 * Scheduled background runs must use /api/cron/release-reservations (authenticated by CRON_SECRET).
 */
export async function releaseExpiredReservations(limit: number = 50): Promise<{
  success: boolean;
  releasedCount?: number;
  orderIds?: string[];
  error?: string;
}> {
  await requireAdmin();
  return runReleaseExpiredReservationsWorker(limit);
}

/**
 * Calculates server-authoritative cart pricing breakdown from database catalog & discounts.
 */
export async function calculateAuthoritativeCartPricing(
  items: Array<{ bookId: string; quantity: number }>,
  couponCode?: string
): Promise<{
  success: boolean;
  subtotal?: number;
  platformFee?: number;
  deliveryFee?: number;
  discountAmount?: number;
  totalAmount?: number;
  error?: string;
}> {
  const supabase = await createClient();
  const payload = items.map((i) => ({ book_id: i.bookId, quantity: i.quantity }));
  const { data, error } = await supabase.rpc("calculate_cart_pricing", {
    p_items: payload,
    p_coupon_code: couponCode || undefined,
  });

  if (error || !data) {
    return { success: false, error: error?.message || "Failed to calculate pricing" };
  }

  const res = data as any;
  if (!res.success) {
    return { success: false, error: res.error };
  }

  return {
    success: true,
    subtotal: res.subtotal,
    platformFee: res.platform_fee,
    deliveryFee: res.delivery_fee,
    discountAmount: res.discount_amount,
    totalAmount: res.total_amount,
  };
}
