"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/Badge";
import {
  createAdminCategory,
  updateAdminCategory,
  deleteAdminCategory,
  type EnrichedCategory,
  type CategoryInput,
} from "@/lib/admin/categories";

interface AdminCategoriesClientProps {
  initialCategories: EnrichedCategory[];
}

export function AdminCategoriesClient({ initialCategories }: AdminCategoriesClientProps) {
  const router = useRouter();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<EnrichedCategory | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deletion state
  const [deletingCat, setDeletingCat] = useState<EnrichedCategory | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openCreateModal = () => {
    setEditingCategory(null);
    setName("");
    setSlug("");
    setDescription("");
    setDisplayOrder(initialCategories.length + 1);
    setIsActive(true);
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (cat: EnrichedCategory) => {
    setEditingCategory(cat);
    setName(cat.name);
    setSlug(cat.slug);
    setDescription(cat.description || "");
    setDisplayOrder(cat.display_order);
    setIsActive(cat.is_active);
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!editingCategory) {
      // Auto-generate slug from name
      const autoSlug = val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
      setSlug(autoSlug);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const payload: CategoryInput = {
        name,
        slug,
        description,
        display_order: Number(displayOrder),
        is_active: isActive,
      };

      if (editingCategory) {
        const res = await updateAdminCategory(editingCategory.id, payload);
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createAdminCategory(payload);
        if (!res.success) throw new Error(res.error);
      }

      setIsModalOpen(false);
      router.refresh();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save category.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (cat: EnrichedCategory) => {
    const res = await updateAdminCategory(cat.id, { is_active: !cat.is_active });
    if (res.success) {
      router.refresh();
    } else {
      alert(`Error toggling category: ${res.error}`);
    }
  };

  const handleDelete = async () => {
    if (!deletingCat) return;
    setDeleteError(null);
    setIsDeleting(true);

    try {
      const res = await deleteAdminCategory(deletingCat.id);
      if (!res.success) {
        setDeleteError(res.error || "Failed to delete category.");
        return;
      }

      setDeletingCat(null);
      router.refresh();
    } catch (err: any) {
      setDeleteError(err?.message || "Failed to delete category.");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] text-black font-semibold rounded-lg text-sm transition flex items-center gap-2 shadow"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add New Category</span>
        </button>
      </div>

      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {initialCategories.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No categories found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Order</th>
                  <th className="py-3.5 px-4">Category Name</th>
                  <th className="py-3.5 px-4">Slug</th>
                  <th className="py-3.5 px-4">Description</th>
                  <th className="py-3.5 px-4">Assigned Titles</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {initialCategories.map((cat) => (
                  <tr key={cat.id} className="hover:bg-[#161616]/40 transition">
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-500">
                      #{cat.display_order}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-white">
                      {cat.name}
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-gray-400">
                      /{cat.slug}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-gray-400 max-w-xs truncate">
                      {cat.description || "—"}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs font-bold px-2 py-0.5 rounded bg-[#1A1A1A] text-gray-300 border border-[#282828]">
                        {cat.bookCount} {cat.bookCount === 1 ? "book" : "books"}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <button
                        type="button"
                        onClick={() => handleToggleActive(cat)}
                        className="focus:outline-none"
                      >
                        <Badge variant={cat.is_active ? "success" : "muted"}>
                          {cat.is_active ? "Active" : "Hidden"}
                        </Badge>
                      </button>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(cat)}
                          className="px-2.5 py-1 text-xs font-medium text-gray-200 bg-[#1A1A1A] hover:bg-[#252525] border border-[#2E2E2E] rounded transition"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeletingCat(cat);
                            setDeleteError(null);
                          }}
                          className="p-1.5 text-xs text-red-400 hover:text-red-200 rounded bg-[#1C1212] border border-red-950 hover:bg-red-950 transition"
                          title="Delete Category"
                        >
                          ✕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE / EDIT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">
              {editingCategory ? "Edit Category" : "Add New Category"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="p-3 text-xs bg-red-950/60 border border-red-800 text-red-200 rounded-lg">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Category Name *
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  placeholder="e.g. Tafseer & Quranic Studies"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  URL Slug *
                </label>
                <input
                  type="text"
                  required
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs font-mono text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  placeholder="tafseer"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Display Order
                </label>
                <input
                  type="number"
                  min="0"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Description
                </label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  placeholder="Brief summary of books included in this section..."
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="catActive"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-[#222222] border-[#333333]"
                />
                <label htmlFor="catActive" className="text-xs text-gray-300 cursor-pointer">
                  Visible in public storefront navigation
                </label>
              </div>

              <div className="pt-3 border-t border-[#262626] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-black bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] rounded-lg disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : editingCategory ? "Update Category" : "Create Category"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {deletingCat && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-red-400 mb-2">Delete Category</h3>

            {deleteError ? (
              <div className="space-y-4">
                <div className="p-3 bg-red-950/60 border border-red-800 text-red-200 text-xs rounded-lg">
                  {deleteError}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setDeletingCat(null);
                      setDeleteError(null);
                    }}
                    className="px-4 py-1.5 bg-[#1A1A1A] text-gray-300 hover:text-white rounded-lg text-xs"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-300">
                  Are you sure you want to delete the category{" "}
                  <span className="font-bold text-white">&ldquo;{deletingCat.name}&rdquo;</span>?
                </p>

                {deletingCat.bookCount > 0 && (
                  <div className="p-3 bg-amber-950/40 border border-amber-800 text-amber-200 text-xs rounded-lg">
                    ⚠️ Notice: This category has {deletingCat.bookCount} active book(s) assigned. The system will prevent deletion until those books are reassigned or deleted.
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeletingCat(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDelete}
                    className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-600 rounded-lg disabled:opacity-50"
                  >
                    {isDeleting ? "Checking..." : "Confirm Delete"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
