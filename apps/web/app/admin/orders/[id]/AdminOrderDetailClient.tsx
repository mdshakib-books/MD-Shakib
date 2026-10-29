"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { ORDER_STATUS_TRANSITIONS } from "@/lib/admin/constants";
import {
  updateAdminOrderStatus,
  cancelAdminOrder,
  approveAdminReplacement,
  rejectAdminReplacement,
  type EnrichedAdminOrder,
} from "@/lib/admin/orders";

interface AdminOrderDetailClientProps {
  order: EnrichedAdminOrder;
}

export function AdminOrderDetailClient({ order }: AdminOrderDetailClientProps) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Ship modal
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [courier, setCourier] = useState(order.shipping_courier || "Delhivery");
  const [awb, setAwb] = useState(order.shipping_awb || "");

  // Cancel modal
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Reject replacement modal
  const [rejectReplacementModalOpen, setRejectReplacementModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.order_status] || [];
  const primaryTransitions = allowedTransitions.filter(
    (s) => !["Cancelled", "Replacement Rejected"].includes(s)
  );
  const canCancel = allowedTransitions.includes("Cancelled");
  const isReplacementRequested = order.order_status === "Replacement Requested";

  const handleAdvanceStatus = async (nextStatus: string) => {
    setFeedback(null);

    if (nextStatus === "Shipped" && !order.shipping_awb) {
      setAwb(`DLH-${order.id.slice(0, 8).toUpperCase()}`);
      setShipModalOpen(true);
      return;
    }

    setBusy(true);
    try {
      const res = await updateAdminOrderStatus({
        orderId: order.id,
        nextStatus,
      });

      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to update order status." });
      } else {
        setFeedback({
          type: "success",
          message: `Status transitioned to "${nextStatus}".`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Operation failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmShipment = async () => {
    if (!awb.trim()) {
      setFeedback({ type: "error", message: "AWB tracking number is required." });
      return;
    }

    setBusy(true);
    setShipModalOpen(false);
    try {
      const res = await updateAdminOrderStatus({
        orderId: order.id,
        nextStatus: "Shipped",
        courier: courier.trim() || "Delhivery",
        awb: awb.trim(),
      });

      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to ship order." });
      } else {
        setFeedback({
          type: "success",
          message: `Order transitioned to Shipped with AWB ${awb}.`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Operation failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelReason.trim()) {
      setFeedback({ type: "error", message: "Cancellation reason is required." });
      return;
    }

    setBusy(true);
    setCancelModalOpen(false);
    try {
      const res = await cancelAdminOrder({
        orderId: order.id,
        reason: cancelReason.trim(),
      });

      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to cancel order." });
      } else {
        setFeedback({
          type: "success",
          message: `Order #${order.id.slice(0, 8)} cancelled and stock restored.`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Cancellation failed." });
    } finally {
      setBusy(false);
      setCancelReason("");
    }
  };

  const handleApproveReplacement = async () => {
    setBusy(true);
    try {
      const res = await approveAdminReplacement(order.id);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to approve replacement." });
      } else {
        setFeedback({ type: "success", message: "Replacement request approved." });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Approval failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmRejectReplacement = async () => {
    if (!rejectReason.trim()) {
      setFeedback({ type: "error", message: "Rejection reason is required." });
      return;
    }

    setBusy(true);
    setRejectReplacementModalOpen(false);
    try {
      const res = await rejectAdminReplacement(order.id, rejectReason.trim());
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to reject replacement." });
      } else {
        setFeedback({ type: "success", message: "Replacement request rejected." });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Rejection failed." });
    } finally {
      setBusy(false);
      setRejectReason("");
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

  const address = (order.address_snapshot || {}) as Record<string, any>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Top Breadcrumb & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-2">
            <Link href="/admin/orders" className="hover:text-white transition">
              ← Back to Orders
            </Link>
            <span>/</span>
            <span className="font-mono text-gray-300">{order.id}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-white font-mono">
              Order #{order.id.slice(0, 8)}
            </h1>
            <Badge variant={getOrderStatusBadgeVariant(order.order_status)}>
              {order.order_status}
            </Badge>
            <Badge variant={getPaymentStatusBadgeVariant(order.payment_status)}>
              Payment: {order.payment_status}
            </Badge>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 flex-wrap">
          {primaryTransitions.map((nextStatus) => (
            <button
              key={nextStatus}
              onClick={() => handleAdvanceStatus(nextStatus)}
              disabled={busy}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              {busy ? "Updating..." : `Advance to ${nextStatus}`}
            </button>
          ))}

          {isReplacementRequested && (
            <>
              <button
                onClick={handleApproveReplacement}
                disabled={busy}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                Approve Replacement
              </button>
              <button
                onClick={() => setRejectReplacementModalOpen(true)}
                disabled={busy}
                className="px-4 py-2 bg-red-950 hover:bg-red-900 border border-red-700 text-red-300 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                Reject Replacement
              </button>
            </>
          )}

          {canCancel && (
            <button
              onClick={() => setCancelModalOpen(true)}
              disabled={busy}
              className="px-4 py-2 bg-red-950/70 hover:bg-red-900 border border-red-700/60 text-red-300 rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              Cancel Order
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
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

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Customer Information */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Customer Information
          </h3>
          <div className="space-y-1.5 text-sm">
            <p className="font-semibold text-white">
              {order.customer?.name || address.full_name || "Customer"}
            </p>
            <p className="text-gray-400 text-xs">{order.customer?.email || "—"}</p>
            <p className="text-gray-400 text-xs">
              Phone: {address.phone || order.customer?.phone || "—"}
            </p>
            <p className="text-gray-500 text-[11px] font-mono pt-1">
              User ID: {order.user_id.slice(0, 13)}...
            </p>
          </div>
        </div>

        {/* Delivery Address */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Delivery Address
          </h3>
          <div className="space-y-1 text-xs text-gray-300">
            <p className="font-semibold text-white text-sm">{address.full_name}</p>
            <p>
              {address.house_no}, {address.area}
            </p>
            {address.landmark && <p className="text-gray-400">Landmark: {address.landmark}</p>}
            <p>
              {address.city}, {address.state} - <span className="font-mono">{address.pincode}</span>
            </p>
            <p className="text-gray-500 text-[11px] pt-1">Type: {address.address_type || "Home"}</p>
          </div>
        </div>

        {/* Payment & Settlement */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
            Payment & Settlement
          </h3>
          <div className="space-y-1.5 text-xs text-gray-300">
            <div className="flex justify-between">
              <span className="text-gray-400">Method:</span>
              <span className="font-semibold text-white uppercase">{order.payment_method}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Status:</span>
              <span className="font-semibold text-white">{order.payment_status}</span>
            </div>
            {order.razorpay_order_id && (
              <div className="flex justify-between pt-1 font-mono text-[11px]">
                <span className="text-gray-500">Razorpay Order:</span>
                <span className="text-gray-300">{order.razorpay_order_id}</span>
              </div>
            )}
            {order.razorpay_payment_id && (
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-gray-500">Payment ID:</span>
                <span className="text-gray-300">{order.razorpay_payment_id}</span>
              </div>
            )}
            {order.paid_at && (
              <div className="flex justify-between text-[11px] text-gray-400 pt-1">
                <span>Paid At:</span>
                <span>{new Date(order.paid_at).toLocaleString()}</span>
              </div>
            )}
            {order.razorpay_refund_id && (
              <div className="flex justify-between pt-1 font-mono text-[11px] text-amber-300">
                <span>Refund ID:</span>
                <span>{order.razorpay_refund_id}</span>
              </div>
            )}
            {order.refunded_at && (
              <div className="flex justify-between text-[11px] text-gray-400 pt-1">
                <span>Refunded At:</span>
                <span>{new Date(order.refunded_at).toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shipping & Fulfillment Panel */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
          Shipping & Logistics
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs text-gray-300">
          <div>
            <span className="text-gray-500 block mb-0.5">Courier</span>
            <span className="font-semibold text-white">{order.shipping_courier || "Delhivery"}</span>
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">AWB Tracking Number</span>
            <span className="font-mono text-white font-medium">
              {order.shipping_awb || "Not assigned"}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">Shipped Date</span>
            <span>
              {order.shipping_shipped_at
                ? new Date(order.shipping_shipped_at).toLocaleString()
                : "—"}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">Delivery Date</span>
            <span>
              {order.delivered_at
                ? new Date(order.delivered_at).toLocaleString()
                : "—"}
            </span>
          </div>
        </div>
        {order.cancel_reason && (
          <div className="mt-4 p-3 bg-red-950/20 border border-red-500/30 rounded-lg text-xs text-red-300">
            <span className="font-bold">Cancellation Reason:</span> {order.cancel_reason}
          </div>
        )}
      </div>

      {/* Line Items Table */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden">
        <div className="p-5 border-b border-[#2A2A2A]">
          <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400">
            Order Items ({order.items.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
              <tr>
                <th className="py-3 px-4">Book ID</th>
                <th className="py-3 px-4">Quantity</th>
                <th className="py-3 px-4">Unit Price</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222222]">
              {order.items.map((item) => (
                <tr key={item.id} className="hover:bg-[#161616]/40 transition">
                  <td className="py-3.5 px-4 font-mono text-xs text-gray-300">
                    <Link
                      href={`/books/${item.book_id}`}
                      target="_blank"
                      className="text-[var(--color-primary-gold,#C9A24A)] hover:underline"
                    >
                      {item.book_id} ↗
                    </Link>
                  </td>
                  <td className="py-3.5 px-4 font-semibold text-white">{item.quantity}</td>
                  <td className="py-3.5 px-4">{formatPrice(item.price)}</td>
                  <td className="py-3.5 px-4 text-right font-semibold text-white">
                    {formatPrice(item.price * item.quantity)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-[#161616] border-t border-[#2A2A2A]">
              <tr>
                <td colSpan={3} className="py-4 px-4 text-right font-bold text-white uppercase text-xs">
                  Total Order Amount:
                </td>
                <td className="py-4 px-4 text-right text-base font-bold text-[var(--color-primary-gold,#C9A24A)]">
                  {formatPrice(order.total_amount)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Status History Timeline */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
          Status Audit Trail
        </h3>
        {order.history.length === 0 ? (
          <p className="text-xs text-gray-500">No status events recorded.</p>
        ) : (
          <div className="space-y-3">
            {order.history.map((h) => (
              <div
                key={h.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-[#161616] border border-[#262626] rounded-lg gap-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <Badge variant={getOrderStatusBadgeVariant(h.status)}>{h.status}</Badge>
                  {h.note && <span className="text-gray-300 italic">— {h.note}</span>}
                </div>
                <span className="text-gray-500 font-mono">
                  {new Date(h.created_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              </div>
            ))}
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
              placeholder="e.g. DLH-998877"
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

      {/* Cancel Modal */}
      <Modal
        isOpen={cancelModalOpen}
        onClose={() => setCancelModalOpen(false)}
        title="Cancel Order & Restore Inventory"
        description="Cancelling will restore inventory for all books and record this administrative action in audit logs."
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
              placeholder="e.g., Damaged item or customer cancellation..."
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

      {/* Reject Replacement Modal */}
      <Modal
        isOpen={rejectReplacementModalOpen}
        onClose={() => setRejectReplacementModalOpen(false)}
        title="Reject Replacement Request"
        description="Provide a justification for rejecting the customer's replacement request."
      >
        <div className="space-y-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-gray-400 uppercase mb-1">
              Rejection Reason (Required)
            </label>
            <textarea
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g. Book return period exceeded or physical damage not covered..."
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg p-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button
              onClick={() => setRejectReplacementModalOpen(false)}
              className="px-4 py-2 text-sm text-gray-400 hover:text-white"
            >
              Close
            </button>
            <Button
              onClick={handleConfirmRejectReplacement}
              variant="outline"
              className="border-red-600 text-red-400 hover:bg-red-950"
            >
              Reject Replacement
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
