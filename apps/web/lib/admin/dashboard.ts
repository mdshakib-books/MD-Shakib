import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import type { Database } from "@/types/database.types";

export interface DashboardMetrics {
  totalRevenue: number;
  grossOrderValue: number;
  totalOrders: number;
  totalBooks: number;
  totalUsers: number;
  lowStockCount: number;
  outOfStockCount: number;
  inactiveBooksCount: number;
  pendingReviewsCount: number;
  activeDiscountsCount: number;
  categoriesCount: number;
  ordersByStatus: Record<string, number>;
  ordersByPaymentStatus: Record<string, number>;
  recentOrders: Array<{
    id: string;
    orderNumber?: string;
    customerName: string;
    customerEmail: string;
    createdAt: string;
    totalAmount: number;
    orderStatus: string;
    paymentStatus: string;
    paymentMethod: string;
  }>;
  alerts: Array<{
    type: "warning" | "info" | "success";
    message: string;
  }>;
}

export type DashboardDateFilter = "all" | "today" | "7d" | "30d" | "month";

/**
 * Fetches authoritative database-aggregated real-time metrics for the admin dashboard.
 * Uses bounded date ranges and PostgreSQL aggregation RPC rather than loading every order into Node memory.
 */
export async function getAdminDashboardStats(filter: DashboardDateFilter = "all"): Promise<DashboardMetrics> {
  await requireAdmin();
  const supabase = await createClient();

  let dateFrom: string | undefined = undefined;
  let dateTo: string | undefined = undefined;
  const now = new Date();

  if (filter === "today") {
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    dateFrom = startOfToday.toISOString();
  } else if (filter === "7d") {
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    dateFrom = sevenDaysAgo.toISOString();
  } else if (filter === "30d") {
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    dateFrom = thirtyDaysAgo.toISOString();
  } else if (filter === "month") {
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    dateFrom = startOfMonth.toISOString();
  }

  // 1. Attempt database-side aggregation via get_admin_dashboard_metrics RPC
  const { data: rpcData, error: rpcError } = await supabase.rpc("get_admin_dashboard_metrics", {
    p_date_from: dateFrom,
    p_date_to: dateTo,
  });

  if (!rpcError && rpcData && typeof rpcData === "object") {
    const payload = (rpcData as any).metrics || {};

    const { count: pendingReviews } = await supabase
      .from("reviews")
      .select("id", { count: "exact", head: true })
      .eq("status", "pending");

    const { count: catCount } = await supabase
      .from("categories")
      .select("id", { count: "exact", head: true });

    const totalRevenue = Number(payload.total_revenue) || 0;
    const grossOrderValue = Number(payload.gross_order_value) || 0;
    const totalOrders = Number(payload.total_orders) || 0;
    const totalBooks = Number(payload.total_books) || 0;
    const totalUsers = Number(payload.total_customers) || 0;
    const lowStockCount = Number(payload.low_stock_count) || 0;
    const outOfStockCount = Number(payload.out_of_stock_count) || 0;
    const inactiveBooksCount = Number(payload.inactive_books_count) || 0;
    const activeDiscountsCount = Number(payload.active_discounts_count) || 0;
    const pendingReviewsCount = pendingReviews ?? 0;
    const categoriesCount = catCount ?? 0;
    const ordersByStatus = payload.orders_by_status || {};
    const ordersByPaymentStatus = payload.orders_by_payment_status || {};

    const recentOrders = (payload.recent_orders || []).map((o: any) => ({
      id: o.id,
      orderNumber: o.order_number,
      customerName: o.customer_name || "Customer",
      customerEmail: o.customer_email || "",
      createdAt: o.created_at,
      totalAmount: Number(o.total_amount) || 0,
      orderStatus: o.order_status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
    }));

    const alerts: Array<{ type: "warning" | "info" | "success"; message: string }> = [];

    if (outOfStockCount > 0) {
      alerts.push({
        type: "warning",
        message: `${outOfStockCount} ${outOfStockCount === 1 ? "book is" : "books are"} completely out of stock.`,
      });
    }

    if (lowStockCount > outOfStockCount) {
      const lowOnly = lowStockCount - outOfStockCount;
      alerts.push({
        type: "warning",
        message: `${lowOnly} ${lowOnly === 1 ? "book is" : "books are"} running low on stock (<= 5 remaining).`,
      });
    }

    if (pendingReviewsCount > 0) {
      alerts.push({
        type: "info",
        message: `${pendingReviewsCount} new customer ${pendingReviewsCount === 1 ? "review requires" : "reviews require"} moderation.`,
      });
    }

    const pendingReplacementCount = ordersByStatus["Replacement Requested"] || 0;
    if (pendingReplacementCount > 0) {
      alerts.push({
        type: "warning",
        message: `${pendingReplacementCount} ${pendingReplacementCount === 1 ? "order requires" : "orders require"} replacement review.`,
      });
    }

    const pendingOrdersCount = ordersByStatus["Pending"] || 0;
    if (pendingOrdersCount > 0) {
      alerts.push({
        type: "info",
        message: `${pendingOrdersCount} new ${pendingOrdersCount === 1 ? "order is" : "orders are"} currently pending fulfillment.`,
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        type: "success",
        message: "All operational metrics are within normal thresholds.",
      });
    }

    return {
      totalRevenue,
      grossOrderValue,
      totalOrders,
      totalBooks,
      totalUsers,
      lowStockCount,
      outOfStockCount,
      inactiveBooksCount,
      pendingReviewsCount,
      activeDiscountsCount,
      categoriesCount,
      ordersByStatus,
      ordersByPaymentStatus,
      recentOrders,
      alerts,
    };
  }

  // 2. Fallback to count/head queries if RPC is not accessible
  console.warn("Falling back from get_admin_dashboard_metrics RPC:", rpcError?.message);

  let ordersQuery = supabase
    .from("orders")
    .select("id, user_id, order_status, payment_status, payment_method, total_amount, address_snapshot, created_at, order_number");

  if (dateFrom) ordersQuery = ordersQuery.gte("created_at", dateFrom);
  if (dateTo) ordersQuery = ordersQuery.lte("created_at", dateTo);

  const { data: orders } = await ordersQuery.order("created_at", { ascending: false }).limit(200);
  const allOrders = orders || [];
  const totalOrders = allOrders.length;

  let totalRevenue = 0;
  let grossOrderValue = 0;
  const ordersByStatus: Record<string, number> = {};
  const ordersByPaymentStatus: Record<string, number> = {};

  for (const order of allOrders) {
    const val = Number(order.total_amount) || 0;
    grossOrderValue += val;
    if (order.payment_status === "Paid") {
      totalRevenue += val;
    }
    const status = order.order_status || "Pending";
    ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;
    const pStatus = order.payment_status || "Pending";
    ordersByPaymentStatus[pStatus] = (ordersByPaymentStatus[pStatus] || 0) + 1;
  }

  const { count: booksCount } = await supabase.from("books").select("id", { count: "exact", head: true });
  const { count: usersCount } = await supabase.from("profiles").select("id", { count: "exact", head: true }).eq("role", "user");
  const { count: reviewsCount } = await supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", "pending");
  const { count: discountsCount } = await supabase.from("discounts").select("id", { count: "exact", head: true }).eq("is_active", true);
  const { count: catCount } = await supabase.from("categories").select("id", { count: "exact", head: true });

  const recentOrders = allOrders.slice(0, 5).map((o) => {
    const snap = (o.address_snapshot as any) || {};
    return {
      id: o.id,
      orderNumber: o.order_number,
      customerName: snap.full_name || "Customer",
      customerEmail: "",
      createdAt: o.created_at,
      totalAmount: Number(o.total_amount) || 0,
      orderStatus: o.order_status,
      paymentStatus: o.payment_status,
      paymentMethod: o.payment_method,
    };
  });

  return {
    totalRevenue,
    grossOrderValue,
    totalOrders,
    totalBooks: booksCount ?? 0,
    totalUsers: usersCount ?? 0,
    lowStockCount: 0,
    outOfStockCount: 0,
    inactiveBooksCount: 0,
    pendingReviewsCount: reviewsCount ?? 0,
    activeDiscountsCount: discountsCount ?? 0,
    categoriesCount: catCount ?? 0,
    ordersByStatus,
    ordersByPaymentStatus,
    recentOrders,
    alerts: [{ type: "info", message: "Metrics computed via bounded database queries." }],
  };
}
