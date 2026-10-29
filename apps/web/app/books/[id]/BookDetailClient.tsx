"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatPrice } from "@/lib/utils";
import { ProductGrid } from "@/components/commerce/ProductGrid";
import type { CatalogBook } from "@/lib/data/catalog";

interface BookDetailClientProps {
  book: CatalogBook;
  similarBooks: CatalogBook[];
}

export function BookDetailClient({ book, similarBooks }: BookDetailClientProps) {
  const [selectedImage, setSelectedImage] = useState<string>(
    book.images?.[0] || book.imageUrl || ""
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [added, setAdded] = useState(false);

  const hasDiscount = Boolean(book.discount && book.discount > 0);
  const discountedPrice = hasDiscount
    ? Math.round(book.price * (1 - (book.discount || 0) / 100))
    : book.price;
  const isOutOfStock = book.stock !== undefined && book.stock <= 0;

  const handleAddToCart = () => {
    // Phase 5A: Client-side feedback. Persistent cart is integrated in Phase 5C.
    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  };

  return (
    <>
      {/* Breadcrumb Navigation */}
      <div className="border-b border-[#2A2A2A] py-3 text-xs text-neutral-400 bg-[#0E0E0E]">
        <div className="max-w-[1200px] mx-auto px-4 lg:px-6 flex items-center space-x-2">
          <Link href="/" className="hover:text-[#C9A24A]">Home</Link>
          <span>/</span>
          <Link href="/books" className="hover:text-[#C9A24A]">Books</Link>
          <span>/</span>
          <span className="text-neutral-200 truncate max-w-xs">{book.title}</span>
        </div>
      </div>

      {/* Product Details Section */}
      <PageContainer>
        <div className="grid md:grid-cols-2 gap-10 lg:gap-14 py-8">
          {/* Left Column: Image Gallery */}
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-sm aspect-[3/4] bg-[#161616] border border-[#2A2A2A] rounded-xl overflow-hidden flex items-center justify-center p-4 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage}
                alt={book.title}
                className="w-full h-full object-contain rounded-lg shadow-md"
              />
              {hasDiscount && (
                <span className="absolute top-4 left-4 bg-[#FFF5D1] text-black text-xs font-bold px-2 py-1 rounded shadow">
                  -{book.discount}% OFF
                </span>
              )}
            </div>

            {/* Thumbnail List */}
            {book.images && book.images.length > 1 && (
              <div className="flex gap-3 mt-4">
                {book.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImage(img)}
                    className={`w-16 h-20 rounded-md border overflow-hidden p-1 bg-[#161616] cursor-pointer ${
                      selectedImage === img
                        ? "border-[#C9A24A]"
                        : "border-[#2A2A2A] opacity-60 hover:opacity-100"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="Thumbnail" className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Book Info & Cart Actions */}
          <div className="flex flex-col justify-between">
            <div>
              {/* Category & Stock Tag */}
              <div className="flex items-center space-x-3 mb-2">
                <span className="text-xs uppercase tracking-wider text-[#C9A24A] bg-[#C9A24A]/10 px-2.5 py-0.5 rounded-full border border-[#C9A24A]/30">
                  {book.category}
                </span>
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full border ${
                    isOutOfStock
                      ? "text-red-400 bg-red-950/20 border-red-800/40"
                      : "text-emerald-400 bg-emerald-950/20 border-emerald-800/40"
                  }`}
                >
                  {isOutOfStock ? "Out of Stock" : `In Stock (${book.stock} available)`}
                </span>
              </div>

              {/* Title & Author */}
              <h1 className="text-2xl md:text-3xl font-serif text-[#F5F5F5] font-semibold leading-tight">
                {book.title}
              </h1>
              {book.author && (
                <p className="text-sm text-neutral-400 mt-1">
                  By <span className="text-neutral-200">{book.author}</span>
                </p>
              )}

              {/* Pricing Section */}
              <div className="flex items-baseline space-x-3 mt-4">
                <span className="text-2xl font-bold text-[#C9A24A]">
                  {formatPrice(discountedPrice)}
                </span>
                {hasDiscount && (
                  <span className="text-sm text-neutral-500 line-through">
                    {formatPrice(book.price)}
                  </span>
                )}
              </div>

              {/* Description */}
              <div className="mt-6 border-t border-[#2A2A2A] pt-4">
                <h3 className="text-sm font-semibold text-neutral-300 uppercase tracking-wide">
                  Description
                </h3>
                <p className="text-neutral-400 text-sm mt-2 leading-relaxed whitespace-pre-line">
                  {book.description}
                </p>
              </div>

              {/* Publishing Metadata Details */}
              <div className="mt-6 border-t border-[#2A2A2A] pt-4 grid grid-cols-2 gap-y-2 text-xs text-neutral-400">
                {book.publisher && (
                  <div>
                    <span className="text-neutral-500">Publisher:</span>{" "}
                    <span className="text-neutral-300">{book.publisher}</span>
                  </div>
                )}
                {book.publishedDate && (
                  <div>
                    <span className="text-neutral-500">Published:</span>{" "}
                    <span className="text-neutral-300">{book.publishedDate}</span>
                  </div>
                )}
                {book.language && (
                  <div>
                    <span className="text-neutral-500">Language:</span>{" "}
                    <span className="text-neutral-300">{book.language}</span>
                  </div>
                )}
                {book.pages && (
                  <div>
                    <span className="text-neutral-500">Pages:</span>{" "}
                    <span className="text-neutral-300">{book.pages}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions: Quantity & Add to Cart */}
            <div className="mt-8 border-t border-[#2A2A2A] pt-6 flex flex-col sm:flex-row items-center gap-4">
              <div className="flex items-center border border-[#333] rounded-lg bg-[#161616]">
                <button
                  type="button"
                  disabled={isOutOfStock || quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3 py-2 text-neutral-400 hover:text-white disabled:opacity-40"
                >
                  -
                </button>
                <span className="px-4 py-2 text-sm text-neutral-200">{quantity}</span>
                <button
                  type="button"
                  disabled={isOutOfStock || (book.stock !== undefined && quantity >= book.stock)}
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-3 py-2 text-neutral-400 hover:text-white disabled:opacity-40"
                >
                  +
                </button>
              </div>

              <button
                type="button"
                disabled={isOutOfStock}
                onClick={handleAddToCart}
                className={`w-full sm:flex-1 py-3 px-6 rounded-lg font-semibold text-sm transition-all shadow-lg ${
                  isOutOfStock
                    ? "bg-[#2A2A2A] text-neutral-500 cursor-not-allowed"
                    : added
                    ? "bg-emerald-600 text-white"
                    : "bg-[#C9A24A] text-black hover:bg-[#b89139] cursor-pointer"
                }`}
              >
                {isOutOfStock ? "Out of Stock" : added ? "Added to Cart ✓" : "Add to Cart"}
              </button>
            </div>
          </div>
        </div>

        {/* Similar Books Section */}
        {similarBooks.length > 0 && (
          <div className="border-t border-[#2A2A2A] pt-12 mt-8 pb-12">
            <h2 className="text-xl font-serif text-[#F5F5F5] font-semibold mb-6">
              Similar Islamic Literature
            </h2>
            <ProductGrid books={similarBooks} />
          </div>
        )}
      </PageContainer>
    </>
  );
}

