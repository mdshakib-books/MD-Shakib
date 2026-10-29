"use client";

import * as React from "react";
import { useState, useTransition } from "react";
import Link from "next/link";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/Button";
import { formatPrice } from "@/lib/utils";
import { updateCartQuantity, removeCartItem, type CustomerCartSummary } from "@/lib/commerce/cart";

interface CartClientProps {
  initialCart: CustomerCartSummary | null;
  isAuthenticated: boolean;
}

export function CartClient({ initialCart, isAuthenticated }: CartClientProps) {
  const [isPending, startTransition] = useTransition();
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cart = initialCart;
  const items = cart?.items || [];
  const subtotal = cart?.subtotal || 0;
  const platformFee = cart?.platformFee || 0;
  const deliveryFee = cart?.deliveryFee || 0;
  const total = cart?.totalAmount || 0;

  const handleQuantity = (cartItemId: string, newQty: number) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await updateCartQuantity(cartItemId, newQty);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      }
    });
  };

  const handleRemove = (cartItemId: string) => {
    setErrorMsg(null);
    startTransition(async () => {
      const res = await removeCartItem(cartItemId);
      if (!res.success && res.error) {
        setErrorMsg(res.error);
      }
    });
  };

  if (!isAuthenticated) {
    return (
      <PageContainer size="md">
        <div className="text-center py-20 px-4 bg-[#141414] border border-[#222] rounded-xl my-8">
          <div className="text-4xl mb-4">🛒</div>
          <h1 className="text-2xl font-serif text-neutral-200 uppercase font-bold">
            Sign In to View Your Cart
          </h1>
          <p className="text-sm text-neutral-400 mt-2 max-w-sm mx-auto mb-6">
            Log in to access your persistent shopping cart, saved addresses, and checkout.
          </p>
          <Link
            href="/login?redirect=/cart"
            className="inline-block px-8 py-3 rounded-xl bg-[var(--color-primary-gold)] text-black font-bold text-xs uppercase tracking-wider hover:bg-[var(--color-accent-gold)] transition-colors"
          >
            Log In Now
          </Link>
        </div>
      </PageContainer>
    );
  }

  if (items.length === 0) {
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
        <h1 className="text-2xl md:text-3xl font-serif text-white uppercase tracking-wider mb-2">
          Shopping Cart ({items.length} {items.length === 1 ? "Item" : "Items"})
        </h1>
        <p className="text-xs text-neutral-400 mb-8">
          Review your authentic Islamic literature selection before proceeding to checkout.
        </p>

        {errorMsg && (
          <div className="mb-6 p-3 rounded-lg bg-red-950/20 border border-red-800/40 text-red-400 text-xs">
            {errorMsg}
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Left 2 Cols: Cart Item List */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-4 bg-[#141414] border border-[#262626] rounded-xl p-4 transition hover:border-[#383838]"
              >
                <div className="w-16 h-22 flex-shrink-0 bg-[#0B0B0B] border border-[#222] rounded-md overflow-hidden p-1 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.imageUrl} alt={item.title} className="w-full h-full object-contain" />
                </div>

                <div className="flex-grow min-w-0">
                  <Link href={`/books/${item.bookId}`} className="hover:text-[#C9A24A]">
                    <h2 className="text-sm font-semibold text-neutral-200 truncate">{item.title}</h2>
                  </Link>
                  <p className="text-xs text-neutral-500 mt-0.5 truncate">{item.author}</p>
                  <div className="text-xs text-[var(--color-primary-gold)] font-bold mt-2">
                    {formatPrice(item.price)}
                  </div>
                </div>

                {/* Quantity Controls */}
                <div className="flex items-center border border-[#333] rounded-md bg-[#0B0B0B]">
                  <button
                    disabled={isPending}
                    onClick={() => handleQuantity(item.id, item.quantity - 1)}
                    className="px-2.5 py-1 text-neutral-400 hover:text-white disabled:opacity-40 text-xs cursor-pointer"
                  >
                    -
                  </button>
                  <span className="px-2 text-xs font-mono text-neutral-200">{item.quantity}</span>
                  <button
                    disabled={isPending || item.quantity >= item.stock}
                    onClick={() => handleQuantity(item.id, item.quantity + 1)}
                    className="px-2.5 py-1 text-neutral-400 hover:text-white disabled:opacity-40 text-xs cursor-pointer"
                  >
                    +
                  </button>
                </div>

                {/* Remove Item Button */}
                <button
                  disabled={isPending}
                  onClick={() => handleRemove(item.id)}
                  className="text-neutral-500 hover:text-red-400 text-xs px-2 py-1 transition cursor-pointer"
                  title="Remove item"
                >
                  ✕
                </button>
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
                <span className="text-neutral-200">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span>Platform Fee</span>
                <span className="text-neutral-200">{formatPrice(platformFee)}</span>
              </div>
              <div className="flex justify-between">
                <span>Delivery Charge</span>
                <span className="text-neutral-200">{formatPrice(deliveryFee)}</span>
              </div>
              <div className="border-t border-[#262626] pt-3 flex justify-between font-bold text-sm text-[var(--color-primary-gold)]">
                <span>Total Amount</span>
                <span>{formatPrice(total)}</span>
              </div>
            </div>

            <Link href="/checkout" className="block w-full">
              <Button variant="primary" className="w-full mt-2" disabled={isPending}>
                Proceed to Checkout
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

