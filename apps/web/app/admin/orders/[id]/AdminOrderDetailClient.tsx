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
  bookAdminOrderShipment,
  scheduleAdminPickup,
  getAdminShippingLabel,
  reconcileAdminCODSettlement,
  type EnrichedAdminOrder,
} from "@/lib/admin/orders";

interface AdminOrderDetailClientProps {
  order: EnrichedAdminOrder;
}

export function AdminOrderDetailClient({ order }: AdminOrderDetailClientProps) {
  const router = useRouter();

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Ship modal (Manual override)
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [courier, setCourier] = useState(order.shipping_courier || "Delhivery");
  const [awb, setAwb] = useState(order.shipping_awb || "");

  // Cancel modal
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");

  // Schedule pickup modal
  const [schedulePickupModalOpen, setSchedulePickupModalOpen] = useState(false);
  const [pickupDate, setPickupDate] = useState(() => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    return tomorrow.toISOString().split("T")[0];
  });
  const [pickupTime, setPickupTime] = useState("10:00:00");
  const [packageCount, setPackageCount] = useState(order.items.length || 1);

  // Reconcile COD modal
  const [reconcileModalOpen, setReconcileModalOpen] = useState(false);
  const [settlementRef, setSettlementRef] = useState(() => `REMIT-${Date.now().toString().slice(-6)}`);
  const [settledAmount, setSettledAmount] = useState<number>(Number(order.total_amount));
  const [settlementNotes, setSettlementNotes] = useState("");

  const allowedTransitions = ORDER_STATUS_TRANSITIONS[order.order_status] || [];
  const primaryTransitions = allowedTransitions.filter(
    (s) => !["Cancelled", "Shipped"].includes(s)
  );
  const canShip = allowedTransitions.includes("Shipped") || ["Confirmed", "Processing", "Packed"].includes(order.order_status);
  const canCancel = allowedTransitions.includes("Cancelled");

  const canReconcileCOD =
    order.payment_method === "COD" &&
    order.order_status === "Delivered" &&
    order.cod_settlement_status !== "reconciled";

  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

  const handleAdvanceStatus = async (nextStatus: string) => {
    setFeedback(null);
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

  // Feature 1.10: Book Delhivery Consignment
  const handleBookDelhiveryShipment = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      const res = await bookAdminOrderShipment(order.id);
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Shipment booking failed." });
      } else {
        setFeedback({
          type: "success",
          message: `Shipment booked successfully with Delhivery! Waybill AWB: ${res.awb}`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Failed to book shipment." });
    } finally {
      setBusy(false);
    }
  };

  // Feature 1.11: Schedule Delhivery Pickup
  const handleConfirmSchedulePickup = async () => {
    setBusy(true);
    setSchedulePickupModalOpen(false);
    try {
      const res = await scheduleAdminPickup(order.id, {
        pickupDate,
        pickupTime,
        expectedPackageCount: packageCount,
      });

      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to schedule pickup." });
      } else {
        setFeedback({
          type: "success",
          message: `Pickup scheduled successfully! Request ID: ${res.pickupRequestId}`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Operation failed." });
    } finally {
      setBusy(false);
    }
  };

  // Feature 1.12: Download Shipping Label
  const handleDownloadLabel = async () => {
    if (!order.shipping_awb) return;
    setBusy(true);
    try {
      const res = await getAdminShippingLabel(order.shipping_awb);
      if (!res.success || !res.labelUrl) {
        setFeedback({ type: "error", message: res.error || "Failed to generate shipping label." });
      } else {
        window.open(res.labelUrl, "_blank");
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Failed to download label." });
    } finally {
      setBusy(false);
    }
  };

  // Feature 1.15: Reconcile COD Remittance
  const handleConfirmReconcileCOD = async () => {
    if (!settlementRef.trim()) {
      setFeedback({ type: "error", message: "Settlement Reference ID is required." });
      return;
    }

    setBusy(true);
    setReconcileModalOpen(false);
    try {
      const res = await reconcileAdminCODSettlement(
        order.id,
        settlementRef.trim(),
        settledAmount,
        settlementNotes.trim()
      );

      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Failed to reconcile COD remittance." });
      } else {
        setFeedback({
          type: "success",
          message: `COD Remittance reconciled! Ref: ${res.settlementRef}, Settled: ${formatPrice(res.settledAmount || settledAmount)}.`,
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Reconciliation failed." });
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmManualShipment = async () => {
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
          message: `Order #${displayOrderNum} cancelled and stock restored.`,
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
            <span className="font-mono text-gray-300">#{displayOrderNum}</span>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl sm:text-2xl font-bold text-white font-mono">
              Order #{displayOrderNum}
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
          {/* Feature 1.10: Book Delhivery Consignment CTA */}
          {canShip && !order.shipping_awb && (
            <button
              onClick={handleBookDelhiveryShipment}
              disabled={busy}
              className="px-4 py-2 bg-[#C9A24A] hover:bg-[#B89139] text-black rounded-lg text-sm font-bold uppercase tracking-wider transition disabled:opacity-50"
            >
              {busy ? "Booking..." : "Book Delhivery Shipment"}
            </button>
          )}

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

          {/* Feature 1.15: Reconcile COD Button */}
          {canReconcileCOD && (
            <button
              onClick={() => setReconcileModalOpen(true)}
              disabled={busy}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-sm font-medium transition disabled:opacity-50"
            >
              Reconcile COD Remittance
            </button>
          )}

          <a
            href={`/api/documents/invoice/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#C9A24A]/40 text-[#C9A24A] rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5"
          >
            <span>Invoice</span>
          </a>

          <a
            href={`/api/documents/packing-slip/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333333] text-gray-200 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5"
          >
            <span>Packing Slip</span>
          </a>

          <a
            href={`/api/documents/receipt/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333333] text-gray-200 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5"
          >
            <span>Receipt</span>
          </a>

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
            className="p-1 text-neutral-400 hover:text-white rounded ml-4 transition"
            aria-label="Dismiss message"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
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
            Payment &amp; Settlement
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

            {/* Feature 1.15: COD Settlement Status */}
            {order.payment_method === "COD" && (
              <div className="border-t border-[#2A2A2A] pt-2 mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-400">COD Settlement:</span>
                  <Badge variant={order.cod_settlement_status === "reconciled" ? "success" : "gold"} size="sm">
                    {order.cod_settlement_status || "unsettled"}
                  </Badge>
                </div>
                {order.cod_settlement_ref && (
                  <div className="flex justify-between font-mono">
                    <span className="text-gray-400">Remittance Ref:</span>
                    <span className="text-amber-300">{order.cod_settlement_ref}</span>
                  </div>
                )}
                {order.cod_settled_amount && (
                  <div className="flex justify-between font-mono">
                    <span className="text-gray-400">Settled Amount:</span>
                    <span className="text-emerald-400">{formatPrice(order.cod_settled_amount)}</span>
                  </div>
                )}
              </div>
            )}

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
          </div>
        </div>
      </div>

      {/* Shipping & Fulfillment Panel */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#2A2A2A] mb-4 gap-2">
          <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Delhivery Shipping &amp; Logistics
          </h3>
          <div className="flex items-center gap-2">
            {order.shipping_awb && (
              <>
                <button
                  onClick={handleDownloadLabel}
                  disabled={busy}
                  className="px-3 py-1.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333333] text-white rounded text-xs font-medium transition"
                >
                  Download Label
                </button>
                <button
                  onClick={() => setSchedulePickupModalOpen(true)}
                  disabled={busy}
                  className="px-3 py-1.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333333] text-white rounded text-xs font-medium transition"
                >
                  {order.shipping_pickup_scheduled_at ? "Reschedule Pickup" : "Schedule Pickup"}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 text-xs text-gray-300">
          <div>
            <span className="text-gray-500 block mb-0.5">Courier</span>
            <span className="font-semibold text-white">{order.shipping_courier || "Delhivery"}</span>
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">AWB Tracking Number</span>
            <span className="font-mono text-white font-medium">
              {order.shipping_awb || "Not booked"}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">Pickup Scheduled</span>
            <span>
              {order.shipping_pickup_scheduled_at
                ? new Date(order.shipping_pickup_scheduled_at).toLocaleString()
                : "Not scheduled"}
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
                <th className="py-3 px-4">Book Title / ID</th>
                <th className="py-3 px-4">Quantity</th>
                <th className="py-3 px-4">Unit Price</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#222222]">
              {order.items.map((item) => (
                <tr key={item.id} className="hover:bg-[#161616]/40 transition">
                  <td className="py-3.5 px-4 font-mono text-xs text-gray-300">
                    <span className="block text-white font-sans font-medium mb-0.5">{item.title}</span>
                    <Link
                      href={`/books/${item.book_id}`}
                      target="_blank"
                      className="text-[#C9A24A] hover:underline"
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
                <td className="py-4 px-4 text-right text-base font-bold text-[#C9A24A]">
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

      {/* Schedule Pickup Modal */}
      <Modal
        isOpen={schedulePickupModalOpen}
        onClose={() => setSchedulePickupModalOpen(false)}
        title="Schedule Delhivery Pickup"
        description="Submit a verified pickup dispatch request to Delhivery logistics associates."
      >
        <div className="space-y-4 pt-2 text-xs">
          <div>
            <label className="block font-semibold text-gray-400 uppercase mb-1">
              Pickup Date
            </label>
            <input
              type="date"
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-400 uppercase mb-1">
              Pickup Slot
            </label>
            <select
              value={pickupTime}
              onChange={(e) => setPickupTime(e.target.value)}
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-white"
            >
              <option value="10:00:00">Morning (10:00 AM – 01:00 PM)</option>
              <option value="14:00:00">Afternoon (02:00 PM – 05:00 PM)</option>
              <option value="18:00:00">Evening (06:00 PM – 08:00 PM)</option>
            </select>
          </div>
          <div>
            <label className="block font-semibold text-gray-400 uppercase mb-1">
              Expected Package Count
            </label>
            <input
              type="number"
              min={1}
              value={packageCount}
              onChange={(e) => setPackageCount(parseInt(e.target.value, 10) || 1)}
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-white"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button
              onClick={() => setSchedulePickupModalOpen(false)}
              className="px-4 py-2 text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <Button onClick={handleConfirmSchedulePickup} variant="primary">
              Confirm Pickup Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* Reconcile COD Remittance Modal */}
      <Modal
        isOpen={reconcileModalOpen}
        onClose={() => setReconcileModalOpen(false)}
        title="Reconcile COD Bank Remittance"
        description="Verify and record the bank settlement from Delhivery for this delivered COD order."
      >
        <div className="space-y-4 pt-2 text-xs">
          <div>
            <label className="block font-semibold text-gray-400 uppercase mb-1">
              Bank Remittance Reference ID
            </label>
            <input
              type="text"
              value={settlementRef}
              onChange={(e) => setSettlementRef(e.target.value)}
              placeholder="e.g. REMIT-DEL-89912"
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-white font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-400 uppercase mb-1">
              Remitted Amount (₹)
            </label>
            <input
              type="number"
              value={settledAmount}
              onChange={(e) => setSettledAmount(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg px-3 py-2 text-white font-mono"
            />
          </div>
          <div>
            <label className="block font-semibold text-gray-400 uppercase mb-1">
              Reconciliation Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={settlementNotes}
              onChange={(e) => setSettlementNotes(e.target.value)}
              placeholder="e.g. Bank credit verified in HDFC account."
              className="w-full bg-[#161616] border border-[#2A2A2A] rounded-lg p-3 text-white placeholder-gray-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-3">
            <button
              onClick={() => setReconcileModalOpen(false)}
              className="px-4 py-2 text-gray-400 hover:text-white"
            >
              Cancel
            </button>
            <Button onClick={handleConfirmReconcileCOD} variant="primary">
              Confirm Settlement
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
    </div>
  );
}
