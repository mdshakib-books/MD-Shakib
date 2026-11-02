"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MediaUploader } from "@/components/admin/MediaUploader";
import { createAdminBook } from "@/lib/admin/books";
import type { CategoryRow } from "@/lib/admin/categories";

interface AdminAddBookClientProps {
  categories: CategoryRow[];
}

export function AdminAddBookClient({ categories }: AdminAddBookClientProps) {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState<number | "">(499);
  const [stock, setStock] = useState<number | "">(25);
  const [discount, setDiscount] = useState<number | "">(0);
  const [category, setCategory] = useState(categories[0]?.name || "Quran");
  const [language, setLanguage] = useState("English / Arabic");
  const [pages, setPages] = useState<number | "">(350);
  const [publisher, setPublisher] = useState("");
  const [publishedDate, setPublishedDate] = useState("");
  const [coverImage, setCoverImage] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [isActive, setIsActive] = useState(true);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!title.trim()) {
      setFormError("Book title is required.");
      return;
    }
    if (!author.trim()) {
      setFormError("Author name is required.");
      return;
    }
    if (price === "" || Number(price) < 0) {
      setFormError("Valid price is required.");
      return;
    }
    if (stock === "" || Number(stock) < 0) {
      setFormError("Valid stock is required.");
      return;
    }
    if (!category) {
      setFormError("Category is required.");
      return;
    }
    if (!coverImage) {
      setFormError("A book cover image is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await createAdminBook({
        title: title.trim(),
        author: author.trim(),
        description: description.trim(),
        price: Number(price),
        stock: Number(stock),
        discount: discount === "" ? 0 : Number(discount),
        category,
        language: language.trim() || null,
        pages: pages === "" ? null : Number(pages),
        publisher: publisher.trim() || null,
        published_date: publishedDate || null,
        image_url: coverImage,
        cover_image: coverImage,
        images: images.length > 0 ? images : [coverImage],
        is_active: isActive,
      });

      if (!res.success) {
        throw new Error(res.error || "Failed to create book.");
      }

      router.push("/admin/books");
      router.refresh();
    } catch (err: any) {
      setFormError(err?.message || "An error occurred while creating the book.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Top Breadcrumb & Title */}
      <div className="flex items-center justify-between border-b border-[#2A2A2A] pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
            <Link href="/admin/books" className="hover:text-white transition">
              Books Catalog
            </Link>
            <span>/</span>
            <span className="text-[var(--color-primary-gold)]">Add New Book</span>
          </div>
          <h1 className="text-2xl font-bold font-serif text-white">
            Add New Title to Catalog
          </h1>
        </div>
        <Link
          href="/admin/books"
          className="text-xs text-gray-400 hover:text-white px-3 py-1.5 rounded-lg border border-[#2A2A2A] transition"
        >
          &larr; Cancel &amp; Return
        </Link>
      </div>

      {formError && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800/40 text-red-300 text-sm">
          {formError}
        </div>
      )}

      {/* Main Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-gold)]">
            Basic Book Information
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Title <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Tafseer Ibn Kathir (Complete 10 Volumes)"
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Author / Scholar <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={author}
                onChange={(e) => setAuthor(e.target.value)}
                placeholder="e.g. Hafiz Ibn Kathir"
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Description
              </label>
              <textarea
                rows={4}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Detailed scholarly overview, contents, and publication notes..."
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)] resize-none"
              />
            </div>
          </div>
        </div>

        {/* Pricing & Stock */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-gold)]">
            Pricing, Stock &amp; Availability
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Price (₹ INR) <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={price}
                onChange={(e) => setPrice(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Stock Quantity <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0"
                step="1"
                required
                value={stock}
                onChange={(e) => setStock(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Discount (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={discount}
                onChange={(e) => setDiscount(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>
          </div>
        </div>

        {/* Publishing Details */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-gold)]">
            Publication Details
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Publisher
              </label>
              <input
                type="text"
                value={publisher}
                onChange={(e) => setPublisher(e.target.value)}
                placeholder="e.g. Darussalam Publishers"
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Language
              </label>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                placeholder="e.g. Arabic / Urdu / English"
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Pages Count
              </label>
              <input
                type="number"
                min="1"
                value={pages}
                onChange={(e) => setPages(e.target.value === "" ? "" : Number(e.target.value))}
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">
                Published Year / Date
              </label>
              <input
                type="text"
                value={publishedDate}
                onChange={(e) => setPublishedDate(e.target.value)}
                placeholder="e.g. 2024 or 1445 AH"
                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[var(--color-primary-gold)]"
              />
            </div>
          </div>
        </div>

        {/* Media & Images */}
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 sm:p-8 space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-primary-gold)]">
            Media &amp; Book Cover Imagery
          </h2>

          <MediaUploader
            coverImage={coverImage}
            images={images}
            onChange={({ coverImage: newCover, images: newImages }) => {
              setCoverImage(newCover);
              setImages(newImages);
            }}
          />

          <div className="pt-2">
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-[#2A2A2A] bg-[#0B0B0B] text-[var(--color-primary-gold)] focus:ring-0"
              />
              <span className="text-sm text-gray-300">
                Publish immediately to active storefront catalog
              </span>
            </label>
          </div>
        </div>

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-4 pt-4">
          <Link
            href="/admin/books"
            className="px-6 py-2.5 rounded-lg border border-[#2A2A2A] text-gray-300 hover:text-white transition text-sm"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-8 py-2.5 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-sm hover:opacity-95 transition disabled:opacity-50 cursor-pointer shadow-md"
          >
            {isSubmitting ? "Saving to Catalog..." : "Add Book to Catalog"}
          </button>
        </div>
      </form>
    </div>
  );
}
