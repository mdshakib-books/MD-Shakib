"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import type { Database } from "@/types/database.types";

export type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];

export interface CustomerPaymentItem {
  id: string;
  orderId: string;
  paymentId: string;
  provider: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  refundStatus: string | null;
  refundAmount: number | null;
  refundedAt: string | null;
  createdAt: string;
  orderStatus?: string;
  paymentMethod?: string;
}

export interface CustomerRefundItem {
  orderId: string;
  refundId: string | null;
  amount: number;
  status: "pending" | "processed" | "failed" | string;
  paymentStatus: string;
  orderStatus: string;
  refundedAt: string | null;
  createdAt: string;
  paymentMethod: string;
}

/**
 * Retrieves payment history records for the authenticated customer.
 * Enforces strict user isolation and sanitizes third-party gateway payloads.
 */
export async function getCustomerPayments(): Promise<CustomerPaymentItem[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();

  // Fetch payments for this user only
  const { data: payments, error } = await supabase
    .from("payments")
    .select(`
      id,
      order_id,
      payment_id,
      provider,
      provider_order_id,
      provider_payment_id,
      amount,
      currency,
      status,
      refund_status,
      refund_amount,
      refunded_at,
      created_at
    `)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !payments) {
    console.error("Error fetching customer payments:", error?.message);
    return [];
  }

  // Fetch linked order metadata for display
  const orderIds = Array.from(new Set(payments.map((p) => p.order_id).filter(Boolean)));
  const orderMap = new Map<string, { order_status: string; payment_method: string }>();

  if (orderIds.length > 0) {
    const { data: orders } = await supabase
      .from("orders")
      .select("id, order_status, payment_method")
      .in("id", orderIds);

    if (orders) {
      for (const ord of orders) {
        orderMap.set(ord.id, {
          order_status: ord.order_status,
          payment_method: ord.payment_method,
        });
      }
    }
  }

  return payments.map((p) => {
    const ord = orderMap.get(p.order_id);
    return {
      id: p.id,
      orderId: p.order_id,
      paymentId: p.payment_id,
      provider: p.provider,
      providerOrderId: p.provider_order_id,
      providerPaymentId: p.provider_payment_id,
      amount: Number(p.amount),
      currency: p.currency,
      status: p.status,
      refundStatus: p.refund_status,
      refundAmount: p.refund_amount ? Number(p.refund_amount) : null,
      refundedAt: p.refunded_at,
      createdAt: p.created_at,
      orderStatus: ord?.order_status,
      paymentMethod: ord?.payment_method,
    };
  });
}

/**
 * Retrieves real refund records for the authenticated customer.
 * Discloses truthful data persisted on orders and payments without simulation.
 */
export async function getCustomerRefunds(): Promise<CustomerRefundItem[]> {
  const user = await getAuthenticatedUser();
  if (!user) return [];

  const supabase = await createClient();

  // Query orders with refund activity
  const { data: orders, error: ordersErr } = await supabase
    .from("orders")
    .select(`
      id,
      total_amount,
      order_status,
      payment_status,
      payment_method,
      razorpay_refund_id,
      refund_amount,
      refund_status,
      refunded_at,
      created_at
    `)
    .eq("user_id", user.id)
    .or("refund_status.not.is.null,payment_status.in.(Refund Pending,Refunded),razorpay_refund_id.not.is.null")
    .order("created_at", { ascending: false });

  if (ordersErr || !orders) {
    console.error("Error fetching customer refunds:", ordersErr?.message);
    return [];
  }

  return orders.map((o) => ({
    orderId: o.id,
    refundId: o.razorpay_refund_id || null,
    amount: o.refund_amount ? Number(o.refund_amount) : Number(o.total_amount),
    status: o.refund_status || (o.payment_status === "Refunded" ? "processed" : "pending"),
    paymentStatus: o.payment_status,
    orderStatus: o.order_status,
    refundedAt: o.refunded_at,
    createdAt: o.created_at,
    paymentMethod: o.payment_method,
  }));
}

