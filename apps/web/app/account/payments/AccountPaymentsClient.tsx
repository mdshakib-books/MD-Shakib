"use client";

import * as React from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { formatPrice } from "@/lib/utils";
import type { CustomerPaymentItem } from "@/lib/commerce/payments";

interface AccountPaymentsClientProps {
  payments: CustomerPaymentItem[];
}

export function AccountPaymentsClient({ payments }: AccountPaymentsClientProps) {
  const getPaymentStatusBadge = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-emerald-950/20 text-emerald-400 border-emerald-800/40";
      case "Failed":
        return "bg-red-950/20 text-red-400 border-red-800/40";
      case "Refunded":
        return "bg-purple-950/20 text-purple-400 border-purple-800/40";
      case "Pending":
      default:
        return "bg-amber-950/20 text-[var(--color-primary-gold)] border-amber-800/40";
    }
  };

  return (
    <PageContainer size="md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
            Payment History
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Persisted online transactions and settlement records.
          </p>
        </div>

        <Link
          href="/account/orders"
          className="text-xs uppercase tracking-wider text-[var(--color-primary-gold)] hover:underline font-semibold"
        >
          View Orders →
        </Link>
      </div>

      <AccountNav />

      {payments.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#141414] border border-[#222] rounded-xl">
          <div className="text-4xl mb-3">💳</div>
          <h2 className="text-base font-serif text-neutral-200 uppercase">No online payment records found</h2>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto mb-6">
            If you placed orders using Cash on Delivery (COD), payment transactions are settled upon parcel handover and not processed online.
          </p>
          <Link
            href="/books"
            className="inline-block px-5 py-2 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-xs hover:bg-[var(--color-accent-gold)] transition shadow"
          >
            Browse Books
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => (
            <div
              key={p.id}
              className="bg-[#141414] border border-[#262626] rounded-xl p-5 hover:border-[#383838] transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs text-neutral-200 font-bold">
                      Order #{p.orderId ? p.orderId.slice(0, 8).toUpperCase() : "N/A"}
                    </span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full border uppercase font-medium ${getPaymentStatusBadge(
                        p.status
                      )}`}
                    >
                      {p.status}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#222] text-neutral-400">
                      {p.provider}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {new Date(p.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-500 block">Amount</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-primary-gold)]">
                      {formatPrice(p.amount)}
                    </span>
                  </div>

                  {p.orderId && (
                    <Link
                      href={`/orders/${p.orderId}`}
                      className="px-3 py-1.5 rounded-lg bg-[#222] hover:bg-[#2c2c2c] text-xs font-semibold text-neutral-200 transition"
                    >
                      Order Details
                    </Link>
                  )}
                </div>
              </div>

              <div className="pt-3 grid sm:grid-cols-2 gap-2 text-xs text-neutral-400 font-mono">
                <div>
                  <span className="text-neutral-500">Transaction ID: </span>
                  <span className="text-neutral-300">{p.providerPaymentId || p.paymentId || "Pending"}</span>
                </div>
                {p.refundStatus && (
                  <div>
                    <span className="text-neutral-500">Refund Status: </span>
                    <span className="text-purple-400 font-semibold">{p.refundStatus}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

