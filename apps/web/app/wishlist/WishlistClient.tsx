"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/lib/commerce/cart-context";
import type { WishlistItem } from "@/lib/commerce/wishlist";

interface WishlistClientProps {
  initialItems: WishlistItem[];
  isAuthenticated: boolean;
}

export function WishlistClient({ initialItems, isAuthenticated }: WishlistClientProps) {
  const [items, setItems] = React.useState<WishlistItem[]>(initialItems);
  const [loadingId, setLoadingId] = React.useState<string | null>(null);
  const cartContext = useCart();

  const handleRemove = async (bookId: string) => {
    setLoadingId(bookId);
    try {
      const res = await fetch(`/api/wishlist?bookId=${bookId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.bookId !== bookId));
      }
    } catch (err) {
      console.error("Failed to remove item from wishlist:", err);
    } finally {
      setLoadingId(null);
    }
  };

  const handleMoveToCart = async (item: WishlistItem) => {
    cartContext.addItem({
      id: item.bookId,
      title: item.title,
      price: item.discountPrice || item.price,
      stock: item.stock,
      imageUrl: item.coverImage || undefined,
      author: item.author,
    });
    // Remove from wishlist after moving to cart
    await handleRemove(item.bookId);
  };

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <h1 className="text-3xl font-serif text-[#C9A24A] mb-4">Your Wishlist</h1>
        <p className="text-neutral-400 mb-8">Please sign in to view and save books to your personal wishlist.</p>
        <Link
          href="/login?redirect=/wishlist"
          className="inline-block px-6 py-3 bg-[#C9A24A] text-black font-semibold rounded-lg hover:bg-[#E5C87B] transition-colors"
        >
          Sign In to Access Wishlist
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-[#2A2A2A] mb-8">
        <div>
          <h1 className="text-3xl font-serif text-[#C9A24A] tracking-wide">My Saved Books</h1>
          <p className="text-sm text-neutral-400 mt-1">
            {items.length} {items.length === 1 ? "book" : "books"} saved in your collection
          </p>
        </div>
        <Link
          href="/books"
          className="mt-4 md:mt-0 text-sm text-[#C9A24A] hover:text-[#E5C87B] transition-colors flex items-center gap-1"
        >
          <span>Continue Browsing</span>
          <span>→</span>
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="bg-[#141414] border border-[#2A2A2A] rounded-2xl p-12 text-center max-w-xl mx-auto">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[#1C1C1C] flex items-center justify-center text-neutral-500">
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
          </div>
          <h2 className="text-xl font-medium text-white mb-2">Your wishlist is empty</h2>
          <p className="text-sm text-neutral-400 mb-6">
            Explore our curated Islamic library and save your favorite books to read or purchase later.
          </p>
          <Link
            href="/books"
            className="inline-block px-6 py-2.5 bg-[#C9A24A] text-black font-semibold text-sm rounded-lg hover:bg-[#E5C87B] transition-colors"
          >
            Discover Books
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {items.map((item) => {
            const isOutOfStock = item.stock <= 0;
            const effectivePrice = item.discountPrice || item.price;

            return (
              <div
                key={item.id}
                className="bg-[#141414] border border-[#2A2A2A] rounded-xl overflow-hidden flex flex-col justify-between hover:border-[#C9A24A]/60 transition-all duration-200"
              >
                <div>
                  <div className="relative aspect-[3/4] w-full bg-[#1C1C1C] overflow-hidden">
                    {item.coverImage ? (
                      <Image
                        src={item.coverImage}
                        alt={item.title}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-neutral-600 font-serif">
                        MD Shakib
                      </div>
                    )}
                    {item.discountPrice && (
                      <span className="absolute top-3 left-3 bg-[#FFF5D1] text-black text-[10px] font-bold px-2 py-0.5 rounded shadow">
                        SALE
                      </span>
                    )}
                    {isOutOfStock && (
                      <span className="absolute top-3 right-3 bg-red-900/80 text-red-200 text-[10px] font-bold px-2 py-0.5 rounded backdrop-blur-sm border border-red-500/30">
                        OUT OF STOCK
                      </span>
                    )}
                  </div>

                  <div className="p-4">
                    <Link href={`/books/${item.bookId}`}>
                      <h3 className="font-serif text-white hover:text-[#C9A24A] transition-colors line-clamp-1 font-medium">
                        {item.title}
                      </h3>
                    </Link>
                    <p className="text-xs text-neutral-400 mt-1 line-clamp-1">{item.author}</p>

                    <div className="mt-3 flex items-baseline gap-2">
                      <span className="text-base font-semibold text-[#C9A24A]">
                        {formatPrice(effectivePrice)}
                      </span>
                      {item.discountPrice && (
                        <span className="text-xs text-neutral-500 line-through">
                          {formatPrice(item.price)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 pt-0 flex gap-2">
                  <button
                    type="button"
                    disabled={isOutOfStock || loadingId === item.bookId}
                    onClick={() => handleMoveToCart(item)}
                    className="flex-1 py-2 px-3 text-xs font-semibold rounded bg-[#C9A24A] text-black hover:bg-[#E5C87B] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Move to Cart
                  </button>
                  <button
                    type="button"
                    disabled={loadingId === item.bookId}
                    onClick={() => handleRemove(item.bookId)}
                    aria-label="Remove item"
                    className="p-2 text-neutral-400 hover:text-red-400 border border-[#2A2A2A] rounded hover:border-red-500/30 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
