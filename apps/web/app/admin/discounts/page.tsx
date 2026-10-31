import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminDiscounts } from "@/lib/admin/discounts";
import { AdminDiscountsClient } from "./AdminDiscountsClient";

export const dynamic = "force-dynamic";

export default async function AdminDiscountsPage() {
  await requireAdmin();
  const discounts = await getAdminDiscounts();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Promotions & Discounts
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Authoritative promotional coupon codes, percentage/fixed cart discounts, and redemption constraints.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Total Coupons: <span className="font-bold text-white">{discounts.length}</span>
        </div>
      </div>

      <AdminDiscountsClient initialDiscounts={discounts} />
    </div>
  );
}

