"use client";

import * as React from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import type { EnrichedOrder } from "@/lib/commerce/orders";

interface AccountReplacementsClientProps {
  replacements: EnrichedOrder[];
}

export function AccountReplacementsClient({ replacements }: AccountReplacementsClientProps) {
  const renderReplacementBadge = (status: string) => {
    switch (status) {
      case "Approved":
      case "Replacement Delivered":
        return <Badge variant="success">{status}</Badge>;
      case "Rejected":
        return <Badge variant="danger">{status}</Badge>;
      case "Replacement Shipped":
        return <Badge variant="info">{status}</Badge>;
      case "Requested":
      default:
        return <Badge variant="warning">{status}</Badge>;
    }
  };

  return (
    <PageContainer size="md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-serif text-2xl md:text-3xl text-[var(--color-primary-gold)] uppercase font-bold">
            Replacement Requests
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Track customer replacement applications under our 7-day post-delivery guarantee.
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

      {/* Policy Information Notice */}
      <div className="mb-6 p-4 rounded-xl bg-dark-surface border border-dark-border text-xs text-neutral-300 shadow-luxury">
        <strong className="text-[var(--color-primary-gold)] block uppercase font-semibold mb-1">
          7-Day Replacement Policy
        </strong>
        Books that arrive with printing defects, missing pages, or transit damage are eligible for a free replacement within 7 calendar days of verified delivery.
      </div>

      {replacements.length === 0 ? (
        <div className="text-center py-16 px-4 bg-dark-surface border border-dark-border rounded-xl shadow-luxury">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full border border-[var(--color-primary-gold)]/20 bg-dark-card flex items-center justify-center text-[var(--color-primary-gold)]">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <h2 className="text-base font-serif text-neutral-200 uppercase font-semibold">No active replacement requests</h2>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto mb-6 leading-relaxed">
            If a book from any of your delivered orders has manufacturing or binding defects, you can submit a replacement request from your order details page.
          </p>
          <Link href="/account/orders">
            <Button variant="primary" size="md">
              Review Delivered Orders
            </Button>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {replacements.map((order) => (
            <div
              key={order.id}
              className="bg-dark-surface border border-dark-border rounded-xl p-5 hover:border-neutral-700 transition shadow-luxury"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-dark-border pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs text-neutral-200 font-bold">
                      Order #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    {renderReplacementBadge(order.replacement_status)}
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Requested on{" "}
                    {order.replacement_requested_at
                      ? new Date(order.replacement_requested_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Pending"}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-500 block">Total</span>
                    <span className="font-mono text-sm font-bold text-[var(--color-primary-gold)]">
                      {formatPrice(order.total_amount)}
                    </span>
                  </div>

                  <Link href={`/orders/${order.id}`}>
                    <Button variant="secondary" size="sm">
                      Inspect Request
                    </Button>
                  </Link>
                </div>
              </div>

              {order.replacement_reason && (
                <div className="pt-3 text-xs text-neutral-300">
                  <span className="text-neutral-500">Stated Reason: </span>
                  <span className="italic">&ldquo;{order.replacement_reason}&rdquo;</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
