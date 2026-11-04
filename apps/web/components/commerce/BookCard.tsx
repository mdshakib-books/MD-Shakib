"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/lib/commerce/cart-context";

export interface BookItem {
  id: string;
  title: string;
  price: number;
  discount?: number;
  stock?: number;
  imageUrl?: string;
  category?: string;
  author?: string;
}

export interface BookCardProps {
  book: BookItem;
  inCart?: boolean;
  onAddToCart?: (book: BookItem) => void;
  onGoToCart?: () => void;
  onToggleWishlist?: (book: BookItem) => void;
}

export function BookCard({
  book,
  inCart: explicitInCart,
  onAddToCart,
  onGoToCart,
  onToggleWishlist,
}: BookCardProps) {
  const router = useRouter();
  const cartContext = useCart();
  const effectiveInCart =
    explicitInCart !== undefined ? explicitInCart : cartContext.isInCart(book.id);

  const hasDiscount = Boolean(book.discount && book.discount > 0);
  const discountedPrice = hasDiscount
    ? Math.round(book.price * (1 - (book.discount || 0) / 100))
    : book.price;
  const originalPrice = book.price;
  const isOutOfStock = book.stock !== undefined && book.stock <= 0;

  const handleCartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (isOutOfStock) return;

    if (effectiveInCart) {
      if (onGoToCart) {
        onGoToCart();
      } else {
        router.push("/cart");
      }
    } else {
      if (onAddToCart) {
        onAddToCart(book);
      } else {
        cartContext.addItem(book);
      }
    }
  };

  const handleWishlistClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onToggleWishlist?.(book);
  };

  return (
    <Link
      href={`/books/${book.id}`}
      className="group relative flex flex-col bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)] hover:-translate-y-1.5 hover:shadow-luxury-hover hover:border-[#C9A24A]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A]"
    >
      {/* Discount Badge */}
      {hasDiscount && (
        <div className="absolute top-4 left-4 z-10 bg-[#FFF5D1] text-black text-[11px] font-bold px-2 py-0.5 rounded shadow-sm uppercase tracking-wide">
          -{book.discount}% OFF
        </div>
      )}

      {/* Wishlist Button */}
      <button
        type="button"
        aria-label="Save to Wishlist"
        onClick={handleWishlistClick}
        className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-black/40 backdrop-blur-md border border-white/10 rounded-full text-neutral-300 hover:text-red-400 hover:bg-black/70 hover:border-red-400/30 active:scale-95 transition-all duration-[var(--duration-button)] cursor-pointer"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
      </button>

      {/* Book Image Presentation */}
      <div className="relative w-full aspect-[3/4] mb-4 overflow-hidden rounded-lg bg-[#0E0E0E] border border-[#222222] flex items-center justify-center p-3 shadow-inner">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            book.imageUrl ||
            "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400&h=300"
          }
          alt={book.title}
          className="w-full h-full object-contain rounded shadow transition-transform duration-500 [transition-timing-function:var(--ease-luxury)] group-hover:scale-[1.04]"
        />
      </div>

      {/* Book Details */}
      <div className="flex-grow flex flex-col justify-between">
        <div>
          {book.category && (
            <p className="text-[10px] uppercase font-semibold text-[#C9A24A] tracking-[0.15em] mb-1 font-sans">
              {book.category}
            </p>
          )}
          <h3 className="font-serif text-sm md:text-base font-medium text-neutral-100 line-clamp-2 leading-snug mb-1">
            {book.title}
          </h3>
          {book.author && (
            <p className="text-xs text-neutral-400 line-clamp-1 mb-2 font-light">
              By <span className="text-neutral-300">{book.author}</span>
            </p>
          )}
        </div>

        <div className="mt-3 flex items-baseline space-x-2">
          <span className="font-bold text-[#C9A24A] text-base md:text-lg">
            {formatPrice(discountedPrice)}
          </span>
          {hasDiscount && (
            <span className="text-neutral-500 text-xs line-through">
              {formatPrice(originalPrice)}
            </span>
          )}
        </div>
      </div>

      {/* Add / Go to Cart Action Button */}
      <button
        type="button"
        onClick={handleCartClick}
        disabled={isOutOfStock}
        className={`mt-4 w-full font-semibold py-2.5 px-3 rounded-lg text-xs md:text-sm flex items-center justify-center gap-2 transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-[0.98] cursor-pointer
          ${
            isOutOfStock
              ? "bg-[#1C1C1C] text-neutral-500 cursor-not-allowed border border-[#2A2A2A]"
              : effectiveInCart
              ? "bg-transparent border border-[#C9A24A] text-[#C9A24A] hover:bg-[#C9A24A] hover:text-black"
              : "bg-[#C9A24A] hover:bg-[#B89139] text-black shadow-md shadow-[#C9A24A]/10 hover:shadow-[0_4px_16px_rgba(201,162,74,0.25)]"
          }`}
      >
        {isOutOfStock ? (
          "Out of Stock"
        ) : effectiveInCart ? (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span>Go to Cart</span>
          </>
        ) : (
          <>
            <svg
              className="w-4 h-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <span>Add to Cart</span>
          </>
        )}
      </button>
    </Link>
  );
}
