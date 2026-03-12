import React, { useEffect, useState, useRef } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useDispatch } from "react-redux";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import AddressSelector from "../components/AddressSelector";
import { useCart } from "../hooks/useCart";
import { orderService } from "../services/orderService";
import { formatPrice } from "../utils/formatPrice";
import { useToast } from "../context/ToastContext";
import { setItems, clearGuestCart } from "../redux/slices/cartSlice";

const PLATFORM_FEE = 10;
const DELIVERY_FEE = 35;

const CheckoutPage = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { cart, isLoggedIn, fetchCart } = useCart();
    const { addToast } = useToast();

    const [selectedAddress, setSelectedAddress] = useState(null);
    const [paymentMethod, setPaymentMethod] = useState("COD");
    const [placing, setPlacing] = useState(false);

    // Idempotency key is generated once per component mount — prevents double-submit
    const idempotencyKey = useRef(crypto.randomUUID());

    const items = cart?.items || [];

    useEffect(() => {
        if (isLoggedIn) fetchCart();
    }, [isLoggedIn, fetchCart]);

    const subtotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
    );
    const total = subtotal + PLATFORM_FEE + DELIVERY_FEE;

    const handlePlaceOrder = async () => {
        if (!selectedAddress) {
            addToast("Please select a delivery address", "error");
            return;
        }
        if (items.length === 0) {
            addToast("Your cart is empty", "error");
            return;
        }

        setPlacing(true);
        try {
            const result = await orderService.createOrder({
                addressId: selectedAddress._id,
                paymentMethod,
                idempotencyKey: idempotencyKey.current,
            });

            // Clear Redux cart state immediately so cart appears empty
            dispatch(setItems([]));
            dispatch(clearGuestCart());

            addToast("Order placed successfully!", "success");
            // Navigate to orders page after successful order
            navigate("/orders", { replace: true });
        } catch (err) {
            console.error("Order Placement Error Stack:", err);
            const msg =
                err.response?.data?.message ||
                "Failed to place order. Please try again.";
            addToast(msg, "error");
            // Regenerate key so user can retry without duplicate detection
            idempotencyKey.current = crypto.randomUUID();
        } finally {
            setPlacing(false);
        }
    };

    if (items.length === 0) {
        return (
            <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
                <Navbar />
                <main className="flex-grow flex flex-col items-center justify-center gap-4 py-20">
                    <p className="text-gray-400 text-lg">Your cart is empty.</p>
                    <Link
                        to="/books"
                        className="px-6 py-3 bg-[var(--color-primary-gold)] text-black font-semibold rounded-lg hover:bg-[var(--color-accent-gold)] transition"
                    >
                        Browse Books
                    </Link>
                </main>
                <Footer />
            </div>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow py-14 px-4 md:px-6">
                <div className="max-w-[1100px] mx-auto">
                    {/* Page title */}
                    <h1 className="font-heading text-3xl md:text-4xl text-[var(--color-primary-gold)] mb-10">
                        Checkout
                    </h1>

                    <div className="grid lg:grid-cols-[1fr_360px] gap-8">
                        {/* ── LEFT: Address + Payment ─────────────────────── */}
                        <div className="space-y-6">
                            {/* Address Section */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 md:p-6 space-y-4">
                                <h2 className="font-heading text-lg text-[var(--color-primary-gold)]">
                                    Delivery Address
                                </h2>
                                <AddressSelector
                                    onSelect={setSelectedAddress}
                                />
                            </div>

                            {/* Payment Method */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 md:p-6 space-y-4">
                                <h2 className="font-heading text-lg text-[var(--color-primary-gold)]">
                                    Payment Method
                                </h2>

                                <div className="space-y-3">
                                    {/* COD */}
                                    <label
                                        className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                                            paymentMethod === "COD"
                                                ? "border-[var(--color-primary-gold)] bg-[#1a1a1a]"
                                                : "border-[#2A2A2A] hover:border-[#3a3a3a]"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="payment"
                                            value="COD"
                                            checked={paymentMethod === "COD"}
                                            onChange={() =>
                                                setPaymentMethod("COD")
                                            }
                                            className="accent-[var(--color-primary-gold)]"
                                        />
                                        <div>
                                            <p className="font-medium text-white">
                                                Cash on Delivery
                                            </p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                Pay when your order arrives
                                            </p>
                                        </div>
                                    </label>

                                    {/* Online */}
                                    <label
                                        className={`flex items-center gap-4 p-4 rounded-lg border cursor-pointer transition-all ${
                                            paymentMethod === "Online"
                                                ? "border-[var(--color-primary-gold)] bg-[#1a1a1a]"
                                                : "border-[#2A2A2A] hover:border-[#3a3a3a]"
                                        }`}
                                    >
                                        <input
                                            type="radio"
                                            name="payment"
                                            value="Online"
                                            checked={paymentMethod === "Online"}
                                            onChange={() =>
                                                setPaymentMethod("Online")
                                            }
                                            className="accent-[var(--color-primary-gold)]"
                                        />
                                        <div>
                                            <p className="font-medium text-white">
                                                Pay Online
                                            </p>
                                            <p className="text-xs text-gray-400 mt-0.5">
                                                UPI, Card, Net Banking
                                            </p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                        {/* ── RIGHT: Order Summary ────────────────────────── */}
                        <div className="space-y-4">
                            {/* Items list */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 space-y-4">
                                <h2 className="font-heading text-lg text-[var(--color-primary-gold)]">
                                    Order Summary
                                </h2>

                                <div className="divide-y divide-[#2A2A2A]">
                                    {items.map((item) => (
                                        <div
                                            key={
                                                item.bookId?._id || item.bookId
                                            }
                                            className="flex gap-3 py-3"
                                        >
                                            <img
                                                src={
                                                    item.imageUrl ||
                                                    item.image ||
                                                    "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=100"
                                                }
                                                alt={item.title}
                                                className="w-12 h-16 object-cover rounded"
                                            />
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-white line-clamp-2 leading-snug">
                                                    {item.title ||
                                                        item.bookId?.title}
                                                </p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    Qty: {item.quantity}
                                                </p>
                                            </div>
                                            <p className="text-sm font-semibold text-[var(--color-primary-gold)] whitespace-nowrap">
                                                {formatPrice(
                                                    item.price * item.quantity,
                                                )}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Price breakdown */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 space-y-3 text-sm">
                                <div className="flex justify-between text-gray-300">
                                    <span>Subtotal</span>
                                    <span>{formatPrice(subtotal)}</span>
                                </div>
                                <div className="flex justify-between text-gray-300">
                                    <span>Platform Fee</span>
                                    <span>{formatPrice(PLATFORM_FEE)}</span>
                                </div>
                                <div className="flex justify-between text-gray-300">
                                    <span>Delivery</span>
                                    <span>{formatPrice(DELIVERY_FEE)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-base text-white border-t border-[#2A2A2A] pt-3 mt-1">
                                    <span>Total</span>
                                    <span className="text-[var(--color-primary-gold)]">
                                        {formatPrice(total)}
                                    </span>
                                </div>
                            </div>

                            {/* Place Order CTA */}
                            <button
                                onClick={handlePlaceOrder}
                                disabled={placing || !selectedAddress}
                                className="w-full py-3.5 rounded-xl bg-[var(--color-primary-gold)] text-black font-bold text-base hover:bg-[var(--color-accent-gold)] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.01]"
                            >
                                {placing
                                    ? "Placing Order…"
                                    : paymentMethod === "COD"
                                      ? "Place Order (Cash on Delivery)"
                                      : "Proceed to Payment"}
                            </button>

                            <p className="text-center text-xs text-gray-500">
                                Estimated delivery: 5-7 business days.
                            </p>
                            <p className="text-center text-xs text-gray-500">
                                By placing the order you agree to our{" "}
                                <Link
                                    to="/support"
                                    className="text-[var(--color-primary-gold)] hover:underline"
                                >
                                    Terms &amp; Conditions
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default CheckoutPage;
