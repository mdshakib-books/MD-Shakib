"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { cancelOrder, requestOrderReplacement, type EnrichedOrder } from "@/lib/commerce/orders";

interface OrderDetailClientProps {
  order: EnrichedOrder;
}

const ORDER_STEPS = [
  "Pending",
  "Confirmed",
  "Packed",
  "Shipped",
  "Out for Delivery",
  "Delivered",
];

const CANCEL_REASONS = [
  "Placed order by mistake",
  "Need to change delivery address",
  "Found a better price elsewhere",
  "Delivery time is too long",
  "Other reason",
];

const REPLACEMENT_REASONS = [
  "Damaged cover or binding in transit",
  "Printing defect or illegible text",
  "Missing pages or inverted binding",
  "Wrong edition or book delivered",
  "Defective copy",
];

export function OrderDetailClient({ order }: OrderDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonSelect, setCancelReasonSelect] = useState(CANCEL_REASONS[0]);
  const [cancelReasonDetails, setCancelReasonDetails] = useState("");

  const [showReplacementModal, setShowReplacementModal] = useState(false);
  const [replacementReasonSelect, setReplacementReasonSelect] = useState(REPLACEMENT_REASONS[0]);
  const [replacementDetails, setReplacementDetails] = useState("");

  const isCancelled = order.order_status === "Cancelled";
  const canCancel = ["Pending", "Confirmed", "Processing"].includes(order.order_status);

  const [currentTime] = useState(() => Date.now());
  const isDelivered = order.order_status === "Delivered" || order.order_status === "Replacement Delivered";
  const deliveryTimestamp = order.delivered_at || order.shipping_delivered_at;
  const deliveryTime = deliveryTimestamp ? new Date(deliveryTimestamp).getTime() : null;
  const isWithin7Days = deliveryTime
    ? currentTime - deliveryTime <= 7 * 24 * 60 * 60 * 1000 && currentTime >= deliveryTime
    : false;
  const canRequestReplacement = isDelivered && !order.replacement_requested && isWithin7Days;

  // Address Snapshot
  const address = order.address_snapshot as unknown as {
    full_name?: string;
    phone?: string;
    house_no?: string;
    area?: string;
    city?: string;
    state?: string;
    pincode?: string;
    landmark?: string;
  } | null;

  const currentStepIndex = ORDER_STEPS.indexOf(order.order_status);

  // Subtotal calculation from items
  const itemsSubtotal = order.items.reduce(
    (sum, item) => sum + Number(item.price) * item.quantity,
    0
  );
  const totalAmount = Number(order.total_amount);
  const discountAmount = Math.max(0, itemsSubtotal - totalAmount);

  const handleCancelSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalReason = cancelReasonDetails.trim()
      ? `${cancelReasonSelect}: ${cancelReasonDetails.trim()}`
      : cancelReasonSelect;

    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await cancelOrder(order.id, finalReason);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        setShowCancelModal(false);
        setSuccessMsg("Your order has been cancelled successfully. Inventory has been restored.");
        router.refresh();
      }
    });
  };

  const handleReplacementSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    startTransition(async () => {
      const res = await requestOrderReplacement(
        order.id,
        replacementReasonSelect,
        replacementDetails
      );
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        setShowReplacementModal(false);
        setSuccessMsg("Replacement request submitted successfully. Our team will review it shortly.");
        router.refresh();
      }
    });
  };

  return (
    <PageContainer size="md">
      {/* Header and Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <Link href="/orders" className="text-xs text-[var(--color-primary-gold)] hover:underline mb-2 inline-block">
            ← Back to All Orders
          </Link>
          <h1 className="font-serif text-2xl md:text-3xl text-white uppercase font-bold">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-mono">
            Placed on {new Date(order.created_at).toLocaleString("en-IN")}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {canCancel && (
            <button
              onClick={() => setShowCancelModal(true)}
              disabled={isPending}
              className="px-4 py-2 rounded-lg border border-red-900/60 bg-red-950/20 text-red-400 hover:bg-red-950/40 text-xs font-semibold transition cursor-pointer"
            >
              Cancel Order
            </button>
          )}

          {canRequestReplacement && (
            <button
              onClick={() => setShowReplacementModal(true)}
              disabled={isPending}
              className="px-4 py-2 rounded-lg border border-[var(--color-primary-gold)] bg-[var(--color-primary-gold)]/10 text-[var(--color-primary-gold)] hover:bg-[var(--color-primary-gold)]/20 text-xs font-semibold transition cursor-pointer"
            >
              Request Replacement
            </button>
          )}
        </div>
      </div>

      <AccountNav />

      {errorMsg && (
        <div className="mb-6 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs">
          ✓ {successMsg}
        </div>
      )}

      {/* Replacement Status Card (If already requested) */}
      {order.replacement_requested && (
        <div className="bg-[#141414] border border-[#2E2E2E] rounded-xl p-6 mb-8 shadow-md">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#222]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
              Replacement Request Status
            </h2>
            <span
              className={`text-[10px] uppercase font-bold px-2.5 py-0.5 rounded ${
                order.replacement_status === "Approved"
                  ? "bg-emerald-950/40 border border-emerald-800/40 text-emerald-400"
                  : order.replacement_status === "Rejected"
                  ? "bg-red-950/40 border border-red-800/40 text-red-400"
                  : "bg-amber-950/40 border border-amber-800/40 text-[var(--color-primary-gold)]"
              }`}
            >
              {order.replacement_status}
            </span>
          </div>

          <div className="text-xs space-y-1.5 text-neutral-400">
            <p>
              <strong className="text-neutral-300">Reason:</strong> {order.replacement_reason}
            </p>
            {order.replacement_requested_at && (
              <p>
                <strong className="text-neutral-300">Requested On:</strong>{" "}
                {new Date(order.replacement_requested_at).toLocaleString("en-IN")}
              </p>
            )}
            {order.replacement_status === "Rejected" && order.replacement_rejection_reason && (
              <div className="mt-3 p-3 rounded bg-red-950/30 border border-red-900/50 text-red-300">
                <strong>Rejection Reason:</strong> {order.replacement_rejection_reason}
              </div>
            )}
            {order.replacement_status === "Approved" && (
              <div className="mt-3 p-3 rounded bg-emerald-950/30 border border-emerald-900/50 text-emerald-300">
                ✓ Replacement approved. Our logistics team will dispatch your replacement copy.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visual Tracking Progress Bar */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 mb-8">
        <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-6">
          Order Status:{" "}
          <span className={isCancelled ? "text-red-400 font-bold" : "text-[var(--color-primary-gold)] font-bold"}>
            {order.order_status}
          </span>
        </h2>

        {isCancelled ? (
          <div className="p-4 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
            ⚠️ This order was cancelled. Reason: {order.cancel_reason || "Customer requested cancellation."}
          </div>
        ) : (
          <div className="relative flex items-center justify-between">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[#2A2A2A] -translate-y-1/2 z-0" />
            {ORDER_STEPS.map((step, idx) => {
              const isDone = currentStepIndex >= idx;
              return (
                <div key={step} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                      isDone
                        ? "bg-[var(--color-primary-gold)] text-black"
                        : "bg-[#222] border border-[#333] text-neutral-500"
                    }`}
                  >
                    {isDone ? "✓" : idx + 1}
                  </div>
                  <span
                    className={`text-[10px] mt-2 text-center whitespace-nowrap hidden sm:block ${
                      isDone ? "text-neutral-200 font-semibold" : "text-neutral-500"
                    }`}
                  >
                    {step}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        {/* Left 2 Cols: Order Items */}
        <div className="md:col-span-2 space-y-4">
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6">
            <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4 pb-2 border-b border-[#222]">
              Items in this Order ({order.items.length})
            </h2>

            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-4">
                  <div className="w-14 h-18 bg-[#0B0B0B] border border-[#222] rounded overflow-hidden p-1 flex-shrink-0 flex items-center justify-center">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={item.image_url} alt={item.title} className="w-full h-full object-contain" />
                  </div>

                  <div className="flex-grow min-w-0 text-xs">
                    <h3 className="font-semibold text-neutral-200 truncate">{item.title}</h3>
                    <p className="text-neutral-500 mt-0.5 font-mono">
                      Quantity: {item.quantity} × {formatPrice(Number(item.price))}
                    </p>
                  </div>

                  <div className="text-xs font-bold text-[var(--color-primary-gold)] font-mono">
                    {formatPrice(Number(item.price) * item.quantity)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Col: Delivery Address & Summary */}
        <div className="space-y-6">
          {/* Shipping Address Card */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 text-xs">
            <h2 className="font-semibold text-neutral-300 uppercase tracking-wider mb-3 pb-2 border-b border-[#222]">
              Delivery Address
            </h2>
            {address ? (
              <div className="space-y-1 text-neutral-400">
                <p className="font-bold text-neutral-200">{address.full_name}</p>
                <p>{address.house_no}, {address.area}</p>
                {address.landmark && <p>Near {address.landmark}</p>}
                <p>{address.city}, {address.state} - {address.pincode}</p>
                <p className="pt-1 text-neutral-500">Phone: {address.phone}</p>
              </div>
            ) : (
              <p className="text-neutral-500">Address record attached to order.</p>
            )}
          </div>

          {/* Delhivery Shipment Tracking Card */}
          {order.shipping_awb && (
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 text-xs space-y-2">
              <h2 className="font-semibold text-neutral-300 uppercase tracking-wider mb-3 pb-2 border-b border-[#222]">
                Shipment Tracking
              </h2>
              <div className="flex justify-between text-neutral-400">
                <span>Courier:</span>
                <span className="text-neutral-200 font-semibold">{order.shipping_courier || "Delhivery"}</span>
              </div>
              <div className="flex justify-between text-neutral-400">
                <span>AWB Number:</span>
                <span className="text-neutral-200 font-mono font-semibold">{order.shipping_awb}</span>
              </div>
              {order.shipping_tracking_url && (
                <div className="pt-2">
                  <a
                    href={order.shipping_tracking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-center py-2 px-3 rounded bg-[#064e3b] hover:bg-[#047857] text-[#fef3c7] font-semibold border border-[#047857] transition"
                  >
                    Track Package on Delhivery ↗
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Payment & Invoice Card */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 text-xs space-y-2">
            <h2 className="font-semibold text-neutral-300 uppercase tracking-wider mb-3 pb-2 border-b border-[#222]">
              Payment Summary
            </h2>
            <div className="flex justify-between text-neutral-400">
              <span>Items Subtotal:</span>
              <span className="font-mono text-neutral-200">{formatPrice(itemsSubtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-emerald-400">
                <span>Coupon Discount:</span>
                <span className="font-mono">-{formatPrice(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-neutral-400">
              <span>Delivery Charges:</span>
              <span className="text-emerald-400 font-medium">Free</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Payment Mode:</span>
              <span className="text-neutral-200 font-semibold">{order.payment_method}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Payment Status:</span>
              <span className="text-neutral-200 font-semibold">{order.payment_status}</span>
            </div>
            <div className="border-t border-[#222] pt-2 flex justify-between font-bold text-sm text-[var(--color-primary-gold)]">
              <span>Total Payable:</span>
              <span className="font-mono">{formatPrice(totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cancellation Modal */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#141414] border border-[#2E2E2E] rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="font-serif text-lg font-bold text-white mb-2">Cancel Order</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Are you sure you want to cancel order #{order.id.slice(0, 8).toUpperCase()}? Inventory will be immediately restored.
            </p>

            <form onSubmit={handleCancelSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Reason for Cancellation
                </label>
                <select
                  value={cancelReasonSelect}
                  onChange={(e) => setCancelReasonSelect(e.target.value)}
                  className="w-full bg-[#1C1C1C] border border-[#333] rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-[var(--color-primary-gold)]"
                >
                  {CANCEL_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={cancelReasonDetails}
                  onChange={(e) => setCancelReasonDetails(e.target.value)}
                  placeholder="Provide more details..."
                  rows={3}
                  className="w-full bg-[#1C1C1C] border border-[#333] rounded-lg p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-[var(--color-primary-gold)]"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowCancelModal(false)}
                  disabled={isPending}
                >
                  Keep Order
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  className="!bg-red-600 hover:!bg-red-700 !text-white"
                  disabled={isPending}
                >
                  {isPending ? "Cancelling..." : "Confirm Cancellation"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Replacement Request Modal */}
      {showReplacementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-[#141414] border border-[#2E2E2E] rounded-2xl p-6 max-w-md w-full shadow-2xl">
            <h3 className="font-serif text-lg font-bold text-white mb-1">Request Replacement</h3>
            <p className="text-xs text-neutral-400 mb-4">
              Under our 7-day replacement guarantee, eligible damaged or defective books can be replaced free of charge.
            </p>

            <form onSubmit={handleReplacementSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Reason for Replacement
                </label>
                <select
                  value={replacementReasonSelect}
                  onChange={(e) => setReplacementReasonSelect(e.target.value)}
                  className="w-full bg-[#1C1C1C] border border-[#333] rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-none focus:border-[var(--color-primary-gold)]"
                >
                  {REPLACEMENT_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1">
                  Describe Defect or Damage
                </label>
                <textarea
                  value={replacementDetails}
                  onChange={(e) => setReplacementDetails(e.target.value)}
                  placeholder="Describe the issue in detail..."
                  rows={3}
                  required
                  className="w-full bg-[#1C1C1C] border border-[#333] rounded-lg p-2.5 text-xs text-neutral-200 focus:outline-none focus:border-[var(--color-primary-gold)]"
                />
              </div>

              <div className="flex justify-end space-x-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowReplacementModal(false)}
                  disabled={isPending}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={isPending}
                >
                  {isPending ? "Submitting..." : "Submit Request"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
