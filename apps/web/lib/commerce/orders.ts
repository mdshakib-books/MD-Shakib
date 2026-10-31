"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getCustomerCart } from "./cart";
import { createRazorpayOrder, type CreatePaymentOrderResult } from "@/lib/integrations/razorpay/service";
import { sendOrderEmails } from "@/lib/integrations/resend/service";
import type { Database } from "@/types/database.types";

export type OrderRow = Database["public"]["Tables"]["orders"]["Row"];
export type OrderItemRow = Database["public"]["Tables"]["order_items"]["Row"];

export interface EnrichedOrder extends OrderRow {
  items: OrderItemRow[];
}

/**
 * Places a Cash on Delivery (COD) order atomically.
 * Prevents duplicate orders via server-side validation and idempotency keys.
 */
export async function placeOrderCOD(
  addressId: string,
  idempotencyKey?: string
): Promise<{ success: boolean; error?: string; orderId?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: "Authentication required to place order." };
  }

  const supabase = await createClient();

  // 0. Check for existing order with same idempotency key
  if (idempotencyKey) {
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id")
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingOrder?.id) {
      return { success: true, orderId: existingOrder.id };
    }
  }

  // 1. Fetch and validate selected address
  const { data: address, error: addrErr } = await supabase
    .from("addresses")
    .select("*")
    .eq("id", addressId)
    .eq("user_id", user.id)
    .single();

  if (addrErr || !address) {
    return { success: false, error: "Please select a valid delivery address." };
  }

  // 2. Fetch customer cart and calculate authoritative total
  const cart = await getCustomerCart();
  if (!cart || cart.items.length === 0) {
    return { success: false, error: "Your shopping cart is empty." };
  }

  // Check that all books are active and in stock
  for (const item of cart.items) {
    if (!item.isActive) {
      return { success: false, error: `"${item.title}" is no longer available.` };
    }
    if (item.stock < item.quantity) {
      return { success: false, error: `Insufficient stock for "${item.title}". Available: ${item.stock}.` };
    }
  }

  const addressSnapshot = {
    full_name: address.full_name,
    phone: address.phone,
    house_no: address.house_no,
    area: address.area,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    landmark: address.landmark,
    address_type: address.address_type,
  };

  const orderItemsPayload = cart.items.map((item) => ({
    book_id: item.bookId,
    quantity: item.quantity,
    price: item.price,
  }));

  // 3. Call atomic RPC: locks rows, validates stock, reduces inventory, clears cart
  const rpcParams: any = {
    p_user_id: user.id,
    p_items: orderItemsPayload,
    p_address_snapshot: addressSnapshot,
    p_payment_method: "COD",
    p_total_amount: cart.totalAmount,
  };
  if (idempotencyKey) {
    rpcParams.p_idempotency_key = idempotencyKey;
  }

  let { data: orderId, error: rpcErr } = await supabase.rpc("create_order_atomic", rpcParams);

  // Backward compatibility fallback if database procedure doesn't yet have p_idempotency_key
  if (rpcErr && rpcErr.message.includes("p_idempotency_key")) {
    const fallbackParams = {
      p_user_id: user.id,
      p_items: orderItemsPayload,
      p_address_snapshot: addressSnapshot,
      p_payment_method: "COD",
      p_total_amount: cart.totalAmount,
    };
    const fallbackRes = await supabase.rpc("create_order_atomic", fallbackParams);
    orderId = fallbackRes.data;
    rpcErr = fallbackRes.error;
    if (orderId && idempotencyKey) {
      // Record idempotency key directly on order
      await supabase.from("orders").update({ idempotency_key: idempotencyKey }).eq("id", orderId as string);
    }
  }

  if (rpcErr || !orderId) {
    console.error("Atomic order creation failed:", rpcErr?.message);
    return { success: false, error: rpcErr?.message || "Failed to create order." };
  }

  revalidatePath("/orders");
  revalidatePath("/cart");
  revalidatePath("/checkout");

  // Asynchronously dispatch order confirmation email (non-blocking)
  sendOrderEmails({
    orderId: orderId as string,
    userId: user.id,
    eventType: "order_confirmation",
  }).catch((e) => console.error("Async COD order email dispatch error:", e));

  return { success: true, orderId: orderId as string };
}

/**
 * Places an Online order atomically and initializes the Razorpay payment session.
 * Prevents duplicate orders via server-side validation and idempotency keys.
 */
export async function placeOrderOnline(
  addressId: string,
  idempotencyKey?: string
): Promise<{
  success: boolean;
  error?: string;
  orderId?: string;
  razorpayOrder?: CreatePaymentOrderResult;
}> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: "Authentication required to place order." };
  }

  const supabase = await createClient();

  // 0. Check for existing order with same idempotency key
  if (idempotencyKey) {
    const { data: existingOrder } = await supabase
      .from("orders")
      .select("id, razorpay_order_id, total_amount")
      .eq("user_id", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingOrder?.id) {
      if (existingOrder.razorpay_order_id) {
        return {
          success: true,
          orderId: existingOrder.id,
          razorpayOrder: {
            razorpayOrderId: existingOrder.razorpay_order_id,
            amount: Math.round(Number(existingOrder.total_amount) * 100),
            currency: "INR",
            keyId: process.env.RAZORPAY_KEY_ID || "",
            orderId: existingOrder.id,
          },
        };
      }
      return { success: true, orderId: existingOrder.id };
    }
  }

  // 1. Fetch and validate selected address
  const { data: address, error: addrErr } = await supabase
    .from("addresses")
    .select("*")
    .eq("id", addressId)
    .eq("user_id", user.id)
    .single();

  if (addrErr || !address) {
    return { success: false, error: "Please select a valid delivery address." };
  }

  // 2. Fetch customer cart and calculate authoritative total
  const cart = await getCustomerCart();
  if (!cart || cart.items.length === 0) {
    return { success: false, error: "Your shopping cart is empty." };
  }

  // Check that all books are active and in stock
  for (const item of cart.items) {
    if (!item.isActive) {
      return { success: false, error: `"${item.title}" is no longer available.` };
    }
    if (item.stock < item.quantity) {
      return { success: false, error: `Insufficient stock for "${item.title}". Available: ${item.stock}.` };
    }
  }

  const addressSnapshot = {
    full_name: address.full_name,
    phone: address.phone,
    house_no: address.house_no,
    area: address.area,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    landmark: address.landmark,
    address_type: address.address_type,
  };

  const orderItemsPayload = cart.items.map((item) => ({
    book_id: item.bookId,
    quantity: item.quantity,
    price: item.price,
  }));

  // 3. Call atomic RPC with ONLINE payment method
  const rpcParams: any = {
    p_user_id: user.id,
    p_items: orderItemsPayload,
    p_address_snapshot: addressSnapshot,
    p_payment_method: "ONLINE",
    p_total_amount: cart.totalAmount,
  };
  if (idempotencyKey) {
    rpcParams.p_idempotency_key = idempotencyKey;
  }

  let { data: orderId, error: rpcErr } = await supabase.rpc("create_order_atomic", rpcParams);

  // Backward compatibility fallback if database procedure doesn't yet have p_idempotency_key
  if (rpcErr && rpcErr.message.includes("p_idempotency_key")) {
    const fallbackParams = {
      p_user_id: user.id,
      p_items: orderItemsPayload,
      p_address_snapshot: addressSnapshot,
      p_payment_method: "ONLINE",
      p_total_amount: cart.totalAmount,
    };
    const fallbackRes = await supabase.rpc("create_order_atomic", fallbackParams);
    orderId = fallbackRes.data;
    rpcErr = fallbackRes.error;
    if (orderId && idempotencyKey) {
      await supabase.from("orders").update({ idempotency_key: idempotencyKey }).eq("id", orderId as string);
    }
  }

  if (rpcErr || !orderId) {
    console.error("Atomic online order creation failed:", rpcErr?.message);
    return { success: false, error: rpcErr?.message || "Failed to create order." };
  }

  // 4. Create Razorpay payment order
  let razorpayOrder: CreatePaymentOrderResult;
  try {
    razorpayOrder = await createRazorpayOrder(orderId as string, user.id);
  } catch (err: any) {
    console.error("Razorpay order creation error:", err?.message || err);
    return {
      success: false,
      error: `Order created (${orderId}) but payment initialization failed: ${err?.message || err}`,
      orderId: orderId as string,
    };
  }

  revalidatePath("/orders");
  revalidatePath("/cart");
  revalidatePath("/checkout");

  return {
    success: true,
    orderId: orderId as string,
    razorpayOrder,
  };
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
 */
export async function getCustomerOrderById(orderId: string): Promise<EnrichedOrder | null> {
  const user = await getAuthenticatedUser();
  if (!user) return null;

  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!orderId || !uuidRegex.test(orderId)) return null;

  const supabase = await createClient();

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (orderErr || !order) {
    return null;
  }

  const { data: items, error: itemsErr } = await supabase
    .from("order_items")
    .select("*")
    .eq("order_id", orderId);

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
 * Cancels an order atomically and restores inventory.
 */
export async function cancelOrder(orderId: string, reason: string): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const supabase = await createClient();

  const { data: success, error } = await supabase.rpc("cancel_order_atomic", {
    p_order_id: orderId,
    p_user_id: user.id,
    p_cancel_reason: reason || "Cancelled by customer",
    p_is_admin: false,
  });

  if (error || !success) {
    console.error("Error cancelling order:", error?.message);
    return { success: false, error: error?.message || "Unable to cancel order." };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");

  // Asynchronously dispatch cancellation email
  sendOrderEmails({
    orderId,
    userId: user.id,
    eventType: "order_cancellation",
    cancelReason: reason,
  }).catch((e) => console.error("Async cancel order email dispatch error:", e));

  return { success: true };
}

