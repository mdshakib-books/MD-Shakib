import * as React from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { HeroSection, TrustIndicators } from "@/components/layout/HeroSection";
import { PageContainer, SectionHeading } from "@/components/layout/PageContainer";
import { ProductGrid } from "@/components/commerce/ProductGrid";
import { OrderSteps } from "@/components/home/OrderSteps";
import { Reviews } from "@/components/home/Reviews";
import { ScrollReveal } from "@/components/ui/ScrollReveal";
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

      <main id="main-content" className="flex-grow">
        {/* 2. Hero Presentation */}
        <HeroSection />

        {/* 3. Trust Indicators Bar */}
        <TrustIndicators />

        {/* 4. Commerce Catalog & Featured Section */}
        <PageContainer>
          <ScrollReveal>
            <SectionHeading
              title="Featured Collection"
              subtitle="Discover authentic scholarly literature, Quran editions, and classical Islamic treatises"
            />

            {fetchError ? (
              <div className="bg-[#141414] border border-red-900/40 text-neutral-300 rounded-2xl p-8 text-center my-8 max-w-xl mx-auto">
                <p className="text-base font-serif text-red-400 mb-2 uppercase">Notice</p>
                <p className="text-sm text-neutral-400 leading-relaxed font-light">
                  The featured collection is momentarily unavailable. Please explore our full catalogue below.
                </p>
                <Link
                  href="/books"
                  className="inline-block mt-5 px-6 py-2.5 rounded-lg bg-[#C9A24A] text-black font-semibold text-xs uppercase tracking-wider hover:bg-[#B89139] transition shadow-sm"
                >
                  Browse All Books
                </Link>
              </div>
            ) : featuredBooks.length === 0 ? (
              <div className="bg-[#141414] border border-[#222222] rounded-2xl p-12 text-center my-8 max-w-xl mx-auto">
                <p className="text-white font-serif text-lg uppercase tracking-wide">No books currently in stock</p>
                <p className="text-xs text-neutral-400 mt-2 font-light">
                  Our catalogue is being updated with authentic collections soon.
                </p>
              </div>
            ) : (
              <div className="mt-8">
                <ProductGrid books={featuredBooks} />
              </div>
            )}

            <div className="text-center mt-14 mb-4">
              <Link
                href="/books"
                className="inline-flex items-center space-x-2.5 px-8 py-3.5 rounded-xl border border-[#C9A24A] text-[#C9A24A] hover:bg-[#C9A24A] hover:text-black font-semibold text-xs uppercase tracking-wider transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-95 shadow-sm"
              >
                <span>View Full Collection</span>
                <span aria-hidden="true">&rarr;</span>
              </Link>
            </div>
          </ScrollReveal>
        </PageContainer>

        {/* 5. How To Order Steps Sequence */}
        <OrderSteps />

        {/* 6. Customer Testimonials */}
        <Reviews />
      </main>

      {/* 7. Global Footer Shell */}
      <Footer />
    </div>
  );
}
