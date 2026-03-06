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
    const { addToCart } = useCart();

    useEffect(() => {
        const fetchDetails = async () => {
            try {
                setLoading(true);
                console.log(`Fetching book details for ID: ${id}`);
                const data = await bookService.getBookById(id);
                setBook(data);
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
                <div className="py-20 text-center">Book not found</div>
                <Footer />
            </>
        );

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8">
                <div className="bg-white rounded-lg shadow-sm p-6 flex flex-col md:flex-row gap-8">
                    <img
                        src={
                            book.image || "https://via.placeholder.com/300x400"
                        }
                        alt={book.title}
                        className="w-full md:w-1/3 rounded object-cover"
                    />
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold mb-2">
                            {book.title}
                        </h1>
                        <p className="text-xl text-gray-600 mb-4">
                            {book.author}
                        </p>
                        <p className="text-2xl font-bold text-blue-600 mb-6">
                            ₹{book.price}
                        </p>
                        <p className="text-gray-700 mb-8">
                            {book.description ||
                                "No description available for this book."}
                        </p>

                        <button
                            onClick={() => addToCart(book._id, 1)}
                            className="bg-blue-600 text-white px-8 py-3 rounded-lg hover:bg-blue-700 font-medium"
                        >
                            Add to Cart
                        </button>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default BookDetailsPage;
