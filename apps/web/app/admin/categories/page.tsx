import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminCategories } from "@/lib/admin/categories";
import { AdminCategoriesClient } from "./AdminCategoriesClient";

export const dynamic = "force-dynamic";

export default async function AdminCategoriesPage() {
  await requireAdmin();
  const categories = await getAdminCategories();

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Category Management
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Organize catalog classifications, public navigation menus, and title distribution.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Total Categories: <span className="font-bold text-white">{categories.length}</span>
        </div>
      </div>

      <AdminCategoriesClient initialCategories={categories} />
    </div>
  );
}

