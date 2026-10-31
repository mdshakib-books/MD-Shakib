import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminInventory } from "@/lib/admin/inventory";
import { AdminInventoryClient } from "./AdminInventoryClient";

export const dynamic = "force-dynamic";

export default async function AdminInventoryPage() {
  await requireAdmin();

  const { items, total, summary } = await getAdminInventory({ limit: 100 });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Inventory & Stock Control
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Authoritative warehouse stock balances, atomic replenishment logs, and low inventory alerts.
          </p>
        </div>
      </div>

      <AdminInventoryClient
        initialItems={items}
        totalItems={total}
        summary={summary}
      />
    </div>
  );
}

