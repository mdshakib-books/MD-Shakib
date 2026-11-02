"use client";

import * as React from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import type { CustomerPaymentItem } from "@/lib/commerce/payments";

interface AccountPaymentsClientProps {
  payments: CustomerPaymentItem[];
}

export function AccountPaymentsClient({ payments }: AccountPaymentsClientProps) {
  const renderPaymentBadge = (status: string) => {
    switch (status) {
      case "Paid":
        return <Badge variant="success">Paid</Badge>;
      case "Failed":
        return <Badge variant="danger">Failed</Badge>;
      case "Refunded":
        return <Badge variant="info">Refunded</Badge>;
      case "Pending":
      default:
        return <Badge variant="warning">{status}</Badge>;
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
          className="text-xs uppercase tracking-wider text-[var(--color-primary-gold)] hover:text-[var(--color-accent-gold)] font-semibold inline-flex items-center gap-1"
        >
          View Orders &rarr;
        </Link>
      </div>

      <AccountNav />

      {payments.length === 0 ? (
        <div className="text-center py-16 px-4 bg-dark-surface border border-dark-border rounded-xl shadow-luxury">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border border-[var(--color-primary-gold)]/20 bg-dark-card flex items-center justify-center text-[var(--color-primary-gold)]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
          </div>
          <h2 className="text-base font-serif text-neutral-200 uppercase font-semibold">No online payment records found</h2>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto mb-6 leading-relaxed">
            If you placed orders using Cash on Delivery (COD), payment transactions are settled upon parcel handover and not processed online.
          </p>
          <Link href="/books">
            <Button variant="primary" size="md">
              Browse Books
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {payments.map((p) => (
            <div
              key={p.id}
              className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-neutral-700 transition shadow-luxury"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dark-border pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs text-neutral-200 font-bold">
                      Order #{p.orderId ? p.orderId.slice(0, 8).toUpperCase() : "N/A"}
                    </span>
                    {renderPaymentBadge(p.status)}
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-dark-card border border-dark-border text-neutral-400">
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
                    <Link href={`/orders/${p.orderId}`}>
                      <Button variant="secondary" size="sm">
                        Order Details
                      </Button>
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
