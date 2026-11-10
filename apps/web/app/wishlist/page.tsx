import * as React from "react";
import type { Metadata } from "next";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { getCustomerWishlist } from "@/lib/commerce/wishlist";
import { WishlistClient } from "./WishlistClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "My Wishlist | MD Shakib Islamic Books",
  description: "View and manage your saved books wishlist.",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function WishlistPage() {
  const user = await getAuthenticatedUser();
  let wishlistItems: any[] = [];

  if (user) {
    try {
      wishlistItems = await getCustomerWishlist(user.id);
    } catch (err) {
      console.error("Error loading wishlist:", err);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white overflow-x-hidden">
      <Navbar />
      <main id="main-content" className="flex-grow pb-16 overflow-x-hidden">
        <WishlistClient initialItems={wishlistItems} isAuthenticated={Boolean(user)} />
      </main>
      <Footer />
    </div>
  );
}
