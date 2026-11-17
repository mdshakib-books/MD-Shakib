"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import {
  DISPATCHED_ORDER_STATUSES,
  FULFILLMENT_SHIPPING_STATUSES,
  ORDER_STATUS_TRANSITIONS,
} from "@/lib/admin/constants";
import { hasPermission } from "@/lib/admin/permissions";
import { updateAdminOrderStatus } from "@/lib/admin/orders";
import { AdminShipmentModal } from "@/components/admin/AdminShipmentModal";
import { AdminCancelOrderModal } from "@/components/admin/AdminCancelOrderModal";

interface AdminOrderSummary {
  id: string;
  order_number?: string | null;
  user_id: string;
  order_status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  shipping_courier: string | null;
  shipping_awb: string | null;
  shipping_booking_mode?: string | null;
  shipping_booking_status?: string | null;
  shipping_last_error?: string | null;
  shipping_tracking_url?: string | null;
  created_at: string;
  customerName: string;
  customerEmail: string;
  itemCount: number;
}

interface AdminOrdersClientProps {
  initialOrders: AdminOrderSummary[];
  total: number;
  currentPage: number;
  totalPages: number;
  currentStatus: string;
  currentPaymentStatus: string;
  currentPaymentMethod: string;
  currentSearch: string;
  delhiveryConfigured?: boolean;
  delhiveryMockMode?: boolean;
  userRole?: string;
}

export function AdminOrdersClient({
  initialOrders,
  total,
  currentPage,
  totalPages,
  currentStatus,
  currentPaymentStatus,
  currentPaymentMethod,
  currentSearch,
  delhiveryConfigured = false,
  delhiveryMockMode = false,
  userRole = "user",
}: AdminOrdersClientProps) {
  const delhiveryUnavailable = !delhiveryConfigured && !delhiveryMockMode;
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const canManageOrders = hasPermission(userRole, "orders.manage");
  const canShipOrders = hasPermission(userRole, "orders.ship");
  const canCancelPreDispatch = hasPermission(userRole, "orders.cancel");
  const canCancelDispatched = hasPermission(userRole, "orders.cancel_dispatched");

  // Filters & Search
  const [search, setSearch] = useState(currentSearch);
  const [statusFilter, setStatusFilter] = useState(currentStatus);
  const [paymentStatusFilter, setPaymentStatusFilter] = useState(currentPaymentStatus);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState(currentPaymentMethod);

  // Status transition state
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Cancel modal state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelTargetOrder, setCancelTargetOrder] = useState<AdminOrderSummary | null>(null);

  // Shipping modal state
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipTargetOrder, setShipTargetOrder] = useState<AdminOrderSummary | null>(null);

  const handleFilterSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const params = new URLSearchParams();
    if (statusFilter && statusFilter !== "ALL") params.set("status", statusFilter);
    if (paymentStatusFilter && paymentStatusFilter !== "ALL") params.set("paymentStatus", paymentStatusFilter);
    if (paymentMethodFilter && paymentMethodFilter !== "ALL") params.set("paymentMethod", paymentMethodFilter);
    if (search.trim()) params.set("search", search.trim());
    params.set("page", "1");

    startTransition(() => {
      router.push(`/admin/orders?${params.toString()}`);
    });
  };

  const handlePageChange = (newPage: number) => {
    const params = new URLSearchParams(window.location.search);
    params.set("page", newPage.toString());
    startTransition(() => {
      router.push(`/admin/orders?${params.toString()}`);
    });
  };

  const handleAdvanceStatus = async (order: AdminOrderSummary, nextStatus: string) => {
    setFeedback(null);

    // If next status is Shipped and shipment has not yet been entered/booked, open unified shipment modal
    if (
      nextStatus === "Shipped" &&
      !order.shipping_awb &&
      order.shipping_booking_mode !== "manual"
    ) {
      setShipTargetOrder(order);
      setShipModalOpen(true);
      return;
    }

    setBusyOrderId(order.id);
    try {
      const res = await updateAdminOrderStatus({
        orderId: order.id,
        nextStatus,
      });

      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to update status." });
      } else {
        setFeedback({
          type: "success",
          message: `Order #${order.order_number || order.id.slice(0, 8)} successfully updated to ${nextStatus}.`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Operation failed." });
    } finally {
      setBusyOrderId(null);
    }
  };

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
      case "Partially Refunded":
        return "gold";
      default:
        return "muted";
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Top Title Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Order Management
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Track, filter, and transition customer orders through the fulfillment lifecycle.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm text-gray-400">
            Showing <span className="font-semibold text-white">{initialOrders.length}</span> of{" "}
            <span className="font-semibold text-white">{total}</span> orders
          </div>
        </div>
      </div>

      {/* Delhivery Configuration Notice */}
      {delhiveryUnavailable && (
        <div className="p-4 rounded-xl border bg-amber-950/20 border-amber-500/30 text-xs text-amber-200 leading-relaxed">
          <span className="font-semibold text-amber-300">Delhivery is not configured on this server.</span>{" "}
          Automated Delhivery AWB booking, pickup requests, and shipping labels are disabled; manual order lifecycle management remains active.
        </div>
      )}

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`p-4 rounded-xl border text-sm flex items-center justify-between ${
            feedback.type === "success"
              ? "bg-emerald-950/20 border-emerald-500/40 text-emerald-300"
              : "bg-red-950/20 border-red-500/40 text-red-300"
          }`}
        >
          <span>{feedback.message}</span>
          <button
            onClick={() => setFeedback(null)}
            className="p-1 text-neutral-400 hover:text-white rounded ml-4 transition"
            aria-label="Dismiss message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Search and Filters Bar */}
      <form
        onSubmit={handleFilterSubmit}
        className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 sm:p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3"
      >
        <div className="lg:col-span-2">
          <input
            type="text"
            placeholder="Search by Order ID or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-[#161616] border border-[#262626] rounded-lg px-3.5 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          />
        </div>

        <div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full bg-[#161616] border border-[#262626] rounded-lg px-3.5 py-2 text-sm text-gray-300 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          >
            <option value="ALL">All Order Statuses</option>
            <option value="Pending">Pending</option>
            <option value="Confirmed">Confirmed</option>
            <option value="Processing">Processing</option>
            <option value="Packed">Packed</option>
            <option value="Shipped">Shipped</option>
            <option value="Out for Delivery">Out for Delivery</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        </div>

        <div>
          <select
            value={paymentStatusFilter}
            onChange={(e) => setPaymentStatusFilter(e.target.value)}
            className="w-full bg-[#161616] border border-[#262626] rounded-lg px-3.5 py-2 text-sm text-gray-300 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          >
            <option value="ALL">All Payment Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Pending">Pending</option>
            <option value="Failed">Failed</option>
            <option value="Refunded">Refunded</option>
          </select>
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isPending}
            className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg px-4 py-2 text-sm font-medium transition disabled:opacity-50"
          >
            {isPending ? "Filtering..." : "Filter"}
          </button>
          {(statusFilter !== "ALL" ||
            paymentStatusFilter !== "ALL" ||
            paymentMethodFilter !== "ALL" ||
            search) && (
            <button
              type="button"
              onClick={() => {
                setSearch("");
                setStatusFilter("ALL");
                setPaymentStatusFilter("ALL");
                setPaymentMethodFilter("ALL");
                router.push("/admin/orders");
              }}
              className="px-3 py-2 bg-[#222222] hover:bg-[#2A2A2A] text-gray-300 rounded-lg text-sm transition"
              title="Reset filters"
            >
              Reset
            </button>
          )}
        </div>
      </form>

      {/* Orders Table */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {initialOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-base font-semibold text-white">No orders found</p>
            <p className="text-sm text-gray-500 mt-1">
              Try adjusting your search criteria or status filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Order ID</th>
                  <th className="py-3.5 px-4">Customer</th>
                  <th className="py-3.5 px-4">Items & Amount</th>
                  <th className="py-3.5 px-4">Payment</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Lifecycle Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {initialOrders.map((order) => {
                  const allowed = ORDER_STATUS_TRANSITIONS[order.order_status] || [];
                  const isBusy = busyOrderId === order.id;

                  // Next primary status respecting caller role permissions
                  const primaryNext = allowed.find((s) => {
                    if (s === "Cancelled") return false;
                    return FULFILLMENT_SHIPPING_STATUSES.has(s) ? canShipOrders : canManageOrders;
                  });
                  const canOpenShipModal =
                    canShipOrders &&
                    allowed.includes("Shipped") &&
                    !order.shipping_awb &&
                    order.shipping_booking_mode !== "manual" &&
                    primaryNext !== "Shipped";

                  const isDispatched = DISPATCHED_ORDER_STATUSES.has(order.order_status);
                  const canCancel = isDispatched
                    ? canCancelDispatched
                    : allowed.includes("Cancelled") && canCancelPreDispatch;

                  return (
                    <tr key={order.id} className="hover:bg-[#161616]/50 transition">
                      {/* Order ID & Date */}
                      <td className="py-4 px-4 align-top">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-mono text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline font-semibold block"
                        >
                          {order.order_number || `${order.id.slice(0, 8)}...`}
                        </Link>
                        <span className="text-[11px] text-gray-500 block mt-0.5">
                          {new Date(order.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      </td>

                      {/* Customer */}
                      <td className="py-4 px-4 align-top">
                        <div className="font-medium text-white text-sm">
                          {order.customerName}
                        </div>
                        {order.customerEmail && (
                          <div className="text-[11px] text-gray-500 truncate max-w-[180px]">
                            {order.customerEmail}
                          </div>
                        )}
                      </td>

                      {/* Items & Total */}
                      <td className="py-4 px-4 align-top">
                        <div className="font-semibold text-white">
                          {formatPrice(order.total_amount)}
                        </div>
                        <div className="text-[11px] text-gray-500">
                          {order.itemCount} {order.itemCount === 1 ? "item" : "items"}
                        </div>
                      </td>

                      {/* Payment */}
                      <td className="py-4 px-4 align-top">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant={getPaymentStatusBadgeVariant(order.payment_status)}>
                            {order.payment_status}
                          </Badge>
                          <span className="text-[11px] text-gray-400 font-mono">
                            {order.payment_method}
                          </span>
                        </div>
                      </td>

                      {/* Status & Shipment Summary */}
                      <td className="py-4 px-4 align-top">
                        <Badge variant={getOrderStatusBadgeVariant(order.order_status)}>
                          {order.order_status}
                        </Badge>
                        {order.shipping_courier && (
                          <div className="text-[10px] text-gray-400 mt-1">
                            {order.shipping_courier}
                            {order.shipping_booking_mode ? ` (${order.shipping_booking_mode})` : ""}
                          </div>
                        )}
                        {order.shipping_awb && (
                          <div className="text-[10px] text-gray-500 font-mono">
                            AWB: {order.shipping_awb}
                          </div>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-4 px-4 align-top text-right">
                        <div className="flex items-center justify-end gap-2 flex-wrap">
                          {/* Primary Transition Button */}
                          {primaryNext && (
                            <button
                              onClick={() => handleAdvanceStatus(order, primaryNext)}
                              disabled={isBusy}
                              className="px-2.5 py-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 text-white rounded transition disabled:opacity-50"
                            >
                              {isBusy ? "..." : `→ ${primaryNext}`}
                            </button>
                          )}

                          {/* Fulfill / Ship Order CTA */}
                          {canOpenShipModal && (
                            <button
                              onClick={() => {
                                setShipTargetOrder(order);
                                setShipModalOpen(true);
                              }}
                              disabled={isBusy}
                              className="px-2.5 py-1 text-xs font-medium bg-[#C9A24A] hover:bg-[#B89139] text-black rounded transition disabled:opacity-50"
                            >
                              Ship
                            </button>
                          )}

                          {/* Cancel Button */}
                          {canCancel && (
                            <button
                              onClick={() => {
                                setCancelTargetOrder(order);
                                setCancelModalOpen(true);
                              }}
                              disabled={isBusy}
                              className="px-2.5 py-1 text-xs font-medium bg-red-950/60 hover:bg-red-900 border border-red-700/50 text-red-300 rounded transition disabled:opacity-50"
                            >
                              {isDispatched ? "Cancel (Courier)" : "Cancel"}
                            </button>
                          )}

                          {/* View Detail Link */}
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="px-2.5 py-1 text-xs font-medium bg-[#1F1F1F] hover:bg-[#282828] text-gray-300 border border-[#2D2D2D] rounded transition"
                          >
                            Inspect
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[#2A2A2A] flex items-center justify-between bg-[#141414]">
            <p className="text-xs text-gray-400">
              Page <span className="font-bold text-white">{currentPage}</span> of{" "}
              <span className="font-bold text-white">{totalPages}</span>
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1 || isPending}
                className="px-3 py-1.5 rounded bg-[#1F1F1F] text-xs font-medium text-gray-300 hover:text-white disabled:opacity-40 disabled:hover:text-gray-300 border border-[#2D2D2D]"
              >
                Previous
              </button>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages || isPending}
                className="px-3 py-1.5 rounded bg-[#1F1F1F] text-xs font-medium text-gray-300 hover:text-white disabled:opacity-40 disabled:hover:text-gray-300 border border-[#2D2D2D]"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Unified Shipment Modal (Delhivery API vs Manual Entry) */}
      <AdminShipmentModal
        isOpen={shipModalOpen}
        onClose={() => {
          setShipModalOpen(false);
          setShipTargetOrder(null);
        }}
        order={shipTargetOrder}
        delhiveryConfigured={delhiveryConfigured}
        delhiveryMockMode={delhiveryMockMode}
        onSuccess={(message) => {
          setFeedback({ type: "success", message });
          router.refresh();
        }}
        onError={(message) => setFeedback({ type: "error", message })}
      />

      {/* Unified Cancellation Modal (Pre-dispatch vs Courier-Confirmed Dispatched) */}
      <AdminCancelOrderModal
        isOpen={cancelModalOpen}
        onClose={() => {
          setCancelModalOpen(false);
          setCancelTargetOrder(null);
        }}
        order={cancelTargetOrder}
        onSuccess={(message) => {
          setFeedback({ type: "success", message });
          router.refresh();
        }}
        onError={(message, orderCancelled) => {
          setFeedback({ type: "error", message });
          if (orderCancelled) router.refresh();
        }}
      />
    </div>
  );
}
