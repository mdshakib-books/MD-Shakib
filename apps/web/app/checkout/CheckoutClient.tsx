"use client";

import * as React from "react";
import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { placeOrderCOD, placeOrderOnline } from "@/lib/commerce/orders";
import { validateCustomerCoupon, type CustomerCouponValidationResult } from "@/lib/commerce/coupons";
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

  // Coupon state
  const [couponInput, setCouponInput] = useState("");
  const [couponPending, setCouponPending] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountType?: "percentage" | "fixed";
    discountValue?: number;
    calculatedDiscount: number;
  } | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Address pincode serviceability state
  const selectedAddress = addresses.find((a) => a.id === selectedAddressId);
  const [serviceability, setServiceability] = useState<{
    serviceable: boolean;
    prepaid: boolean;
    cod: boolean;
  } | null>(null);

  useEffect(() => {
    if (!selectedAddress?.pincode) return;

    let isMounted = true;

    fetch(`/api/shipping/serviceability?pincode=${encodeURIComponent(selectedAddress.pincode)}`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        const svc = data?.data || data;
        if (svc && typeof svc.serviceable === "boolean") {
          setServiceability({
            serviceable: Boolean(svc.serviceable),
            prepaid: Boolean(svc.prepaid),
            cod: Boolean(svc.cod),
          });
          if (!svc.cod) {
            setPaymentMethod((prev) => (prev === "COD" ? "ONLINE" : prev));
          }
        } else {
          setServiceability({ serviceable: true, prepaid: true, cod: true });
        }
      })
      .catch(() => {
        if (isMounted) setServiceability({ serviceable: true, prepaid: true, cod: true });
      });

    return () => {
      isMounted = false;
    };
  }, [selectedAddress?.pincode]);

  const handleApplyCoupon = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = couponInput.trim().toUpperCase();
    if (!clean) return;

    setCouponPending(true);
    setCouponFeedback(null);

    try {
      const res: CustomerCouponValidationResult = await validateCustomerCoupon(
        clean,
        cart.subtotal
      );

      if (!res.valid || !res.calculatedDiscount) {
        setCouponFeedback({
          type: "error",
          message: res.error || "Invalid or ineligible promotional code.",
        });
      } else {
        setAppliedCoupon({
          code: res.code || clean,
          discountType: res.discountType,
          discountValue: res.discountValue,
          calculatedDiscount: res.calculatedDiscount,
        });
        setCouponFeedback({
          type: "success",
          message: `Coupon ${res.code || clean} applied! ₹${res.calculatedDiscount.toFixed(2)} savings.`,
        });
        setCouponInput("");
      }
    } catch (err: any) {
      setCouponFeedback({
        type: "error",
        message: err?.message || "Failed to validate coupon code.",
      });
    } finally {
      setCouponPending(false);
    }
  };

  const handleRemoveCoupon = () => {
    setAppliedCoupon(null);
    setCouponFeedback(null);
    setCouponInput("");
  };

  const discountAmount = appliedCoupon?.calculatedDiscount || 0;
  const finalPayable = Math.max(
    0,
    cart.subtotal + cart.platformFee + cart.deliveryFee - discountAmount
  );

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
    const couponCode = appliedCoupon?.code;

    startTransition(async () => {
      if (paymentMethod === "COD") {
        const res = await placeOrderCOD(selectedAddressId, key, couponCode);
        if (!res.success && res.error) {
          setErrorMsg(res.error);
        } else if (res.orderId) {
          router.push(`/order-success?orderId=${res.orderId}`);
        }
        return;
      }

      // Online payment via Razorpay
      const res = await placeOrderOnline(selectedAddressId, key, couponCode);
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
          <div role="alert" className="mb-6 p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-neutral-400 hover:text-white ml-2 text-xs underline focus-visible:ring-1 focus-visible:ring-[#C9A24A] rounded"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left 2 Cols: Shipping Address & Payment Selection */}
          <div className="lg:col-span-2 space-y-6">
            {/* Step 1: Select Shipping Address */}
            <fieldset className="bg-[#141414] border border-[#262626] rounded-xl p-6 shadow-luxury">
              <div className="flex items-center justify-between pb-3.5 border-b border-[#262626] mb-5">
                <legend className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
                  1. Delivery Destination
                </legend>
                <Link href="/addresses" className="text-xs text-[#C9A24A] hover:underline font-medium focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24A] rounded">
                  + Manage Addresses
                </Link>
              </div>

              {addresses.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-xs text-neutral-400 mb-4 font-light">No delivery address found.</p>
                  <Link
                    href="/addresses"
                    className="inline-flex items-center justify-center font-medium rounded-lg transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] bg-[#C9A24A] hover:bg-[#B89139] text-black font-semibold text-xs px-4 py-2 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A]"
                  >
                    Add Shipping Address
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {addresses.map((addr) => (
                    <label
                      key={addr.id}
                      className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)] focus-within:ring-2 focus-within:ring-[#C9A24A] ${
                        selectedAddressId === addr.id
                          ? "border-[#C9A24A] bg-[#C9A24A]/5 shadow-[0_0_15px_rgba(201,162,74,0.1)]"
                          : "border-[#262626] hover:border-[#383838]"
                      }`}
                    >
                      <input
                        type="radio"
                        name="shippingAddress"
                        value={addr.id}
                        checked={selectedAddressId === addr.id}
                        onChange={() => setSelectedAddressId(addr.id)}
                        className="mt-1 accent-[#C9A24A] focus:outline-none"
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
                        <p className="text-neutral-400 mt-1">Phone: {addr.phone}</p>

                        {/* Live Pincode Serviceability Indicator */}
                        {selectedAddressId === addr.id && (
                          <div className="mt-2 flex items-center gap-2 text-[11px]">
                            {serviceability ? (
                              serviceability.serviceable ? (
                                <span className="text-emerald-400 flex items-center gap-1 font-medium">
                                  <span>✓</span>
                                  <span>Delhivery Express: Prepaid {serviceability.cod ? "& COD available" : "only (COD unavailable)"}</span>
                                </span>
                              ) : (
                                <span className="text-amber-400 flex items-center gap-1">
                                  <span>⚠️</span>
                                  <span>Limited courier coverage for this pincode.</span>
                                </span>
                              )
                            ) : (
                              <span className="text-neutral-500 italic">Verifying Delhivery courier serviceability...</span>
                            )}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </fieldset>

            {/* Step 2: Payment Method */}
            <fieldset className="bg-[#141414] border border-[#262626] rounded-xl p-6 shadow-luxury">
              <legend className="text-xs font-semibold uppercase tracking-wider text-neutral-200 pb-3.5 border-b border-[#262626] mb-5 w-full block">
                2. Payment Method
              </legend>

              <div className="space-y-3">
                <label
                  className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)] focus-within:ring-2 focus-within:ring-[#C9A24A] ${
                    paymentMethod === "COD"
                      ? "border-[#C9A24A] bg-[#C9A24A]/5 shadow-[0_0_15px_rgba(201,162,74,0.1)]"
                      : "border-[#262626] hover:border-[#383838]"
                  } ${serviceability && !serviceability.cod ? "opacity-60 cursor-not-allowed" : ""}`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="COD"
                    disabled={Boolean(serviceability && !serviceability.cod)}
                    checked={paymentMethod === "COD"}
                    onChange={() => setPaymentMethod("COD")}
                    className="mt-1 accent-[#C9A24A] focus:outline-none"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-neutral-100">Cash on Delivery (COD)</span>
                    <p className="text-neutral-400 mt-1 font-light">
                      {serviceability && !serviceability.cod
                        ? "COD is not available for this pincode. Please use Online Payment."
                        : "Pay cash upon doorstep delivery anywhere in India."}
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3.5 p-4 rounded-xl border cursor-pointer transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)] focus-within:ring-2 focus-within:ring-[#C9A24A] ${
                    paymentMethod === "ONLINE"
                      ? "border-[#C9A24A] bg-[#C9A24A]/5 shadow-[0_0_15px_rgba(201,162,74,0.1)]"
                      : "border-[#262626] hover:border-[#383838]"
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    value="ONLINE"
                    checked={paymentMethod === "ONLINE"}
                    onChange={() => setPaymentMethod("ONLINE")}
                    className="mt-1 accent-[#C9A24A] focus:outline-none"
                  />
                  <div className="text-xs">
                    <span className="font-semibold text-neutral-100">Online Payment (UPI, Cards, NetBanking)</span>
                    <p className="text-neutral-400 mt-1 font-light">
                      Fast, 100% encrypted payment processing via Razorpay gateway.
                    </p>
                  </div>
                </label>
              </div>
            </fieldset>
          </div>

          {/* Right Col: Coupon Box, Price Breakdown & Place Order CTA */}
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

            {/* Feature 1.6: Coupon Entry Experience */}
            <div className="border-t border-[#262626] pt-3.5 space-y-2">
              <label className="text-[11px] font-semibold uppercase tracking-wider text-neutral-300 block">
                Promotional Coupon
              </label>

              {appliedCoupon ? (
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#C9A24A]/10 border border-[#C9A24A]/40 text-xs">
                  <div>
                    <span className="font-mono font-bold text-[#E5C87B]">{appliedCoupon.code}</span>
                    <span className="text-neutral-400 ml-2">(-{formatPrice(appliedCoupon.calculatedDiscount)})</span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRemoveCoupon}
                    className="text-xs text-red-400 hover:text-red-300 font-medium underline focus:outline-none"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={couponInput}
                    onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                    placeholder="Enter coupon code"
                    className="flex-grow bg-[#1A1A1A] border border-[#333333] rounded-lg px-3 py-1.5 text-xs text-white uppercase placeholder-neutral-500 font-mono focus:outline-none focus:border-[#C9A24A]"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handleApplyCoupon()}
                    disabled={couponPending || !couponInput.trim()}
                    className="text-xs whitespace-nowrap"
                  >
                    {couponPending ? "Checking..." : "Apply"}
                  </Button>
                </div>
              )}

              {couponFeedback && (
                <p
                  className={`text-[11px] font-medium ${
                    couponFeedback.type === "success" ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {couponFeedback.message}
                </p>
              )}
            </div>

            {/* Price Breakdown */}
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
              {appliedCoupon && appliedCoupon.calculatedDiscount > 0 && (
                <div className="flex justify-between text-[#E5C87B]">
                  <span>Coupon Discount ({appliedCoupon.code})</span>
                  <span className="font-mono font-medium">-{formatPrice(appliedCoupon.calculatedDiscount)}</span>
                </div>
              )}
              <div className="border-t border-[#262626] pt-3.5 flex justify-between font-bold text-base text-[#C9A24A]">
                <span>Total Payable</span>
                <span className="font-mono">{formatPrice(finalPayable)}</span>
              </div>
            </div>

            <Button
              variant="primary"
              className="w-full mt-4 uppercase tracking-wider text-xs font-bold"
              onClick={handlePlaceOrder}
              disabled={isPending || addresses.length === 0}
            >
              {isPending ? "Placing Order..." : `Confirm Order (${formatPrice(finalPayable)})`}
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
