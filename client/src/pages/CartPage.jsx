import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import CartItem from "../components/CartItem";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useCart } from "../hooks/useCart";

const CartPage = () => {
    const { cart, loading, fetchCart } = useCart();

    useEffect(() => {
        console.log("CartPage loaded. Fetching cart user...");
        fetchCart();
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8">
                <h1 className="text-3xl font-bold mb-6">Your Cart</h1>

                {loading ? (
                    <Loader />
                ) : !cart || cart.items?.length === 0 ? (
                    <EmptyState
                        message="Your cart is empty"
                        actionText="Continue Shopping"
                        actionUrl="/books"
                    />
                ) : (
                    <div className="flex flex-col md:flex-row gap-8">
                        <div className="flex-grow bg-white p-6 rounded-lg shadow-sm">
                            {cart?.items?.map((item) => (
                                <CartItem
                                    key={item.bookId}
                                    item={item}
                                    onUpdateQuantity={() => {}}
                                    onRemove={() => {}}
                                />
                            ))}
                        </div>
                        <div className="w-full md:w-1/3 bg-white p-6 rounded-lg shadow-sm h-fit">
                            <h3 className="text-xl font-bold mb-4">
                                Order Summary
                            </h3>
                            <div className="flex justify-between mb-2">
                                <span>Subtotal</span>
                                <span>
                                    ₹
                                    {cart?.items?.reduce(
                                        (total, item) =>
                                            total + item.price * item.quantity,
                                        0,
                                    )}
                                </span>
                            </div>
                            <div className="border-t my-4 pt-4 flex justify-between font-bold text-lg">
                                <span>Total</span>
                                <span>
                                    ₹
                                    {cart?.items?.reduce(
                                        (total, item) =>
                                            total + item.price * item.quantity,
                                        0,
                                    )}
                                </span>
                            </div>
                            <Link
                                to="/checkout"
                                className="w-full block text-center bg-blue-600 text-white py-3 rounded-lg font-medium hover:bg-blue-700"
                            >
                                Proceed to Checkout
                            </Link>
                        </div>
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default CartPage;
