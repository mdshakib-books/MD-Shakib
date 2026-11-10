"use client";

import * as React from "react";
import { useState } from "react";

interface DeliveryVerificationClientProps {
  adminRole: string;
}

export function DeliveryVerificationClient({ adminRole }: DeliveryVerificationClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [order, setOrder] = useState<any | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // OTP Verification state
  const [otp, setOtp] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{
    success: boolean;
    message: string;
    attemptsLeft?: number;
  } | null>(null);

  // COD Collection state
  const [collectedAmount, setCollectedAmount] = useState<string>("");
  const [codRef, setCodRef] = useState<string>("");
  const [codNotes, setCodNotes] = useState<string>("");
  const [isCollectingCod, setIsCollectingCod] = useState(false);
  const [codSuccess, setCodSuccess] = useState<string | null>(null);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setIsSearching(true);
    setSearchError(null);
    setOrder(null);
    setVerifyResult(null);
    setCodSuccess(null);

    try {
      const res = await fetch(`/api/admin/orders?search=${encodeURIComponent(searchQuery.trim())}&limit=1`);
      if (!res.ok) throw new Error("Failed to find order");
      const data = await res.json();
      const found = data.orders?.[0];

      if (!found) {
        setSearchError("No matching order found. Please check Order ID or AWB.");
      } else {
        setOrder(found);
        setCollectedAmount(String(found.total_amount || ""));
      }
    } catch (err: any) {
      setSearchError(err.message || "Search error");
    } finally {
      setIsSearching(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || otp.length !== 6) return;

    setIsVerifying(true);
    setVerifyResult(null);

    try {
      const res = await fetch("/api/admin/delivery/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          otp,
          awb: order.shipping_awb,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setVerifyResult({
          success: false,
          message: data.error || "Verification failed.",
          attemptsLeft: data.attemptsLeft,
        });
      } else {
        setVerifyResult({
          success: true,
          message: `Delivery successfully verified! Order marked Delivered at ${new Date(data.delivered_at).toLocaleTimeString()}.`,
        });
        setOrder({ ...order, order_status: "Delivered" });
      }
    } catch (err: any) {
      setVerifyResult({
        success: false,
        message: err.message || "Network error during verification.",
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCollectCod = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order) return;

    setIsCollectingCod(true);
    setCodSuccess(null);

    try {
      const res = await fetch("/api/admin/delivery/cod-collect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: order.id,
          expectedAmount: Number(order.total_amount),
          collectedAmount: Number(collectedAmount),
          collectionReference: codRef,
          notes: codNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to record cash collection");
      }

      setCodSuccess(`₹${collectedAmount} Cash On Delivery recorded successfully.`);
    } catch (err: any) {
      alert(err.message || "Error recording COD collection");
    } finally {
      setIsCollectingCod(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Search Bar */}
      <section className="bg-[#161616] p-6 rounded-xl border border-neutral-800">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Enter Order ID, Reference (e.g. MDS-10001), or AWB..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-[#0B0B0B] border border-neutral-700 rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#C9A24A]"
          />
          <button
            type="submit"
            disabled={isSearching}
            className="px-6 py-2.5 bg-[#C9A24A] hover:bg-[#B89139] text-black font-semibold text-sm rounded-lg transition-colors disabled:opacity-50"
          >
            {isSearching ? "Searching..." : "Lookup Consignment"}
          </button>
        </form>

        {searchError && (
          <p className="text-red-400 text-xs mt-3 flex items-center gap-1.5">
            <span>⚠</span> {searchError}
          </p>
        )}
      </section>

      {/* Order Details & Verification Card */}
      {order && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Order Snapshot */}
          <div className="bg-[#161616] p-6 rounded-xl border border-neutral-800 space-y-4">
            <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
              <div>
                <span className="text-xs text-neutral-400 uppercase tracking-wider">Order ID</span>
                <p className="font-mono text-sm font-bold text-white">{order.order_number || order.id}</p>
              </div>
              <span
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                  order.order_status === "Out for Delivery"
                    ? "bg-amber-950/60 border border-amber-600/40 text-amber-300"
                    : order.order_status === "Delivered"
                    ? "bg-emerald-950/60 border border-emerald-600/40 text-emerald-400"
                    : "bg-neutral-800 text-neutral-300"
                }`}
              >
                {order.order_status}
              </span>
            </div>

            <div className="text-sm space-y-2 text-neutral-300">
              <p>
                <strong className="text-neutral-400">Recipient:</strong>{" "}
                {order.address_snapshot?.full_name || "Customer"}
              </p>
              <p>
                <strong className="text-neutral-400">Address:</strong>{" "}
                {order.address_snapshot?.house_no}, {order.address_snapshot?.area},{" "}
                {order.address_snapshot?.city} ({order.address_snapshot?.pincode})
              </p>
              <p>
                <strong className="text-neutral-400">AWB Tracking:</strong>{" "}
                <span className="font-mono text-xs">{order.shipping_awb || "Not assigned"}</span>
              </p>
              <p>
                <strong className="text-neutral-400">Payment Mode:</strong>{" "}
                <span className="font-semibold text-white">{order.payment_method}</span> ({order.payment_status})
              </p>
              <p>
                <strong className="text-neutral-400">Total Payable:</strong>{" "}
                <span className="font-bold text-[#E5C87B]">₹{order.total_amount}</span>
              </p>
            </div>
          </div>

          {/* Action Panels */}
          <div className="space-y-6">
            {/* Panel 1: OTP Verification */}
            <div className="bg-[#161616] p-6 rounded-xl border border-neutral-800">
              <h2 className="font-serif text-lg font-semibold text-[#C9A24A] mb-2">
                1. Delivery OTP Handover
              </h2>
              <p className="text-xs text-neutral-400 mb-4">
                Ask the customer for their 6-digit Delivery OTP shown in their tracking screen.
              </p>

              {order.order_status !== "Out for Delivery" && order.order_status !== "Delivered" && (
                <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-lg text-amber-300 text-xs mb-4">
                  Notice: Order is currently &quot;{order.order_status}&quot;. OTP verification is valid once marked Out for Delivery.
                </div>
              )}

              {verifyResult && (
                <div
                  className={`p-3.5 rounded-lg mb-4 text-xs ${
                    verifyResult.success
                      ? "bg-emerald-950/40 border border-emerald-700/50 text-emerald-300"
                      : "bg-red-950/40 border border-red-700/50 text-red-300"
                  }`}
                >
                  <p className="font-semibold">{verifyResult.message}</p>
                  {verifyResult.attemptsLeft !== undefined && (
                    <p className="mt-1 text-[11px]">Remaining attempts: {verifyResult.attemptsLeft}</p>
                  )}
                </div>
              )}

              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div>
                  <label htmlFor="delivery-otp-input" className="block text-xs font-medium text-neutral-300 mb-1">
                    Customer 6-Digit OTP
                  </label>
                  <input
                    id="delivery-otp-input"
                    type="text"
                    maxLength={6}
                    placeholder="123456"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    className="w-full text-center tracking-widest font-mono text-xl font-bold bg-[#0B0B0B] border border-neutral-700 rounded-lg py-2.5 text-white focus:outline-none focus:border-[#C9A24A]"
                    disabled={order.order_status === "Delivered"}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isVerifying || otp.length !== 6 || order.order_status === "Delivered"}
                  className="w-full py-2.5 bg-[#C9A24A] hover:bg-[#B89139] text-black font-semibold text-sm rounded-lg transition-colors disabled:opacity-40"
                >
                  {isVerifying ? "Verifying..." : order.order_status === "Delivered" ? "✓ Verified Delivered" : "Confirm Handover OTP"}
                </button>
              </form>
            </div>

            {/* Panel 2: Independent COD Cash Collection */}
            {order.payment_method === "COD" && (
              <div className="bg-[#161616] p-6 rounded-xl border border-neutral-800">
                <h2 className="font-serif text-lg font-semibold text-[#E5C87B] mb-2">
                  2. Doorstep Cash Collection (COD)
                </h2>
                <p className="text-xs text-neutral-400 mb-4">
                  Independent of OTP verification. Record physical cash received from recipient.
                </p>

                {codSuccess && (
                  <div className="p-3 bg-emerald-950/40 border border-emerald-700/50 rounded-lg text-emerald-300 text-xs mb-4">
                    ✓ {codSuccess}
                  </div>
                )}

                <form onSubmit={handleCollectCod} className="space-y-3">
                  <div>
                    <label htmlFor="cod-cash-input" className="block text-xs text-neutral-300 mb-1">
                      Cash Collected (₹)
                    </label>
                    <input
                      id="cod-cash-input"
                      type="number"
                      step="0.01"
                      value={collectedAmount}
                      onChange={(e) => setCollectedAmount(e.target.value)}
                      className="w-full bg-[#0B0B0B] border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
                      required
                    />
                  </div>

                  <div>
                    <label htmlFor="cod-pouch-ref" className="block text-xs text-neutral-300 mb-1">
                      Cash Pouch / Receipt Reference (Optional)
                    </label>
                    <input
                      id="cod-pouch-ref"
                      type="text"
                      placeholder="e.g. POUCH-8921"
                      value={codRef}
                      onChange={(e) => setCodRef(e.target.value)}
                      className="w-full bg-[#0B0B0B] border border-neutral-700 rounded-lg px-3 py-2 text-sm text-white"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isCollectingCod}
                    className="w-full py-2 bg-neutral-800 hover:bg-neutral-700 text-[#E5C87B] font-semibold text-xs rounded-lg transition-colors border border-neutral-700"
                  >
                    {isCollectingCod ? "Recording..." : "Record Cash Collection"}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
