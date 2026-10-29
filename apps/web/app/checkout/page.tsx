import * as React from "react";
import { redirect } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getCustomerCart } from "@/lib/commerce/cart";
import { getCustomerAddresses } from "@/lib/commerce/addresses";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { CheckoutClient } from "./CheckoutClient";

export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const user = await getAuthenticatedUser();
  if (!user) {
    redirect("/login?redirect=/checkout");
  }

  const [cart, addresses] = await Promise.all([
    getCustomerCart(),
    getCustomerAddresses(),
  ]);

  if (!cart || cart.items.length === 0) {
    redirect("/cart");
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar cartCount={cart.itemCount} />
      <main className="flex-grow pb-16">
        <CheckoutClient cart={cart} addresses={addresses} />
      </main>
      <Footer />
    </div>
  );
}
