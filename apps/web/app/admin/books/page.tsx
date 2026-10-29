import React from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "@/lib/admin/auth";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

export default async function AdminBooksPage() {
  await requireAdmin();
  const supabase = await createClient();

  const { data: books, error } = await supabase
    .from("books")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error loading admin books:", error.message);
  }

  const allBooks = books || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-[#2A2A2A] pb-6">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white font-serif">
            Catalog Management
          </h1>
          <p className="text-sm text-gray-400 mt-1">
            Authoritative book inventory, stock levels, and publication status.
          </p>
        </div>
        <div className="text-sm text-gray-400">
          Total Titles: <span className="font-bold text-white">{allBooks.length}</span>
        </div>
      </div>

      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {allBooks.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No books found in catalog.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Title & Author</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Price</th>
                  <th className="py-3.5 px-4">Stock</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">View</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {allBooks.map((book) => (
                  <tr key={book.id} className="hover:bg-[#161616]/40 transition">
                    <td className="py-3.5 px-4">
                      <div className="font-semibold text-white">{book.title}</div>
                      <div className="text-xs text-gray-500">{book.author || "Unknown"}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs text-gray-400 bg-[#1A1A1A] px-2 py-1 rounded border border-[#262626]">
                        {book.category}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-[var(--color-primary-gold,#C9A24A)]">
                      {formatPrice(book.price)}
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`text-xs font-bold ${
                          book.stock <= 5
                            ? "text-red-400"
                            : book.stock <= 20
                            ? "text-amber-400"
                            : "text-emerald-400"
                        }`}
                      >
                        {book.stock} units
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <Badge variant={book.is_active ? "success" : "danger"}>
                        {book.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <Link
                        href={`/books/${book.id}`}
                        target="_blank"
                        className="text-xs text-[var(--color-primary-gold,#C9A24A)] hover:underline"
                      >
                        Storefront ↗
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

