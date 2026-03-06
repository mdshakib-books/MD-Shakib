import React, { useRef } from "react";
import { useNavigate } from "react-router-dom";
import BookCard from "./BookCard";
import EmptyState from "./EmptyState";

const ProductGrid = ({
    books = [],
    loading,
    hideHeader = false,
    isCarousel = false,
}) => {
    const navigate = useNavigate();
    const scrollContainerRef = useRef(null);

    const scroll = (direction) => {
        if (scrollContainerRef.current) {
            const scrollAmount = window.innerWidth < 768 ? 300 : 600;
            const targetScroll =
                scrollContainerRef.current.scrollLeft +
                (direction === "right" ? scrollAmount : -scrollAmount);

            scrollContainerRef.current.scrollTo({
                left: targetScroll,
                behavior: "smooth",
            });
        }
    };

    if (loading) return null; // handled by parent

    if (!books || books.length === 0) {
        return <EmptyState message="No books found." />;
    }

    return (
        <section
            className={`w-full bg-[var(--color-main-bg)] ${hideHeader ? "py-0 mt-0" : "py-10 md:py-20"}`}
        >
            <div className="max-w-[1200px] mx-auto px-4 lg:px-6 relative">
                {!hideHeader && (
                    <React.Fragment>
                        <div className="flex justify-between items-center mb-8">
                            <h2 className="text-lg md:text-xl lg:text-2xl font-heading text-white tracking-wide whitespace-nowrap overflow-hidden text-ellipsis">
                                🔥 Our{" "}
                                <span className="text-[#C9A24A] border-b-2 border-[#C9A24A] pb-0.5">
                                    Recommendation
                                </span>{" "}
                                For You
                            </h2>

                            <button
                                onClick={() => navigate("/books")}
                                className="text-[#C9A24A] font-medium tracking-wide transition-all duration-300 hover:text-[#E5C87B] hidden sm:block whitespace-nowrap ml-4"
                            >
                                View More →
                            </button>
                        </div>
                        {/* Mobile View More Button - To maintain spacing it's good to keep structure clean */}
                        <div className="flex justify-end mb-4 sm:hidden">
                            <button
                                onClick={() => navigate("/books")}
                                className="text-[#C9A24A] text-sm font-medium tracking-wide hover:text-[#E5C87B]"
                            >
                                View More →
                            </button>
                        </div>
                    </React.Fragment>
                )}

                <div className="relative group">
                    {/* Left Scroll Button */}
                    {isCarousel && (
                        <button
                            onClick={() => scroll("left")}
                            className="absolute left-0 top-1/2 -translate-y-1/2 -ml-2 sm:-ml-4 z-10 bg-black/40 backdrop-blur-sm text-[#C9A24A] rounded-full p-3 hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100 hidden sm:flex items-center justify-center border border-[#2A2A2A]/50"
                            aria-label="Scroll left"
                        >
                            <svg
                                className="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M15 19l-7-7 7-7"
                                />
                            </svg>
                        </button>
                    )}

                    {/* Grid / Carousel Container */}
                    <div
                        ref={scrollContainerRef}
                        className={
                            isCarousel
                                ? "flex overflow-x-auto snap-x snap-mandatory scroll-smooth no-scrollbar gap-4 md:gap-6 pb-4 -mx-4 px-4 sm:mx-0 sm:px-0"
                                : "grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 md:gap-6"
                        }
                    >
                        {books?.map((book) => (
                            <div
                                key={book._id}
                                className={
                                    isCarousel
                                        ? "snap-start shrink-0 w-[160px] sm:w-[200px] md:w-[220px] lg:w-[250px]"
                                        : ""
                                }
                            >
                                <BookCard book={book} />
                            </div>
                        ))}
                    </div>

                    {/* Right Scroll Button */}
                    {isCarousel && (
                        <button
                            onClick={() => scroll("right")}
                            className="absolute right-0 top-1/2 -translate-y-1/2 -mr-2 sm:-mr-4 z-10 bg-black/40 backdrop-blur-sm text-[#C9A24A] rounded-full p-3 hover:bg-black/60 transition-all opacity-0 group-hover:opacity-100 hidden sm:flex items-center justify-center border border-[#2A2A2A]/50"
                            aria-label="Scroll right"
                        >
                            <svg
                                className="w-6 h-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2"
                                    d="M9 5l7 7-7 7"
                                />
                            </svg>
                        </button>
                    )}
                </div>
            </div>
        </section>
    );
};

export default ProductGrid;
