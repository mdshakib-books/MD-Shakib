import React from "react";
import { Link } from "react-router-dom";
import { formatPrice } from "../utils/formatPrice";
import { useCart } from "../hooks/useCart"; // Assuming useCart exposes addToCart

const BookCard = ({ book }) => {
    const { addToCart } = useCart();

    // Simulate an old price for the aesthetic (-20% discount)
    const oldPrice = Math.round(book.price * 1.25);
    const discount = "20%";

    const handleAddToCart = (e) => {
        e.preventDefault();
        e.stopPropagation();
        addToCart(book._id, 1);
    };

    return (
        <Link
            to={`/books/${book._id}`}
            className="group relative flex flex-col bg-[#111111] border border-[#2A2A2A] rounded-[12px] p-4 transition-all duration-300 hover:-translate-y-[6px] hover:shadow-[0_10px_30px_rgba(201,162,74,0.15)] hover:border-[var(--color-primary-gold)]"
        >
            {/* Discount Badge */}
            <div className="absolute top-4 left-4 z-10 bg-[#FFF5D1] text-black text-xs font-bold px-2 py-1 rounded shadow-sm">
                -{discount}
            </div>

            {/* Wishlist Icon */}
            <button
                className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center bg-white/10 backdrop-blur-sm rounded-full text-white hover:text-red-500 hover:bg-white/20 transition-colors"
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                }}
            >
                <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                    />
                </svg>
            </button>

            {/* Book Image */}
            <div className="relative w-full aspect-[3/4] mb-4 overflow-hidden rounded-md bg-[#1a1a1a] flex items-center justify-center">
                <img
                    src={
                        book.imageUrl ||
                        "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400&h=300"
                    }
                    alt={book.title}
                    className="w-[90%] h-[95%] object-cover rounded shadow-lg transition-transform duration-500 group-hover:scale-105"
                />
            </div>

            {/* Book Details */}
            <div className="flex-grow flex flex-col justify-between">
                <div>
                    <h3 className="font-medium text-sm md:text-base text-[var(--color-text-light)] line-clamp-2 leading-tight mb-2">
                        {book.title}
                    </h3>
                </div>

                <div className="mt-2 flex items-center space-x-2">
                    <span className="text-gray-500 text-xs line-through">
                        {formatPrice(oldPrice)}
                    </span>
                    <span className="font-bold text-[var(--color-primary-gold)] text-lg">
                        {formatPrice(book.price)}
                    </span>
                </div>
            </div>

            {/* Add to Cart Button */}
            <button
                onClick={handleAddToCart}
                className="mt-4 w-full bg-[var(--color-primary-gold)] hover:bg-[var(--color-accent-gold)] text-black font-semibold py-2.5 rounded-[10px] text-sm flex items-center justify-center gap-2 transition-colors"
            >
                <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2"
                        d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                </svg>
                Add to Cart
            </button>
        </Link>
    );
};

export default BookCard;
