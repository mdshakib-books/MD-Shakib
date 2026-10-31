import React from "react";
import Link from "next/link";
import { getAdminDashboardStats } from "@/lib/admin/dashboard";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const stats = await getAdminDashboardStats();

  const getOrderStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Delivered":
      case "Replacement Delivered":
        return "success";
      case "Confirmed":
      case "Packed":
      case "Shipped":
      case "Out for Delivery":
        return "gold";
      case "Cancelled":
      case "Replacement Rejected":
        return "danger";
      default:
        return "muted";
    }
  };

  const getPaymentStatusBadgeVariant = (status: string) => {
    switch (status) {
      case "Paid":
        return "success";
      case "Pending":
      case "Refund Pending":
        return "gold";
      case "Failed":
        return "danger";
      case "Refunded":
        return "muted";
      default:
        return "muted";
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Operations Dashboard
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Real-time catalog, inventory, order lifecycle, and customer activity metrics.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link
            href="/admin/books"
            className="px-3.5 py-2 bg-[#1A1A1A] hover:bg-[#222222] text-gray-200 border border-[#333333] rounded-lg text-xs sm:text-sm font-semibold transition shadow-sm"
          >
            + Add Title
          </Link>
          <Link
            href="/admin/inventory"
            className="px-3.5 py-2 bg-[#1A1A1A] hover:bg-[#222222] text-gray-200 border border-[#333333] rounded-lg text-xs sm:text-sm font-semibold transition shadow-sm"
          >
            Adjust Stock
          </Link>
          <Link
            href="/admin/orders"
            className="px-3.5 py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs sm:text-sm font-semibold transition shadow-sm"
          >
            Manage Orders
          </Link>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {/* Total Revenue */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Gross Revenue
            </span>
            <div className="w-8 h-8 rounded-full bg-emerald-950/60 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
              ₹
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3">
            {formatPrice(stats.totalRevenue)}
          </h2>
          <p className="text-xs text-emerald-400 mt-1 font-medium">
            From settled paid orders
          </p>
        </div>

        {/* Total Orders */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Total Orders
            </span>
            <div className="w-8 h-8 rounded-full bg-blue-950/60 border border-blue-500/20 flex items-center justify-center text-blue-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3">{stats.totalOrders}</h2>
          <p className="text-xs text-gray-400 mt-1">
            {stats.ordersByStatus["Pending"] || 0} pending fulfillment
          </p>
        </div>

        {/* Catalog Titles */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Catalog Titles
            </span>
            <div className="w-8 h-8 rounded-full bg-amber-950/60 border border-amber-500/20 flex items-center justify-center text-[var(--color-primary-gold,#C9A24A)]">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3">{stats.totalBooks}</h2>
          <p className="text-xs text-gray-400 mt-1">
            Across {stats.categoriesCount} categories
          </p>
        </div>

        {/* Registered Customers */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Customers
            </span>
            <div className="w-8 h-8 rounded-full bg-purple-950/60 border border-purple-500/20 flex items-center justify-center text-purple-400">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3">{stats.totalUsers}</h2>
          <p className="text-xs text-purple-400 mt-1 font-medium">Verified customer accounts</p>
        </div>
      </div>

      {/* Secondary Operational Status Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Low Stock Warning */}
        <Link
          href="/admin/inventory"
          className="bg-[#141414] hover:bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4 transition group"
        >
          <div className="text-xs font-medium text-gray-400">Low Stock Titles</div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-2xl font-bold ${stats.lowStockCount > 0 ? "text-amber-400" : "text-gray-300"}`}>
              {stats.lowStockCount}
            </span>
            <span className="text-xs text-gray-500 group-hover:text-gray-300 transition">View →</span>
          </div>
        </Link>

        {/* Out of Stock */}
        <Link
          href="/admin/inventory"
          className="bg-[#141414] hover:bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4 transition group"
        >
          <div className="text-xs font-medium text-gray-400">Out of Stock</div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-2xl font-bold ${stats.outOfStockCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {stats.outOfStockCount}
            </span>
            <span className="text-xs text-gray-500 group-hover:text-gray-300 transition">Inspect →</span>
          </div>
        </Link>

        {/* Pending Reviews */}
        <Link
          href="/admin/reviews"
          className="bg-[#141414] hover:bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4 transition group"
        >
          <div className="text-xs font-medium text-gray-400">Pending Reviews</div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-2xl font-bold ${stats.pendingReviewsCount > 0 ? "text-[var(--color-primary-gold,#C9A24A)]" : "text-gray-400"}`}>
              {stats.pendingReviewsCount}
            </span>
            <span className="text-xs text-gray-500 group-hover:text-gray-300 transition">Moderate →</span>
          </div>
        </Link>

        {/* Active Promotions */}
        <Link
          href="/admin/discounts"
          className="bg-[#141414] hover:bg-[#1A1A1A] border border-[#2A2A2A] rounded-xl p-4 transition group"
        >
          <div className="text-xs font-medium text-gray-400">Active Coupons</div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-blue-400">{stats.activeDiscountsCount}</span>
            <span className="text-xs text-gray-500 group-hover:text-gray-300 transition">Manage →</span>
          </div>
        </Link>
      </div>

      {/* Operational Alerts */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-400 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--color-primary-gold,#C9A24A)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Operational Intelligence Alerts
        </h3>
        <div className="space-y-2">
          {stats.alerts.map((alert, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg text-sm flex items-start gap-3 border ${
                alert.type === "warning"
                  ? "bg-amber-950/30 border-amber-800/40 text-amber-200"
                  : alert.type === "info"
                  ? "bg-blue-950/30 border-blue-800/40 text-blue-200"
                  : "bg-emerald-950/30 border-emerald-800/40 text-emerald-200"
              }`}
            >
              <span className="mt-0.5">•</span>
              <p className="flex-1">{alert.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        <div className="p-5 border-b border-[#2A2A2A] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Recent Customer Orders</h3>
            <p className="text-xs text-gray-400 mt-0.5">Authoritative real-time transaction ledger</p>
          </div>
          <Link
            href="/admin/orders"
            className="text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline font-semibold"
          >
            View All ({stats.totalOrders}) →
          </Link>
        </div>

        {stats.recentOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No customer orders recorded yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Order ID</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4">Amount</th>
                  <th className="py-3.5 px-4">Payment</th>
                  <th className="py-3.5 px-4">Order Status</th>
                  <th className="py-3.5 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {stats.recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#161616]/40 transition">
                    <td className="py-3.5 px-4 font-mono text-xs text-white">
                      #{order.id.slice(0, 8)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{order.customerName}</div>
                      <div className="text-xs text-gray-500">{order.customerEmail || "—"}</div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-400">
                      {new Date(order.createdAt).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[var(--color-primary-gold,#C9A24A)]">
                      {formatPrice(order.totalAmount)}
                    </td>
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-1.5">
                        <Badge variant={getPaymentStatusBadgeVariant(order.paymentStatus)}>
                          {order.paymentStatus}
                        </Badge>
                        <span className="text-[11px] text-gray-500 uppercase">{order.paymentMethod}</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={getOrderStatusBadgeVariant(order.orderStatus)}>
                        {order.orderStatus}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline font-semibold"
                      >
                        Details →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
