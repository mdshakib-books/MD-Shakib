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
      className="group relative flex flex-col bg-[#111111] border border-[#2A2A2A] rounded-[12px] p-4 transition-all duration-300 hover:-translate-y-[6px] hover:shadow-[0_10px_30px_rgba(201,162,74,0.15)] hover:border-[var(--color-primary-gold)]"
    >
      {/* Discount Badge */}
      {hasDiscount && (
        <div className="absolute top-4 left-4 z-10 bg-[#FFF5D1] text-black text-xs font-bold px-2 py-1 rounded shadow-sm">
          -{book.discount}%
        </div>
      )}

      {/* Wishlist Button */}
      <button
        type="button"
        aria-label="Save to Wishlist"
        onClick={handleWishlistClick}
        className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-full text-white hover:text-red-500 hover:bg-white/20 transition-colors cursor-pointer"
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
            strokeWidth="2"
            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
          />
        </svg>
      </button>

      {/* Book Image */}
      <div className="relative w-full aspect-[3/4] mb-4 overflow-hidden rounded-md bg-[#1a1a1a] flex items-center justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={
            book.imageUrl ||
            "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400&h=300"
          }
          alt={book.title}
          className="w-[90%] h-[95%] object-cover rounded shadow-lg transition-transform duration-500 group-hover:scale-105"
        />
      </div>

      {/* Book Details */}
      <div className="flex-grow flex flex-col justify-between">
        <div>
          {book.category && (
            <p className="text-[10px] uppercase font-semibold text-[var(--color-primary-gold)] tracking-wider mb-1">
              {book.category}
            </p>
          )}
          <h3 className="font-medium text-sm md:text-base text-neutral-100 line-clamp-2 leading-tight mb-2">
            {book.title}
          </h3>
          {book.author && (
            <p className="text-xs text-neutral-400 line-clamp-1 mb-2">
              {book.author}
            </p>
          )}
        </div>

        <div className="mt-2 flex items-center space-x-2">
          {hasDiscount && (
            <span className="text-neutral-500 text-xs line-through">
              {formatPrice(originalPrice)}
            </span>
          )}
          <span className="font-bold text-[var(--color-primary-gold)] text-lg">
            {formatPrice(discountedPrice)}
          </span>
        </div>
      </div>

      {/* Add / Go to Cart Action Button */}
      <button
        type="button"
        onClick={handleCartClick}
        disabled={isOutOfStock}
        className={`mt-4 w-full font-semibold py-2.5 rounded-[10px] text-sm flex items-center justify-center gap-2 transition-all duration-300 cursor-pointer
          ${
            isOutOfStock
              ? "bg-[#222222] text-neutral-500 cursor-not-allowed border border-[#2A2A2A]"
              : effectiveInCart
              ? "bg-transparent border border-[var(--color-primary-gold)] text-[var(--color-primary-gold)] hover:bg-[var(--color-primary-gold)] hover:text-black"
              : "bg-[var(--color-primary-gold)] hover:bg-[var(--color-accent-gold)] text-black"
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
                strokeWidth="2"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Go to Cart
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
                strokeWidth="2"
                d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            Add to Cart
          </>
        )}
      </button>
    </Link>
  );
}

