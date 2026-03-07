import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Loader from "../components/Loader";
import { bookService } from "../services/bookService";
import { useCart } from "../hooks/useCart";

const BookDetailsPage = () => {
    const { id } = useParams();

    const [book, setBook] = useState(null);
    const [loading, setLoading] = useState(true);
    const [selectedImage, setSelectedImage] = useState(null);
    const [quantity, setQuantity] = useState(1);

    const { addToCart } = useCart();

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                setLoading(true);
                const data = await bookService.getBookById(id);
                setBook(data);
                setSelectedImage(data.imageUrl);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchDetails();
    }, [id]);

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
                <div className="text-center py-20 text-gray-400">
                    Book not found
                </div>
                <Footer />
            </>
        );

    const discountedPrice =
        book.discount > 0
            ? Math.round(book.price - (book.price * book.discount) / 100)
            : book.price;

    const images = [book.imageUrl, book.imageUrl, book.imageUrl];

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow max-w-[1200px] mx-auto px-6 py-12">
                <div className="grid md:grid-cols-2 gap-12">
                    {/* LEFT SIDE IMAGES */}

                    <div>
                        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                            <img
                                src={selectedImage}
                                alt={book.title}
                                className="w-full h-[420px] object-contain rounded"
                            />
                        </div>

                        {/* Thumbnail images */}

                        <div className="flex gap-4 mt-4">
                            {images.map((img, i) => (
                                <img
                                    key={i}
                                    src={img}
                                    alt="preview"
                                    onClick={() => setSelectedImage(img)}
                                    className={`w-20 h-24 object-cover cursor-pointer rounded border ${
                                        selectedImage === img
                                            ? "border-[var(--color-primary-gold)]"
                                            : "border-[#2A2A2A]"
                                    }`}
                                />
                            ))}
                        </div>
                    </div>

                    {/* RIGHT SIDE DETAILS */}

                    <div>
                        <span className="text-sm bg-[#1a1a1a] px-3 py-1 rounded text-gray-400">
                            {book.category}
                        </span>

                        <h1 className="text-3xl font-heading mt-4">
                            {book.title}
                        </h1>

                        <p className="text-gray-400 mt-2">by {book.author}</p>

                        {/* PRICE */}

                        <div className="flex items-center gap-4 mt-6">
                            <span className="text-3xl text-[var(--color-primary-gold)] font-semibold">
                                ₹{discountedPrice}
                            </span>

                            {book.discount > 0 && (
                                <>
                                    <span className="line-through text-gray-500">
                                        ₹{book.price}
                                    </span>

                                    <span className="bg-red-600 text-white text-xs px-2 py-1 rounded">
                                        {book.discount}% OFF
                                    </span>
                                </>
                            )}
                        </div>

                        {/* STOCK */}

                        <p className="mt-4 text-sm text-gray-400">
                            {book.stock > 0
                                ? `In Stock (${book.stock} available)`
                                : "Out of stock"}
                        </p>

                        {/* DESCRIPTION */}

                        <p className="mt-6 text-gray-300 leading-relaxed">
                            {book.description}
                        </p>

                        {/* QUANTITY */}

                        <div className="flex items-center gap-4 mt-8">
                            <span>Quantity</span>

                            <div className="flex border border-[#2A2A2A] rounded">
                                <button
                                    onClick={() =>
                                        setQuantity((q) => Math.max(1, q - 1))
                                    }
                                    className="px-3"
                                >
                                    -
                                </button>

                                <span className="px-4">{quantity}</span>

                                <button
                                    onClick={() =>
                                        setQuantity((q) =>
                                            Math.min(book.stock, q + 1),
                                        )
                                    }
                                    className="px-3"
                                >
                                    +
                                </button>
                            </div>
                        </div>

                        {/* ADD TO CART */}

                        <button
                            onClick={() =>
                                addToCart(
                                    {
                                        bookId: book._id,
                                        title: book.title,
                                        price: discountedPrice,
                                        image: book.imageUrl,
                                    },
                                    quantity,
                                )
                            }
                            className="mt-8 bg-[var(--color-primary-gold)] text-black px-8 py-3 rounded-lg font-semibold hover:opacity-90"
                        >
                            Add to Cart
                        </button>

                        {/* INFO SECTION */}

                        <div className="grid grid-cols-3 gap-6 mt-10 text-center">
                            <div className="border border-[#2A2A2A] p-4 rounded-lg">
                                <p className="text-[var(--color-primary-gold)]">
                                    🚚
                                </p>
                                <p className="text-sm mt-1">Free Shipping</p>
                            </div>

                            <div className="border border-[#2A2A2A] p-4 rounded-lg">
                                <p className="text-[var(--color-primary-gold)]">
                                    ✔
                                </p>
                                <p className="text-sm mt-1">Authentic Books</p>
                            </div>

                            <div className="border border-[#2A2A2A] p-4 rounded-lg">
                                <p className="text-[var(--color-primary-gold)]">
                                    🔒
                                </p>
                                <p className="text-sm mt-1">Secure Payment</p>
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default BookDetailsPage;
