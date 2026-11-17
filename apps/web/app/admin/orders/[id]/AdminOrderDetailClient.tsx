"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { checkOrderInvoiceEligibility } from "@/lib/commerce/tax";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import {
  DISPATCHED_ORDER_STATUSES,
  FULFILLMENT_SHIPPING_STATUSES,
  ORDER_STATUS_TRANSITIONS,
  isDelhiveryShipment,
  resolveOrderTrackingUrl,
} from "@/lib/admin/constants";
import { hasAnyPermission, hasPermission } from "@/lib/admin/permissions";
import {
  updateAdminOrderStatus,
  retryAdminOrderRefund,
  verifyUncertainAdminShipment,
  scheduleAdminPickup,
  getAdminShippingLabel,
  reconcileAdminCODSettlement,
  type EnrichedAdminOrder,
} from "@/lib/admin/orders";
import { AdminShipmentModal } from "@/components/admin/AdminShipmentModal";
import { AdminCancelOrderModal } from "@/components/admin/AdminCancelOrderModal";

interface AdminOrderDetailClientProps {
  order: EnrichedAdminOrder;
  delhiveryConfigured?: boolean;
  delhiveryMockMode?: boolean;
  userRole?: string;
}

export function AdminOrderDetailClient({
  order,
  delhiveryConfigured = false,
  delhiveryMockMode = false,
  userRole = "user",
}: AdminOrderDetailClientProps) {
  const router = useRouter();
  const delhiveryUnavailable = !delhiveryConfigured && !delhiveryMockMode;

  const canManageOrders = hasPermission(userRole, "orders.manage");
  const canShipOrders = hasPermission(userRole, "orders.ship");
  const canCancelPreDispatch = hasPermission(userRole, "orders.cancel");
  const canCancelDispatched = hasPermission(userRole, "orders.cancel_dispatched");
  const canSettleCod = hasPermission(userRole, "orders.settle_cod");
  const canManageRefunds = hasPermission(userRole, "orders.refund");
  const canViewPackingSlip = hasAnyPermission(userRole, ["orders.ship", "orders.manage"]);

  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);

  // Unified Shipment modal (Delhivery API vs Manual Entry)
  const [shipModalOpen, setShipModalOpen] = useState(false);

  // Unified Cancel modal (Pre-dispatch vs Courier-Confirmed Dispatched)
  const [cancelModalOpen, setCancelModalOpen] = useState(false);

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
  const hasActiveShipment =
    Boolean(order.shipping_awb) || order.shipping_booking_mode === "manual";
  const isDispatched = DISPATCHED_ORDER_STATUSES.has(order.order_status);
  const isDelhiveryOrder = isDelhiveryShipment({
    courier: order.shipping_courier,
    bookingMode: order.shipping_booking_mode,
    trackingUrl: order.shipping_tracking_url,
  });
  const resolvedTrackingUrl = resolveOrderTrackingUrl({
    courier: order.shipping_courier,
    awb: order.shipping_awb,
    trackingUrl: order.shipping_tracking_url,
    bookingMode: order.shipping_booking_mode,
  });
  const canUseDelhiveryOps = Boolean(
    canShipOrders && isDelhiveryOrder && order.shipping_awb
  );

  // Separate status transitions gated by role permissions
  const primaryTransitions = allowedTransitions.filter((s) => {
    if (s === "Cancelled") return false;
    if (s === "Shipped" && !hasActiveShipment) return false;
    return FULFILLMENT_SHIPPING_STATUSES.has(s) ? canShipOrders : canManageOrders;
  });

  const canCreateShipment =
    canShipOrders &&
    allowedTransitions.includes("Shipped") &&
    !hasActiveShipment;

  const canCancel = isDispatched
    ? canCancelDispatched
    : allowedTransitions.includes("Cancelled") && canCancelPreDispatch;

  const canReconcileCOD =
    canSettleCod &&
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

  // Reconcile COD handled below; manual shipping & cancellation handled by shared modals.

  const handleVerifyUncertainShipment = async () => {
    setBusy(true);
    try {
      const res = await verifyUncertainAdminShipment(order.id);
      if (!res.success) {
        setFeedback({
          type: "error",
          message: res.error || "Unable to verify uncertain booking with Delhivery.",
        });
      } else if (res.recovered && res.awb) {
        setFeedback({
          type: "success",
          message: `Recovered existing Delhivery consignment AWB ${res.awb} without creating a duplicate parcel!`,
        });
        router.refresh();
      } else if (res.clearedToRetry) {
        setFeedback({
          type: "success",
          message:
            "Verified with Delhivery that no shipment was created prior to timeout. Booking unlocked for retry.",
        });
        router.refresh();
      }
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Verification error." });
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

  // Order status progression & refund retry controls below.

  const handleRetryRefund = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      const res = await retryAdminOrderRefund({ orderId: order.id });
      if (!res.success) {
        setFeedback({ type: "error", message: res.error || "Refund retry failed." });
      } else {
        setFeedback({
          type: "success",
          message:
            res.refundStatus === "PROCESSED"
              ? `Refund processed successfully (${res.refundId || "confirmed"}).`
              : `Refund status updated to ${res.refundStatus || "PROCESSING"} (${res.refundId || "pending sync"}).`,
        });
      }
      router.refresh();
    } catch (err: any) {
      setFeedback({ type: "error", message: err?.message || "Failed to retry refund." });
    } finally {
      setBusy(false);
    }
  };

  const canRetryOrSyncRefund =
    canManageRefunds &&
    order.payment_method === "ONLINE" &&
    order.order_status === "Cancelled" &&
    (order.payment_status === "Paid" ||
      order.payment_status === "Partially Refunded" ||
      order.payment_status === "Refund Pending") &&
    order.refund_status !== "processed" &&
    order.refund_status !== "not_required";

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
          {canCreateShipment && (
            <button
              onClick={() => setShipModalOpen(true)}
              disabled={busy}
              className="px-4 py-2 bg-[#C9A24A] hover:bg-[#B89139] text-black rounded-lg text-sm font-bold uppercase tracking-wider transition disabled:opacity-50"
            >
              Create Shipment / Ship
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

          {checkOrderInvoiceEligibility(order).eligible && (
            <a
              href={`/api/documents/invoice/${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#C9A24A]/40 text-[#C9A24A] rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5"
            >
              <span>Invoice</span>
            </a>
          )}

          {canViewPackingSlip && (
            <a
              href={`/api/documents/packing-slip/${order.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-2 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333333] text-gray-200 rounded-lg text-sm font-medium transition inline-flex items-center gap-1.5"
            >
              <span>Packing Slip</span>
            </a>
          )}

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
              {isDispatched ? "Cancel with Courier" : "Cancel Order"}
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
                  <span className="text-gray-400">Doorstep Collection:</span>
                  <Badge variant={order.cod_collection_status === "collected" ? "success" : "muted"} size="sm">
                    {order.cod_collection_status || "uncollected"}
                  </Badge>
                </div>
                {order.cod_collected_amount !== null && order.cod_collected_amount !== undefined && (
                  <div className="flex justify-between font-mono">
                    <span className="text-gray-400">Cash Collected:</span>
                    <span className="text-emerald-300">{formatPrice(order.cod_collected_amount)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-400">COD Remittance:</span>
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
                    <span className="text-gray-400">Remitted &amp; Settled:</span>
                    <span className="text-emerald-400">{formatPrice(order.cod_settled_amount)}</span>
                  </div>
                )}
                {order.cod_refund_reference && (
                  <div className="flex justify-between font-mono">
                    <span className="text-gray-400">COD Refund Ref:</span>
                    <span className="text-sky-300">{order.cod_refund_reference}</span>
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
            {order.refund_status && (
              <div className="border-t border-[#2A2A2A] pt-2 mt-2 space-y-1 text-[11px]">
                <div className="flex justify-between">
                  <span className="text-gray-400">Refund Lifecycle:</span>
                  <span className="font-mono uppercase text-amber-300">{order.refund_status}</span>
                </div>
                {order.razorpay_refund_id && (
                  <div className="flex justify-between font-mono">
                    <span className="text-gray-400">Gateway Refund ID:</span>
                    <span className="text-gray-300">{order.razorpay_refund_id}</span>
                  </div>
                )}
                {order.refund_amount !== null && order.refund_amount !== undefined && (
                  <div className="flex justify-between font-mono">
                    <span className="text-gray-400">Refund Amount:</span>
                    <span className="text-gray-200">{formatPrice(order.refund_amount)}</span>
                  </div>
                )}
                {canRetryOrSyncRefund && (
                  <div className="pt-2">
                    <Button
                      onClick={handleRetryRefund}
                      disabled={busy}
                      variant="outline"
                      size="sm"
                      className="w-full border-amber-500/60 text-amber-300 hover:bg-amber-950/40 text-xs"
                    >
                      {busy
                        ? "Processing..."
                        : order.refund_status === "processing"
                        ? "Sync Razorpay Refund Status"
                        : "Retry Razorpay Refund"}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Shipping & Fulfillment Panel */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-[#2A2A2A] mb-4 gap-2">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Shipping &amp; Fulfillment Details
            </h3>
            <Badge
              variant={
                order.shipping_booking_status === "booked" ||
                order.shipping_booking_status === "manual_entered"
                  ? "success"
                  : order.shipping_booking_status === "booking_failed" ||
                    order.shipping_booking_status === "booking_uncertain" ||
                    order.shipping_booking_status === "cancelled"
                  ? "danger"
                  : "muted"
              }
              size="sm"
            >
              {order.shipping_booking_mode === "delhivery"
                ? "Delhivery API"
                : order.shipping_booking_mode === "manual"
                ? "Manual Shipment"
                : "Not Booked"}
              {order.shipping_booking_status ? ` · ${order.shipping_booking_status}` : ""}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {canCreateShipment && (
              <button
                onClick={() => setShipModalOpen(true)}
                disabled={busy}
                className="px-3 py-1.5 bg-[#C9A24A] hover:bg-[#B89139] text-black rounded text-xs font-semibold transition disabled:opacity-50"
              >
                Book / Enter Shipment
              </button>
            )}
            {canShipOrders && order.shipping_booking_status === "booking_uncertain" && (
              <button
                onClick={handleVerifyUncertainShipment}
                disabled={busy || delhiveryUnavailable}
                className="px-3 py-1.5 bg-amber-900/50 hover:bg-amber-800/60 border border-amber-500/50 text-amber-200 rounded text-xs font-semibold transition disabled:opacity-50"
              >
                Verify Uncertain Delhivery Booking
              </button>
            )}
            {canUseDelhiveryOps && (
              <>
                <button
                  onClick={handleDownloadLabel}
                  disabled={busy || delhiveryUnavailable}
                  title={
                    delhiveryUnavailable
                      ? "Delhivery credentials are not configured on the server"
                      : undefined
                  }
                  className="px-3 py-1.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333333] text-white rounded text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Download Label
                </button>
                <button
                  onClick={() => setSchedulePickupModalOpen(true)}
                  disabled={busy || delhiveryUnavailable}
                  title={
                    delhiveryUnavailable
                      ? "Delhivery credentials are not configured on the server"
                      : undefined
                  }
                  className="px-3 py-1.5 bg-[#1F1F1F] hover:bg-[#2A2A2A] border border-[#333333] text-white rounded text-xs font-medium transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {order.shipping_pickup_scheduled_at ? "Reschedule Pickup" : "Schedule Pickup"}
                </button>
              </>
            )}
          </div>
        </div>

        {order.shipping_last_error && (
          <div className="mb-4 p-3 bg-red-950/25 border border-red-500/35 rounded-lg text-xs text-red-200 leading-relaxed">
            <span className="font-semibold text-red-300">Shipping Error / Alert:</span>{" "}
            {order.shipping_last_error}
          </div>
        )}

        {!delhiveryConfigured && (
          <div className="mb-4 p-3 bg-amber-950/20 border border-amber-500/30 rounded-lg text-xs text-amber-200 leading-relaxed">
            {delhiveryUnavailable ? (
              <>
                <span className="font-semibold text-amber-300">Delhivery is not configured.</span>{" "}
                Automated Delhivery shipment booking, pickup requests, and shipping labels are disabled until server credentials are configured. Manual shipment entry for alternative couriers remains available.
              </>
            ) : (
              <>
                <span className="font-semibold text-amber-300">Delhivery Sandbox / Mock Mode:</span>{" "}
                Live Delhivery credentials are not configured; non-production mock responses are active for local testing.
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-4 text-xs text-gray-300">
          <div>
            <span className="text-gray-500 block mb-0.5">Courier Partner</span>
            <span className="font-semibold text-white">
              {order.shipping_courier || "Not assigned"}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">AWB / Tracking Ref</span>
            <span className="font-mono text-white font-medium">
              {order.shipping_awb || (order.shipping_booking_mode === "manual" ? "Not provided" : "Not booked")}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">Tracking URL</span>
            {resolvedTrackingUrl ? (
              <a
                href={resolvedTrackingUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C9A24A] hover:underline font-medium break-all"
              >
                Open Tracking Link ↗
              </a>
            ) : (
              <span className="text-gray-400">Tracking unavailable</span>
            )}
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">Shipped Date</span>
            <span>
              {order.shipping_shipped_at
                ? new Date(order.shipping_shipped_at).toLocaleString()
                : "Not dispatched"}
            </span>
          </div>
          <div>
            <span className="text-gray-500 block mb-0.5">Pickup / Delivery</span>
            <span>
              {order.delivered_at
                ? `Delivered ${new Date(order.delivered_at).toLocaleDateString()}`
                : order.shipping_pickup_scheduled_at
                ? `Pickup ${new Date(order.shipping_pickup_scheduled_at).toLocaleDateString()}`
                : "—"}
            </span>
          </div>
        </div>

        {isDispatched && (
          <div className="mt-4 p-3 bg-neutral-900 border border-[#2A2A2A] rounded-lg text-xs text-gray-300">
            <span className="font-semibold text-[#C9A24A]">Cancellation Policy Enforcement:</span>{" "}
            Direct cancellation is blocked once an order is dispatched ({order.order_status}). Only authorized administrators can cancel after confirming courier halt/cancellation.
          </div>
        )}

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
                <div className="flex items-center gap-2 flex-wrap">
                  {h.previous_status && (
                    <>
                      <span className="text-gray-400 font-mono">{h.previous_status}</span>
                      <span className="text-gray-500">→</span>
                    </>
                  )}
                  <Badge variant={getOrderStatusBadgeVariant(h.status)}>{h.status}</Badge>
                  {h.source && (
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1F1F1F] text-gray-400 border border-[#2E2E2E]">
                      {h.source}
                    </span>
                  )}
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

      {/* Shipment Events Log */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
          Shipment &amp; Courier Event History
        </h3>
        {!order.shipmentEvents || order.shipmentEvents.length === 0 ? (
          <p className="text-xs text-gray-500">No shipment events logged yet.</p>
        ) : (
          <div className="space-y-3">
            {order.shipmentEvents.map((ev) => (
              <div
                key={ev.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-[#161616] border border-[#262626] rounded-lg gap-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="gold" size="sm">
                      {ev.event_type}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1F1F1F] text-gray-400 border border-[#2E2E2E]">
                      {ev.source}
                    </span>
                    {ev.actor_role && (
                      <span className="text-[10px] font-mono text-gray-400">
                        role: {ev.actor_role}
                      </span>
                    )}
                    {ev.carrier_name && (
                      <span className="text-gray-300 font-medium">{ev.carrier_name}</span>
                    )}
                    {ev.awb && <span className="font-mono text-[#C9A24A]">{ev.awb}</span>}
                  </div>
                  {(ev.previous_status || ev.new_status || ev.note) && (
                    <p className="text-gray-300">
                      {ev.previous_status && ev.new_status
                        ? `${ev.previous_status} → ${ev.new_status} · `
                        : ""}
                      {ev.note}
                    </p>
                  )}
                </div>
                <span className="text-gray-500 font-mono">
                  {new Date(ev.created_at).toLocaleString("en-IN", {
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

      {/* Transactional Email Delivery & Suppression Log */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-4">
          Transactional Email Delivery Log
        </h3>
        {!order.emailLogs || order.emailLogs.length === 0 ? (
          <p className="text-xs text-gray-500">No transactional email logs recorded for this order.</p>
        ) : (
          <div className="space-y-3">
            {order.emailLogs.map((log) => (
              <div
                key={log.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 bg-[#161616] border border-[#262626] rounded-lg gap-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant={
                        log.status === "sent"
                          ? "success"
                          : log.status === "failed"
                          ? "danger"
                          : log.status === "suppressed"
                          ? "warning"
                          : "muted"
                      }
                      size="sm"
                    >
                      {log.status}
                    </Badge>
                    <span className="font-mono text-[#C9A24A]">{log.event_type}</span>
                    <span className="text-gray-400">
                      attempts: {log.attempt_count}/{log.max_attempts}
                    </span>
                    {log.failure_type && (
                      <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[#1F1F1F] text-gray-300 border border-[#2E2E2E]">
                        {log.failure_type}
                      </span>
                    )}
                  </div>
                  {log.suppressed_reason && (
                    <p className="text-amber-300/90">Suppressed: {log.suppressed_reason}</p>
                  )}
                  {log.last_error && (
                    <p className="text-red-400/90">Error: {log.last_error}</p>
                  )}
                </div>
                <span className="text-gray-500 font-mono">
                  {new Date(log.sent_at || log.created_at).toLocaleString("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
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

      {/* Unified Shipment Modal (Delhivery API vs Manual Entry) */}
      <AdminShipmentModal
        isOpen={shipModalOpen}
        onClose={() => setShipModalOpen(false)}
        order={order}
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
        onClose={() => setCancelModalOpen(false)}
        order={order}
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
