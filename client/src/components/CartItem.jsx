import React from "react";
import { formatPrice } from "../utils/formatPrice";

const CartItem = ({ item, onUpdateQuantity, onRemove }) => {
    return (
        <div className="flex items-center justify-between border-b pb-4 mb-4">
            <div className="flex items-center space-x-4">
                <img
                    src={
                        item.imageUrl ||
                        "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=400&h=300"
                    }
                    alt={item.title || "Book Cover"}
                    className="w-16 h-16 object-cover rounded"
                />
                <div>
                    <h4 className="font-semibold">
                        {item.title || "Unknown Book"}
                    </h4>
                    <p className="text-gray-500 text-sm">
                        {formatPrice(item.price)}
                    </p>
                </div>
            </div>
            <div className="flex items-center space-x-6">
                <div className="flex items-center border rounded">
                    <button
                        onClick={() =>
                            onUpdateQuantity(item.bookId, item.quantity - 1)
                        }
                        disabled={item.quantity <= 1}
                        className="px-3 py-1 bg-gray-100 disabled:opacity-50"
                    >
                        -
                    </button>
                    <span className="px-3 py-1">{item.quantity}</span>
                    <button
                        onClick={() =>
                            onUpdateQuantity(item.bookId, item.quantity + 1)
                        }
                        className="px-3 py-1 bg-gray-100"
                    >
                        +
                    </button>
                </div>
                <div className="font-semibold">
                    {formatPrice(item.price * item.quantity)}
                </div>
                <button
                    onClick={() => onRemove(item.bookId)}
                    className="text-red-500 hover:text-red-700"
                >
                    Remove
                </button>
            </div>
        </div>
    );
};

export default CartItem;
