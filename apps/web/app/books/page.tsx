import * as React from "react";
import { Suspense } from "react";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getBooks, CATALOG_CATEGORIES, type PaginatedCatalogResult } from "@/lib/data/catalog";
import { BooksCatalogClient } from "./BooksCatalogClient";

interface BooksPageProps {
  searchParams: Promise<{
    search?: string;
    category?: string;
    page?: string;
    sort?: "newest" | "price_asc" | "price_desc" | "title_asc";
  }>;
}

export const dynamic = "force-dynamic";

export default async function BooksPage({ searchParams }: BooksPageProps) {
  const resolvedParams = await searchParams;
  const search = resolvedParams.search || "";
  const category = resolvedParams.category || "";
  const page = Math.max(1, Number(resolvedParams.page) || 1);
  const sort = resolvedParams.sort || "newest";

  let catalogResult: PaginatedCatalogResult = {
    books: [],
    totalCount: 0,
    page: 1,
    pageSize: 8,
    totalPages: 1,
  };
  let fetchError = false;

  try {
    catalogResult = await getBooks({
      search,
      category,
      page,
      sort,
      pageSize: 8,
    });
  } catch (err) {
    console.error("Failed to query catalog in BooksPage:", err);
    fetchError = true;
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
      <Navbar />

      <main className="flex-grow w-full pb-16">
        {/* Hero Header */}
        <section className="text-center py-16 px-4">
          <h1 className="text-3xl md:text-5xl font-serif tracking-wide uppercase">
            Explore Our{" "}
            <span className="text-[var(--color-primary-gold)]">Collection</span>
          </h1>
          <p className="text-neutral-400 mt-3 text-sm md:text-base max-w-lg mx-auto font-sans">
            Discover authentic Islamic books carefully curated for knowledge seekers and learners.
          </p>
        </section>

        <Suspense fallback={<div className="text-center py-12 text-neutral-500">Loading catalog...</div>}>
          <BooksCatalogClient
            initialData={catalogResult}
            currentSearch={search}
            currentCategory={category}
            currentPage={page}
            currentSort={sort}
            categories={[...CATALOG_CATEGORIES]}
            hasError={fetchError}
          />
        </Suspense>
      </main>

      <Footer />
    </div>
  );
}
