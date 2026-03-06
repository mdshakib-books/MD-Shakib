import React from "react";
import BookCard from "./BookCard";
import EmptyState from "./EmptyState";

const ProductGrid = ({ books = [], loading }) => {
    if (loading) return null; // handled by parent

    if (!books || books.length === 0) {
        return <EmptyState message="No books found." />;
    }

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {books?.map((book) => (
                <BookCard key={book._id} book={book} />
            ))}
        </div>
    );
};

export default ProductGrid;
