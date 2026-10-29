"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { ORDER_STATUS_TRANSITIONS } from "@/lib/admin/constants";
import {
  updateAdminOrderStatus,
  cancelAdminOrder,
} from "@/lib/admin/orders";

interface AdminOrderSummary {
  id: string;
  user_id: string;
  order_status: string;
  payment_status: string;
  payment_method: string;
  total_amount: number;
  shipping_courier: string;
  shipping_awb: string | null;
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
}: AdminOrdersClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

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
  const [cancelReason, setCancelReason] = useState("");

  // Shipping modal state
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [shipTargetOrder, setShipTargetOrder] = useState<AdminOrderSummary | null>(null);
  const [courier, setCourier] = useState("Delhivery");
  const [awb, setAwb] = useState("");

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

    // If next status is Shipped, open modal for AWB and courier input
    if (nextStatus === "Shipped" && !order.shipping_awb) {
      setShipTargetOrder(order);
      setAwb(`DLH-${order.id.slice(0, 8).toUpperCase()}`);
      setCourier(order.shipping_courier || "Delhivery");
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
          message: `Order #${order.id.slice(0, 8)} successfully updated to ${nextStatus}.`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Operation failed." });
    } finally {
      setBusyOrderId(null);
    }
  };

  const handleConfirmShipment = async () => {
    if (!shipTargetOrder) return;
    if (!awb.trim()) {
      setFeedback({ type: "error", message: "AWB tracking number is required to ship." });
      return;
    }

    setBusyOrderId(shipTargetOrder.id);
    setShipModalOpen(false);
    try {
      const res = await updateAdminOrderStatus({
        orderId: shipTargetOrder.id,
        nextStatus: "Shipped",
        courier: courier.trim() || "Delhivery",
        awb: awb.trim(),
      });

      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to update status." });
      } else {
        setFeedback({
          type: "success",
          message: `Order #${shipTargetOrder.id.slice(0, 8)} shipped with AWB ${awb}.`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Operation failed." });
    } finally {
      setBusyOrderId(null);
      setShipTargetOrder(null);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelTargetOrder) return;
    if (!cancelReason.trim()) {
      setFeedback({ type: "error", message: "Cancellation reason is required." });
      return;
    }

    setBusyOrderId(cancelTargetOrder.id);
    setCancelModalOpen(false);
    try {
      const res = await cancelAdminOrder({
        orderId: cancelTargetOrder.id,
        reason: cancelReason.trim(),
      });

      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to cancel order." });
      } else {
        setFeedback({
          type: "success",
          message: `Order #${cancelTargetOrder.id.slice(0, 8)} cancelled and stock restored.`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Cancellation failed." });
    } finally {
      setBusyOrderId(null);
      setCancelTargetOrder(null);
      setCancelReason("");
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
        <div className="text-sm text-gray-400">
          Showing <span className="font-semibold text-white">{initialOrders.length}</span> of{" "}
          <span className="font-semibold text-white">{total}</span> orders
        </div>
      </div>

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
            className="text-xs opacity-70 hover:opacity-100 ml-4"
          >
            ✕
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
            <option value="Packed">Packed</option>
            <option value="Shipped">Shipped</option>
            <option value="Out for Delivery">Out for Delivery</option>
            <option value="Delivered">Delivered</option>
            <option value="Cancelled">Cancelled</option>
            <option value="Replacement Requested">Replacement Requested</option>
            <option value="Replacement Approved">Replacement Approved</option>
            <option value="Replacement Rejected">Replacement Rejected</option>
            <option value="Replacement Shipped">Replacement Shipped</option>
            <option value="Replacement Delivered">Replacement Delivered</option>
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

                  // Next primary status (excluding Cancelled which gets its own button)
                  const primaryNext = allowed.find((s) => s !== "Cancelled");
                  const canCancel = allowed.includes("Cancelled");

                  return (
                    <tr key={order.id} className="hover:bg-[#161616]/50 transition">
                      {/* Order ID & Date */}
                      <td className="py-4 px-4 align-top">
                        <Link
                          href={`/admin/orders/${order.id}`}
                          className="font-mono text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline font-semibold block"
                        >
                          {order.id.slice(0, 8)}...
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

                      {/* Status */}
                      <td className="py-4 px-4 align-top">
                        <Badge variant={getOrderStatusBadgeVariant(order.order_status)}>
                          {order.order_status}
                        </Badge>
                        {order.shipping_awb && (
                          <div className="text-[10px] text-gray-500 font-mono mt-1">
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

                          {/* Admin Cancel Button */}
                          {canCancel && (
                            <button
                              onClick={() => {
                                setCancelTargetOrder(order);
                                setCancelModalOpen(true);
                              }}
                              disabled={isBusy}
                              className="px-2.5 py-1 text-xs font-medium bg-red-950/60 hover:bg-red-900 border border-red-700/50 text-red-300 rounded transition disabled:opacity-50"
                            >
                              Cancel
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

      {/* Shipment Modal */}
      <Modal
        isOpen={shipModalOpen}
        onClose={() => setShipModalOpen(false)}
        title="Fulfill & Ship Order"
        description="Provide courier and tracking details to transition order to Shipped."
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
              Courier Partner
            </label>
            <input
              type="text"
              value={courier}
              onChange={(e) => setCourier(e.target.value)}
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
              AWB Tracking Number
            </label>
            <input
              type="text"
              value={awb}
              onChange={(e) => setAwb(e.target.value)}
              placeholder="e.g. 123456789012"
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button
              onClick={() => setShipModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <Button onClick={handleConfirmShipment} variant="primary">
              Confirm Shipment
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin Cancellation Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Order & Restore Inventory"
        description="This administrative action will cancel the order, restore inventory for all books, and record an audit log."
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
              Cancellation Reason (Required)
            </label>
            <textarea
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g., Customer requested via phone, or stock damaged..."
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button
              onClick={() => setCancelModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Close
            </button>
            <Button
              onClick={handleConfirmCancel}
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-950"
            >
              Cancel Order
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
