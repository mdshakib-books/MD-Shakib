"use client";

import * as React from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import type { CustomerRefundItem } from "@/lib/commerce/payments";

interface AccountRefundsClientProps {
  refunds: CustomerRefundItem[];
}

export function AccountRefundsClient({ refunds }: AccountRefundsClientProps) {
  const renderRefundBadge = (status: string) => {
    switch (status.toLowerCase()) {
      case "processed":
      case "refunded":
        return <Badge variant="success">{status}</Badge>;
      case "failed":
        return <Badge variant="danger">{status}</Badge>;
      case "pending":
      default:
        return <Badge variant="warning">{status}</Badge>;
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
          className="text-xs uppercase tracking-wider text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] font-semibold inline-flex items-center gap-1"
        >
          View Orders &rarr;
        </Link>
      </div>

      <AccountNav />

      {refunds.length === 0 ? (
        <div className="text-center py-16 px-4 bg-dark-surface border border-dark-border rounded-xl shadow-luxury">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border border-[var(--color-primary-gold)]/20 bg-dark-card flex items-center justify-center text-[var(--color-primary-gold)]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>
          <h2 className="text-base font-serif text-neutral-200 uppercase font-semibold">No active or historical refunds</h2>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto mb-6 leading-relaxed">
            Refunds are initiated when eligible prepaid orders are cancelled or returned. Cash on Delivery (COD) orders do not generate online refund records.
          </p>
          <Link href="/account/orders">
            <Button variant="secondary" size="md">
              Review Orders
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {refunds.map((ref) => (
            <div
              key={ref.orderId}
              className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-neutral-700 transition shadow-luxury"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dark-border pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs text-neutral-200 font-bold">
                      Order #{ref.orderId.slice(0, 8).toUpperCase()}
                    </span>
                    {renderRefundBadge(ref.status)}
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

                  <Link href={`/orders/${ref.orderId}`}>
                    <Button variant="secondary" size="sm">
                      Order Details
                    </Button>
                  </Link>
                </div>
              </div>

              <div className="pt-3 grid sm:grid-cols-2 gap-2 text-xs text-neutral-400 font-mono">
                <div>
                  <span className="text-neutral-500">Refund ID: </span>
                  <span className="text-neutral-300">{ref.refundId || "Pending"}</span>
                </div>
                <div>
                  <span className="text-neutral-500">Payment Method: </span>
                  <span className="text-neutral-300 uppercase">{ref.paymentMethod}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
