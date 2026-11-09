import React from "react";
import Link from "next/link";
import { getAdminDashboardStats } from "@/lib/admin/dashboard";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AdminMetricCard } from "@/components/ui/AdminMetricCard";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ dateRange?: string }>;
}) {
  const resolvedParams = searchParams ? await searchParams : {};
  const filter = (resolvedParams.dateRange || "all") as any;
  const stats = await getAdminDashboardStats(filter);

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
    <div className="space-y-8 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-dark-border pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif uppercase">
            Operations Dashboard
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 mt-1">
            Real-time catalog, inventory, order lifecycle, and customer activity metrics.
          </p>

          {/* Date Range Filters */}
          <div className="flex items-center gap-1.5 mt-3 pt-2">
            {[
              { label: "All Time", value: "all" },
              { label: "Today", value: "today" },
              { label: "Last 7 Days", value: "7d" },
              { label: "Last 30 Days", value: "30d" },
              { label: "This Month", value: "month" },
            ].map((f) => (
              <Link
                key={f.value}
                href={f.value === "all" ? "/admin/dashboard" : `/admin/dashboard?dateRange=${f.value}`}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${
                  filter === f.value
                    ? "bg-[#C9A24A] text-black font-bold border-[#C9A24A]"
                    : "bg-[#141414] text-neutral-400 border-[#262626] hover:border-neutral-500"
                }`}
              >
                {f.label}
              </Link>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <Link href="/admin/books">
            <Button variant="secondary" size="sm">
              + Add Title
            </Button>
          </Link>
          <Link href="/admin/inventory">
            <Button variant="secondary" size="sm">
              Adjust Stock
            </Button>
          </Link>
          <Link href="/admin/orders">
            <Button variant="primary" size="sm">
              Manage Orders
            </Button>
          </Link>
        </div>
      </div>

      {/* Primary KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <AdminMetricCard
          title="Gross Revenue"
          value={formatPrice(stats.totalRevenue)}
          subtitle="From settled paid orders"
          iconVariant="emerald"
          icon="₹"
        />

        <AdminMetricCard
          title="Total Orders"
          value={stats.totalOrders}
          subtitle={`${stats.ordersByStatus["Pending"] || 0} pending fulfillment`}
          iconVariant="blue"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
            </svg>
          }
        />

        <AdminMetricCard
          title="Catalog Titles"
          value={stats.totalBooks}
          subtitle={`Across ${stats.categoriesCount} categories`}
          iconVariant="gold"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          }
        />

        <AdminMetricCard
          title="Customers"
          value={stats.totalUsers}
          subtitle="Verified customer accounts"
          iconVariant="purple"
          icon={
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        />
      </div>

      {/* Secondary Operational Status Widgets */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Low Stock Warning */}
        <Link
          href="/admin/inventory"
          className="bg-dark-surface hover:bg-dark-card border border-dark-border rounded-xl p-4 transition-all duration-200 group shadow-luxury"
        >
          <div className="text-xs font-medium text-neutral-400">Low Stock Titles</div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-2xl font-bold ${stats.lowStockCount > 0 ? "text-amber-400" : "text-neutral-300"}`}>
              {stats.lowStockCount}
            </span>
            <span className="text-xs text-neutral-500 group-hover:text-[var(--color-primary-gold)] transition">View &rarr;</span>
          </div>
        </Link>

        {/* Out of Stock */}
        <Link
          href="/admin/inventory"
          className="bg-dark-surface hover:bg-dark-card border border-dark-border rounded-xl p-4 transition-all duration-200 group shadow-luxury"
        >
          <div className="text-xs font-medium text-neutral-400">Out of Stock</div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-2xl font-bold ${stats.outOfStockCount > 0 ? "text-red-400" : "text-emerald-400"}`}>
              {stats.outOfStockCount}
            </span>
            <span className="text-xs text-neutral-500 group-hover:text-[var(--color-primary-gold)] transition">Inspect &rarr;</span>
          </div>
        </Link>

        {/* Pending Reviews */}
        <Link
          href="/admin/reviews"
          className="bg-dark-surface hover:bg-dark-card border border-dark-border rounded-xl p-4 transition-all duration-200 group shadow-luxury"
        >
          <div className="text-xs font-medium text-neutral-400">Pending Reviews</div>
          <div className="flex items-center justify-between mt-2">
            <span className={`text-2xl font-bold ${stats.pendingReviewsCount > 0 ? "text-[var(--color-primary-gold)]" : "text-neutral-400"}`}>
              {stats.pendingReviewsCount}
            </span>
            <span className="text-xs text-neutral-500 group-hover:text-[var(--color-primary-gold)] transition">Moderate &rarr;</span>
          </div>
        </Link>

        {/* Active Promotions */}
        <Link
          href="/admin/discounts"
          className="bg-dark-surface hover:bg-dark-card border border-dark-border rounded-xl p-4 transition-all duration-200 group shadow-luxury"
        >
          <div className="text-xs font-medium text-neutral-400">Active Coupons</div>
          <div className="flex items-center justify-between mt-2">
            <span className="text-2xl font-bold text-blue-400">{stats.activeDiscountsCount}</span>
            <span className="text-xs text-neutral-500 group-hover:text-[var(--color-primary-gold)] transition">Manage &rarr;</span>
          </div>
        </Link>
      </div>

      {/* Operational Alerts */}
      <div className="bg-dark-surface border border-dark-border rounded-xl p-5 shadow-luxury">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400 mb-3 flex items-center gap-2">
          <svg className="w-4 h-4 text-[var(--color-primary-gold)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Operational Intelligence Alerts
        </h3>
        <div className="space-y-2">
          {stats.alerts.map((alert, index) => (
            <div
              key={index}
              className={`p-3 rounded-lg text-xs flex items-start gap-3 border ${
                alert.type === "warning"
                  ? "bg-amber-950/20 border-amber-800/30 text-amber-200"
                  : alert.type === "info"
                  ? "bg-blue-950/20 border-blue-800/30 text-blue-200"
                  : "bg-emerald-950/20 border-emerald-800/30 text-emerald-200"
              }`}
            >
              <span className="mt-0.5">•</span>
              <p className="flex-1">{alert.message}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Orders Section */}
      <div className="bg-dark-surface border border-dark-border rounded-xl overflow-hidden shadow-luxury">
        <div className="p-5 border-b border-dark-border flex items-center justify-between">
          <div>
            <h3 className="text-base font-serif font-bold text-white">Recent Customer Orders</h3>
            <p className="text-xs text-neutral-400 mt-0.5">Authoritative real-time transaction ledger</p>
          </div>
          <Link
            href="/admin/orders"
            className="text-xs text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] font-semibold inline-flex items-center gap-1"
          >
            View All ({stats.totalOrders}) &rarr;
          </Link>
        </div>

        {stats.recentOrders.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">No customer orders recorded yet.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Order Status</TableHead>
                <TableHead align="right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {stats.recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-xs text-white">
                    {order.orderNumber || `#${order.id.slice(0, 8).toUpperCase()}`}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium text-white">{order.customerName}</div>
                    <div className="text-[11px] text-neutral-500">{order.customerEmail || "—"}</div>
                  </TableCell>
                  <TableCell className="text-xs text-neutral-400">
                    {new Date(order.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </TableCell>
                  <TableCell className="font-mono font-semibold text-[var(--color-primary-gold)]">
                    {formatPrice(order.totalAmount)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1.5">
                      <Badge variant={getPaymentStatusBadgeVariant(order.paymentStatus)}>
                        {order.paymentStatus}
                      </Badge>
                      <span className="text-[10px] text-neutral-500 uppercase font-mono">{order.paymentMethod}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={getOrderStatusBadgeVariant(order.orderStatus)}>
                      {order.orderStatus}
                    </Badge>
                  </TableCell>
                  <TableCell align="right">
                    <Link
                      href={`/admin/orders/${order.id}`}
                      className="text-xs text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] font-semibold"
                    >
                      Details &rarr;
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
