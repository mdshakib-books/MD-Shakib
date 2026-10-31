"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
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
        <div className="text-center py-20 px-4 bg-[#141414] border border-[#222] rounded-xl my-8">
          <div className="text-4xl mb-3">🛒</div>
          <h1 className="text-xl font-serif text-neutral-200 uppercase">Your Cart is Empty</h1>
          <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto">
            You haven&apos;t added any Islamic books to your cart yet. Explore our authentic collection!
          </p>
          <Link
            href="/books"
            className="inline-block mt-6 px-6 py-2.5 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-xs hover:bg-[var(--color-accent-gold)] transition-all shadow"
          >
            Explore Books
          </Link>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="py-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-serif text-white uppercase tracking-wider mb-2">
              Shopping Cart ({items.length} {items.length === 1 ? "Item" : "Items"})
            </h1>
            <p className="text-xs text-neutral-400">
              Review your authentic Islamic literature selection before proceeding to checkout.
            </p>
          </div>
          {!isAuthenticated && items.length > 0 && (
            <div className="bg-[#181818] border border-[var(--color-primary-gold)]/30 rounded-lg px-4 py-2 text-xs text-neutral-300 flex flex-wrap items-center gap-2 sm:gap-3">
              <span>Browsing as Guest. Log in to save cart to your account.</span>
              <Link
                href="/login?redirect=/cart"
                className="text-[var(--color-primary-gold)] font-bold hover:underline whitespace-nowrap"
              >
                Log In
              </Link>
            </div>
          )}
        </div>

        {errorMsg && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
            {errorMsg}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8 min-w-0">
          {/* Left 2 Cols: Cart Item List */}
          <div className="lg:col-span-2 space-y-4 min-w-0">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3 sm:gap-4 bg-[#141414] border border-[#262626] rounded-xl p-3 sm:p-4 transition hover:border-[#383838] min-w-0"
              >
                <div className="w-14 h-20 sm:w-16 sm:h-22 flex-shrink-0 bg-[#0B0B0B] border border-[#222] rounded-md overflow-hidden p-1 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-contain" />
                </div>

                <div className="flex-grow min-w-0">
                  <Link href={`/books/${item.bookId}`} className="block hover:text-[#C9A24A]">
                    <h2 className="text-xs sm:text-sm font-semibold text-neutral-200 truncate">{item.title}</h2>
                  </Link>
                  {item.author && <p className="text-[11px] sm:text-xs text-neutral-500 mt-0.5 truncate">{item.author}</p>}
                  <div className="text-xs text-[var(--color-primary-gold)] font-bold mt-1.5 sm:mt-2">
                    {formatPrice(item.price)}
                  </div>
                </div>

                {/* Quantity Controls & Remove */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="flex items-center border border-[#333] rounded-md bg-[#0B0B0B]">
                    <button
                      disabled={isPending}
                      onClick={() => handleQuantity(item.id, item.quantity - 1)}
                      className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-neutral-400 hover:text-white disabled:opacity-40 text-xs cursor-pointer"
                      aria-label="Decrease quantity"
                    >
                      -
                    </button>
                    <span className="px-1.5 sm:px-2 text-xs font-mono text-neutral-200">{item.quantity}</span>
                    <button
                      disabled={isPending || (item.stock !== undefined && item.quantity >= item.stock)}
                      onClick={() => handleQuantity(item.id, item.quantity + 1)}
                      className="px-2 py-0.5 sm:px-2.5 sm:py-1 text-neutral-400 hover:text-white disabled:opacity-40 text-xs cursor-pointer"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  <button
                    disabled={isPending}
                    onClick={() => handleRemove(item.id)}
                    className="text-neutral-500 hover:text-red-400 text-xs p-1 sm:px-2 sm:py-1 transition cursor-pointer"
                    title="Remove item"
                    aria-label="Remove item"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Right Col: Price Summary Card */}
          <div className="bg-[#141414] border border-[#262626] rounded-xl p-6 h-fit space-y-4">
            <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider pb-3 border-b border-[#262626]">
              Order Summary
            </h2>

            <div className="space-y-2 text-xs text-neutral-400">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-neutral-200 font-mono">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Fee</span>
                <span className="text-neutral-200 font-mono">{formatPrice(platformFee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Charge</span>
                <span className="text-neutral-200 font-mono">{formatPrice(deliveryFee)}</span>
              </div>
              <div className="border-t border-[#262626] pt-3 flex justify-between font-bold text-sm text-[var(--color-primary-gold)]">
                <span>Total Amount</span>
                <span className="font-mono">{formatPrice(totalAmount)}</span>
              </div>
            </div>

            <Link
              href={isAuthenticated ? "/checkout" : "/login?redirect=/checkout"}
              className="block w-full"
            >
              <Button variant="primary" className="w-full mt-2" disabled={isPending || items.length === 0}>
                {isAuthenticated ? "Proceed to Checkout" : "Sign In to Checkout"}
              </Button>
            </Link>

            <p className="text-[10px] text-neutral-500 text-center leading-tight">
              Taxes included. Cash on Delivery (COD) and fast shipping available.
            </p>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}

