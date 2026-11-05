"use client";

import * as React from "react";
import { BookCard, BookItem } from "./BookCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils";

export interface ProductGridProps {
  books: BookItem[];
  cartBookIds?: string[];
  onAddToCart?: (book: BookItem) => void;
  onGoToCart?: () => void;
  isLoading?: boolean;
}

export function ProductGrid({
  books,
  cartBookIds,
  onAddToCart,
  onGoToCart,
  isLoading = false,
}: ProductGridProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col bg-[#141414] border border-[#2A2A2A] rounded-xl p-4 overflow-hidden relative"
          >
            <div className="w-full aspect-[3/4] mb-4 rounded-lg bg-[#1C1C1C] skeleton-shimmer" />
            <div className="h-4 bg-[#1C1C1C] skeleton-shimmer rounded mb-2 w-3/4" />
            <div className="h-3 bg-[#1C1C1C] skeleton-shimmer rounded mb-4 w-1/2" />
            <div className="h-5 bg-[#1C1C1C] skeleton-shimmer rounded w-1/3 mb-4" />
            <div className="h-10 bg-[#1C1C1C] skeleton-shimmer rounded-lg mt-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (!books || books.length === 0) {
    return (
      <EmptyState
        title="No Books Found"
        description="We couldn't find any titles matching this selection. Try adjusting your filters or browse our full catalogue."
        actionText="Browse All Books"
        actionUrl="/books"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {books.map((book, index) => (
        <div
          key={book.id}
          className="animate-fade-in-up"
          style={{ animationDelay: `${Math.min(index * 45, 360)}ms` }}
        >
          <BookCard
            book={book}
            inCart={cartBookIds !== undefined ? cartBookIds.includes(book.id) : undefined}
            onAddToCart={onAddToCart}
            onGoToCart={onGoToCart}
          />
        </div>
      ))}
    </div>
  );
}

export interface CategoryTabsProps {
  categories: string[];
  activeCategory: string;
  onSelectCategory: (category: string) => void;
}

export function CategoryTabs({
  categories,
  activeCategory,
  onSelectCategory,
}: CategoryTabsProps) {
  return (
    <div
      role="tablist"
      aria-label="Book categories"
      className="flex justify-start md:justify-center items-center space-x-2.5 overflow-x-auto py-3 scrollbar-none px-1"
    >
      <button
        type="button"
        role="tab"
        aria-selected={!activeCategory}
        onClick={() => onSelectCategory("")}
        className={cn(
          "px-5 py-2 rounded-full whitespace-nowrap text-xs font-semibold uppercase tracking-wider transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0B]",
          !activeCategory
            ? "bg-[#C9A24A] text-black shadow-md shadow-[#C9A24A]/20 font-bold"
            : "bg-[#141414] border border-[#2A2A2A] text-neutral-400 hover:text-white hover:border-[#C9A24A]/50 hover:bg-[#1A1A1A]"
        )}
      >
        All Books
      </button>

      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          role="tab"
          aria-selected={activeCategory === cat}
          onClick={() => onSelectCategory(cat)}
          className={cn(
            "px-5 py-2 rounded-full whitespace-nowrap text-xs font-semibold uppercase tracking-wider transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)] active:scale-95 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] focus-visible:ring-offset-2 focus-visible:ring-offset-[#0B0B0B]",
            activeCategory === cat
              ? "bg-[#C9A24A] text-black shadow-md shadow-[#C9A24A]/20 font-bold"
              : "bg-[#141414] border border-[#2A2A2A] text-neutral-400 hover:text-white hover:border-[#C9A24A]/50 hover:bg-[#1A1A1A]"
          )}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}
