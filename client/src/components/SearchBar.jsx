import React, { useState, useEffect } from "react";
import { useDebounce } from "../hooks/useDebounce";

const SearchBar = ({
    onSearch,
    onClear,
    defaultQuery = "",
    autoFocus = false,
}) => {
    const [query, setQuery] = useState(defaultQuery);
    const debouncedQuery = useDebounce(query, 200);

    // Only sync the query when it's explicitly cleared from outside
    // (i.e., when defaultQuery changes to empty string)
    useEffect(() => {
        if (defaultQuery === "" && query !== "") {
            setQuery("");
        }
    }, [defaultQuery]);

    useEffect(() => {
        // Trigger search/clear on every debounced query change
        // including when query is cleared (empty string)
        console.log("SearchBar debounced query changed:", debouncedQuery);
        onSearch?.(debouncedQuery);
    }, [debouncedQuery, onSearch]);

    const handleChange = (e) => {
        setQuery(e.target.value);
    };

    const handleClear = () => {
        setQuery("");
        onClear?.();
    };

    return (
        <div className="relative w-full max-w-3xl mx-auto">
            <div className="relative group">
                <input
                    type="text"
                    value={query}
                    onChange={handleChange}
                    autoFocus={autoFocus}
                    placeholder="Search books, authors..."
                    className="w-full h-10 px-4 pr-10 bg-[#0B0B0B] border border-[#2A2A2A] text-[#F5F5F5] placeholder-[#9CA3AF] rounded-full focus:outline-none focus:border-[#C9A24A] focus:shadow-[0_0_10px_rgba(201,162,74,0.25)] transition-all duration-200"
                />

                {/* Search Icon */}
                <svg
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-[#9CA3AF] pointer-events-none"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                </svg>

                {/* Clear Button */}
                {query && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute right-10 top-1/2 transform -translate-y-1/2 text-[#9CA3AF] hover:text-[#C9A24A] transition-colors p-1"
                        title="Clear search"
                    >
                        <svg
                            className="w-4 h-4"
                            fill="currentColor"
                            viewBox="0 0 24 24"
                        >
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12 19 6.41z" />
                        </svg>
                    </button>
                )}
            </div>
        </div>
    );
};

export default SearchBar;
