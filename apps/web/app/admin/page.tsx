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
            Real-time catalog, order lifecycle, and customer activity metrics.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/admin/orders"
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition shadow-sm"
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
          <p className="text-xs text-gray-500 mt-1">Paid / Settled orders only</p>
        </div>

        {/* Total Orders */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Total Orders
            </span>
            <div className="w-8 h-8 rounded-full bg-amber-950/60 border border-amber-500/20 flex items-center justify-center text-amber-400">
              📦
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3">
            {stats.totalOrders}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {stats.ordersByStatus["Pending"] || 0} pending action
          </p>
        </div>

        {/* Total Books */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Catalog Titles
            </span>
            <div className="w-8 h-8 rounded-full bg-blue-950/60 border border-blue-500/20 flex items-center justify-center text-blue-400">
              📚
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3">
            {stats.totalBooks}
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {stats.lowStockCount} low stock (≤ 5)
          </p>
        </div>

        {/* Registered Users */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">
              Customer Accounts
            </span>
            <div className="w-8 h-8 rounded-full bg-purple-950/60 border border-purple-500/20 flex items-center justify-center text-purple-400">
              👥
            </div>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-white mt-3">
            {stats.totalUsers}
          </h2>
          <p className="text-xs text-gray-500 mt-1">Active customer profiles</p>
        </div>
      </div>

      {/* Operational Alerts */}
      {stats.alerts.length > 0 && (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4 flex items-center gap-2">
            <span>Operational Alerts</span>
          </h3>
          <div className="space-y-2.5">
            {stats.alerts.map((alert, idx) => (
              <div
                key={idx}
                className={`flex items-center gap-3 p-3 rounded-lg border text-sm ${
                  alert.type === "warning"
                    ? "bg-amber-950/20 border-amber-500/30 text-amber-300"
                    : alert.type === "info"
                    ? "bg-blue-950/20 border-blue-500/30 text-blue-300"
                    : "bg-emerald-950/20 border-emerald-500/30 text-emerald-300"
                }`}
              >
                <span>
                  {alert.type === "warning" ? "⚠️" : alert.type === "info" ? "ℹ️" : "✅"}
                </span>
                <span>{alert.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Order Status Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">
            Orders by Lifecycle Status
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[
              "Pending",
              "Confirmed",
              "Packed",
              "Shipped",
              "Out for Delivery",
              "Delivered",
              "Cancelled",
              "Replacement Requested",
            ].map((status) => {
              const count = stats.ordersByStatus[status] || 0;
              return (
                <div
                  key={status}
                  className="p-3 bg-[#161616] border border-[#262626] rounded-lg"
                >
                  <p className="text-xs text-gray-400 truncate">{status}</p>
                  <p className="text-xl font-bold text-white mt-1">{count}</p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 sm:p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-4">
            Orders by Payment Settlement
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {["Paid", "Pending", "Refund Pending", "Failed", "Refunded"].map((pStatus) => {
              const count = stats.ordersByPaymentStatus[pStatus] || 0;
              return (
                <div
                  key={pStatus}
                  className="p-3 bg-[#161616] border border-[#262626] rounded-lg"
                >
                  <p className="text-xs text-gray-400">{pStatus}</p>
                  <p className="text-xl font-bold text-white mt-1">{count}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-[#2A2A2A] flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-white">Recent Orders</h3>
            <p className="text-xs text-gray-400 mt-0.5">Latest transactions from customer purchases</p>
          </div>
          <Link
            href="/admin/orders"
            className="text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline font-medium"
          >
            View All Orders →
          </Link>
        </div>

        {stats.recentOrders.length === 0 ? (
          <div className="p-8 text-center text-gray-500 text-sm">
            No orders placed yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3 px-4">Order ID</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Total</th>
                  <th className="py-3 px-4">Payment</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {stats.recentOrders.map((order) => (
                  <tr key={order.id} className="hover:bg-[#161616]/60 transition">
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-300">
                      {order.id.slice(0, 8)}...
                    </td>
                    <td className="py-3.5 px-4 font-medium text-white">
                      <div>{order.customerName}</div>
                      {order.customerEmail && (
                        <div className="text-[11px] text-gray-500 font-normal">
                          {order.customerEmail}
                        </div>
                      )}
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
                        <span className="text-[10px] text-gray-500 uppercase">
                          ({order.paymentMethod})
                        </span>
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
                        className="text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline font-medium"
                      >
                        Details
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

