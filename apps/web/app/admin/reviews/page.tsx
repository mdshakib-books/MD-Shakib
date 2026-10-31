import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminReviews } from "@/lib/admin/reviews";
import { AdminReviewsClient } from "./AdminReviewsClient";

export const dynamic = "force-dynamic";

export default async function AdminReviewsPage() {
  await requireAdmin();

  const { reviews, total, pendingCount } = await getAdminReviews({ limit: 100 });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Review Moderation
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Authoritative feedback moderation, customer star ratings, and community standards enforcement.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Pending Moderation: <span className="font-bold text-amber-400">{pendingCount}</span>
        </div>
      </div>

      <AdminReviewsClient
        initialReviews={reviews}
        totalReviews={total}
        pendingCount={pendingCount}
      />
    </div>
  );
}

