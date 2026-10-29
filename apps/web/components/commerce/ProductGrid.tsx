"use client";

import * as React from "react";
import { BookCard, BookItem } from "./BookCard";
import { EmptyState } from "@/components/ui/EmptyState";

export interface ProductGridProps {
  books: BookItem[];
  cartBookIds?: string[];
  onAddToCart?: (book: BookItem) => void;
  onGoToCart?: () => void;
  isLoading?: boolean;
}

export function ProductGrid({
  books,
  cartBookIds = [],
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
            className="flex flex-col bg-[#111111] border border-[#2A2A2A] rounded-[12px] p-4 animate-pulse"
          >
            <div className="w-full aspect-[3/4] mb-4 rounded-md bg-[#1f1f1f]" />
            <div className="h-4 bg-[#1f1f1f] rounded mb-2 w-3/4" />
            <div className="h-3 bg-[#1f1f1f] rounded mb-4 w-1/2" />
            <div className="h-5 bg-[#1f1f1f] rounded w-1/3 mb-4" />
            <div className="h-10 bg-[#1f1f1f] rounded mt-auto" />
          </div>
        ))}
      </div>
    );
  }

  if (!books || books.length === 0) {
    return (
      <EmptyState
        message="No books found matching this selection."
        actionText="View All Books"
        actionUrl="/books"
      />
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
      {books.map((book) => (
        <BookCard
          key={book.id}
          book={book}
          inCart={cartBookIds.includes(book.id)}
          onAddToCart={onAddToCart}
          onGoToCart={onGoToCart}
        />
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
    <div className="flex justify-start md:justify-center space-x-3 overflow-x-auto py-4 hide-scrollbar">
      <button
        type="button"
        onClick={() => onSelectCategory("")}
        className={`px-6 py-2 rounded-[20px] whitespace-nowrap text-sm font-medium transition-all duration-200 cursor-pointer ${
          !activeCategory
            ? "bg-[var(--color-primary-gold)] text-black shadow-[0_0_15px_rgba(201,162,74,0.3)]"
            : "bg-[#111111] border border-[#2A2A2A] text-neutral-400 hover:text-[var(--color-primary-gold)] hover:border-[var(--color-primary-gold)]"
        }`}
      >
        All Books
      </button>
      {categories.map((cat) => (
        <button
          key={cat}
          type="button"
          onClick={() => onSelectCategory(cat)}
          className={`px-6 py-2 rounded-[20px] whitespace-nowrap text-sm font-medium transition-all duration-200 cursor-pointer ${
            activeCategory === cat
              ? "bg-[var(--color-primary-gold)] text-black shadow-[0_0_15px_rgba(201,162,74,0.3)]"
              : "bg-[#111111] border border-[#2A2A2A] text-neutral-400 hover:text-[var(--color-primary-gold)] hover:border-[var(--color-primary-gold)]"
          }`}
        >
          {cat}
        </button>
      ))}
    </div>
  );
}

