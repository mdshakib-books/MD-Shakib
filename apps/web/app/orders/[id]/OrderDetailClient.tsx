"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatPrice } from "@/lib/utils";
import { cancelOrder, type EnrichedOrder } from "@/lib/commerce/orders";

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

export function OrderDetailClient({ order }: OrderDetailClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isCancelled = order.order_status === "Cancelled";
  const canCancel = ["Pending", "Confirmed", "Processing"].includes(order.order_status);

  // Address Snapshot cast
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

  const handleCancel = () => {
    const reason = prompt("Please provide a reason for cancellation:");
    if (!reason || !reason.trim()) return;

    setErrorMsg(null);
    startTransition(async () => {
      const res = await cancelOrder(order.id, reason.trim());
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <PageContainer size="md">
      {/* Header and Back Link */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
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

        {canCancel && (
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="px-4 py-2 rounded-lg border border-red-900/60 bg-red-950/20 text-red-400 hover:bg-red-950/40 text-xs font-semibold transition cursor-pointer"
          >
            {isPending ? "Cancelling..." : "Cancel Order"}
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="mb-6 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
          {errorMsg}
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

          {/* Delhivery Shipment Tracking Card (When Dispatched) */}
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
              <span>Payment Mode:</span>
              <span className="text-neutral-200 font-semibold">{order.payment_method}</span>
            </div>
            <div className="flex justify-between text-neutral-400">
              <span>Payment Status:</span>
              <span className="text-neutral-200 font-semibold">{order.payment_status}</span>
            </div>
            <div className="border-t border-[#222] pt-2 flex justify-between font-bold text-sm text-[var(--color-primary-gold)]">
              <span>Total Paid/Payable:</span>
              <span className="font-mono">{formatPrice(Number(order.total_amount))}</span>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

