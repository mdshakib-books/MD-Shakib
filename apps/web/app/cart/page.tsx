import * as React from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerCart } from "@/lib/commerce/cart";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { CartClient } from "./CartClient";

export const dynamic = "force-dynamic";

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
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar cartCount={cart?.itemCount || 0} />
      <main className="flex-grow pb-16">
        <CartClient initialCart={cart} isAuthenticated={Boolean(user)} />
      </main>
      <Footer />
    </div>
  );
}
