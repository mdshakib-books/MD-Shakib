import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import type { Database } from "@/types/database.types";

export interface DashboardMetrics {
  totalRevenue: number;
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

/**
 * Fetches authoritative real-time metrics for the admin dashboard.
 * Requires active administrative credentials.
 */
export async function getAdminDashboardStats(): Promise<DashboardMetrics> {
  await requireAdmin();
  const supabase = await createClient();

  // 1. Fetch Orders summary (all orders for counting & revenue)
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("id, user_id, order_status, payment_status, payment_method, total_amount, address_snapshot, created_at")
    .order("created_at", { ascending: false });

  if (ordersError) {
    console.error("Error querying orders for admin dashboard:", ordersError.message);
    throw new Error(`Failed to load orders: ${ordersError.message}`);
  }

  const allOrders = orders || [];
  const totalOrders = allOrders.length;

  let totalRevenue = 0;
  const ordersByStatus: Record<string, number> = {};
  const ordersByPaymentStatus: Record<string, number> = {};

  for (const order of allOrders) {
    // Gross revenue includes all orders where payment is settled/paid
    if (order.payment_status === "Paid") {
      totalRevenue += Number(order.total_amount) || 0;
    }

    // Status counts
    const status = order.order_status || "Pending";
    ordersByStatus[status] = (ordersByStatus[status] || 0) + 1;

    // Payment status counts
    const pStatus = order.payment_status || "Pending";
    ordersByPaymentStatus[pStatus] = (ordersByPaymentStatus[pStatus] || 0) + 1;
  }

  // 2. Fetch Books summary
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("id, title, stock, is_active");

  if (booksError) {
    console.error("Error querying books for admin dashboard:", booksError.message);
    throw new Error(`Failed to load books: ${booksError.message}`);
  }

  const allBooks = books || [];
  const totalBooks = allBooks.length;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let inactiveBooksCount = 0;

  for (const book of allBooks) {
    if (book.stock === 0) {
      outOfStockCount++;
      lowStockCount++;
    } else if (book.stock <= 5) {
      lowStockCount++;
    }
    if (!book.is_active) {
      inactiveBooksCount++;
    }
  }

  // 3. Fetch Registered Users count
  const { count: usersCount, error: usersError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "user");

  if (usersError) {
    console.error("Error querying users for admin dashboard:", usersError.message);
  }

  const totalUsers = usersCount ?? 0;

  // 4. Fetch Pending Reviews count
  const { count: pendingReviews, error: revError } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  if (revError) {
    console.error("Error querying reviews count:", revError.message);
  }
  const pendingReviewsCount = pendingReviews ?? 0;

  // 5. Fetch Active Discounts count
  const { count: activeDiscounts, error: discError } = await supabase
    .from("discounts")
    .select("id", { count: "exact", head: true })
    .eq("is_active", true);

  if (discError) {
    console.error("Error querying discounts count:", discError.message);
  }
  const activeDiscountsCount = activeDiscounts ?? 0;

  // 6. Fetch Categories count
  const { count: catCount, error: catError } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true });

  if (catError) {
    console.error("Error querying categories count:", catError.message);
  }
  const categoriesCount = catCount ?? 0;

  // 7. Extract recent 5 orders with customer names
  const recentOrdersRaw = allOrders.slice(0, 5);
  const userIds = [...new Set(recentOrdersRaw.map((o) => o.user_id).filter(Boolean))];

  let profileMap: Record<string, { name: string; email: string }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, name, email")
      .in("id", userIds);

    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, { name: p.name || "Customer", email: p.email || "" }])
      );
    }
  }

  const recentOrders = recentOrdersRaw.map((order) => {
    let customerName = profileMap[order.user_id]?.name;
    const customerEmail = profileMap[order.user_id]?.email || "";

    if (!customerName && order.address_snapshot && typeof order.address_snapshot === "object") {
      const snap = order.address_snapshot as Record<string, any>;
      if (snap.full_name) customerName = snap.full_name;
    }

    return {
      id: order.id,
      customerName: customerName || "Customer",
      customerEmail,
      createdAt: order.created_at,
      totalAmount: Number(order.total_amount) || 0,
      orderStatus: order.order_status,
      paymentStatus: order.payment_status,
      paymentMethod: order.payment_method,
    };
  });

  // 8. Generate operational alerts
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
