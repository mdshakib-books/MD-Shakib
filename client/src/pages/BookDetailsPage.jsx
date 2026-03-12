import React, { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Loader from "../components/Loader";
import ProductGrid from "../components/ProductGrid";
import { bookService } from "../services/bookService";
import { useCart } from "../hooks/useCart";
import { useToast } from "../context/ToastContext";
import api from "../api/axios";

// ─── Small reusable components ───────────────────────────────────────────────

const TrustCard = ({ icon, label }) => (
    <div className="flex flex-col items-center gap-2 border border-[#2A2A2A] bg-[#111111] rounded-xl p-4 text-center">
        <span className="text-2xl">{icon}</span>
        <span className="text-xs text-gray-300 leading-tight">{label}</span>
    </div>
);

const InsightCard = ({ label, value }) => (
    <div className="flex flex-col gap-1 border border-[#2A2A2A] bg-[#111111] rounded-xl px-4 py-3">
        <span className="text-[10px] uppercase tracking-widest text-gray-500">
            {label}
        </span>
        <span className="text-sm font-medium text-[var(--color-text-light)] truncate">
            {value}
        </span>
    </div>
);

const DetailRow = ({ label, value }) => (
    <tr className="border-b border-[#2A2A2A] last:border-0">
        <td className="py-3 px-4 text-gray-500 text-sm w-1/3 font-medium">
            {label}
        </td>
        <td className="py-3 px-4 text-gray-200 text-sm">{value || "---"}</td>
    </tr>
);

// ─── Main Page ────────────────────────────────────────────────────────────────

const BookDetailsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { addToCart } = useCart();
    const { addToast } = useToast();

    const [book, setBook] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);
    const [quantity, setQuantity] = useState(1);
    const [addingToCart, setAddingToCart] = useState(false);

    const [similarBooks, setSimilarBooks] = useState([]);
    const [similarLoading, setSimilarLoading] = useState(false);
    const [popularBooks, setPopularBooks] = useState([]);
    const [popularLoading, setPopularLoading] = useState(false);

    // ── Fetch book details ───────────────────────────────────────────────────
    useEffect(() => {
        if (!id) return;
        const fetchDetails = async () => {
            try {
                setLoading(true);
                const data = await bookService.getBookById(id);
                setBook(data);
                
                // Create a gallery array from the optional `images` field and the main `imageUrl`
                const imagesArray = data.images && data.images.length > 0 ? data.images : [data.imageUrl];
                setSelectedImage(imagesArray[0]);
                setQuantity(1);
            } catch (err) {
                console.error(err);
                setBook(null);
            } finally {
                setLoading(false);
            }
        };
        fetchDetails();
    }, [id]);

    // ── Fetch similar & popular books ────────────────────────────────────────
    useEffect(() => {
        if (!book) return;

        // Similar: use the built-in related endpoint
        const fetchSimilar = async () => {
            setSimilarLoading(true);
            try {
                const res = await api.get(`/books/${id}/related`);
                const items = res.data?.data || [];
                setSimilarBooks(items.filter((b) => b._id !== id));
            } catch {
                setSimilarBooks([]);
            } finally {
                setSimilarLoading(false);
            }
        };

        // Popular: use featured endpoint (newest 8 active books)
        const fetchPopular = async () => {
            setPopularLoading(true);
            try {
                const res = await api.get("/books/featured");
                const items = res.data?.data || [];
                setPopularBooks(items.filter((b) => b._id !== id));
            } catch {
                setPopularBooks([]);
            } finally {
                setPopularLoading(false);
            }
        };

        fetchSimilar();
        fetchPopular();
    }, [book, id]);

    // ── Handlers ─────────────────────────────────────────────────────────────
    const handleAddToCart = useCallback(async () => {
        if (!book || book.stock === 0 || addingToCart) return;
        setAddingToCart(true);
        try {
            await addToCart(
                {
                    bookId: book._id,
                    title: book.title,
                    price: discountedPrice,
                    image: book.imageUrl,
                },
                quantity,
            );
            addToast(`"${book.title}" added to cart`, "success");
        } catch {
            addToast("Failed to add to cart. Please try again.", "error");
        } finally {
            setAddingToCart(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book, quantity, addingToCart]);

    const handleBuyNow = useCallback(async () => {
        if (!book || book.stock === 0 || addingToCart) return;
        setAddingToCart(true);
        try {
            await addToCart(
                {
                    bookId: book._id,
                    title: book.title,
                    price: discountedPrice,
                    image: book.imageUrl,
                },
                quantity,
            );
            navigate("/cart");
        } catch {
            addToast("Something went wrong. Please try again.", "error");
            setAddingToCart(false);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [book, quantity, addingToCart, navigate]);

    // ── Loading / Error states ────────────────────────────────────────────────
    if (loading)
        return (
            <>
                <Navbar />
                <Loader fullScreen />
                <Footer />
            </>
        );

    if (!book)
        return (
            <>
                <Navbar />
                <div className="min-h-screen flex items-center justify-center flex-col gap-4 text-center px-6">
                    <span className="text-5xl">📚</span>
                    <h2 className="text-2xl font-heading text-[var(--color-primary-gold)]">
                        Book Not Found
                    </h2>
                    <p className="text-gray-400">
                        This book doesn't exist or is currently unavailable.
                    </p>
                    <button
                        onClick={() => navigate("/books")}
                        className="mt-4 px-6 py-3 bg-[var(--color-primary-gold)] text-black rounded-lg font-semibold hover:opacity-90 transition"
                    >
                        Browse Books
                    </button>
                </div>
                <Footer />
            </>
        );

    // ── Computed values ──────────────────────────────────────────────────────
    const hasDiscount = book.discount > 0;
    const discountedPrice = hasDiscount
        ? Math.round(book.price - (book.price * book.discount) / 100)
        : book.price;
    const isOutOfStock = !book.stock || book.stock <= 0;

    // Build thumbnail list — use images if available, else fallback to just imageUrl
    const thumbnails = book.images && book.images.length > 0 ? book.images : [book.imageUrl];

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow">
                {/* ═══════════════════════════════════════════════════════════
                    HERO SECTION
                ═══════════════════════════════════════════════════════════ */}
                <section className="max-w-[1200px] mx-auto px-4 lg:px-6 py-10 md:py-14">
                    <div className="grid md:grid-cols-2 gap-10 lg:gap-16">
                        {/* LEFT — Image Gallery */}
                        <div className="flex flex-col gap-4">
                            {/* Main image */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 flex items-center justify-center aspect-[4/5] max-h-[520px] overflow-hidden">
                                <img
                                    src={selectedImage || book.imageUrl}
                                    alt={book.title}
                                    className="w-full h-full object-contain rounded-lg transition-all duration-300"
                                    onError={(e) => {
                                        e.target.src =
                                            "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=400&h=500";
                                    }}
                                />
                            </div>

                            {/* Thumbnails (Only show if multiple images exist) */}
                            {thumbnails.length > 1 && (
                                <div className="flex gap-3 flex-wrap">
                                    {thumbnails.map((img, i) => (
                                        <button
                                            key={i}
                                            onClick={() => setSelectedImage(img)}
                                            className={`w-20 h-24 rounded-lg border-2 overflow-hidden transition-all duration-200 flex-shrink-0 ${
                                                selectedImage === img
                                                    ? "border-[var(--color-primary-gold)] shadow-[0_0_10px_rgba(201,162,74,0.4)]"
                                                    : "border-[#2A2A2A] hover:border-[#444]"
                                            }`}
                                        >
                                            <img
                                                src={img}
                                                alt={`Preview ${i + 1}`}
                                                className="w-full h-full object-cover"
                                                onError={(e) => {
                                                    e.target.src =
                                                        "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&w=160&h=192";
                                                }}
                                            />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* RIGHT — Book Info */}
                        <div className="flex flex-col gap-5">

                            {/* TODO: Future Advertisement */}

                            {/* Category badge */}
                            <div>
                                <span className="text-xs uppercase tracking-widest bg-[#1a1a1a] border border-[#2A2A2A] px-3 py-1 rounded-full text-[var(--color-primary-gold)]">
                                    {book.category}
                                </span>
                            </div>

                            {/* Title + Author */}
                            <div>
                                <h1 className="text-2xl md:text-3xl lg:text-4xl font-heading leading-tight text-white">
                                    {book.title}
                                </h1>
                                <p className="mt-2 text-gray-400 text-sm md:text-base">
                                    by{" "}
                                    <span className="text-gray-300 font-medium">
                                        {book.author}
                                    </span>
                                </p>
                            </div>

                            {/* Book description in only 1-2 line and then ... */}
                            {book.description && (
                                <p className="text-gray-500 text-sm line-clamp-3">
                                    {book.description}
                                </p>
                            )}

                            {/* ── Pricing ──────────────────────────────────── */}
                            <div className="flex items-center gap-4 flex-wrap">
                                <span className="text-3xl md:text-4xl font-bold text-[var(--color-primary-gold)]">
                                    ₹{discountedPrice}
                                </span>
                                {hasDiscount && (
                                    <>
                                        <span className="text-lg text-gray-500 line-through">
                                            ₹{book.price}
                                        </span>
                                        <span className="bg-red-600 text-white text-xs font-bold px-2.5 py-1 rounded-md">
                                            {book.discount}% OFF
                                        </span>
                                    </>
                                )}
                            </div>

                            {/* ── Stock Info ───────────────────────────────── */}
                            <div>
                                {isOutOfStock ? (
                                    <span className="inline-flex items-center gap-2 text-sm text-red-400 bg-red-950/40 border border-red-800/40 px-4 py-2 rounded-lg">
                                        <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse"></span>
                                        Out of Stock
                                    </span>
                                ) : (
                                    <span className="inline-flex items-center gap-2 text-sm text-green-400 bg-green-950/40 border border-green-800/40 px-4 py-2 rounded-lg">
                                        <span className="w-2 h-2 rounded-full bg-green-400"></span>
                                        In Stock ({book.stock} available)
                                    </span>
                                )}
                            </div>

                            {/* ── Delivery Info ────────────────────────────── */}
                            <div className="flex items-start gap-3 bg-[#111111] border border-[#2A2A2A] rounded-xl px-4 py-3">
                                <span className="text-xl mt-0.5">🚚</span>
                                <div>
                                    <p className="text-sm font-semibold text-gray-200">
                                        Free Delivery
                                    </p>
                                    <p className="text-xs text-gray-500 mt-0.5">
                                        Estimated delivery in 3–5 business days
                                    </p>
                                </div>
                            </div>

                            {/* ── Trust Indicators ────────────────────────── */}
                            <div className="grid grid-cols-3 gap-3 pt-2">
                                <TrustCard
                                    icon="🔁"
                                    label="7 Days Replacement"
                                />
                                <TrustCard icon="💵" label="Cash On Delivery" />
                                <TrustCard icon="🔒" label="Secure Payment" />
                            </div>


                            {/* ── Primary Action Buttons ───────────────────── */}
                            <div className="flex gap-3 flex-wrap">
                                <button
                                    onClick={handleAddToCart}
                                    disabled={isOutOfStock || addingToCart}
                                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3.5 px-6 border-2 border-[var(--color-primary-gold)] text-[var(--color-primary-gold)] font-semibold rounded-xl hover:bg-[var(--color-primary-gold)] hover:text-black transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    🛒
                                    {addingToCart ? "Adding..." : "Add to Cart"}
                                </button>
                                <button
                                    onClick={handleBuyNow}
                                    disabled={isOutOfStock || addingToCart}
                                    className="flex-1 min-w-[140px] flex items-center justify-center gap-2 py-3.5 px-6 bg-[var(--color-primary-gold)] text-black font-semibold rounded-xl hover:bg-[var(--color-accent-gold)] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_4px_15px_rgba(201,162,74,0.3)]"
                                >
                                    ⚡ Buy Now
                                </button>
                            </div>
                        </div>
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════════
                    PRODUCT INSIGHTS + DETAILS + DESCRIPTION
                ═══════════════════════════════════════════════════════════ */}
                <section className="max-w-[1200px] mx-auto px-4 lg:px-6 pb-12">
                    <div className="grid lg:grid-cols-3 gap-6">
                        {/* LEFT col: Insights + Description */}
                        <div className="lg:col-span-2 flex flex-col gap-6">
                            {/* Product Insights */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6">
                                <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-4 font-medium">
                                    Product Insights
                                </h2>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                    <InsightCard
                                        label="Author"
                                        value={book.author}
                                    />
                                    <InsightCard
                                        label="Category"
                                        value={book.category}
                                    />
                                    <InsightCard
                                        label="Availability"
                                        value={
                                            isOutOfStock
                                                ? "Out of Stock"
                                                : `${book.stock} in Stock`
                                        }
                                    />
                                </div>
                            </div>

                            {/* Book Description */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6">
                                <h2 className="text-sm uppercase tracking-widest text-gray-500 mb-4 font-medium">
                                    About This Book
                                </h2>
                                <p className="text-gray-300 leading-[1.85] text-sm md:text-base whitespace-pre-line">
                                    {book.description}
                                </p>
                            </div>
                        </div>

                        {/* RIGHT col: Product Details Table */}
                        <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl overflow-hidden h-fit">
                            <div className="px-5 py-4 border-b border-[#2A2A2A]">
                                <h2 className="text-sm uppercase tracking-widest text-gray-500 font-medium">
                                    Product Details
                                </h2>
                            </div>
                            <table className="w-full">
                                <tbody>
                                    <DetailRow
                                        label="Title"
                                        value={book.title}
                                    />
                                    <DetailRow
                                        label="Author"
                                        value={book.author}
                                    />
                                    <DetailRow
                                        label="Category"
                                        value={book.category}
                                    />
                                    <DetailRow
                                        label="Language"
                                        value={book.language}
                                    />
                                    <DetailRow
                                        label="Pages"
                                        value={book.pages}
                                    />
                                    <DetailRow
                                        label="Publisher"
                                        value={book.publisher}
                                    />
                                    <DetailRow
                                        label="Published"
                                        value={
                                            book.publishedDate
                                                ? new Date(
                                                      book.publishedDate,
                                                  ).toLocaleDateString(
                                                      "en-IN",
                                                      {
                                                          year: "numeric",
                                                          month: "long",
                                                      },
                                                  )
                                                : null
                                        }
                                    />
                                </tbody>
                            </table>
                        </div>
                    </div>
                </section>

                {/* ═══════════════════════════════════════════════════════════
                    SIMILAR BOOKS
                ═══════════════════════════════════════════════════════════ */}
                {(similarLoading || similarBooks.length > 0) && (
                    <section className="border-t border-[#1a1a1a] py-12">
                        <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl md:text-2xl font-heading text-white">
                                    Similar{" "}
                                    <span className="text-[var(--color-primary-gold)] border-b-2 border-[var(--color-primary-gold)] pb-0.5">
                                        Books
                                    </span>
                                </h2>
                                <button
                                    onClick={() =>
                                        navigate(
                                            `/books?category=${encodeURIComponent(book.category)}`,
                                        )
                                    }
                                    className="text-[var(--color-primary-gold)] text-sm font-medium hover:text-[var(--color-accent-gold)] transition hidden sm:block"
                                >
                                    View All →
                                </button>
                            </div>
                            <ProductGrid
                                books={similarBooks}
                                loading={similarLoading}
                                hideHeader
                                isCarousel
                            />
                        </div>
                    </section>
                )}

                {/* ═══════════════════════════════════════════════════════════
                    LOVED BY READERS
                ═══════════════════════════════════════════════════════════ */}
                {(popularLoading || popularBooks.length > 0) && (
                    <section className="border-t border-[#1a1a1a] py-12">
                        <div className="max-w-[1200px] mx-auto px-4 lg:px-6">
                            <div className="flex items-center justify-between mb-6">
                                <h2 className="text-xl md:text-2xl font-heading text-white">
                                    ❤️ Loved by{" "}
                                    <span className="text-[var(--color-primary-gold)] border-b-2 border-[var(--color-primary-gold)] pb-0.5">
                                        Readers
                                    </span>
                                </h2>
                                <button
                                    onClick={() => navigate("/books")}
                                    className="text-[var(--color-primary-gold)] text-sm font-medium hover:text-[var(--color-accent-gold)] transition hidden sm:block"
                                >
                                    View All →
                                </button>
                            </div>
                            <ProductGrid
                                books={popularBooks}
                                loading={popularLoading}
                                hideHeader
                                isCarousel
                            />
                        </div>
                    </section>
                )}
            </main>

            <Footer />
        </div>
    );
};

export default BookDetailsPage;
