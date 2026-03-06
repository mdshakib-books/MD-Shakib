import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import ProductGrid from "../components/ProductGrid";
import CategoryTabs from "../components/CategoryTabs";
import SearchBar from "../components/SearchBar";
import { useBooks } from "../hooks/useBooks";
import { bookService } from "../services/bookService";

const BooksPage = () => {
    const { books, loading: booksLoading } = useBooks();
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalResults, setTotalResults] = useState(0);

    const itemsPerPage = 12;
    const isSearching = searchQuery.trim().length > 0;
    const displayBooks = isSearching ? searchResults : books;

    // Handle search with debounce
    useEffect(() => {
        console.log(
            "Search effect triggered - isSearching:",
            isSearching,
            "searchQuery:",
            searchQuery,
        );

        // If search is cleared, reset and show all books
        if (!isSearching) {
            setSearchResults([]);
            setTotalResults(0);
            setCurrentPage(1);
            return;
        }

        const fetchSearchResults = async () => {
            setSearchLoading(true);
            try {
                console.log("Fetching search results for:", searchQuery);
                const response = await bookService.searchBooks(
                    searchQuery,
                    selectedCategory,
                    currentPage,
                    itemsPerPage,
                );
                console.log("Search response:", response);
                setSearchResults(response.books || []);
                setTotalResults(response.total || 0);
                setTotalPages(response.totalPages || 1);
            } catch (error) {
                console.error("Search error:", error);
                setSearchResults([]);
                setTotalResults(0);
                setTotalPages(1);
            } finally {
                setSearchLoading(false);
            }
        };

        // Add a small delay before fetching to ensure debounce works properly
        const timeoutId = setTimeout(fetchSearchResults, 0);
        return () => clearTimeout(timeoutId);
    }, [searchQuery, selectedCategory, currentPage]);

    const handleSearch = (query) => {
        console.log("BooksPage.handleSearch called with:", query);
        setSearchQuery(query);
        setCurrentPage(1);
    };

    const handleClear = () => {
        setSearchQuery("");
        setSelectedCategory("");
        setCurrentPage(1);
        setSearchResults([]);
    };

    const handleCategorySelect = (category) => {
        setSelectedCategory(category === selectedCategory ? "" : category);
        setCurrentPage(1);
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            setCurrentPage(currentPage + 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const handlePrevPage = () => {
        if (currentPage > 1) {
            setCurrentPage(currentPage - 1);
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    };

    const loading = booksLoading || (isSearching && searchLoading);

    return (
        <div className="min-h-screen flex flex-col bg-[var(--color-main-bg)] text-white">
            <Navbar />
            <main className="flex-grow w-full pb-16">
                {/* Hero Header */}
                <section className="text-center py-16 px-4">
                    <h1 className="text-3xl md:text-4xl font-heading tracking-wide">
                        Explore Our{" "}
                        <span className="text-[var(--color-primary-gold)]">
                            Collection
                        </span>
                    </h1>
                    <p className="text-gray-400 mt-3 text-sm md:text-base max-w-lg mx-auto font-body">
                        Discover authentic Islamic books carefully curated for
                        knowledge seekers.
                    </p>
                </section>

                {/* Search Bar */}
                <div className="max-w-[700px] mx-auto px-4 mt-4">
                    <SearchBar
                        onSearch={handleSearch}
                        onClear={handleClear}
                        defaultQuery={searchQuery}
                    />
                </div>

                {/* Category Filters */}
                <div className="mt-8 px-4">
                    <CategoryTabs
                        categories={["Quran", "Hadith", "Fiqh", "History"]}
                        activeCategory={selectedCategory}
                        onSelectCategory={handleCategorySelect}
                    />
                </div>

                {/* Search Results Info */}
                {isSearching && (
                    <div className="text-center mt-6 px-4">
                        <p className="text-[var(--color-text-muted)] font-body">
                            Found{" "}
                            <span className="text-[var(--color-primary-gold)]">
                                {totalResults}
                            </span>{" "}
                            results for "{searchQuery}"
                            {selectedCategory && (
                                <span>
                                    {" "}
                                    in{" "}
                                    <span className="text-[var(--color-primary-gold)]">
                                        {selectedCategory}
                                    </span>
                                </span>
                            )}
                        </p>
                    </div>
                )}

                {/* Books Grid */}
                <div className="mt-8 md:mt-12">
                    {displayBooks.length === 0 && !loading ? (
                        <div className="text-center px-4 py-12">
                            <svg
                                className="w-16 h-16 mx-auto text-[#2A2A2A] mb-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={1.5}
                                    d="M12 6.253v13m0-13C6.5 6.253 2 10.582 2 15.107c0 4.514 4.5 8.854 10 8.854s10-4.34 10-8.854c0-4.525-4.5-8.854-10-8.854z"
                                />
                            </svg>
                            <p className="text-[var(--color-text-muted)] font-body">
                                {isSearching
                                    ? `No books found for "${searchQuery}"`
                                    : "No books available"}
                            </p>
                        </div>
                    ) : (
                        <ProductGrid
                            books={displayBooks}
                            loading={loading}
                            hideHeader={true}
                        />
                    )}
                </div>

                {/* Pagination */}
                {totalPages > 1 && displayBooks.length > 0 && (
                    <div className="flex justify-center items-center gap-4 mt-12 mb-8 px-4">
                        <button
                            onClick={handlePrevPage}
                            disabled={currentPage === 1}
                            className="px-6 py-3 bg-[#111111] border border-[#2A2A2A] text-[var(--color-primary-gold)] font-medium rounded-[10px] hover:bg-[var(--color-primary-gold)] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-body"
                        >
                            ← Previous
                        </button>
                        <div className="flex items-center gap-2">
                            <span className="text-[var(--color-text-muted)] font-body">
                                Page{" "}
                                <span className="text-[var(--color-primary-gold)]">
                                    {currentPage}
                                </span>{" "}
                                of{" "}
                                <span className="text-[var(--color-primary-gold)]">
                                    {totalPages}
                                </span>
                            </span>
                        </div>
                        <button
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages}
                            className="px-6 py-3 bg-[#111111] border border-[#2A2A2A] text-[var(--color-primary-gold)] font-medium rounded-[10px] hover:bg-[var(--color-primary-gold)] hover:text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 font-body"
                        >
                            Next →
                        </button>
                    </div>
                )}

                {/* Load More Books Button - Only show when not searching */}
                {!isSearching && !loading && displayBooks.length > 0 && (
                    <div className="flex justify-center mt-12 mb-8 px-4">
                        <button className="px-8 py-3 bg-[#111111] border border-[#2A2A2A] text-[var(--color-primary-gold)] font-medium rounded-[10px] hover:bg-[var(--color-primary-gold)] hover:text-black transition-all duration-300 font-body">
                            Load More Books
                        </button>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default BooksPage;
