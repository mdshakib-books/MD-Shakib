"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { MediaUploader } from "@/components/admin/MediaUploader";
import {
  createAdminBook,
  updateAdminBook,
  deleteAdminBook,
  toggleBookStatus,
  type BookRow,
  type BookInput,
} from "@/lib/admin/books";
import { adjustAdminStock } from "@/lib/admin/inventory";
import type { CategoryRow } from "@/lib/admin/categories";

interface AdminBooksClientProps {
  initialBooks: BookRow[];
  totalBooks: number;
  categories: CategoryRow[];
}

export function AdminBooksClient({
  initialBooks,
  totalBooks,
  categories,
}: AdminBooksClientProps) {
  const router = useRouter();

  // Search & Filters
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("ALL");
  const [stockFilter, setStockFilter] = useState<"ALL" | "LOW" | "OUT" | "ACTIVE" | "INACTIVE">("ALL");

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingBook, setEditingBook] = useState<BookRow | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Quick Stock Adjust Modal
  const [stockModalBook, setStockModalBook] = useState<BookRow | null>(null);
  const [stockAdjustType, setStockAdjustType] = useState<"INCREASE" | "DECREASE" | "SET">("INCREASE");
  const [stockAdjustQty, setStockAdjustQty] = useState(5);
  const [stockAdjustReason, setStockAdjustReason] = useState("Restock delivery received");
  const [isAdjustingStock, setIsAdjustingStock] = useState(false);

  // Delete Confirm Modal
  const [deletingBook, setDeletingBook] = useState<BookRow | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState<string | null>(null);

  // Form Fields
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState(499);
  const [stock, setStock] = useState(25);
  const [discount, setDiscount] = useState(0);
  const [category, setCategory] = useState(categories[0]?.name || "Quran");
  const [language, setLanguage] = useState("English / Arabic");
  const [pages, setPages] = useState<number | "">(350);
  const [publisher, setPublisher] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const openCreateModal = () => {
    setEditingBook(null);
    setTitle("");
    setAuthor("");
    setDescription("");
    setPrice(499);
    setStock(25);
    setDiscount(0);
    setCategory(categories[0]?.name || "Quran");
    setLanguage("English / Arabic");
    setPages(350);
    setPublisher("");
    setPublishedDate("");
    setCoverImage("");
    setImages([]);
    setIsActive(true);
    setFormError(null);
    setIsFormOpen(true);
  };

  const openEditModal = (book: BookRow) => {
    setEditingBook(book);
    setTitle(book.title);
    setAuthor(book.author);
    setDescription(book.description || "");
    setPrice(Number(book.price));
    setStock(book.stock);
    setDiscount(book.discount);
    setCategory(book.category);
    setLanguage(book.language || "");
    setPages(book.pages || "");
    setPublisher(book.publisher || "");
    setPublishedDate(book.published_date || "");
    setCoverImage(book.cover_image || book.image_url);
    setImages(book.images?.length ? book.images : [book.image_url]);
    setIsActive(book.is_active);
    setFormError(null);
    setIsFormOpen(true);
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const primaryImg = coverImage || images[0];
    if (!primaryImg) {
      setFormError("At least one book cover image must be uploaded.");
      return;
    }

    setIsSubmitting(true);

    try {
      const payload: BookInput = {
        title,
        author,
        description,
        price: Number(price),
        stock: Number(stock),
        discount: Number(discount),
        category,
        language: language || null,
        pages: pages ? Number(pages) : null,
        publisher: publisher || null,
        published_date: publishedDate || null,
        image_url: primaryImg,
        cover_image: primaryImg,
        images: images.length > 0 ? images : [primaryImg],
        is_active: isActive,
      };

      if (editingBook) {
        const res = await updateAdminBook(editingBook.id, payload);
        if (!res.success) throw new Error(res.error);
      } else {
        const res = await createAdminBook(payload);
        if (!res.success) throw new Error(res.error);
      }

      setIsFormOpen(false);
      router.refresh();
    } catch (err: any) {
      setFormError(err?.message || "Failed to save book.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (book: BookRow) => {
    const nextStatus = !book.is_active;
    const res = await toggleBookStatus(book.id, nextStatus);
    if (res.success) {
      router.refresh();
    } else {
      alert(`Error toggling status: ${res.error}`);
    }
  };

  const handleDeleteBook = async () => {
    if (!deletingBook) return;
    setIsDeleting(true);
    setDeleteNotice(null);

    try {
      const res = await deleteAdminBook(deletingBook.id);
      if (!res.success) {
        throw new Error(res.error);
      }

      if (res.archived) {
        setDeleteNotice(res.message || "Book was archived.");
      } else {
        setDeletingBook(null);
        router.refresh();
      }
    } catch (err: any) {
      alert(`Deletion error: ${err?.message}`);
      setDeletingBook(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stockModalBook) return;
    setIsAdjustingStock(true);

    try {
      const res = await adjustAdminStock({
        bookId: stockModalBook.id,
        type: stockAdjustType,
        quantity: stockAdjustQty,
        reason: stockAdjustReason,
      });

      if (!res.success) throw new Error(res.error);

      setStockModalBook(null);
      router.refresh();
    } catch (err: any) {
      alert(`Stock adjustment error: ${err?.message}`);
    } finally {
      setIsAdjustingStock(false);
    }
  };

  // Filter books locally
  const filteredBooks = initialBooks.filter((book) => {
    const matchesSearch =
      search.trim() === "" ||
      book.title.toLowerCase().includes(search.toLowerCase()) ||
      book.author.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      selectedCategory === "ALL" || book.category === selectedCategory;

    let matchesStock = true;
    if (stockFilter === "LOW") matchesStock = book.stock > 0 && book.stock <= 5;
    else if (stockFilter === "OUT") matchesStock = book.stock === 0;
    else if (stockFilter === "ACTIVE") matchesStock = book.is_active;
    else if (stockFilter === "INACTIVE") matchesStock = !book.is_active;

    return matchesSearch && matchesCategory && matchesStock;
  });

  return (
    <div className="space-y-6">
      {/* Top Filter Bar */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
        <div className="flex flex-1 flex-col sm:flex-row gap-2.5">
          {/* Search */}
          <div className="relative flex-1">
            <svg
              className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by title, author..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#161616] border border-[#2A2A2A] rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
            />
          </div>

          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 bg-[#161616] border border-[#2A2A2A] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          >
            <option value="ALL">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Stock Filter */}
          <select
            value={stockFilter}
            onChange={(e) => setStockFilter(e.target.value as any)}
            className="px-3 py-2 bg-[#161616] border border-[#2A2A2A] rounded-lg text-sm text-gray-200 focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
          >
            <option value="ALL">All Stock Statuses</option>
            <option value="LOW">Low Stock (≤ 5)</option>
            <option value="OUT">Out of Stock (0)</option>
            <option value="ACTIVE">Active Only</option>
            <option value="INACTIVE">Archived / Inactive</option>
          </select>
        </div>

        <button
          onClick={openCreateModal}
          className="px-4 py-2 bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] text-black font-semibold rounded-lg text-sm transition flex items-center justify-center gap-2 shadow"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          <span>Add New Book</span>
        </button>
      </div>

      {/* Catalog Table */}
      <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden shadow-lg">
        {filteredBooks.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No books found matching your current filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#161616] text-[11px] uppercase tracking-wider text-gray-400 border-b border-[#2A2A2A]">
                <tr>
                  <th className="py-3.5 px-4">Book Details</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4">Price / Discount</th>
                  <th className="py-3.5 px-4">Inventory</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#222222]">
                {filteredBooks.map((book) => {
                  const hasDiscount = book.discount > 0;
                  const effectivePrice = hasDiscount
                    ? Math.round(Number(book.price) * (1 - book.discount / 100))
                    : Number(book.price);

                  return (
                    <tr key={book.id} className="hover:bg-[#161616]/40 transition">
                      {/* Details & Thumbnail */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-14 rounded bg-[#1F1F1F] border border-[#2A2A2A] overflow-hidden flex-shrink-0">
                            {book.image_url ? (
                              <img
                                src={book.image_url}
                                alt={book.title}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-xs text-gray-500">
                                📖
                              </div>
                            )}
                          </div>
                          <div>
                            <div className="font-semibold text-white line-clamp-1">{book.title}</div>
                            <div className="text-xs text-gray-400">{book.author}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">
                              {book.language || "English"} {book.pages ? `• ${book.pages} pages` : ""}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td className="py-3.5 px-4">
                        <span className="text-xs text-gray-300 bg-[#1A1A1A] px-2.5 py-1 rounded border border-[#282828]">
                          {book.category}
                        </span>
                      </td>

                      {/* Price */}
                      <td className="py-3.5 px-4">
                        <div className="font-semibold text-[var(--color-primary-gold,#C9A24A)]">
                          {formatPrice(effectivePrice)}
                        </div>
                        {hasDiscount && (
                          <div className="text-xs text-gray-500 line-through">
                            {formatPrice(Number(book.price))}
                            <span className="ml-1 text-emerald-400 text-[10px]">(-{book.discount}%)</span>
                          </div>
                        )}
                      </td>

                      {/* Inventory Stock */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded ${
                              book.stock === 0
                                ? "bg-red-950/60 text-red-400 border border-red-800"
                                : book.stock <= 5
                                ? "bg-amber-950/60 text-amber-400 border border-amber-800"
                                : "bg-emerald-950/60 text-emerald-400 border border-emerald-800"
                            }`}
                          >
                            {book.stock} in stock
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setStockModalBook(book);
                              setStockAdjustType("INCREASE");
                              setStockAdjustQty(5);
                              setStockAdjustReason("Restock delivery received");
                            }}
                            className="text-xs text-gray-400 hover:text-white p-1 rounded hover:bg-[#222222]"
                            title="Adjust stock"
                          >
                            ✏️
                          </button>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => handleToggleStatus(book)}
                          className="focus:outline-none"
                        >
                          <Badge variant={book.is_active ? "success" : "danger"}>
                            {book.is_active ? "Active" : "Archived"}
                          </Badge>
                        </button>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/books/${book.id}`}
                            target="_blank"
                            className="p-1.5 text-xs text-gray-400 hover:text-white rounded bg-[#181818] border border-[#262626] transition"
                            title="View on Storefront"
                          >
                            ↗
                          </Link>
                          <button
                            type="button"
                            onClick={() => openEditModal(book)}
                            className="px-2.5 py-1 text-xs font-medium text-gray-200 bg-[#1A1A1A] hover:bg-[#252525] border border-[#2E2E2E] rounded transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeletingBook(book);
                              setDeleteNotice(null);
                            }}
                            className="p-1.5 text-xs text-red-400 hover:text-red-200 rounded bg-[#1C1212] border border-red-950 hover:bg-red-950 transition"
                            title="Delete / Archive"
                          >
                            ✕
                          </button>
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

      {/* ADD / EDIT BOOK MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
            <div className="p-5 border-b border-[#262626] flex items-center justify-between">
              <h2 className="text-lg font-bold text-white font-serif">
                {editingBook ? `Edit Book: ${editingBook.title}` : "Add New Catalog Book"}
              </h2>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="text-gray-400 hover:text-white text-lg p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
              {formError && (
                <div className="p-3 text-xs bg-red-950/60 border border-red-800 text-red-200 rounded-lg">
                  {formError}
                </div>
              )}

              {/* Cloudinary Media Uploader */}
              <MediaUploader
                coverImage={coverImage}
                images={images}
                onChange={({ coverImage: newCover, images: newImgs }) => {
                  setCoverImage(newCover);
                  setImages(newImgs);
                }}
              />

              {/* Title & Author */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Book Title *
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                    placeholder="e.g. The Sealed Nectar"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Author *
                  </label>
                  <input
                    type="text"
                    required
                    value={author}
                    onChange={(e) => setAuthor(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                    placeholder="e.g. Safiur Rahman Mubarakpuri"
                  />
                </div>
              </div>

              {/* Category, Price, Stock, Discount */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Category *
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  >
                    {categories.map((c) => (
                      <option key={c.id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Price (₹) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Stock Units *
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    value={stock}
                    onChange={(e) => setStock(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Discount (%)
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={discount}
                    onChange={(e) => setDiscount(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  />
                </div>
              </div>

              {/* Publisher, Language, Pages */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Publisher
                  </label>
                  <input
                    type="text"
                    value={publisher}
                    onChange={(e) => setPublisher(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                    placeholder="e.g. Darussalam"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Language
                  </label>
                  <input
                    type="text"
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                    placeholder="e.g. Urdu / Arabic"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-300 mb-1">
                    Pages
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={pages}
                    onChange={(e) => setPages(e.target.value === "" ? "" : Number(e.target.value))}
                    className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                    placeholder="350"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Book Description
                </label>
                <textarea
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                  placeholder="Comprehensive description of the book's contents, significance, and editions..."
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center gap-3 p-3 bg-[#171717] rounded-lg border border-[#262626]">
                <input
                  type="checkbox"
                  id="isActiveToggle"
                  checked={isActive}
                  onChange={(e) => setIsActive(e.target.checked)}
                  className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 bg-[#222222] border-[#333333]"
                />
                <label htmlFor="isActiveToggle" className="text-xs text-gray-300 cursor-pointer">
                  <span className="font-semibold text-white">Active in Storefront:</span> Checked books are visible to customers and available for purchase.
                </label>
              </div>

              <div className="pt-3 border-t border-[#262626] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-lg bg-[#1A1A1A] hover:bg-[#222222] border border-[#2E2E2E] transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-black bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] rounded-lg transition disabled:opacity-50"
                >
                  {isSubmitting ? "Saving..." : editingBook ? "Update Book" : "Create Book"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK INVENTORY ADJUSTMENT MODAL */}
      {stockModalBook && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-white mb-1">Adjust Inventory Stock</h3>
            <p className="text-xs text-gray-400 mb-4">
              Book: <span className="text-white font-medium">{stockModalBook.title}</span> (Current:{" "}
              <span className="text-amber-400 font-bold">{stockModalBook.stock}</span> units)
            </p>

            <form onSubmit={handleAdjustStock} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Adjustment Type
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(["INCREASE", "DECREASE", "SET"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setStockAdjustType(t)}
                      className={`py-2 text-xs font-bold rounded-lg border transition ${
                        stockAdjustType === t
                          ? "bg-[var(--color-primary-gold,#C9A24A)] text-black border-[var(--color-primary-gold,#C9A24A)]"
                          : "bg-[#1A1A1A] text-gray-400 border-[#2E2E2E] hover:text-white"
                      }`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  {stockAdjustType === "SET" ? "New Exact Stock" : "Quantity Change"}
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={stockAdjustQty}
                  onChange={(e) => setStockAdjustQty(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-300 mb-1">
                  Audit Reason *
                </label>
                <select
                  value={stockAdjustReason}
                  onChange={(e) => setStockAdjustReason(e.target.value)}
                  className="w-full px-3 py-2 bg-[#1A1A1A] border border-[#2E2E2E] rounded-lg text-xs text-white focus:outline-none focus:border-[var(--color-primary-gold,#C9A24A)]"
                >
                  <option value="Restock delivery received">Restock delivery received</option>
                  <option value="Damaged / defective item written off">Damaged / defective item written off</option>
                  <option value="Inventory audit reconciliation">Inventory audit reconciliation</option>
                  <option value="Customer order return">Customer order return</option>
                  <option value="Manual admin correction">Manual admin correction</option>
                </select>
              </div>

              <div className="pt-2 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setStockModalBook(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAdjustingStock}
                  className="px-5 py-2 text-xs font-bold text-black bg-[var(--color-primary-gold,#C9A24A)] hover:bg-[#B8923E] rounded-lg disabled:opacity-50"
                >
                  {isAdjustingStock ? "Applying..." : "Confirm Adjustment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DELETE / ARCHIVE CONFIRMATION MODAL */}
      {deletingBook && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[#121212] border border-[#2E2E2E] rounded-xl w-full max-w-md p-6 shadow-2xl">
            <h3 className="text-base font-bold text-red-400 mb-2">Delete or Archive Book</h3>

            {deleteNotice ? (
              <div className="space-y-4">
                <div className="p-3 bg-amber-950/40 border border-amber-800 text-amber-200 text-xs rounded-lg">
                  {deleteNotice}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={() => {
                      setDeletingBook(null);
                      setDeleteNotice(null);
                      router.refresh();
                    }}
                    className="px-4 py-2 bg-emerald-700 text-white rounded-lg text-xs font-semibold"
                  >
                    OK
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-xs text-gray-300">
                  Are you sure you want to delete{" "}
                  <span className="font-bold text-white">&ldquo;{deletingBook.title}&rdquo;</span>?
                </p>
                <p className="text-[11px] text-gray-500">
                  Note: If this book has existing customer order records, it will be automatically archived and deactivated rather than deleted to protect database transaction integrity.
                </p>

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setDeletingBook(null)}
                    className="px-4 py-2 text-xs font-semibold text-gray-400 hover:text-white rounded-lg bg-[#1A1A1A] border border-[#2E2E2E]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={isDeleting}
                    onClick={handleDeleteBook}
                    className="px-4 py-2 text-xs font-bold text-white bg-red-700 hover:bg-red-600 rounded-lg disabled:opacity-50"
                  >
                    {isDeleting ? "Processing..." : "Confirm Removal"}
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
