"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatPrice } from "@/lib/utils";
import { useCart } from "@/lib/commerce/cart-context";
import type { CustomerCartSummary } from "@/lib/commerce/cart";

interface CartClientProps {
  initialCart?: CustomerCartSummary | null;
  isAuthenticated?: boolean;
}

export function CartClient({ initialCart, isAuthenticated: initialAuth = false }: CartClientProps) {
  const {
    items,
    subtotal,
    platformFee,
    deliveryFee,
    totalAmount,
    updateQuantity,
    removeItem,
    isAuthenticated,
    isLoading,
  } = useCart();

  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleQuantity = (itemIdOrBookId: string, newQty: number) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateQuantity(itemIdOrBookId, newQty);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      }
    });
  };

  const handleRemove = (itemIdOrBookId: string) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await removeItem(itemIdOrBookId);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      }
    });
  };

  if (items.length === 0 && !isLoading) {
    return (
      <PageContainer size="md">
        <EmptyState
          headingLevel="h1"
          title="Your Cart is Empty"
          description="You haven't added any authentic Islamic books to your cart yet. Explore our scholarly collection to begin."
          icon={
            <svg className="w-8 h-8 text-[#C9A24A]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
          }
          actionText="Explore Catalogue"
          actionUrl="/books"
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-serif text-white uppercase tracking-wide mb-1 font-bold">
              Shopping Cart ({items.length} {items.length === 1 ? "Item" : "Items"})
            </h1>
            <p className="text-xs text-neutral-400 font-light">
              Review your authentic Islamic literature selection before proceeding to checkout.
            </p>
          </div>
          {!isAuthenticated && items.length > 0 && (
            <div className="bg-[#141414] border border-[#C9A24A]/30 rounded-xl px-4 py-2.5 text-xs text-neutral-300 flex flex-wrap items-center gap-2 sm:gap-3">
              <span>Browsing as Guest. Log in to save cart to your account.</span>
              <Link
                href="/login?redirect=/cart"
                className="text-[#C9A24A] font-bold hover:underline whitespace-nowrap"
              >
                Log In
              </Link>
            </div>
          )}
        </div>

        {errorMsg && (
          <div role="alert" className="mb-6 p-3.5 rounded-xl bg-red-950/20 border border-red-800/40 text-red-400 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button
              type="button"
              onClick={() => setErrorMsg(null)}
              className="text-neutral-400 hover:text-white ml-2 text-xs underline focus-visible:ring-1 focus-visible:ring-[#C9A24A] rounded"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8 min-w-0">
          {/* Left 2 Cols: Cart Item List */}
          <div className="lg:col-span-2 space-y-4 min-w-0">
            {items.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-3 sm:gap-4 bg-[#141414] border border-[#262626] rounded-xl p-4 transition-all duration-[var(--duration-card)] [transition-timing-function:var(--ease-luxury)] hover:border-[#383838] min-w-0 animate-fade-in-up"
                style={{ animationDelay: `${Math.min(index * 50, 300)}ms` }}
              >
                <div className="relative w-14 h-20 sm:w-16 sm:h-22 flex-shrink-0 bg-[#0E0E0E] border border-[#222] rounded-lg overflow-hidden p-1 flex items-center justify-center shadow-inner">
                  {item.imageUrl ? (
                    <Image src={item.imageUrl} alt={item.title} fill sizes="64px" className="object-contain p-1" />
                  ) : (
                    <span className="text-[10px] text-neutral-500 font-serif">No Cover</span>
                  )}
                </div>

                <div className="flex-grow min-w-0">
                  <Link href={`/books/${item.bookId}`} className="block hover:text-[#C9A24A] transition-colors duration-[var(--duration-button)]">
                    <h2 className="text-xs sm:text-sm font-semibold text-neutral-100 truncate">{item.title}</h2>
                  </Link>
                  {item.author && <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5 truncate font-light">By {item.author}</p>}
                  <div className="text-xs text-[#C9A24A] font-bold mt-1.5 sm:mt-2">
                    {formatPrice(item.price)}
                  </div>
                </div>

                {/* Quantity Controls & Remove */}
                <div className="flex items-center gap-2.5 flex-shrink-0">
                  <div className="flex items-center border border-[#333333] rounded-lg bg-[#0E0E0E] h-8">
                    <button
                      disabled={isPending}
                      onClick={() => handleQuantity(item.id, item.quantity - 1)}
                      className="px-2.5 h-full text-neutral-400 hover:text-white disabled:opacity-40 text-xs cursor-pointer transition-transform duration-[var(--duration-micro)] active:scale-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24A]"
                      aria-label={`Decrease quantity of ${item.title}`}
                    >
                      −
                    </button>
                    <span
                      aria-live="polite"
                      aria-label={`Quantity: ${item.quantity}`}
                      className="px-2 text-xs font-mono font-semibold text-neutral-200"
                    >
                      {item.quantity}
                    </span>
                    <button
                      disabled={isPending || (item.stock !== undefined && item.quantity >= item.stock)}
                      onClick={() => handleQuantity(item.id, item.quantity + 1)}
                      className="px-2.5 h-full text-neutral-400 hover:text-white disabled:opacity-40 text-xs cursor-pointer transition-transform duration-[var(--duration-micro)] active:scale-90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#C9A24A]"
                      aria-label={`Increase quantity of ${item.title}`}
                    >
                      +
                    </button>
                  </div>

                  <button
                    disabled={isPending}
                    onClick={() => handleRemove(item.id)}
                    className="w-8 h-8 rounded-lg bg-[#1C1C1C] text-neutral-400 hover:text-red-400 hover:bg-[#252525] flex items-center justify-center transition-all duration-[var(--duration-button)] active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A]"
                    title={`Remove ${item.title}`}
                    aria-label={`Remove ${item.title} from cart`}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right Col: Price Summary Card */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 h-fit space-y-5 shadow-luxury">
            <h2 className="text-xs font-semibold text-neutral-200 uppercase tracking-wider pb-3 border-b border-[#262626]">
              Order Summary
            </h2>

            <div className="space-y-2.5 text-xs text-neutral-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-neutral-200 font-mono font-medium">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Fee</span>
                <span className="text-neutral-200 font-mono font-medium">{formatPrice(platformFee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Charge</span>
                <span className="text-neutral-200 font-mono font-medium">{formatPrice(deliveryFee)}</span>
              </div>
              <div className="border-t border-[#262626] pt-3.5 flex justify-between font-bold text-base text-[#C9A24A]">
                <span>Total Amount</span>
                <span className="font-mono">{formatPrice(totalAmount)}</span>
              </div>
            </div>

            <Link
              href={isAuthenticated ? "/checkout" : "/login?redirect=/checkout"}
              className="block w-full text-center py-3 px-4 rounded-lg bg-[#C9A24A] hover:bg-[#B89139] text-black font-bold uppercase tracking-wider text-xs shadow-md shadow-[#C9A24A]/10 hover:shadow-[0_4px_16px_rgba(201,162,74,0.25)] transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#141414]"
            >
              {isAuthenticated ? "Proceed to Checkout" : "Sign In to Checkout"}
            </Link>

            <p className="text-[10px] text-neutral-400 text-center leading-tight">
              Taxes included. Cash on Delivery (COD) and fast shipping available.
            </p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
