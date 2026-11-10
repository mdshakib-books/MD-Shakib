import { createAdminClient } from "@/lib/supabase/admin";

export interface InvoiceData {
  id: string;
  order_id: string;
  invoice_number: string;
  invoice_date: string;
  billing_name: string;
  billing_address: any;
  shipping_address: any;
  items_snapshot: any[];
  subtotal: number;
  discount_amount: number;
  taxable_value: number;
  cgst_rate: number;
  cgst_amount: number;
  sgst_rate: number;
  sgst_amount: number;
  igst_rate: number;
  igst_amount: number;
  shipping_charges: number;
  grand_total: number;
  payment_method: string;
  payment_status: string;
  payment_reference: string | null;
  seller_gstin: string;
}

/**
 * Retrieves existing invoice or atomically snapshots and generates an authoritative invoice (2.10, 2.11).
 * Fails closed in production if BUSINESS_GSTIN is missing or configured as placeholder.
 */
export async function getOrCreateOrderInvoice(
  orderId: string,
  sellerGstin?: string
): Promise<{ success: boolean; invoice?: InvoiceData; error?: string }> {
  const adminDb = createAdminClient();

  // 1. Check if invoice already exists
  const { data: existing, error: existErr } = await adminDb
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (existing) {
    return { success: true, invoice: existing as unknown as InvoiceData };
  }

  // 2. Resolve and validate seller GSTIN
  let effectiveGstin: string;
  const isProd = process.env.NODE_ENV === "production";

  if (sellerGstin) {
    effectiveGstin = sellerGstin;
  } else if (process.env.BUSINESS_GSTIN) {
    effectiveGstin = process.env.BUSINESS_GSTIN;
  } else if (isProd) {
    return {
      success: false,
      error: "Valid 15-character seller GSTIN is required for statutory invoicing. Configure BUSINESS_GSTIN in production.",
    };
  } else {
    // Non-production test fallback with valid format
    effectiveGstin = "07AABCM1234F1Z5";
  }

  // If in production and configured with placeholder or invalid length, fail closed
  if (isProd && (effectiveGstin === "07AAAAA0000A1Z5" || effectiveGstin.length !== 15)) {
    return {
      success: false,
      error: "Valid 15-character seller GSTIN is required for statutory invoicing. Placeholder or invalid GSTINs are rejected.",
    };
  }

  // 3. Generate atomically via RPC
  const { data: rpcRes, error: rpcErr } = await adminDb.rpc("generate_order_invoice_atomic", {
    p_order_id: orderId,
    p_seller_gstin: effectiveGstin,
  });

  if (rpcErr || !(rpcRes as any)?.success) {
    return {
      success: false,
      error: (rpcRes as any)?.error || rpcErr?.message || "Failed to generate invoice snapshot.",
    };
  }

  // Retrieve newly created invoice
  const { data: created, error: createErr } = await adminDb
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .single();

  if (createErr || !created) {
    return { success: false, error: "Invoice created but retrieval failed." };
  }

  return { success: true, invoice: created as unknown as InvoiceData };
}

/**
 * Generates warehouse-ready packing slip document data (2.12).
 * Excludes sensitive payment details.
 */
export async function getOrderPackingSlip(orderId: string): Promise<{
  success: boolean;
  packingSlip?: {
    orderNumber: string;
    orderId: string;
    customerName: string;
    shippingAddress: any;
    items: { title: string; sku?: string; quantity: number }[];
    awb?: string;
    courier?: string;
    createdDate: string;
  };
  error?: string;
}> {
  const adminDb = createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, order_number, shipping_awb, shipping_courier, address_snapshot, created_at")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, error: "Order not found." };
  }

  const { data: items } = await adminDb
    .from("order_items")
    .select("title, quantity, book_id")
    .eq("order_id", orderId);

  // Fetch SKUs for books
  const bookIds = items?.map((i) => i.book_id) || [];
  const { data: books } = await adminDb
    .from("books")
    .select("id, sku")
    .in("id", bookIds);

  const skuMap = new Map((books || []).map((b) => [b.id, b.sku]));

  const packingItems = (items || []).map((item) => ({
    title: item.title,
    sku: skuMap.get(item.book_id) || "MDS-BOOK",
    quantity: item.quantity,
  }));

  const addr: any = order.address_snapshot || {};

  return {
    success: true,
    packingSlip: {
      orderNumber: order.order_number || order.id.slice(0, 8),
      orderId: order.id,
      customerName: addr.full_name || "Customer",
      shippingAddress: addr,
      items: packingItems,
      awb: order.shipping_awb || undefined,
      courier: order.shipping_courier || "Delhivery Express",
      createdDate: new Date(order.created_at).toLocaleDateString("en-IN"),
    },
  };
}

/**
 * Retrieves payment receipt details (2.13).
 */
export async function getOrderPaymentReceipt(orderId: string): Promise<{
  success: boolean;
  receipt?: {
    orderNumber: string;
    orderId: string;
    paymentReference: string;
    provider: string;
    amount: number;
    currency: string;
    paymentDate: string;
    paymentStatus: string;
    paymentMethod: string;
    customerName: string;
  };
  error?: string;
}> {
  const adminDb = createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select("id, order_number, total_amount, payment_status, payment_method, razorpay_payment_id, is_paid, paid_at, address_snapshot")
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, error: "Order not found." };
  }

  const addr: any = order.address_snapshot || {};

  // For COD: Payment date is paid_at or not collected
  const isPaid = order.payment_status === "Paid" || order.is_paid;
  const paymentRef = order.razorpay_payment_id || (order.payment_method === "COD" ? "COD-PENDING-COLLECTION" : "TXN-NA");

  return {
    success: true,
    receipt: {
      orderNumber: order.order_number || order.id.slice(0, 8),
      orderId: order.id,
      paymentReference: paymentRef,
      provider: order.payment_method === "ONLINE" ? "Razorpay" : "Cash On Delivery",
      amount: Number(order.total_amount),
      currency: "INR",
      paymentDate: order.paid_at ? new Date(order.paid_at).toLocaleDateString("en-IN") : isPaid ? "Paid" : "Pending",
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      customerName: addr.full_name || "Customer",
    },
  };
}

/**
 * Retrieves refund credit note details (2.14).
 */
export async function getOrderRefundCreditNote(refundRecordId: string): Promise<{
  success: boolean;
  creditNote?: {
    refundRecordId: string;
    orderId: string;
    orderNumber: string;
    gatewayRefundId: string;
    refundAmount: number;
    refundDate: string;
    refundStatus: string;
    reason: string;
    customerName: string;
    remainingRefundableBalance: number;
  };
  error?: string;
}> {
  const adminDb = createAdminClient();

  const { data: refund, error } = await adminDb
    .from("refund_records")
    .select("*, orders(id, order_number, total_amount, address_snapshot)")
    .eq("id", refundRecordId)
    .single();

  if (error || !refund) {
    return { success: false, error: "Refund record not found." };
  }

  const ord: any = refund.orders;
  const addr: any = ord?.address_snapshot || {};

  // Compute total processed refunds for order
  const { data: allRefunds } = await adminDb
    .from("refund_records")
    .select("amount")
    .eq("order_id", ord.id)
    .eq("status", "processed");

  const totalRefunded = (allRefunds || []).reduce((acc, r) => acc + Number(r.amount), 0);
  const remaining = Math.max(0, Number((Number(ord.total_amount) - totalRefunded).toFixed(2)));

  return {
    success: true,
    creditNote: {
      refundRecordId: refund.id,
      orderId: ord.id,
      orderNumber: ord.order_number || ord.id.slice(0, 8),
      gatewayRefundId: refund.gateway_refund_id || "PENDING_GATEWAY_SYNC",
      refundAmount: Number(refund.amount),
      refundDate: new Date(refund.created_at).toLocaleDateString("en-IN"),
      refundStatus: refund.status,
      reason: refund.reason,
      customerName: addr.full_name || "Customer",
      remainingRefundableBalance: remaining,
    },
  };
}
