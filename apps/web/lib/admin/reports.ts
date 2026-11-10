import { createAdminClient } from "@/lib/supabase/admin";

export interface SalesReportData {
  totalOrders: number;
  grossSales: number;
  totalDiscount: number;
  totalShipping: number;
  netSales: number;
  averageOrderValue: number;
  deliveredOrders: number;
  cancelledOrders: number;
  refundedOrders: number;
}

export interface PaymentReportData {
  prepaidCount: number;
  prepaidAmount: number;
  codCount: number;
  codAmount: number;
  codCollectedCount: number;
  codCollectedAmount: number;
  codPendingCount: number;
  refundedAmount: number;
}

export interface InventoryValuationData {
  totalStock: number;
  reservedStock: number;
  availableStock: number;
  lowStockCount: number;
  outOfStockCount: number;
}

/**
 * Executes authoritative SQL aggregation for sales KPIs over a time window (2.36).
 */
export async function getSalesReport(
  startDate?: string,
  endDate?: string
): Promise<SalesReportData> {
  const adminDb = createAdminClient();

  const startIso = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endIso = endDate || new Date().toISOString();

  const { data, error } = await adminDb.rpc("get_sales_report", {
    p_start_date: startIso,
    p_end_date: endIso,
  });

  if (error || !data) {
    throw new Error(`Failed to load sales report: ${error?.message}`);
  }

  const raw = data as any;
  return {
    totalOrders: Number(raw.total_orders || 0),
    grossSales: Number(raw.gross_sales || 0),
    totalDiscount: Number(raw.total_discount || 0),
    totalShipping: Number(raw.total_shipping || 0),
    netSales: Number(raw.net_sales || 0),
    averageOrderValue: Number(raw.average_order_value || 0),
    deliveredOrders: Number(raw.delivered_orders || 0),
    cancelledOrders: Number(raw.cancelled_orders || 0),
    refundedOrders: Number(raw.refunded_orders || 0),
  };
}

/**
 * Executes authoritative aggregation for payment breakdown & COD collection rates (2.37).
 */
export async function getPaymentReport(
  startDate?: string,
  endDate?: string
): Promise<PaymentReportData> {
  const adminDb = createAdminClient();

  const startIso = startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endIso = endDate || new Date().toISOString();

  const { data, error } = await adminDb.rpc("get_payment_report", {
    p_start_date: startIso,
    p_end_date: endIso,
  });

  if (error || !data) {
    throw new Error(`Failed to load payment report: ${error?.message}`);
  }

  const raw = data as any;
  return {
    prepaidCount: Number(raw.prepaid_count || 0),
    prepaidAmount: Number(raw.prepaid_amount || 0),
    codCount: Number(raw.cod_count || 0),
    codAmount: Number(raw.cod_amount || 0),
    codCollectedCount: Number(raw.cod_collected_count || 0),
    codCollectedAmount: Number(raw.cod_collected_amount || 0),
    codPendingCount: Number(raw.cod_pending_count || 0),
    refundedAmount: Number(raw.refunded_amount || 0),
  };
}

/**
 * Retrieves catalog inventory stock totals and availability metrics (2.38).
 */
export async function getInventoryValuationReport(): Promise<InventoryValuationData> {
  const adminDb = createAdminClient();

  const { data, error } = await adminDb.rpc("get_inventory_report");

  if (error || !data) {
    throw new Error(`Failed to load inventory report: ${error?.message}`);
  }

  const raw = data as any;
  return {
    totalStock: Number(raw.total_stock || 0),
    reservedStock: Number(raw.reserved_stock || 0),
    availableStock: Number(raw.available_stock || 0),
    lowStockCount: Number(raw.low_stock_count || 0),
    outOfStockCount: Number(raw.out_of_stock_count || 0),
  };
}

function escapeCsv(val: any): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Exports orders matching filter criteria into RFC 4180 CSV (2.34).
 */
export async function exportOrdersToCsv(params?: {
  startDate?: string;
  endDate?: string;
  orderStatus?: string;
  paymentStatus?: string;
}): Promise<string> {
  const adminDb = createAdminClient();

  let query = adminDb
    .from("orders")
    .select(`
      id,
      order_number,
      created_at,
      total_amount,
      subtotal,
      delivery_fee,
      discount_amount,
      order_status,
      payment_method,
      payment_status,
      shipping_courier,
      shipping_awb,
      address_snapshot,
      profiles (name, email, phone)
    `)
    .order("created_at", { ascending: false });

  if (params?.startDate) query = query.gte("created_at", params.startDate);
  if (params?.endDate) query = query.lte("created_at", params.endDate);
  if (params?.orderStatus && params.orderStatus !== "ALL") {
    query = query.eq("order_status", params.orderStatus);
  }
  if (params?.paymentStatus && params.paymentStatus !== "ALL") {
    query = query.eq("payment_status", params.paymentStatus);
  }

  const { data: orders, error } = await query;
  if (error || !orders) {
    throw new Error(`Failed to query orders for export: ${error?.message}`);
  }

  const headers = [
    "order_number",
    "date",
    "customer_name",
    "customer_email",
    "customer_phone",
    "status",
    "payment_method",
    "payment_status",
    "subtotal",
    "discount",
    "delivery_fee",
    "total_amount",
    "shipping_courier",
    "shipping_awb",
    "city",
    "state",
    "pincode",
  ];

  const lines = [headers.join(",")];

  for (const o of orders) {
    const prof: any = o.profiles || {};
    const addr: any = o.address_snapshot || {};

    const row = [
      escapeCsv(o.order_number),
      escapeCsv(o.created_at),
      escapeCsv(addr.full_name || prof.name || "Customer"),
      escapeCsv(prof.email || ""),
      escapeCsv(addr.phone || prof.phone || ""),
      escapeCsv(o.order_status),
      escapeCsv(o.payment_method),
      escapeCsv(o.payment_status),
      escapeCsv(o.subtotal),
      escapeCsv(o.discount_amount || 0),
      escapeCsv(o.delivery_fee || 0),
      escapeCsv(o.total_amount),
      escapeCsv(o.shipping_courier || "Delhivery"),
      escapeCsv(o.shipping_awb || ""),
      escapeCsv(addr.city || ""),
      escapeCsv(addr.state || ""),
      escapeCsv(addr.pincode || ""),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}

/**
 * Exports registered customers with order statistics into RFC 4180 CSV (2.35).
 */
export async function exportCustomersToCsv(): Promise<string> {
  const adminDb = createAdminClient();

  const { data: profiles, error } = await adminDb
    .from("profiles")
    .select(`
      id,
      name,
      email,
      phone,
      role,
      is_blocked,
      created_at
    `)
    .order("created_at", { ascending: false });

  if (error || !profiles) {
    throw new Error(`Failed to query customers for export: ${error?.message}`);
  }

  // Fetch orders aggregate for customer spend
  const { data: orders } = await adminDb
    .from("orders")
    .select("user_id, total_amount, order_status")
    .not("order_status", "eq", "Cancelled");

  const spendMap = new Map<string, { totalSpend: number; totalOrders: number }>();
  (orders || []).forEach((o) => {
    const prev = spendMap.get(o.user_id) || { totalSpend: 0, totalOrders: 0 };
    spendMap.set(o.user_id, {
      totalSpend: prev.totalSpend + Number(o.total_amount || 0),
      totalOrders: prev.totalOrders + 1,
    });
  });

  const headers = [
    "customer_id",
    "name",
    "email",
    "phone",
    "role",
    "is_blocked",
    "registered_date",
    "total_orders",
    "total_spend",
  ];

  const lines = [headers.join(",")];

  for (const p of profiles) {
    const stats = spendMap.get(p.id) || { totalSpend: 0, totalOrders: 0 };
    const row = [
      escapeCsv(p.id),
      escapeCsv(p.name),
      escapeCsv(p.email),
      escapeCsv(p.phone || ""),
      escapeCsv(p.role),
      escapeCsv(p.is_blocked ? "true" : "false"),
      escapeCsv(p.created_at),
      escapeCsv(stats.totalOrders),
      escapeCsv(stats.totalSpend.toFixed(2)),
    ];
    lines.push(row.join(","));
  }

  return lines.join("\n");
}
