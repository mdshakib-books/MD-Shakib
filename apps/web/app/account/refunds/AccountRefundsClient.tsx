"use client";

import * as React from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { formatPrice } from "@/lib/utils";
import type { CustomerRefundItem } from "@/lib/commerce/payments";

interface AccountRefundsClientProps {
  refunds: CustomerRefundItem[];
}

export function AccountRefundsClient({ refunds }: AccountRefundsClientProps) {
  const getRefundBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "processed":
      case "refunded":
        return "bg-emerald-950/30 text-emerald-400 border-emerald-800/40";
      case "failed":
        return "bg-red-950/30 text-red-400 border-red-800/40";
      case "pending":
      default:
        return "bg-amber-950/30 text-[var(--color-primary-gold)] border-amber-800/40";
    }
  };

  return (
    <PageContainer size="md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
            Refund Status
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Track status and transaction references for returned or cancelled online payments.
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

      {refunds.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#141414] border border-[#222] rounded-xl">
          <div className="text-4xl mb-3">🔄</div>
          <h2 className="text-base font-serif text-neutral-200 uppercase">No active or historical refunds</h2>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto mb-6">
            Refunds are initiated when eligible prepaid orders are cancelled or returned. Cash on Delivery (COD) orders do not generate online refund records.
          </p>
          <Link
            href="/account/orders"
            className="inline-block px-5 py-2 rounded-lg bg-[#222] hover:bg-[#2c2c2c] text-neutral-200 font-semibold text-xs transition border border-[#333]"
          >
            Review Orders
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {refunds.map((ref) => (
            <div
              key={ref.orderId}
              className="bg-[#141414] border border-[#262626] rounded-xl p-5 hover:border-[#383838] transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs text-neutral-200 font-bold">
                      Order #{ref.orderId.slice(0, 8).toUpperCase()}
                    </span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full border uppercase font-semibold ${getRefundBadge(
                        ref.status
                      )}`}
                    >
                      {ref.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {ref.refundedAt
                      ? `Completed on ${new Date(ref.refundedAt).toLocaleDateString("en-IN")}`
                      : `Initiated on ${new Date(ref.createdAt).toLocaleDateString("en-IN")}`}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-500 block">Refund Amount</span>
                    <span className="font-mono text-sm font-bold text-emerald-400">
                      {formatPrice(ref.amount)}
                    </span>
                  </div>

                  <Link
                    href={`/orders/${ref.orderId}`}
                    className="px-3 py-1.5 rounded-lg bg-[#222] hover:bg-[#2c2c2c] text-xs font-semibold text-neutral-200 transition"
                  >
                    Details →
                  </Link>
                </div>
              </div>

              <div className="pt-3 grid sm:grid-cols-2 gap-2 text-xs text-neutral-400 font-mono">
                <div>
                  <span className="text-neutral-500">Refund Reference: </span>
                  <span className="text-neutral-300">{ref.refundId || "Under processing"}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Payment Status: </span>
                  <span className="text-neutral-300">{ref.paymentStatus}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}

