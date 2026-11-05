"use client";

import * as React from "react";
import { useState, useEffect, useRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface SearchBarProps {
  onSearch?: (query: string) => void;
  onClear?: () => void;
  onSelectSuggestion?: (suggestion: string) => void;
  suggestions?: string[];
  isLoadingSuggestions?: boolean;
  defaultQuery?: string;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
}

export function SearchBar({
  onSearch,
  onClear,
  onSelectSuggestion,
  suggestions = [],
  isLoadingSuggestions = false,
  defaultQuery = "",
  autoFocus = false,
  placeholder = "Search books, authors...",
  className,
  id,
}: SearchBarProps) {
  const generatedId = useId();
  const inputId = id || `search-input-${generatedId.replace(/:/g, "")}`;
  const listboxId = `${inputId}-listbox`;

  const [query, setQuery] = useState(defaultQuery);
  const [prevDefaultQuery, setPrevDefaultQuery] = useState(defaultQuery);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (defaultQuery !== prevDefaultQuery) {
    setPrevDefaultQuery(defaultQuery);
    if (defaultQuery === "") {
      setQuery("");
    }
  }

  // Filter suggestions matching current query if suggestions array provided
  const filteredSuggestions = React.useMemo(() => {
    if (!query.trim() || suggestions.length === 0) return [];
    const q = query.toLowerCase().trim();
    return suggestions.filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  }, [query, suggestions]);

  const hasSuggestions = filteredSuggestions.length > 0;
  const showDropdown = isOpen && (hasSuggestions || (query.trim().length >= 2 && isLoadingSuggestions));

  useEffect(() => {
    const timer = setTimeout(() => {
      onSearch?.(query);
    }, 200);

    return () => clearTimeout(timer);
  }, [query, onSearch]);

  // Handle outside click dismissal
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const handleClear = () => {
    setQuery("");
    setIsOpen(false);
    setActiveIndex(-1);
    onClear?.();
    inputRef.current?.focus();
  };

  const handleSelect = (suggestion: string) => {
    setQuery(suggestion);
    setIsOpen(false);
    setActiveIndex(-1);
    if (onSelectSuggestion) {
      onSelectSuggestion(suggestion);
    } else {
      onSearch?.(suggestion);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen && hasSuggestions) {
        setIsOpen(true);
        setActiveIndex(0);
        return;
      }
      if (hasSuggestions) {
        setActiveIndex((prev) => (prev + 1 >= filteredSuggestions.length ? 0 : prev + 1));
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (hasSuggestions) {
        setActiveIndex((prev) => (prev <= 0 ? filteredSuggestions.length - 1 : prev - 1));
      }
    } else if (e.key === "Enter") {
      if (isOpen && activeIndex >= 0 && filteredSuggestions[activeIndex]) {
        e.preventDefault();
        handleSelect(filteredSuggestions[activeIndex]);
      } else {
        setIsOpen(false);
        onSearch?.(query);
      }
    } else if (e.key === "Escape") {
      if (isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
      }
    }
  };

  const activeOptionId = activeIndex >= 0 ? `${inputId}-opt-${activeIndex}` : undefined;

  return (
    <div ref={containerRef} className={cn("relative w-full max-w-3xl mx-auto", className)}>
      <label htmlFor={inputId} className="sr-only">
        Search books, authors, or categories
      </label>

      {/* Screen Reader Live Region */}
      <div className="sr-only" role="status" aria-live="polite">
        {showDropdown && hasSuggestions
          ? `${filteredSuggestions.length} search suggestions available. Use up and down arrow keys to navigate.`
          : ""}
      </div>

      <div className="relative group">
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-activedescendant={activeOptionId}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => {
            if (filteredSuggestions.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          autoFocus={autoFocus}
          placeholder={placeholder}
          autoComplete="off"
          className="w-full h-11 px-4 pr-16 bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] placeholder-[#9CA3AF] rounded-full text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] focus:border-[#C9A24A] focus:shadow-[0_0_12px_rgba(201,162,74,0.25)] transition-all duration-[var(--duration-button)] [transition-timing-function:var(--ease-luxury)]"
        />

        {/* Clear Button */}
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-10 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-[#C9A24A] transition-colors duration-[var(--duration-micro)] p-1.5 cursor-pointer animate-fade-in focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C9A24A] rounded-full"
            title="Clear search"
            aria-label="Clear search text"
          >
            <svg
              className="w-4 h-4"
              fill="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
            </svg>
          </button>
        )}

        {/* Search Icon */}
        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-neutral-400 flex items-center justify-center">
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </div>
      </div>

      {/* Accessible Suggestions Listbox */}
      {showDropdown && (
        <ul
          id={listboxId}
          role="listbox"
          aria-label="Search suggestions"
          className="absolute left-0 right-0 top-full mt-2 bg-[#161616] border border-[#2A2A2A] rounded-xl shadow-2xl z-50 overflow-hidden divide-y divide-[#1F1F1F] animate-scale-in"
        >
          {filteredSuggestions.map((item, idx) => {
            const isSelected = activeIndex === idx;
            return (
              <li
                key={item}
                id={`${inputId}-opt-${idx}`}
                role="option"
                aria-selected={isSelected}
                onClick={() => handleSelect(item)}
                onMouseEnter={() => setActiveIndex(idx)}
                className={cn(
                  "px-4 py-3 text-xs sm:text-sm cursor-pointer flex items-center justify-between transition-colors",
                  isSelected
                    ? "bg-[#222222] text-[#C9A24A] font-semibold pl-5"
                    : "text-neutral-300 hover:bg-[#1A1A1A] hover:text-white"
                )}
              >
                <div className="flex items-center gap-2.5">
                  <svg
                    className={cn("w-3.5 h-3.5", isSelected ? "text-[#C9A24A]" : "text-neutral-500")}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  <span>{item}</span>
                </div>
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                  Suggestion
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
