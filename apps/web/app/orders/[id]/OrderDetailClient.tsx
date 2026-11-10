"use client";

import * as React from "react";
import { useState, useTransition, useEffect } from "react";
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
import {
  cancelOrder,
  retryOrderPayment,
  type EnrichedOrder,
} from "@/lib/commerce/orders";
import type { NormalizedTrackingResult } from "@/lib/integrations/delhivery/service";
import { DeliveryOtpCard } from "@/components/commerce/DeliveryOtpCard";

interface OrderDetailClientProps {
  order: EnrichedOrder;
  initialReturnRequest?: any | null;
}

const ORDER_STEPS = [
  "Pending",
  "Confirmed",
  "Processing",
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

const RETURN_REASONS = [
  "Damaged cover or binding in transit",
  "Printing defect or illegible text",
  "Missing pages or inverted binding",
  "Wrong edition or book delivered",
  "Defective copy or quality issue",
  "Changed mind / No longer needed",
  "Other reason",
];

export function OrderDetailClient({ order, initialReturnRequest = null }: OrderDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Return & Refund state
  const [returnRequest, setReturnRequest] = useState<any | null>(initialReturnRequest);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [returnReason, setReturnReason] = useState(RETURN_REASONS[0]);
  const [returnDetails, setReturnDetails] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(order.items.map((i) => i.id));
  const [isSubmittingReturn, setIsSubmittingReturn] = useState(false);

  // Modal states
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReasonSelect, setCancelReasonSelect] = useState(CANCEL_REASONS[0]);
  const [cancelReasonDetails, setCancelReasonDetails] = useState("");

  // Retry payment state
  const [isRetryingPayment, setIsRetryingPayment] = useState(false);

  // Tracking state
  const [trackingData, setTrackingData] = useState<NormalizedTrackingResult | null>(null);
  const [loadingTracking, setLoadingTracking] = useState(() => Boolean(order.shipping_awb));

  const isCancelled = order.order_status === "Cancelled";
  // Customer can cancel only before dispatch (Pending, Confirmed, Processing, Packed)
  const canCancel = ["Pending", "Confirmed", "Processing", "Packed"].includes(order.order_status);

  // Payment retry eligibility (Feature 1.5)
  const canRetryPayment =
    order.payment_method === "ONLINE" &&
    order.payment_status !== "Paid" &&
    order.order_status === "Pending";

  const [currentTime] = useState(() => Date.now());
  const isDelivered = order.order_status === "Delivered" || order.order_status === "Replacement Delivered";
  const deliveryTimestamp = order.delivered_at || order.shipping_delivered_at;
  const deliveryTime = deliveryTimestamp ? new Date(deliveryTimestamp).getTime() : null;
  const isWithin7Days = deliveryTime
    ? currentTime - deliveryTime <= 7 * 24 * 60 * 60 * 1000 && currentTime >= deliveryTime
    : false;
  const canRequestReturn = isDelivered && isWithin7Days && !returnRequest;

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
  const displayOrderNum = order.order_number || order.id.slice(0, 8).toUpperCase();

  // Load live tracking scans when AWB is present (Feature 1.14)
  useEffect(() => {
    if (!order.shipping_awb) return;

    let isMounted = true;

    fetch(`/api/shipping/track?awb=${encodeURIComponent(order.shipping_awb)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (data && !data.error) {
          setTrackingData(data);
        }
      })
      .catch((err) => console.warn("Failed to load tracking:", err))
      .finally(() => {
        if (isMounted) setLoadingTracking(false);
      });

    return () => {
      isMounted = false;
    };
  }, [order.shipping_awb]);

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

  const handleSubmitReturn = async () => {
    if (!returnReason.trim()) return;
    setIsSubmittingReturn(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const itemsPayload = order.items
        .filter((i) => selectedItemIds.includes(i.id))
        .map((i) => ({
          orderItemId: i.id,
          bookId: i.book_id,
          quantity: i.quantity,
        }));

      if (itemsPayload.length === 0) {
        setErrorMsg("Please select at least one item to return.");
        setIsSubmittingReturn(false);
        return;
      }

      const res = await fetch("/api/returns/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          requestType: "return_refund",
          reason: returnReason,
          description: returnDetails,
          items: itemsPayload,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMsg(data.error || "Failed to submit return request.");
      } else {
        setSuccessMsg("Return request submitted successfully. Our team will review it shortly.");
        setReturnRequest({
          return_number: data.returnNumber || `RET-${Date.now().toString().slice(-6)}`,
          request_type: "return_refund",
          reason: returnReason,
          description: returnDetails,
          status: "submitted",
          created_at: new Date().toISOString(),
        });
        setShowReturnModal(false);
        router.refresh();
      }
    } catch (err: any) {
      setErrorMsg(err?.message || "Network error submitting return request.");
    } finally {
      setIsSubmittingReturn(false);
    }
  };

  // Feature 1.5: Payment Retry Workflow
  const handleRetryPayment = async () => {
    if (isRetryingPayment) return;
    setErrorMsg(null);
    setIsRetryingPayment(true);

    try {
      const res = await retryOrderPayment(order.id);
      if (!res.success || !res.razorpayOrder) {
        setErrorMsg(res.error || "Unable to initialize payment retry.");
        setIsRetryingPayment(false);
        return;
      }

      const { razorpayOrder } = res;

      // Load Razorpay checkout script
      const loadScript = (src: string) =>
        new Promise<boolean>((resolve) => {
          if (typeof window === "undefined") return resolve(false);
          if ((window as any).Razorpay) return resolve(true);
          const script = document.createElement("script");
          script.src = src;
          script.onload = () => resolve(true);
          script.onerror = () => resolve(false);
          document.body.appendChild(script);
        });

      const isLoaded = await loadScript("https://checkout.razorpay.com/v1/checkout.js");

      if (!isLoaded || !(window as any).Razorpay) {
        setErrorMsg("Payment gateway checkout script could not be loaded. Please refresh or check ad-blocker.");
        setIsRetryingPayment(false);
        return;
      }

      const options = {
        key: razorpayOrder.keyId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: "MD Shakib Islamic Books",
        description: `Retry Payment for Order #${displayOrderNum}`,
        order_id: razorpayOrder.razorpayOrderId,
        handler: async function (response: any) {
          try {
            const verifyRes = await fetch("/api/payments/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(response),
            });
            const data = await verifyRes.json();
            if (data.success) {
              setSuccessMsg("Payment successfully verified! Your order is confirmed.");
              router.refresh();
            } else {
              setErrorMsg(data.error || "Payment verification failed.");
            }
          } catch (err: any) {
            setErrorMsg(err?.message || "Error verifying payment signature.");
          } finally {
            setIsRetryingPayment(false);
          }
        },
        modal: {
          ondismiss: function () {
            setIsRetryingPayment(false);
          },
        },
        theme: {
          color: "#C9A24A",
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      setErrorMsg(err?.message || "Unexpected error during payment retry.");
      setIsRetryingPayment(false);
    }
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
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="font-serif text-2xl md:text-3xl text-white uppercase font-bold tracking-wide">
              Order #{displayOrderNum}
            </h1>
            <Badge variant={order.order_status === "Delivered" ? "success" : isCancelled ? "danger" : "gold"}>
              {order.order_status}
            </Badge>
          </div>
          <p className="text-xs text-neutral-400 mt-1 font-mono font-light">
            Internal Ref: {order.id} • Placed on {new Date(order.created_at).toLocaleString("en-IN")}
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-2.5">
          <a
            href={`/api/documents/invoice/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#C9A24A]/40 text-[#C9A24A] hover:bg-[#C9A24A]/10 text-xs font-semibold uppercase tracking-wider transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <span>Invoice</span>
          </a>

          <a
            href={`/api/documents/receipt/${order.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:text-white hover:bg-neutral-800 text-xs font-semibold uppercase tracking-wider transition-colors"
          >
            <span>Receipt</span>
          </a>

          {canRetryPayment && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleRetryPayment}
              disabled={isRetryingPayment}
              className="bg-[#C9A24A] hover:bg-[#B89139] text-black font-bold uppercase tracking-wider text-xs"
            >
              {isRetryingPayment ? "Opening Gateway..." : "Retry Payment"}
            </Button>
          )}

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

          {canRequestReturn && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowReturnModal(true)}
              disabled={isPending || isSubmittingReturn}
              className="border-[#C9A24A]/60 text-[#C9A24A] hover:bg-[#C9A24A]/10 text-xs font-semibold uppercase tracking-wider"
            >
              Request Return / Refund
            </Button>
          )}

          <Link
            href={`/account/support?orderId=${order.id}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2A2A] text-neutral-300 hover:text-white hover:border-[#C9A24A] text-xs font-medium transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            Need Help?
          </Link>
        </div>
      </div>

      <AccountNav />

      {errorMsg && (
        <div role="alert" className="mb-6 p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs flex items-center justify-between">
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-neutral-400 hover:text-white ml-2 text-xs underline focus:outline-none"
          >
            Dismiss
          </button>
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

      {/* Return & Refund Status Card */}
      {returnRequest && (
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 mb-8 shadow-luxury space-y-3 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-2 pb-2.5 border-b border-[#222222]">
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase font-bold tracking-wider text-[#C9A24A]">
                Return & Refund Request
              </span>
              <span className="text-xs font-mono text-neutral-400">
                #{returnRequest.return_number}
              </span>
            </div>
            <Badge
              variant={
                returnRequest.status === "completed"
                  ? "success"
                  : returnRequest.status === "approved" || returnRequest.status === "pickup_scheduled"
                  ? "gold"
                  : returnRequest.status === "rejected"
                  ? "danger"
                  : "info"
              }
            >
              {returnRequest.status.replace(/_/g, " ").toUpperCase()}
            </Badge>
          </div>

          <div className="text-xs text-neutral-300 space-y-2">
            <p><span className="text-neutral-500 font-medium">Claim Reason:</span> {returnRequest.reason}</p>
            {returnRequest.description && (
              <p><span className="text-neutral-500 font-medium">Customer Details:</span> {returnRequest.description}</p>
            )}
            {returnRequest.rejection_reason && (
              <p className="text-red-400"><span className="font-semibold">Rejection Note:</span> {returnRequest.rejection_reason}</p>
            )}
            {returnRequest.pickup_awb && (
              <p className="text-neutral-400 font-mono"><span className="text-neutral-500 font-sans font-medium">Reverse Courier AWB:</span> {returnRequest.pickup_awb}</p>
            )}
            {returnRequest.refund_amount > 0 && (
              <p className="text-[#C9A24A] font-semibold">Refund Amount: ₹{Number(returnRequest.refund_amount).toFixed(2)}</p>
            )}
            <p className="text-[11px] text-neutral-500">
              Submitted on {new Date(returnRequest.created_at).toLocaleString("en-IN")}
            </p>
          </div>
        </div>
      )}

      {/* Feature 2.4: Delivery Handover OTP */}
      <DeliveryOtpCard orderId={order.id} orderStatus={order.order_status} />

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

      {/* Feature 1.14: Logistics & Live Shipment Tracking Card */}
      {order.shipping_awb && (
        <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 mb-8 shadow-luxury">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 border-b border-[#222222] mb-4 gap-2">
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
                Logistics &amp; Tracking Information
              </h2>
              <p className="text-xs text-neutral-400 mt-0.5 font-light">
                Fulfilled via <strong>{order.shipping_courier || "Delhivery"}</strong> • Waybill Number:{" "}
                <span className="font-mono text-[#C9A24A]">{order.shipping_awb}</span>
              </p>
            </div>
            {order.shipping_tracking_url && (
              <a
                href={order.shipping_tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[#C9A24A] hover:underline inline-flex items-center gap-1 self-start sm:self-auto"
              >
                <span>Live Delhivery Portal</span>
                <span>↗</span>
              </a>
            )}
          </div>

          {loadingTracking ? (
            <p className="text-xs text-neutral-500 italic py-2">Loading live tracking events...</p>
          ) : trackingData && trackingData.scans && trackingData.scans.length > 0 ? (
            <div className="space-y-3 pt-1">
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
                Activity Timeline
              </h3>
              <div className="space-y-2 border-l border-[#2A2A2A] ml-2 pl-4">
                {trackingData.scans.map((scan, idx) => (
                  <div key={idx} className="relative text-xs">
                    <div className="absolute -left-[21px] top-1.5 w-2 h-2 rounded-full bg-[#C9A24A]" />
                    <p className="font-medium text-neutral-200">{scan.status}</p>
                    <p className="text-[11px] text-neutral-400 font-light">
                      {scan.location} • {new Date(scan.timestamp).toLocaleString("en-IN")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-neutral-500 font-light">
              Package registered with Delhivery logistics. Live scan events will appear as your consignment moves through transit hubs.
            </p>
          )}
        </div>
      )}

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

        {/* Right Col: Delivery Address & Financial Breakdown */}
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

          {/* Payment & Price Summary Breakdown (Feature 1.1) */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-5 text-xs space-y-3 shadow-luxury">
            <h2 className="font-semibold text-neutral-300 uppercase tracking-wider pb-2 border-b border-[#222222]">
              Payment &amp; Price Breakdown
            </h2>
            <div className="flex justify-between text-neutral-400 font-light">
              <span>Payment Method</span>
              <span className="text-neutral-200 font-medium">{order.payment_method}</span>
            </div>
            <div className="flex justify-between text-neutral-400 font-light items-center">
              <span>Payment Status</span>
              <Badge variant={order.payment_status === "Paid" ? "success" : "gold"} size="sm">
                {order.payment_status}
              </Badge>
            </div>

            <div className="border-t border-[#222222] pt-3 space-y-2 text-neutral-400 font-light">
              <div className="flex justify-between">
                <span>Items Subtotal</span>
                <span className="text-neutral-200 font-mono font-medium">
                  {formatPrice(Number(order.subtotal || order.total_amount))}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Platform Fee</span>
                <span className="text-neutral-200 font-mono font-medium">
                  {formatPrice(Number(order.platform_fee || 10))}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Charge</span>
                <span className="text-neutral-200 font-mono font-medium">
                  {formatPrice(Number(order.delivery_fee || 35))}
                </span>
              </div>
              {order.discount_amount && Number(order.discount_amount) > 0 ? (
                <div className="flex justify-between text-[#E5C87B]">
                  <span>Coupon Discount ({order.coupon_code || "APPLIED"})</span>
                  <span className="font-mono font-medium">
                    -{formatPrice(Number(order.discount_amount))}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="border-t border-[#222222] pt-3 flex justify-between font-bold text-sm text-[#C9A24A]">
              <span>Final Total</span>
              <span className="font-mono">{formatPrice(Number(order.total_amount))}</span>
            </div>

            {canRetryPayment && (
              <Button
                variant="primary"
                size="sm"
                onClick={handleRetryPayment}
                disabled={isRetryingPayment}
                className="w-full mt-3 bg-[#C9A24A] hover:bg-[#B89139] text-black font-bold uppercase tracking-wider text-xs"
              >
                {isRetryingPayment ? "Processing..." : "Complete Payment Now"}
              </Button>
            )}
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

      {/* Return & Refund Request Modal */}
      <Modal
        isOpen={showReturnModal}
        onClose={() => setShowReturnModal(false)}
        title="Request Return for Refund"
        description="Under our 7-day policy, authentic Islamic books delivered in defective or damaged condition are eligible for return and full refund."
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmitReturn();
          }}
          className="space-y-4"
        >
          <Select
            label="Reason for Return"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
            options={RETURN_REASONS.map((r) => ({ label: r, value: r }))}
          />

          <Textarea
            label="Additional Details (Optional)"
            value={returnDetails}
            onChange={(e) => setReturnDetails(e.target.value)}
            placeholder="Please share any helpful details regarding the condition of the book..."
            rows={3}
          />

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-neutral-300">Select Item(s)</label>
            <div className="space-y-2 border border-neutral-800 rounded-lg p-2.5 max-h-36 overflow-y-auto">
              {order.items.map((it) => (
                <label key={it.id} className="flex items-center gap-2.5 text-xs text-neutral-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedItemIds.includes(it.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedItemIds([...selectedItemIds, it.id]);
                      } else {
                        setSelectedItemIds(selectedItemIds.filter((id) => id !== it.id));
                      }
                    }}
                    className="accent-[#C9A24A] rounded"
                  />
                  <span className="truncate flex-1">{it.title} (Qty: {it.quantity})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowReturnModal(false)}
              disabled={isSubmittingReturn}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={isSubmittingReturn || selectedItemIds.length === 0}
              className="bg-[#C9A24A] hover:bg-[#B89139] text-black font-bold uppercase tracking-wider text-xs"
            >
              {isSubmittingReturn ? "Submitting..." : "Submit Return Request"}
            </Button>
          </div>
        </form>
      </Modal>
    </PageContainer>
  );
}
