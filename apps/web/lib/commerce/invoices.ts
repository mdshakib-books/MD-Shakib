import { createAdminClient } from "@/lib/supabase/admin";
import { resolveAppEnvironment } from "@/lib/env/server";
import {
  getDevFallbackGstin,
  isValidProductionGstin,
  validateIndianGstin,
} from "@/lib/env/shared";
import { roundCurrency } from "@/lib/commerce/pricing";
import { checkOrderInvoiceEligibility } from "@/lib/commerce/tax";

export { checkOrderInvoiceEligibility };

export interface InvoiceRefundSummary {
  refundedAmount: number;
  netAmountAfterRefunds: number;
  orderStatus: string;
  paymentStatus: string;
}

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
  platform_fee: number;
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
  customer_gstin?: string | null;
  seller_state_code?: string;
  place_of_supply_code?: string;
  refundSummary?: InvoiceRefundSummary;
}

export interface InvoiceServiceOptions {
  adminDb?: any;
  customerGstin?: string | null;
  isProductionOverride?: boolean;
}

/**
 * Retrieves existing invoice or atomically snapshots and generates an authoritative invoice (2.10, 2.11, Phase 05).
 * Enforces order/payment eligibility, Indian GSTIN structure + mod-36 check digit, platform_fee accounting,
 * and post-issuance refund credit reconciliation without mutating existing tax invoices.
 */
export async function getOrCreateOrderInvoice(
  orderId: string,
  sellerGstin?: string,
  options: InvoiceServiceOptions = {}
): Promise<{
  success: boolean;
  invoice?: InvoiceData;
  error?: string;
  errorCode?: string;
  statusCode?: number;
}> {
  const adminDb = options.adminDb || createAdminClient();

  const { data: order, error: orderErr } = await adminDb
    .from("orders")
    .select(
      "id, order_status, payment_method, payment_status, is_paid, cod_collection_status, cod_settlement_status, customer_gstin, total_amount"
    )
    .eq("id", orderId)
    .maybeSingle();

  if (orderErr || !order) {
    return {
      success: false,
      error: "Order not found.",
      errorCode: "ORDER_NOT_FOUND",
      statusCode: 404,
    };
  }

  const attachRefundSummary = async (rawInvoice: any): Promise<InvoiceData> => {
    const inv = { ...rawInvoice } as InvoiceData;
    inv.platform_fee = Number(rawInvoice.platform_fee ?? 0);
    inv.seller_state_code =
      rawInvoice.seller_state_code || String(rawInvoice.seller_gstin || "07").slice(0, 2);
    inv.place_of_supply_code = rawInvoice.place_of_supply_code || "99";

    try {
      const { data: processedRefunds } = await adminDb
        .from("refund_records")
        .select("amount")
        .eq("order_id", orderId)
        .eq("status", "processed");

      const refundedAmount = roundCurrency(
        (processedRefunds || []).reduce((acc: number, r: any) => acc + Number(r.amount || 0), 0)
      );
      if (refundedAmount > 0 || order.payment_status === "Partially Refunded" || order.payment_status === "Refunded") {
        inv.refundSummary = {
          refundedAmount,
          netAmountAfterRefunds: Math.max(
            0,
            roundCurrency(Number(inv.grand_total) - refundedAmount)
          ),
          orderStatus: order.order_status,
          paymentStatus: order.payment_status,
        };
      }
    } catch {
      // Optional enrichment when table mocked
    }

    return inv;
  };

  // 1. Preserve existing immutable tax invoice cleanly (never overwrite)
  const { data: existing } = await adminDb
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .maybeSingle();

  if (existing) {
    return {
      success: true,
      invoice: await attachRefundSummary(existing),
    };
  }

  // 2. Enforce strict invoice eligibility before generation
  const eligibility = checkOrderInvoiceEligibility(order);
  if (!eligibility.eligible) {
    return {
      success: false,
      error: eligibility.reason || "Order is not eligible for tax invoice generation.",
      errorCode: eligibility.errorCode || "INVOICE_INELIGIBLE",
      statusCode: 409,
    };
  }

  // 3. Resolve & validate Seller GSTIN (format, jurisdiction code, mod-36 check digit, prod guard)
  const isProd =
    options.isProductionOverride !== undefined
      ? options.isProductionOverride
      : resolveAppEnvironment().isProduction;

  let effectiveGstin: string;
  if (sellerGstin !== undefined) {
    effectiveGstin = sellerGstin.trim().toUpperCase();
  } else if (process.env.BUSINESS_GSTIN) {
    effectiveGstin = process.env.BUSINESS_GSTIN.trim().toUpperCase();
  } else if (isProd) {
    return {
      success: false,
      errorCode: "INVALID_SELLER_GSTIN",
      statusCode: 422,
      error:
        "Valid 15-character seller GSTIN is required for statutory invoicing. Configure BUSINESS_GSTIN in production.",
    };
  } else {
    effectiveGstin = getDevFallbackGstin();
  }

  const sellerGstinValidation = validateIndianGstin(effectiveGstin);
  if (!sellerGstinValidation.valid || (isProd && !isValidProductionGstin(effectiveGstin))) {
    return {
      success: false,
      errorCode: "INVALID_SELLER_GSTIN",
      statusCode: isProd ? 422 : 400,
      error: isProd
        ? "Valid 15-character non-placeholder seller GSTIN with valid check digit is required in production."
        : `Invalid seller GSTIN: ${sellerGstinValidation.reason}`,
    };
  }

  // 4. Validate optional customer B2B GSTIN
  const rawCustomerGstin =
    options.customerGstin !== undefined ? options.customerGstin : order.customer_gstin;
  let cleanCustomerGstin: string | null = null;
  if (rawCustomerGstin && String(rawCustomerGstin).trim() !== "") {
    const custValidation = validateIndianGstin(String(rawCustomerGstin));
    if (!custValidation.valid) {
      return {
        success: false,
        errorCode: "INVALID_CUSTOMER_GSTIN",
        statusCode: 400,
        error: `Invalid customer GSTIN: ${custValidation.reason}`,
      };
    }
    cleanCustomerGstin = custValidation.normalized;
  }

  // 5. Generate atomically via PostgreSQL RPC
  const rpcArgs: Record<string, unknown> = {
    p_order_id: orderId,
    p_seller_gstin: sellerGstinValidation.normalized,
  };
  if (cleanCustomerGstin) {
    rpcArgs.p_customer_gstin = cleanCustomerGstin;
  }

  const { data: rpcRes, error: rpcErr } = await adminDb.rpc(
    "generate_order_invoice_atomic",
    rpcArgs
  );

  if (rpcErr || !(rpcRes as any)?.success) {
    const resObj = rpcRes as any;
    const errorCode = resObj?.error_code || "INVOICE_GENERATION_FAILED";
    const statusCode =
      errorCode === "ORDER_NOT_FOUND"
        ? 404
        : errorCode === "INVALID_SELLER_GSTIN" || errorCode === "INVALID_CUSTOMER_GSTIN"
        ? 400
        : errorCode.startsWith("INVOICE_")
        ? 409
        : 500;
    return {
      success: false,
      errorCode,
      statusCode,
      error: resObj?.error || rpcErr?.message || "Failed to generate invoice snapshot.",
    };
  }

  const { data: created, error: createErr } = await adminDb
    .from("invoices")
    .select("*")
    .eq("order_id", orderId)
    .single();

  if (createErr || !created) {
    return {
      success: false,
      errorCode: "INVOICE_RETRIEVAL_FAILED",
      statusCode: 500,
      error: "Invoice created but retrieval failed.",
    };
  }

  return {
    success: true,
    invoice: await attachRefundSummary(created),
  };
}

/**
 * Generates warehouse-ready packing slip document data (2.12).
 * Excludes sensitive payment details.
 */
export async function getOrderPackingSlip(
  orderId: string,
  options: { adminDb?: any } = {}
): Promise<{
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
  const adminDb = options.adminDb || createAdminClient();

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

  const bookIds = items?.map((i: any) => i.book_id) || [];
  const { data: books } =
    bookIds.length > 0
      ? await adminDb.from("books").select("id, sku").in("id", bookIds)
      : { data: [] };

  const skuMap = new Map((books || []).map((b: any) => [b.id, b.sku]));

  const packingItems = (items || []).map((item: any) => ({
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
      courier: order.shipping_courier || undefined,
      createdDate: new Date(order.created_at).toLocaleDateString("en-IN"),
    },
  };
}

/**
 * Retrieves payment receipt details (2.13).
 */
export async function getOrderPaymentReceipt(
  orderId: string,
  options: { adminDb?: any } = {}
): Promise<{
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
  const adminDb = options.adminDb || createAdminClient();

  const { data: order, error } = await adminDb
    .from("orders")
    .select(
      "id, order_number, total_amount, payment_status, payment_method, razorpay_payment_id, cod_settlement_ref, is_paid, paid_at, address_snapshot"
    )
    .eq("id", orderId)
    .single();

  if (error || !order) {
    return { success: false, error: "Order not found." };
  }

  const addr: any = order.address_snapshot || {};
  const isPaid =
    order.payment_status === "Paid" ||
    order.payment_status === "Partially Refunded" ||
    order.payment_status === "Refunded" ||
    order.is_paid === true;
  const paymentRef =
    order.razorpay_payment_id ||
    (order.payment_method === "COD"
      ? order.cod_settlement_ref || (isPaid ? "COD-COLLECTED" : "COD-PENDING-COLLECTION")
      : "TXN-NA");

  return {
    success: true,
    receipt: {
      orderNumber: order.order_number || order.id.slice(0, 8),
      orderId: order.id,
      paymentReference: paymentRef,
      provider: order.payment_method === "ONLINE" ? "Razorpay" : "Cash On Delivery",
      amount: Number(order.total_amount),
      currency: "INR",
      paymentDate: order.paid_at
        ? new Date(order.paid_at).toLocaleDateString("en-IN")
        : isPaid
        ? "Paid"
        : "Pending",
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
      customerName: addr.full_name || "Customer",
    },
  };
}

/**
 * Retrieves refund credit note details (2.14, Phase 05).
 */
export async function getOrderRefundCreditNote(
  refundRecordId: string,
  options: { adminDb?: any } = {}
): Promise<{
  success: boolean;
  creditNote?: {
    refundRecordId: string;
    orderId: string;
    orderNumber: string;
    gatewayRefundId: string;
    paymentChannel: string;
    payoutReference?: string;
    refundAmount: number;
    refundDate: string;
    refundStatus: string;
    reason: string;
    customerName: string;
    remainingRefundableBalance: number;
  };
  error?: string;
  statusCode?: number;
}> {
  const adminDb = options.adminDb || createAdminClient();

  const { data: refund, error } = await adminDb
    .from("refund_records")
    .select("*, orders(id, order_number, total_amount, address_snapshot)")
    .eq("id", refundRecordId)
    .single();

  if (error || !refund) {
    return { success: false, error: "Refund record not found.", statusCode: 404 };
  }

  if (refund.status === "failed") {
    return {
      success: false,
      error: "Credit note cannot be issued for a failed refund attempt.",
      statusCode: 409,
    };
  }

  const ord: any = refund.orders;
  const addr: any = ord?.address_snapshot || {};

  const { data: allRefunds } = await adminDb
    .from("refund_records")
    .select("amount")
    .eq("order_id", ord.id)
    .eq("status", "processed");

  const totalRefunded = roundCurrency(
    (allRefunds || []).reduce((acc: number, r: any) => acc + Number(r.amount || 0), 0)
  );
  const remaining = Math.max(0, roundCurrency(Number(ord.total_amount) - totalRefunded));

  return {
    success: true,
    creditNote: {
      refundRecordId: refund.id,
      orderId: ord.id,
      orderNumber: ord.order_number || ord.id.slice(0, 8),
      gatewayRefundId:
        refund.gateway_refund_id ||
        refund.payout_reference ||
        (refund.payment_channel === "cod_offline" ? "COD-OFFLINE-PENDING" : "PENDING_GATEWAY_SYNC"),
      paymentChannel: refund.payment_channel || "razorpay",
      payoutReference: refund.payout_reference || undefined,
      refundAmount: Number(refund.amount),
      refundDate: new Date(refund.processed_at || refund.created_at).toLocaleDateString("en-IN"),
      refundStatus: refund.status,
      reason: refund.reason,
      customerName: addr.full_name || "Customer",
      remainingRefundableBalance: remaining,
    },
  };
}
