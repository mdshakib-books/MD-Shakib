"use client";

import * as React from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { AccountNav } from "@/components/account/AccountNav";
import { formatPrice } from "@/lib/utils";
import type { EnrichedOrder } from "@/lib/commerce/orders";

interface AccountReplacementsClientProps {
  replacements: EnrichedOrder[];
}

export function AccountReplacementsClient({ replacements }: AccountReplacementsClientProps) {
  const getReplacementStatusBadge = (status: string) => {
    switch (status) {
      case "Approved":
      case "Replacement Delivered":
        return "bg-emerald-950/30 text-emerald-400 border-emerald-800/40";
      case "Rejected":
        return "bg-red-950/30 text-red-400 border-red-800/40";
      case "Replacement Shipped":
        return "bg-blue-950/30 text-blue-400 border-blue-800/40";
      case "Requested":
      default:
        return "bg-amber-950/30 text-[var(--color-primary-gold)] border-amber-800/40";
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
          className="text-xs uppercase tracking-wider text-[var(--color-primary-gold)] hover:underline font-semibold"
        >
          View Orders →
        </Link>
      </div>

      <AccountNav />

      {/* Policy Information Notice */}
      <div className="mb-6 p-4 rounded-xl bg-[#141414] border border-[#262626] text-xs text-neutral-300">
        <strong className="text-[var(--color-primary-gold)] block uppercase font-semibold mb-1">
          7-Day Replacement Policy
        </strong>
        Books that arrive with printing defects, missing pages, or transit damage are eligible for a free replacement within 7 calendar days of verified delivery.
      </div>

      {replacements.length === 0 ? (
        <div className="text-center py-16 px-4 bg-[#141414] border border-[#222] rounded-xl">
          <div className="text-4xl mb-3">📖</div>
          <h2 className="text-base font-serif text-neutral-200 uppercase">No active replacement requests</h2>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto mb-6">
            If a book from any of your delivered orders has manufacturing or binding defects, you can submit a replacement request from your order details page.
          </p>
          <Link
            href="/account/orders"
            className="inline-block px-5 py-2 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-xs hover:bg-[var(--color-accent-gold)] transition shadow"
          >
            Review Delivered Orders
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {replacements.map((order) => (
            <div
              key={order.id}
              className="bg-[#141414] border border-[#262626] rounded-xl p-5 hover:border-[#383838] transition"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#222] pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="font-mono text-xs text-neutral-200 font-bold">
                      Order #{order.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span
                      className={`text-[10px] px-2.5 py-0.5 rounded-full border uppercase font-bold ${getReplacementStatusBadge(
                        order.replacement_status
                      )}`}
                    >
                      {order.replacement_status}
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    Requested on{" "}
                    {order.replacement_requested_at
                      ? new Date(order.replacement_requested_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })
                      : "Recently"}
                  </p>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-4">
                  <span className="font-mono text-xs font-bold text-[var(--color-primary-gold)]">
                    {formatPrice(Number(order.total_amount))}
                  </span>

                  <Link
                    href={`/orders/${order.id}`}
                    className="px-3 py-1.5 rounded-lg bg-[#222] hover:bg-[#2c2c2c] text-xs font-semibold text-neutral-200 transition"
                  >
                    View Order Details
                  </Link>
                </div>
              </div>

              <div className="pt-3 text-xs space-y-2 text-neutral-400">
                <p>
                  <strong className="text-neutral-300">Customer Reason:</strong>{" "}
                  {order.replacement_reason || "Defective copy reported"}
                </p>

                {order.replacement_status === "Rejected" && order.replacement_rejection_reason && (
                  <div className="p-3 rounded bg-red-950/20 border border-red-800/40 text-red-300">
                    <strong className="block text-[11px] uppercase tracking-wider font-semibold mb-0.5">
                      Rejection Notice:
                    </strong>
                    {order.replacement_rejection_reason}
                  </div>
                )}

                {order.replacement_status === "Approved" && (
                  <div className="p-3 rounded bg-emerald-950/20 border border-emerald-800/40 text-emerald-300">
                    ✓ Replacement approved. Our logistics team will process and dispatch your replacement copy.
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

