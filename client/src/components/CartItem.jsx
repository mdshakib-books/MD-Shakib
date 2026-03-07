import React from "react";
import { formatPrice } from "../utils/formatPrice";

const CartItem = ({ item, onUpdateQuantity, onRemove }) => {
    return (
        <div className="border border-[#2A2A2A] rounded-xl p-4 bg-[#111111] hover:border-[var(--color-primary-gold)] transition">
            {/* TOP SECTION */}
            <div className="flex items-start gap-4">
                {/* Image */}
                <img
                    src={
                        item.imageUrl ||
                        item.image ||
                        "https://images.unsplash.com/photo-1544947950-fa07a98d237f"
                    }
                    alt={item.title}
                    className="w-16 h-20 object-cover rounded-md"
                />

                {/* Title + Remove */}
                <div className="flex-1 flex justify-between items-start">
                    <div>
                        <h4 className="text-sm md:text-base font-semibold">
                            {item.title || "Unknown Book"}
                        </h4>

                        <p className="text-gray-400 text-sm mt-1">
                            {formatPrice(item.price)}
                        </p>
                    </div>

                    {/* Remove button */}
                    <button
                        onClick={() => onRemove(item.bookId)}
                        className="text-red-500 text-sm hover:text-red-400 transition"
                    >
                        Remove
                    </button>
                </div>
            </div>

            {/* BOTTOM SECTION */}
            <div className="flex items-center justify-between mt-4">
                {/* Quantity */}
                <div className="flex items-center border border-[#2A2A2A] rounded-lg overflow-hidden">
                    <button
                        onClick={() =>
                            onUpdateQuantity(item.bookId, item.quantity - 1)
                        }
                        disabled={item.quantity <= 1}
                        className="px-3 py-1 hover:bg-[#1a1a1a]"
                    >
                        -
                    </button>

                    <span className="px-4 text-sm">{item.quantity}</span>

                    <button
                        onClick={() =>
                            onUpdateQuantity(item.bookId, item.quantity + 1)
                        }
                        className="px-3 py-1 hover:bg-[#1a1a1a]"
                    >
                        +
                    </button>
                </div>

                {/* Total price */}
                <div className="text-sm md:text-base font-semibold text-[var(--color-primary-gold)]">
                    {formatPrice(item.price * item.quantity)}
                </div>
            </div>
        </div>
    );
};

export default CartItem;
