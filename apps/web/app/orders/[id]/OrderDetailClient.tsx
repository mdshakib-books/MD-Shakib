"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Badge } from "@/components/ui/Badge";
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
          <Link href="/orders" className="text-xs text-[#C9A24A] hover:underline mb-2 inline-flex items-center gap-1 font-semibold">
            <span>&larr;</span>
            <span>Back to All Orders</span>
          </Link>
          <h1 className="font-serif text-2xl md:text-3xl text-white uppercase font-bold tracking-wide">
            Order #{order.id.slice(0, 8).toUpperCase()}
          </h1>
          <p className="text-xs text-neutral-400 mt-1 font-mono font-light">
            Placed on {new Date(order.created_at).toLocaleString("en-IN")}
          </p>
        </div>

        <div className="flex items-center space-x-3">
          {canCancel && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setShowCancelModal(true)}
              disabled={isPending}
            >
              Cancel Order
            </Button>
          )}

          {canRequestReplacement && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReplacementModal(true)}
              disabled={isPending}
            >
              Request Replacement
            </Button>
          )}
        </div>
      </div>

      <AccountNav />

      {errorMsg && (
        <div className="mb-6 p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="mb-6 p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{successMsg}</span>
        </div>
      )}

      {/* Replacement Status Card (If already requested) */}
      {order.replacement_requested && (
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 mb-8 shadow-luxury">
          <div className="flex items-center justify-between mb-3 pb-2.5 border-b border-[#222222]">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
              Replacement Request Status
            </h2>
            <Badge
              variant={
                order.replacement_status === "Approved"
                  ? "success"
                  : order.replacement_status === "Rejected"
                  ? "danger"
                  : "gold"
              }
            >
              {order.replacement_status}
            </Badge>
          </div>

          <div className="text-xs space-y-1.5 text-neutral-400 font-light">
            <p>
              <strong className="text-neutral-300 font-medium">Reason:</strong> {order.replacement_reason}
            </p>
            {order.replacement_requested_at && (
              <p>
                <strong className="text-neutral-300 font-medium">Requested On:</strong>{" "}
                {new Date(order.replacement_requested_at).toLocaleString("en-IN")}
              </p>
            )}
            {order.replacement_status === "Rejected" && order.replacement_rejection_reason && (
              <div className="mt-3 p-3 rounded-lg bg-red-950/30 border border-red-900/50 text-red-300">
                <strong>Rejection Reason:</strong> {order.replacement_rejection_reason}
              </div>
            )}
            {order.replacement_status === "Approved" && (
              <div className="mt-3 p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/50 text-emerald-300 flex items-center gap-2">
                <svg className="w-4 h-4 shrink-0 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span>Replacement approved. Our logistics team will dispatch your replacement copy.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Visual Tracking Progress Bar */}
      <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 mb-8 shadow-luxury">
        <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-6 flex items-center gap-2">
          <span>Order Status:</span>
          <span className={isCancelled ? "text-red-400 font-bold" : "text-[#C9A24A] font-bold"}>
            {order.order_status}
          </span>
        </h2>

        {isCancelled ? (
          <div className="p-4 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p>This order was cancelled. Reason: {order.cancel_reason || "Customer requested cancellation."}</p>
          </div>
        ) : (
          <div className="relative flex items-center justify-between py-2">
            <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-[#2A2A2A] -translate-y-1/2 z-0" />
            {ORDER_STEPS.map((step, idx) => {
              const isDone = currentStepIndex >= idx;
              return (
                <div key={step} className="relative z-10 flex flex-col items-center">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-sm ${
                      isDone
                        ? "bg-[#C9A24A] text-black shadow-[#C9A24A]/20"
                        : "bg-[#222222] border border-[#333333] text-neutral-500"
                    }`}
                  >
                    {isDone ? (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      idx + 1
                    )}
                  </div>
                  <span
                    className={`text-[10px] mt-2 text-center whitespace-nowrap hidden sm:block ${
                      isDone ? "text-neutral-200 font-semibold" : "text-neutral-500 font-light"
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
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 shadow-luxury">
            <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-4 pb-2.5 border-b border-[#222222]">
              Items in this Order ({order.items.length})
            </h2>

            <div className="space-y-4">
              {order.items.map((item) => (
                <div key={item.id} className="flex items-center gap-4">
                  <div className="relative w-14 h-18 bg-[#0E0E0E] border border-[#222222] rounded-lg overflow-hidden p-1 flex-shrink-0 flex items-center justify-center shadow-inner">
                    {item.image_url ? (
                      <Image src={item.image_url} alt={item.title} fill sizes="56px" className="object-contain p-1" />
                    ) : (
                      <span className="text-[10px] text-neutral-500 font-serif">No Cover</span>
                    )}
                  </div>

                  <div className="flex-grow min-w-0 text-xs">
                    <h3 className="font-semibold text-neutral-200 truncate">{item.title}</h3>
                    <p className="text-neutral-400 mt-0.5 font-mono font-light">
                      Quantity: {item.quantity} × {formatPrice(Number(item.price))}
                    </p>
                  </div>

                  <div className="text-xs font-bold text-[#C9A24A] font-mono">
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
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 text-xs shadow-luxury">
            <h2 className="font-semibold text-neutral-300 uppercase tracking-wider mb-3 pb-2 border-b border-[#222222]">
              Delivery Address
            </h2>
            {address ? (
              <div className="space-y-1 text-neutral-400 font-light">
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

          {/* Payment & Price Summary */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 text-xs space-y-3 shadow-luxury">
            <h2 className="font-semibold text-neutral-300 uppercase tracking-wider pb-2 border-b border-[#222222]">
              Payment Summary
            </h2>
            <div className="flex justify-between text-neutral-400 font-light">
              <span>Payment Method</span>
              <span className="text-neutral-200 font-medium">{order.payment_method}</span>
            </div>
            <div className="flex justify-between text-neutral-400 font-light">
              <span>Payment Status</span>
              <Badge variant={order.payment_status === "Paid" ? "success" : "muted"} size="sm">
                {order.payment_status}
              </Badge>
            </div>
            <div className="border-t border-[#222222] pt-3 flex justify-between font-bold text-sm text-[#C9A24A]">
              <span>Total Paid</span>
              <span className="font-mono">{formatPrice(Number(order.total_amount))}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Cancel Order Modal */}
      <Modal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        title="Cancel Order"
        description="Please select a reason for cancelling this order. Once cancelled, inventory will be restored."
        size="md"
      >
        <form onSubmit={handleCancelSubmit} className="space-y-4">
          <Select
            label="Reason for Cancellation"
            value={cancelReasonSelect}
            onChange={(e) => setCancelReasonSelect(e.target.value)}
            options={CANCEL_REASONS.map((r) => ({ label: r, value: r }))}
          />

          <Textarea
            label="Additional Notes (Optional)"
            value={cancelReasonDetails}
            onChange={(e) => setCancelReasonDetails(e.target.value)}
            placeholder="Provide any additional context for cancellation..."
            rows={3}
          />

          <div className="flex justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowCancelModal(false)}
              disabled={isPending}
            >
              Keep Order
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              disabled={isPending}
            >
              {isPending ? "Cancelling..." : "Confirm Cancellation"}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Replacement Request Modal */}
      <Modal
        isOpen={showReplacementModal}
        onClose={() => setShowReplacementModal(false)}
        title="Request Replacement"
        description="Under our 7-day replacement guarantee, eligible damaged or defective books can be replaced free of charge."
        size="md"
      >
        <form onSubmit={handleReplacementSubmit} className="space-y-4">
          <Select
            label="Reason for Replacement"
            value={replacementReasonSelect}
            onChange={(e) => setReplacementReasonSelect(e.target.value)}
            options={REPLACEMENT_REASONS.map((r) => ({ label: r, value: r }))}
          />

          <Textarea
            label="Describe Defect or Damage"
            value={replacementDetails}
            onChange={(e) => setReplacementDetails(e.target.value)}
            placeholder="Describe the issue in detail (e.g. printing defect, cover damage)..."
            rows={3}
            required
          />

          <div className="flex justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="secondary"
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
      </Modal>
    </PageContainer>
  );
}
