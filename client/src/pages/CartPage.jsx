import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import CartItem from "../components/CartItem";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useCart } from "../hooks/useCart";
import AddressSelector from "../components/AddressSelector";
import { formatPrice } from "../utils/formatPrice";

const CartPage = () => {
    const { cart, loading, fetchCart } = useCart();
    const [feeOpen, setFeeOpen] = React.useState(false);
    const [discountOpen, setDiscountOpen] = React.useState(false);

    useEffect(() => {
        fetchCart();
        window.scrollTo(0, 0);
    }, []);

    const subtotal = Math.round(
        cart?.items?.reduce(
            (total, item) => total + item.price * item.quantity,
            0,
        ) || 0,
    );

    const MRP = Math.round(
        cart?.items?.reduce(
            (total, item) =>
                total +
                (item.originalPrice || item.price * 1.4) * item.quantity,
            0,
        ) || 0,
    );
    const discount = Math.round(MRP - subtotal);

    const platformFee = 10;
    const deliveryFee = 35;

    const totalFee = platformFee + deliveryFee;

    const totalAmount = subtotal + totalFee;

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow py-14 px-4 md:px-6">
                <div className="max-w-[1100px] mx-auto">
                    {/* Title */}
                    <h1 className="font-heading text-3xl md:text-4xl text-[var(--color-primary-gold)] mb-10">
                        Your Cart
                    </h1>

                    {loading ? (
                        <Loader />
                    ) : !cart || cart.items?.length === 0 ? (
                        <EmptyState
                            message="Your cart is empty"
                            actionText="Browse Books"
                            actionUrl="/books"
                        />
                    ) : (
                        <div className="grid lg:grid-cols-[1fr_320px] gap-8">
                            {/* CART ITEMS */}
                            <div className="space-y-4">
                                <AddressSelector />

                                <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-4 md:p-6 space-y-4 shadow-xl">
                                    {cart?.items?.map((item) => (
                                        <CartItem
                                            key={item.bookId}
                                            item={item}
                                            onUpdateQuantity={() => {}}
                                            onRemove={() => {}}
                                        />
                                    ))}
                                </div>
                            </div>

                            {/* ORDER SUMMARY */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 h-fit sticky top-[90px] shadow-xl">
                                <h3 className="font-heading text-base text-[var(--color-primary-gold)] mb-5">
                                    Order Summary
                                </h3>

                                <div className="space-y-3 text-[13px]">
                                    {/* MRP */}
                                    <div className="flex justify-between text-gray-300">
                                        <span>MRP</span>
                                        <span>₹{formatPrice(MRP)}</span>
                                    </div>

                                    {/* FEES */}
                                    <div>
                                        <div className="flex justify-between items-center text-gray-300">
                                            <button
                                                onClick={() =>
                                                    setFeeOpen(!feeOpen)
                                                }
                                                className="flex items-center gap-2"
                                            >
                                                <span>Fees</span>

                                                <svg
                                                    className={`w-4 h-4 transition ${feeOpen ? "rotate-180" : ""}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth="2"
                                                        d="M19 9l-7 7-7-7"
                                                    />
                                                </svg>
                                            </button>

                                            {!feeOpen && (
                                                <span>
                                                    {formatPrice(totalFee)}
                                                </span>
                                            )}
                                        </div>

                                        {feeOpen && (
                                            <div className="mt-3 space-y-2 text-gray-400 pl-2">
                                                <div className="flex justify-between">
                                                    <span>Platform Fee</span>
                                                    <span>₹{platformFee}</span>
                                                </div>

                                                <div className="flex justify-between">
                                                    <span>Delivery Fee</span>
                                                    <span>₹{deliveryFee}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* DISCOUNT */}
                                    <div>
                                        <div className="flex justify-between items-center text-gray-300">
                                            <button
                                                onClick={() =>
                                                    setDiscountOpen(
                                                        !discountOpen,
                                                    )
                                                }
                                                className="flex items-center gap-2"
                                            >
                                                <span>Discount</span>

                                                <svg
                                                    className={`w-4 h-4 transition ${discountOpen ? "rotate-180 text-green-400" : ""}`}
                                                    fill="none"
                                                    stroke="currentColor"
                                                    viewBox="0 0 24 24"
                                                >
                                                    <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        strokeWidth="2"
                                                        d="M19 9l-7 7-7-7"
                                                    />
                                                </svg>
                                            </button>

                                            {!discountOpen && (
                                                <span className="text-green-400">
                                                    -{formatPrice(discount)}
                                                </span>
                                            )}
                                        </div>

                                        {discountOpen && (
                                            <div className="mt-3 text-green-400 pl-2">
                                                <div className="flex justify-between">
                                                    <span>Discount on MRP</span>
                                                    <span>
                                                        
                                                        -{formatPrice(discount)}
                                                    </span>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div className="border-t border-[#2A2A2A] pt-3 flex justify-between font-semibold text-[15px]">
                                        <span>Total Amount</span>

                                        <span className="text-[var(--color-primary-gold)]">
                                            {formatPrice(totalAmount)}
                                        </span>
                                    </div>

                                    {/* SAVINGS */}
                                    <div className="bg-green-900/20 border border-green-700 text-green-400 rounded-lg text-center py-2 text-[13px]">
                                        You will save ₹{formatPrice(discount)}{" "}
                                        on this order
                                    </div>
                                </div>

                                <Link
                                    to="/checkout"
                                    className="mt-6 block w-full text-center py-3 rounded-lg bg-[var(--color-primary-gold)] text-black font-semibold hover:scale-[1.02] hover:bg-[var(--color-accent-gold)] transition"
                                >
                                    Proceed to Checkout
                                </Link>

                                <Link
                                    to="/books"
                                    className="mt-4 block text-center text-sm text-gray-400 hover:text-[var(--color-primary-gold)] transition"
                                >
                                    Continue Shopping
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};

export default CartPage;
