"use client";

import * as React from "react";
import { useEffect, useState } from "react";

interface DeliveryOtpCardProps {
  orderId: string;
  orderStatus: string;
}

export function DeliveryOtpCard({ orderId, orderStatus }: DeliveryOtpCardProps) {
  const [otp, setOtp] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(orderStatus === "Out for Delivery");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (orderStatus !== "Out for Delivery") {
      return;
    }

    let isMounted = true;

    fetch(`/api/delivery/otp?orderId=${encodeURIComponent(orderId)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Could not retrieve delivery OTP");
        return res.json();
      })
      .then((data) => {
        if (!isMounted) return;
        if (data.eligible && data.otp) {
          setOtp(data.otp);
          setExpiresAt(data.expiresAt);
        } else {
          setError(data.message || "OTP is not available");
        }
      })
      .catch((err) => {
        if (isMounted) setError(err.message || "Network error fetching OTP");
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [orderId, orderStatus]);

  if (orderStatus !== "Out for Delivery") {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-[#1C1608] via-[#161616] to-[#1C1608] border-2 border-[#C9A24A]/60 rounded-2xl p-6 mb-8 shadow-[0_0_30px_rgba(201,162,74,0.15)] text-center relative overflow-hidden">
      <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 w-24 h-24 bg-[#C9A24A]/10 rounded-full blur-xl pointer-events-none" />

      <div className="flex items-center justify-center gap-2 mb-2">
        <svg className="w-5 h-5 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        <span className="text-xs uppercase tracking-widest font-bold text-[#E5C87B]">
          Secure Delivery Handover Code
        </span>
      </div>

      <h3 className="font-serif text-xl font-bold text-white mb-2">
        Your Delivery OTP
      </h3>

      <p className="text-xs text-neutral-300 max-w-md mx-auto mb-5 leading-relaxed">
        Your package is out for delivery! Please share this confidential 6-digit code with the courier agent only upon physical inspection and handover.
      </p>

      {loading ? (
        <div className="py-4 text-sm text-[#C9A24A] animate-pulse">
          Generating cryptographic OTP...
        </div>
      ) : error ? (
        <div className="p-3 bg-red-950/30 border border-red-800/40 text-red-300 text-xs rounded-lg max-w-sm mx-auto">
          {error}
        </div>
      ) : otp ? (
        <div>
          <div className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-[#0B0B0B] border border-[#C9A24A] rounded-xl shadow-inner mb-3">
            {otp.split("").map((digit, i) => (
              <span
                key={i}
                className="w-8 h-10 flex items-center justify-center text-2xl font-mono font-bold text-[#E5C87B] border-b-2 border-[#C9A24A]/40"
              >
                {digit}
              </span>
            ))}
          </div>

          {expiresAt && (
            <p className="text-[11px] text-neutral-500 font-mono">
              Valid until: {new Date(expiresAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}
