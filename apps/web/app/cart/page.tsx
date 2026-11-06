import * as React from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerCart } from "@/lib/commerce/cart";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { CartClient } from "./CartClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Shopping Cart | MD Shakib Islamic Books",
  description: "View and manage items in your shopping cart.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function CartPage() {
  const user = await getAuthenticatedUser();
  let cart = null;

  if (user) {
    try {
      cart = await getCustomerCart();
    } catch (err) {
      console.error("Error loading cart:", err);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white overflow-x-hidden">
      <Navbar />
      <main id="main-content" className="flex-grow pb-16 overflow-x-hidden">
        <CartClient initialCart={cart} isAuthenticated={Boolean(user)} />
      </main>
      <Footer />
    </div>
  );
}
