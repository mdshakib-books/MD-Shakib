"use client";

import * as React from "react";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { placeOrderCOD, placeOrderOnline } from "@/lib/commerce/orders";
import type { CustomerCartSummary } from "@/lib/commerce/cart";
import type { AddressRow } from "@/lib/commerce/addresses";

interface CheckoutClientProps {
  cart: CustomerCartSummary;
  addresses: AddressRow[];
}

export function CheckoutClient({ cart, addresses }: CheckoutClientProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [selectedAddressId, setSelectedAddressId] = useState<string>(
    addresses.find((a) => a.is_default)?.id || addresses[0]?.id || ""
  );
  const [paymentMethod, setPaymentMethod] = useState<"COD" | "ONLINE">("COD");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const idempotencyKeyRef = useRef<string>("");

  const handlePlaceOrder = () => {
    if (isPending) return;

    if (!selectedAddressId) {
      setErrorMsg("Please select or add a delivery address.");
      return;
    }

    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `order-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    }

    setErrorMsg(null);
    const key = idempotencyKeyRef.current;

    startTransition(async () => {
      if (paymentMethod === "COD") {
        const res = await placeOrderCOD(selectedAddressId, key);
        if (!res.success && res.error) {
          setErrorMsg(res.error);
        } else if (res.orderId) {
          router.push(`/order-success?orderId=${res.orderId}`);
        }
        return;
      }

      // Online payment via Razorpay
      const res = await placeOrderOnline(selectedAddressId, key);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
        return;
      }

      if (!res.orderId || !res.razorpayOrder) {
        setErrorMsg("Failed to initialize payment gateway order.");
        return;
      }

      const { razorpayOrder, orderId } = res;

      // Dynamically load Razorpay checkout script if not present
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
        console.warn("Razorpay checkout SDK unavailable or blocked. Redirecting to order details.");
        router.push(`/orders/${orderId}`);
        return;
      }

      const options = {
        key: razorpayOrder.keyId,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        name: "MD Shakib Islamic Books",
        description: "Authentic Islamic Books Purchase",
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
              router.push(`/order-success?orderId=${orderId}`);
            } else {
              setErrorMsg(data.error || "Payment verification failed.");
            }
          } catch (err: any) {
            setErrorMsg(err?.message || "Error verifying payment signature.");
          }
        },
        modal: {
          ondismiss: function () {
            router.push(`/orders/${orderId}`);
          },
        },
        theme: {
          color: "#C9A24A",
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    });
  };

  return (
    <PageContainer>
      <div className="py-6">
        <h1 className="text-2xl md:text-3xl font-serif text-white uppercase tracking-wide mb-1 font-bold">
          Secure Checkout
        </h1>
        <p className="text-xs text-neutral-400 mb-8 font-light">
          Complete your authentic Islamic books order with verified shipping and payment.
        </p>

        {errorMsg && (
          <div className="mb-6 p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
            {errorMsg}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left 2 Cols: Shipping Address & Payment Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Select Shipping Address */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 shadow-luxury">
              <div className="flex items-center justify-between pb-3.5 border-b border-[#262626] mb-5">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
                  1. Delivery Destination
                </h2>
                <Link href="/addresses" className="text-xs text-[#C9A24A] hover:underline font-medium">
                  + Manage Addresses
                </Link>
              </div>

              {addresses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-neutral-400 mb-4 font-light">No delivery address found.</p>
                  <Link href="/addresses">
                    <Button variant="primary" size="sm">Add Shipping Address</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <label
                      key={addr.id}
                      className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                        selectedAddressId === addr.id
                          ? "border-[#C9A24A] bg-[#C9A24A]/5 shadow-sm"
                          : "border-[#262626] hover:border-[#383838]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="shippingAddress"
                        value={addr.id}
                        checked={selectedAddressId === addr.id}
                        onChange={() => setSelectedAddressId(addr.id)}
                        className="mt-1 accent-[#C9A24A]"
                      />
                      <div className="text-xs flex-grow">
                        <div className="flex items-center space-x-2">
                          <span className="font-semibold text-neutral-100">{addr.full_name}</span>
                          <span className="text-[10px] bg-[#1F1F1F] text-neutral-400 px-2 py-0.5 rounded uppercase font-semibold">
                            {addr.address_type}
                          </span>
                          {addr.is_default && (
                            <span className="text-[10px] text-black bg-[#C9A24A] px-2 py-0.5 rounded font-bold uppercase">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-neutral-400 mt-1 font-light leading-relaxed">
                          {addr.house_no}, {addr.area}, {addr.city}, {addr.state} - {addr.pincode}
                        </p>
                        <p className="text-neutral-500 mt-1">Phone: {addr.phone}</p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Step 2: Payment Method */}
            <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 shadow-luxury">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-200 pb-3.5 border-b border-[#262626] mb-5">
                2. Payment Method
              </h2>

              <div className="space-y-3">
                <label
                  className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                    paymentMethod === "COD"
                      ? "border-[#C9A24A] bg-[#C9A24A]/5 shadow-sm"
                      : "border-[#262626] hover:border-[#383838]"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    checked={paymentMethod === "COD"}
                    onChange={() => setPaymentMethod("COD")}
                    className="mt-1 accent-[#C9A24A]"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-neutral-100">Cash on Delivery (COD)</span>
                    <p className="text-neutral-400 mt-1 font-light">
                      Pay cash upon doorstep delivery anywhere in India.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all ${
                    paymentMethod === "ONLINE"
                      ? "border-[#C9A24A] bg-[#C9A24A]/5 shadow-sm"
                      : "border-[#262626] hover:border-[#383838]"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="ONLINE"
                    checked={paymentMethod === "ONLINE"}
                    onChange={() => setPaymentMethod("ONLINE")}
                    className="mt-1 accent-[#C9A24A]"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-neutral-100">Online Payment (UPI, Cards, NetBanking)</span>
                    <p className="text-neutral-400 mt-1 font-light">
                      Fast, 100% encrypted payment processing via Razorpay gateway.
                    </p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Right Col: Price Breakdown & Place Order CTA */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 h-fit space-y-5 shadow-luxury">
            <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider pb-3 border-b border-[#262626]">
              Order Summary ({cart.items.length} items)
            </h2>

            <div className="max-h-48 overflow-y-auto space-y-2 pr-1 scrollbar-none">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between text-xs">
                  <span className="text-neutral-400 truncate max-w-[160px] font-light">
                    {item.quantity}x {item.title}
                  </span>
                  <span className="text-neutral-200 font-mono font-medium">{formatPrice(item.lineTotal)}</span>
                </div>
              ))}
            </div>

            <div className="border-t border-[#262626] pt-3.5 space-y-2 text-xs text-neutral-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-neutral-200 font-mono font-medium">{formatPrice(cart.subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Fee</span>
                <span className="text-neutral-200 font-mono font-medium">{formatPrice(cart.platformFee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Charge</span>
                <span className="text-neutral-200 font-mono font-medium">{formatPrice(cart.deliveryFee)}</span>
              </div>
              <div className="border-t border-[#262626] pt-3.5 flex justify-between font-bold text-base text-[#C9A24A]">
                <span>Total Payable</span>
                <span className="font-mono">{formatPrice(cart.totalAmount)}</span>
              </div>
            </div>

            <Button
              variant="primary"
              className="w-full mt-4 uppercase tracking-wider text-xs font-bold"
              onClick={handlePlaceOrder}
              disabled={isPending || addresses.length === 0}
            >
              {isPending ? "Placing Order..." : `Confirm Order (${formatPrice(cart.totalAmount)})`}
            </Button>

            <p className="text-[10px] text-neutral-500 text-center leading-tight">
              By placing your order, you agree to MD Shakib Books Terms and Conditions.
            </p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
