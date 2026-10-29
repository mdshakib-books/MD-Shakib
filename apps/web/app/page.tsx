import * as React from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection, TrustIndicators } from "@/components/layout/HeroSection";
import { PageContainer, SectionHeading } from "@/components/layout/PageContainer";
import { ProductGrid } from "@/components/commerce/ProductGrid";
import { getFeaturedBooks, type CatalogBook } from "@/lib/data/catalog";
import Link from "next/link";

export const revalidate = 60; // ISR cache revalidation every 60 seconds

export default async function HomePage() {
  let featuredBooks: CatalogBook[] = [];
  let fetchError = false;

  try {
    featuredBooks = await getFeaturedBooks(8);
  } catch (err) {
    console.error("Failed to load featured books on homepage:", err);
    fetchError = true;
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#0B0B0B] text-[#F5F5F5]">
      {/* 1. Global Navigation Shell */}
      <Navbar />

      {/* 2. Hero Presentation */}
      <HeroSection />

      {/* 3. Trust Indicators Bar */}
      <TrustIndicators />

      {/* 4. Commerce Catalog & Featured Section */}
      <PageContainer>
        <SectionHeading
          title="Featured Collection"
          subtitle="Discover authentic scholarly literature and classical Islamic books"
        />

        {fetchError ? (
          <div className="bg-[#1A1A1A] border border-red-900/40 text-neutral-300 rounded-xl p-8 text-center my-8">
            <p className="text-base font-serif text-red-400 mb-2">Notice</p>
            <p className="text-sm text-neutral-400">
              The featured collection is momentarily unavailable. Please explore our full catalogue below.
            </p>
            <Link
              href="/books"
              className="inline-block mt-4 px-6 py-2 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-sm hover:opacity-95 transition"
            >
              Browse All Books
            </Link>
          </div>
        ) : featuredBooks.length === 0 ? (
          <div className="bg-[#141414] border border-[#222] rounded-xl p-12 text-center my-8">
            <p className="text-neutral-400 font-serif text-lg">No books currently in stock</p>
            <p className="text-xs text-neutral-500 mt-2">
              Our catalogue is being updated with authentic collections soon.
            </p>
          </div>
        ) : (
          <div className="mt-8">
            <ProductGrid books={featuredBooks} />
          </div>
        )}

        <div className="text-center mt-12 mb-6">
          <Link
            href="/books"
            className="inline-flex items-center space-x-2 px-8 py-3 rounded-lg border border-[var(--color-primary-gold)] text-[var(--color-primary-gold)] hover:bg-[var(--color-primary-gold)] hover:text-black font-medium text-sm transition-all shadow-sm"
          >
            <span>View Full Collection</span>
            <span>&rarr;</span>
          </Link>
        </div>
      </PageContainer>

      {/* 5. Global Footer Shell */}
      <Footer />
    </div>
  );
}
