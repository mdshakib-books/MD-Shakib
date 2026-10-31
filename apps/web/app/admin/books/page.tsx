import React from "react";
import { requireAdmin } from "@/lib/admin/auth";
import { getAdminBooks } from "@/lib/admin/books";
import { getAdminCategories } from "@/lib/admin/categories";
import { AdminBooksClient } from "./AdminBooksClient";

export const dynamic = "force-dynamic";

export default async function AdminBooksPage() {
  await requireAdmin();

  const [{ books, total }, categories] = await Promise.all([
    getAdminBooks({ limit: 100 }),
    getAdminCategories(),
  ]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Catalog Management
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Authoritative bookstore titles, stock availability, pricing, and Cloudinary media assets.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Total Titles: <span className="font-bold text-white">{total}</span>
        </div>
      </div>

      <AdminBooksClient
        initialBooks={books}
        totalBooks={total}
        categories={categories}
      />
    </div>
  );
}
