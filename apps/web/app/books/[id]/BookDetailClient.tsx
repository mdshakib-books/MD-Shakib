"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageContainer } from "@/components/layout/PageContainer";
import { formatPrice } from "@/lib/utils";
import { ProductGrid } from "@/components/commerce/ProductGrid";
import { useCart } from "@/lib/commerce/cart-context";
import type { CatalogBook } from "@/lib/data/catalog";

interface BookDetailClientProps {
  book: CatalogBook;
  similarBooks: CatalogBook[];
}

export function BookDetailClient({ book, similarBooks }: BookDetailClientProps) {
  const router = useRouter();
  const { addItem, isInCart } = useCart();
  const inCart = isInCart(book.id);

  const [selectedImage, setSelectedImage] = useState<string>(
    book.images?.[0] || book.imageUrl || ""
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [added, setAdded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const hasDiscount = Boolean(book.discount && book.discount > 0);
  const discountedPrice = hasDiscount
    ? Math.round(book.price * (1 - (book.discount || 0) / 100))
    : book.price;
  const isOutOfStock = book.stock !== undefined && book.stock <= 0;

  const handleAddToCart = async () => {
    if (isOutOfStock || isSubmitting) return;
    setIsSubmitting(true);
    const res = await addItem(
      {
        id: book.id,
        title: book.title,
        price: book.price,
        discount: book.discount,
        stock: book.stock,
        imageUrl: book.imageUrl,
        category: book.category,
        author: book.author,
      },
      quantity
    );
    setIsSubmitting(false);

    if (res.success) {
      setAdded(true);
      setTimeout(() => setAdded(false), 2500);
    }
  };

  const handleBuyNow = async () => {
    if (isOutOfStock || isSubmitting) return;
    setIsSubmitting(true);
    await addItem(
      {
        id: book.id,
        title: book.title,
        price: book.price,
        discount: book.discount,
        stock: book.stock,
        imageUrl: book.imageUrl,
        category: book.category,
        author: book.author,
      },
      quantity
    );
    setIsSubmitting(false);
    router.push("/cart");
  };

  return (
    <>
      {/* Breadcrumb Navigation */}
      <div className="border-b border-[#222222] py-3 text-xs text-neutral-400 bg-[#0E0E0E]">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 flex items-center space-x-2">
          <Link href="/" className="hover:text-[#C9A24A] transition-colors">Home</Link>
          <span className="text-neutral-600">/</span>
          <Link href="/books" className="hover:text-[#C9A24A] transition-colors">Books</Link>
          <span className="text-neutral-600">/</span>
          <span className="text-neutral-200 truncate max-w-xs">{book.title}</span>
        </div>
      </div>

      {/* Product Details Section */}
      <PageContainer>
        <div className="grid md:grid-cols-2 gap-10 lg:gap-14 py-8">
          {/* Left Column: Image Gallery */}
          <div className="flex flex-col items-center">
            <div className="relative w-full max-w-md aspect-[3/4] bg-[#141414] border border-[#2A2A2A] rounded-2xl overflow-hidden flex items-center justify-center p-6 shadow-2xl">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={selectedImage}
                alt={book.title}
                className="w-full h-full object-contain rounded-lg shadow-md transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)]"
              />
              {hasDiscount && (
                <span className="absolute top-4 left-4 bg-[#FFF5D1] text-black text-xs font-bold px-2.5 py-1 rounded shadow uppercase tracking-wide">
                  -{book.discount}% OFF
                </span>
              )}
            </div>

            {/* Thumbnail List */}
            {book.images && book.images.length > 1 && (
              <div className="flex gap-3 mt-4 overflow-x-auto max-w-md pb-2" role="group" aria-label="Book image gallery">
                {book.images.map((img, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setSelectedImage(img)}
                    aria-label={`View image ${i + 1} of ${book.images?.length || 1}`}
                    aria-pressed={selectedImage === img}
                    className={`w-16 h-20 rounded-lg border overflow-hidden p-1 bg-[#141414] cursor-pointer transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] ${
                      selectedImage === img
                        ? "border-[#C9A24A] shadow-md shadow-[#C9A24A]/20 scale-105"
                        : "border-[#2A2A2A] opacity-60 hover:opacity-100 hover:border-[#383838]"
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={img} alt="" className="w-full h-full object-cover rounded" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right Column: Book Info & Cart Actions */}
          <div className="flex flex-col justify-between">
            <div>
              {/* Category & Stock Tag */}
              <div className="flex items-center space-x-3 mb-3">
                <span className="text-[11px] uppercase tracking-wider font-semibold text-[#C9A24A] bg-[#C9A24A]/10 px-2.5 py-0.5 rounded-full border border-[#C9A24A]/30">
                  {book.category}
                </span>
                <span
                  className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                    isOutOfStock
                      ? "text-red-400 bg-red-950/20 border-red-800/40"
                      : "text-emerald-400 bg-emerald-950/20 border-emerald-800/40"
                  }`}
                >
                  {isOutOfStock ? "Out of Stock" : `In Stock (${book.stock} available)`}
                </span>
              </div>

              {/* Title & Author */}
              <h1 className="text-2xl md:text-3xl lg:text-4xl font-serif text-white font-semibold leading-tight">
                {book.title}
              </h1>
              {book.author && (
                <p className="text-sm text-neutral-400 mt-2 font-light">
                  By <span className="text-neutral-200 font-medium">{book.author}</span>
                </p>
              )}

              {/* Pricing Section */}
              <div className="flex items-baseline space-x-3 mt-5">
                <span className="text-2xl md:text-3xl font-bold text-[#C9A24A]">
                  {formatPrice(discountedPrice)}
                </span>
                {hasDiscount && (
                  <span className="text-sm md:text-base text-neutral-500 line-through">
                    {formatPrice(book.price)}
                  </span>
                )}
                {hasDiscount && (
                  <span className="bg-red-950/60 text-red-400 border border-red-800/60 text-xs font-bold px-2 py-0.5 rounded">
                    Save {book.discount}%
                  </span>
                )}
              </div>

              {/* Delivery Info Badge */}
              <div className="flex items-start gap-3.5 bg-[#141414] border border-[#2A2A2A] rounded-xl px-4 py-3.5 mt-5">
                <div className="w-8 h-8 rounded-lg bg-[#1C1C1C] border border-[#2A2A2A] flex items-center justify-center text-[#C9A24A] shrink-0">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7h12m0 0l1 1v6a2 2 0 01-2 2h-1M5 7h2m-2 4h2m-4 8a2 2 0 100-4 2 2 0 000 4zm14 0a2 2 0 100-4 2 2 0 000 4z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-semibold text-neutral-200">
                    Free Delivery
                  </p>
                  <p className="text-xs text-neutral-400 mt-0.5 font-light">
                    Express dispatch within 3–5 business days across India
                  </p>
                </div>
              </div>

              {/* Trust Indicators */}
              <div className="grid grid-cols-3 gap-3 pt-3.5">
                <div className="flex flex-col items-center gap-1.5 border border-[#262626] bg-[#141414] rounded-xl p-3 text-center">
                  <svg className="w-5 h-5 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span className="text-[11px] text-neutral-300 font-medium">7 Days Replacement</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 border border-[#262626] bg-[#141414] rounded-xl p-3 text-center">
                  <svg className="w-5 h-5 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                  </svg>
                  <span className="text-[11px] text-neutral-300 font-medium">Cash On Delivery</span>
                </div>
                <div className="flex flex-col items-center gap-1.5 border border-[#262626] bg-[#141414] rounded-xl p-3 text-center">
                  <svg className="w-5 h-5 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span className="text-[11px] text-neutral-300 font-medium">Secure Payment</span>
                </div>
              </div>

              {/* Description */}
              <div className="mt-6 border-t border-[#2A2A2A] pt-5">
                <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Description
                </h2>
                <p className="text-neutral-400 text-sm leading-relaxed whitespace-pre-line font-light">
                  {book.description}
                </p>
              </div>

              {/* Publishing Metadata Details */}
              <div className="mt-6 border-t border-[#2A2A2A] pt-4 grid grid-cols-2 gap-y-2 text-xs text-neutral-400">
                {book.publisher && (
                  <div>
                    <span className="text-neutral-500">Publisher:</span>{" "}
                    <span className="text-neutral-300 font-medium">{book.publisher}</span>
                  </div>
                )}
                {book.publishedDate && (
                  <div>
                    <span className="text-neutral-500">Published:</span>{" "}
                    <span className="text-neutral-300 font-medium">{book.publishedDate}</span>
                  </div>
                )}
                {book.language && (
                  <div>
                    <span className="text-neutral-500">Language:</span>{" "}
                    <span className="text-neutral-300 font-medium">{book.language}</span>
                  </div>
                )}
                {book.pages && (
                  <div>
                    <span className="text-neutral-500">Pages:</span>{" "}
                    <span className="text-neutral-300 font-medium">{book.pages}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions: Quantity, Add to Cart & Buy Now */}
            <div className="mt-8 border-t border-[#2A2A2A] pt-6 flex flex-col sm:flex-row items-center gap-3">
              <div className="flex items-center border border-[#333333] rounded-lg bg-[#141414] h-11 shrink-0">
                <button
                  type="button"
                  disabled={isOutOfStock || quantity <= 1}
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                  className="px-3.5 h-full text-neutral-400 hover:text-white disabled:opacity-40 transition-transform duration-[var(--duration-micro)] active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24A]"
                  aria-label={`Decrease quantity of ${book.title}`}
                >
                  −
                </button>
                <span className="px-3 text-sm font-semibold text-white" aria-live="polite" aria-label={`Quantity: ${quantity}`}>{quantity}</span>
                <button
                  type="button"
                  disabled={isOutOfStock || (book.stock !== undefined && quantity >= book.stock)}
                  onClick={() => setQuantity((q) => q + 1)}
                  className="px-3.5 h-full text-neutral-400 hover:text-white disabled:opacity-40 transition-transform duration-[var(--duration-micro)] active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24A]"
                  aria-label={`Increase quantity of ${book.title}`}
                >
                  +
                </button>
              </div>

              <button
                type="button"
                disabled={isOutOfStock || isSubmitting}
                onClick={handleAddToCart}
                aria-label={
                  isOutOfStock
                    ? `${book.title} is out of stock`
                    : inCart
                    ? `Go to cart for ${book.title}`
                    : `Add ${book.title} to cart`
                }
                className={`w-full sm:flex-1 h-11 px-4 rounded-lg font-semibold text-xs md:text-sm tracking-wider transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-[0.98] flex items-center justify-center gap-2 shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0B] ${
                  isOutOfStock
                    ? "bg-[#1C1C1C] text-neutral-400 cursor-not-allowed border border-[#2A2A2A]"
                    : added
                    ? "bg-emerald-600 text-white shadow-emerald-900/30"
                    : inCart
                    ? "bg-transparent border border-[#C9A24A] text-[#C9A24A] hover:bg-[#C9A24A] hover:text-black cursor-pointer"
                    : "bg-[#C9A24A] text-black hover:bg-[#B89139] hover:shadow-[0_4px_16px_rgba(201,162,74,0.25)] cursor-pointer"
                }`}
              >
                {isOutOfStock ? (
                  "Out of Stock"
                ) : isSubmitting ? (
                  "Adding..."
                ) : added ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Added to Cart</span>
                  </>
                ) : inCart ? (
                  `In Cart (${quantity})`
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    <span>Add to Cart</span>
                  </>
                )}
              </button>

              <button
                type="button"
                disabled={isOutOfStock || isSubmitting}
                onClick={handleBuyNow}
                className="w-full sm:flex-1 h-11 px-4 rounded-lg font-semibold text-xs md:text-sm tracking-wider bg-[#C9A24A] text-black hover:bg-[#B89139] hover:shadow-[0_4px_16px_rgba(201,162,74,0.25)] transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-[0.98] shadow-md disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>Buy Now</span>
              </button>
            </div>
          </div>
        </div>

        {/* Similar Books Section */}
        {similarBooks.length > 0 && (
          <div className="border-t border-[#222222] pt-12 mt-12 pb-12">
            <div className="mb-8">
              <p className="text-[#C9A24A] text-xs uppercase tracking-[0.25em] font-semibold font-sans mb-1">
                Recommendations
              </p>
              <h2 className="text-xl md:text-2xl font-serif text-white font-semibold uppercase tracking-wide">
                Similar Islamic Literature
              </h2>
            </div>
            <ProductGrid books={similarBooks} />
          </div>
        )}
      </PageContainer>
    </>
  );
}
