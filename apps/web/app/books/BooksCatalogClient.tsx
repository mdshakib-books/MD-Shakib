"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/ui/SearchBar";
import { CategoryTabs, ProductGrid } from "@/components/commerce/ProductGrid";
import { PageContainer } from "@/components/layout/PageContainer";
import { EmptyState } from "@/components/ui/EmptyState";
import type { PaginatedCatalogResult } from "@/lib/data/catalog";

interface BooksCatalogClientProps {
  initialData: PaginatedCatalogResult;
  currentSearch: string;
  currentCategory: string;
  currentPage: number;
  currentSort: string;
  categories: string[];
  hasError: boolean;
}

export function BooksCatalogClient({
  initialData,
  currentSearch,
  currentCategory,
  currentPage,
  currentSort,
  categories,
  hasError,
}: BooksCatalogClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const updateFilters = (updates: {
    search?: string;
    category?: string;
    page?: number;
    sort?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.search !== undefined) {
      if (updates.search.trim()) {
        params.set("search", updates.search.trim());
      } else {
        params.delete("search");
      }
      params.delete("page");
    }

    if (updates.category !== undefined) {
      if (updates.category) {
        params.set("category", updates.category);
      } else {
        params.delete("category");
      }
      params.delete("page");
    }

    if (updates.sort !== undefined) {
      if (updates.sort && updates.sort !== "newest") {
        params.set("sort", updates.sort);
      } else {
        params.delete("sort");
      }
      params.delete("page");
    }

    if (updates.page !== undefined) {
      if (updates.page > 1) {
        params.set("page", updates.page.toString());
      } else {
        params.delete("page");
      }
    }

    const query = params.toString();
    router.push(query ? `/books?${query}` : "/books");
  };

  const handleSearch = (query: string) => {
    updateFilters({ search: query });
  };

  const handleClear = () => {
    updateFilters({ search: "", category: "", page: 1, sort: "newest" });
  };

  const handleCategorySelect = (cat: string) => {
    updateFilters({ category: cat === currentCategory ? "" : cat });
  };

  const handleSortChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    updateFilters({ sort: e.target.value });
  };

  const { books, totalCount, totalPages } = initialData;

  const searchSuggestions = React.useMemo(() => {
    const titles = books.map((b) => b.title);
    return Array.from(new Set([...titles, ...categories]));
  }, [books, categories]);

  return (
    <>
      {/* Search Bar */}
      <div className="max-w-[700px] mx-auto px-4 mt-2">
        <SearchBar
          onSearch={handleSearch}
          onClear={handleClear}
          suggestions={searchSuggestions}
          defaultQuery={currentSearch}
          placeholder="Search books, authors..."
        />
      </div>

      {/* Category Filter Tabs */}
      <div className="mt-6 px-4">
        <CategoryTabs
          categories={categories}
          activeCategory={currentCategory}
          onSelectCategory={handleCategorySelect}
        />
      </div>

      {/* Active Filter Indicators & Sorting Bar */}
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-[#222222] pb-4">
        <div className="text-xs text-neutral-400" role="status" aria-live="polite">
          {currentSearch || currentCategory ? (
            <span>
              Showing results for{" "}
              {currentSearch && (
                <span className="text-[#C9A24A] font-semibold">
                  &ldquo;{currentSearch}&rdquo;{" "}
                </span>
              )}
              {currentCategory && (
                <span className="text-neutral-200">
                  in <strong className="text-[#C9A24A]">{currentCategory}</strong>
                </span>
              )}
              {" "}({totalCount} {totalCount === 1 ? "book" : "books"} found)
            </span>
          ) : (
            <span>Total {totalCount} books in catalogue</span>
          )}
        </div>

        {/* Sort Controls */}
        <div className="flex items-center space-x-2 text-xs">
          <label htmlFor="sort-select" className="text-neutral-400 font-medium">Sort by:</label>
          <div className="relative">
            <select
              id="sort-select"
              value={currentSort}
              onChange={handleSortChange}
              className="bg-[#141414] border border-[#2A2A2A] rounded-lg pl-3 pr-8 py-1.5 text-neutral-200 text-xs focus:outline-none focus:border-[#C9A24A] appearance-none cursor-pointer transition-all duration-[var(--duration-micro)] [transition-timing-function:var(--ease-luxury)]"
            >
              <option value="newest">Newest Arrivals</option>
              <option value="price_asc">Price: Low to High</option>
              <option value="price_desc">Price: High to Low</option>
              <option value="title_asc">Title: A to Z</option>
            </select>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 9l-7 7-7-7" />
              </svg>
            </div>
          </div>
        </div>
      </div>

      {/* Products Content Area */}
      <PageContainer>
        {hasError ? (
          <div className="bg-[#141414] border border-red-900/40 rounded-2xl p-12 text-center my-8 max-w-xl mx-auto">
            <p className="text-red-400 font-serif text-lg mb-2 uppercase">Catalogue Error</p>
            <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6 font-light">
              We encountered a difficulty reaching the catalogue database. Please refresh or try again shortly.
            </p>
            <button
              onClick={() => router.refresh()}
              className="px-6 py-2.5 rounded-lg bg-[#C9A24A] text-black font-semibold text-xs uppercase tracking-wider hover:bg-[#B89139] transition shadow"
            >
              Retry
            </button>
          </div>
        ) : books.length === 0 ? (
          <EmptyState
            title="No Books Found"
            description="We could not find any books matching your criteria. Try adjusting your search or clearing active filters."
            icon={
              <svg className="w-8 h-8 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            }
            actionText={currentSearch || currentCategory ? "Clear All Filters" : "Browse All Books"}
            onAction={handleClear}
          />
        ) : (
          <div className="mt-8">
            <ProductGrid books={books} />
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <nav aria-label="Catalog pagination" className="flex justify-center items-center gap-2 mt-14">
            <button
              disabled={currentPage <= 1}
              onClick={() => updateFilters({ page: currentPage - 1 })}
              aria-label="Previous page"
              className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] ${
                currentPage <= 1
                  ? "border-[#222222] text-neutral-600 cursor-not-allowed bg-transparent"
                  : "border-[#2A2A2A] bg-[#141414] text-neutral-300 hover:border-[#C9A24A] hover:text-[#C9A24A] cursor-pointer"
              }`}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => updateFilters({ page: p })}
                aria-label={`Page ${p}`}
                aria-current={currentPage === p ? "page" : undefined}
                className={`w-9 h-9 rounded-lg text-xs font-bold transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] ${
                  currentPage === p
                    ? "bg-[#C9A24A] text-black shadow-md shadow-[#C9A24A]/20"
                    : "bg-[#141414] border border-[#2A2A2A] text-neutral-400 hover:text-white hover:border-[#3A3A3A] cursor-pointer"
                }`}
              >
                {p}
              </button>
            ))}

            <button
              disabled={currentPage >= totalPages}
              onClick={() => updateFilters({ page: currentPage + 1 })}
              aria-label="Next page"
              className={`px-4 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider border transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] ${
                currentPage >= totalPages
                  ? "border-[#222222] text-neutral-600 cursor-not-allowed bg-transparent"
                  : "border-[#2A2A2A] bg-[#141414] text-neutral-300 hover:border-[#C9A24A] hover:text-[#C9A24A] cursor-pointer"
              }`}
            >
              Next
            </button>
          </nav>
        )}
      </PageContainer>
    </>
  );
}
