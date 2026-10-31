"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import {
  moderateAdminReview,
  type EnrichedReview,
} from "@/lib/admin/reviews";

interface AdminReviewsClientProps {
  initialReviews: EnrichedReview[];
  totalReviews: number;
  pendingCount: number;
}

export function AdminReviewsClient({
  initialReviews,
  totalReviews,
  pendingCount,
}: AdminReviewsClientProps) {
  const router = useRouter();

  const [statusFilter, setStatusFilter] = useState<"ALL" | "pending" | "approved" | "rejected" | "hidden">("ALL");
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleModerate = async (reviewId: string, status: "approved" | "rejected" | "hidden" | "pending") => {
    setProcessingId(reviewId);
    try {
      const res = await moderateAdminReview({ reviewId, status });
      if (!res.success) {
        throw new Error(res.error);
      }
      router.refresh();
    } catch (err: any) {
      alert(`Moderation failed: ${err?.message}`);
    } finally {
      setProcessingId(null);
    }
  };

  const filteredReviews = initialReviews.filter((r) => {
    if (statusFilter === "ALL") return true;
    return r.status === statusFilter;
  });

  const getStatusBadgeVariant = (st: string) => {
    switch (st) {
      case "approved":
        return "success";
      case "pending":
        return "gold";
      case "rejected":
        return "danger";
      default:
        return "muted";
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-wrap items-center gap-1.5 bg-[#161616] p-1 rounded-lg border border-[#262626]">
          {(["ALL", "pending", "approved", "rejected", "hidden"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setStatusFilter(tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                statusFilter === tab
                  ? "bg-[var(--color-primary-gold,#C9A24A)] text-black"
                  : "text-gray-400 hover:text-white"
              }`}
            >
              {tab === "ALL"
                ? `All (${totalReviews})`
                : tab === "pending"
                ? `Pending Review (${pendingCount})`
                : tab.charAt(0).toUpperCase() + tab.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Reviews Table */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {filteredReviews.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No reviews found matching the selected status.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Book Title</th>
                  <th className="py-3.5 px-4">Reviewer</th>
                  <th className="py-3.5 px-4">Rating</th>
                  <th className="py-3.5 px-4">Review Content</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Moderation Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {filteredReviews.map((rev) => {
                  const isProcessing = processingId === rev.id;

                  return (
                    <tr key={rev.id} className="hover:bg-[#161616]/40 transition">
                      <td className="py-3.5 px-4 max-w-xs">
                        <Link
                          href={`/books/${rev.book_id}`}
                          target="_blank"
                          className="font-semibold text-white hover:text-[var(--color-primary-gold,#C9A24A)] line-clamp-1"
                        >
                          {rev.bookTitle}
                        </Link>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="font-medium text-white text-xs">{rev.reviewerName}</div>
                        <div className="text-[11px] text-gray-500">{rev.reviewerEmail}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center text-amber-400 text-xs">
                          {"★".repeat(rev.rating)}
                          {"☆".repeat(5 - rev.rating)}
                          <span className="ml-1 text-gray-400 text-[11px]">({rev.rating}/5)</span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 max-w-md">
                        <div className="font-semibold text-white text-xs">{rev.title}</div>
                        <div className="text-xs text-gray-400 mt-0.5 line-clamp-2">{rev.comment}</div>
                        <div className="text-[10px] text-gray-500 mt-1">
                          {new Date(rev.created_at).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <Badge variant={getStatusBadgeVariant(rev.status)}>
                          {rev.status}
                        </Badge>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {rev.status !== "approved" && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleModerate(rev.id, "approved")}
                              className="px-2.5 py-1 text-xs font-semibold text-emerald-300 bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-800 rounded transition disabled:opacity-50"
                            >
                              Approve
                            </button>
                          )}

                          {rev.status !== "rejected" && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleModerate(rev.id, "rejected")}
                              className="px-2.5 py-1 text-xs font-semibold text-red-300 bg-red-950/70 hover:bg-red-900 border border-red-800 rounded transition disabled:opacity-50"
                            >
                              Reject
                            </button>
                          )}

                          {rev.status !== "hidden" && (
                            <button
                              type="button"
                              disabled={isProcessing}
                              onClick={() => handleModerate(rev.id, "hidden")}
                              className="px-2.5 py-1 text-xs text-gray-400 hover:text-white bg-[#1A1A1A] hover:bg-[#252525] border border-[#2E2E2E] rounded transition disabled:opacity-50"
                            >
                              Hide
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

