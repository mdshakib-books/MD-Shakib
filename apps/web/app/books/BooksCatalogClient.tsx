"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchBar } from "@/components/ui/SearchBar";
import { CategoryTabs, ProductGrid } from "@/components/commerce/ProductGrid";
import { PageContainer } from "@/components/layout/PageContainer";
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

  return (
    <>
      {/* Search Bar */}
      <div className="max-w-[700px] mx-auto px-4 mt-2">
        <SearchBar
          onSearch={handleSearch}
          onClear={handleClear}
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 flex flex-col sm:flex-row items-center justify-between gap-4 border-b border-[#1E1E1E] pb-4">
        <div className="text-xs text-neutral-400">
          {currentSearch || currentCategory ? (
            <span>
              Showing results for{" "}
              {currentSearch && (
                <span className="text-[var(--color-primary-gold)] font-medium">
                  &ldquo;{currentSearch}&rdquo;{" "}
                </span>
              )}
              {currentCategory && (
                <span className="text-neutral-200">
                  in <strong className="text-[var(--color-primary-gold)]">{currentCategory}</strong>
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
          <label htmlFor="sort-select" className="text-neutral-400">Sort by:</label>
          <select
            id="sort-select"
            value={currentSort}
            onChange={handleSortChange}
            className="bg-[#141414] border border-[#2E2E2E] rounded-md px-3 py-1.5 text-neutral-200 focus:outline-none focus:border-[var(--color-primary-gold)]"
          >
            <option value="newest">Newest Arrivals</option>
            <option value="price_asc">Price: Low to High</option>
            <option value="price_desc">Price: High to Low</option>
            <option value="title_asc">Title: A to Z</option>
          </select>
        </div>
      </div>

      {/* Products Content Area */}
      <PageContainer>
        {hasError ? (
          <div className="bg-[#141414] border border-red-900/30 rounded-xl p-12 text-center my-8">
            <p className="text-red-400 font-serif text-lg mb-2">Catalogue Error</p>
            <p className="text-sm text-neutral-400 max-w-md mx-auto mb-6">
              We encountered a difficulty reaching the catalogue database. Please refresh or try again shortly.
            </p>
            <button
              onClick={() => router.refresh()}
              className="px-6 py-2 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold text-xs hover:opacity-90"
            >
              Retry
            </button>
          </div>
        ) : books.length === 0 ? (
          <div className="text-center py-20 px-4 bg-[#141414] border border-[#222] rounded-xl my-8">
            <div className="text-4xl mb-3">📖</div>
            <h2 className="text-lg font-serif text-neutral-200">No books found</h2>
            <p className="text-xs text-neutral-400 mt-2 max-w-sm mx-auto">
              We could not find any books matching your criteria. Try adjusting your search or category filter.
            </p>
            {(currentSearch || currentCategory) && (
              <button
                onClick={handleClear}
                className="mt-6 px-4 py-2 text-xs rounded-md bg-[var(--color-primary-gold)] text-black font-semibold hover:opacity-90 transition cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="mt-8">
            <ProductGrid books={books} />
          </div>
        )}

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-12">
            <button
              disabled={currentPage <= 1}
              onClick={() => updateFilters({ page: currentPage - 1 })}
              className={`px-4 py-2 rounded-md text-xs font-medium border transition ${
                currentPage <= 1
                  ? "border-[#222] text-neutral-600 cursor-not-allowed"
                  : "border-[#333] text-neutral-300 hover:border-[var(--color-primary-gold)] hover:text-white cursor-pointer"
              }`}
            >
              Previous
            </button>

            {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
              <button
                key={p}
                onClick={() => updateFilters({ page: p })}
                className={`w-8 h-8 rounded-md text-xs font-medium border transition cursor-pointer ${
                  p === currentPage
                    ? "bg-[var(--color-primary-gold)] text-black border-[var(--color-primary-gold)] font-bold"
                    : "border-[#333] text-neutral-300 hover:border-[#555]"
                }`}
              >
                {p}
              </button>
            ))}

            <button
              disabled={currentPage >= totalPages}
              onClick={() => updateFilters({ page: currentPage + 1 })}
              className={`px-4 py-2 rounded-md text-xs font-medium border transition ${
                currentPage >= totalPages
                  ? "border-[#222] text-neutral-600 cursor-not-allowed"
                  : "border-[#333] text-neutral-300 hover:border-[var(--color-primary-gold)] hover:text-white cursor-pointer"
              }`}
            >
              Next
            </button>
          </div>
        )}
      </PageContainer>
    </>
  );
}

