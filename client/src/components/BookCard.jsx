import React from "react";
import { Link } from "react-router-dom";
import { formatPrice, truncateText } from "../utils/formatPrice";

const BookCard = ({ book }) => {
    return (
        <div className="border rounded-lg shadow-sm overflow-hidden bg-white flex flex-col hover:shadow-md transition">
            <img
                src={
                    book.imageUrl ||
                    "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400&h=300"
                }
                alt={book.title}
                className="w-full h-48 object-cover"
            />
            <div className="p-4 flex-grow flex flex-col justify-between">
                <div>
                    <h3 className="font-semibold text-lg line-clamp-1">
                        {book.title}
                    </h3>
                    <p className="text-gray-500 text-sm mt-1">{book.author}</p>
                </div>
                <div className="mt-4 flex justify-between items-center">
                    <span className="font-bold text-blue-600">
                        {formatPrice(book.price)}
                    </span>
                    <Link
                        to={`/books/${book._id}`}
                        className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700"
                    >
                        View
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default BookCard;
