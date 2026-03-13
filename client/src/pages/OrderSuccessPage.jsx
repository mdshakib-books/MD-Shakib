import React, { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { formatPrice } from "../utils/formatPrice";
import { orderService } from "../services/orderService";

const OrderSuccessPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [order, setOrder] = useState(location.state?.order || null);
    const [items, setItems] = useState(location.state?.items || []);
    const [totalAmount, setTotalAmount] = useState(location.state?.totalAmount || 0);

    const orderId = useMemo(
        () => searchParams.get("orderId") || location.state?.orderId || location.state?.order?._id,
        [searchParams, location.state],
    );

    useEffect(() => {
        const loadOrder = async () => {
            if (!orderId) {
                navigate("/orders", { replace: true });
                return;
            }

            try {
                const data = await orderService.getOrderById(orderId);
                const fetchedOrder = data?.order;
                if (!fetchedOrder) {
                    navigate("/orders", { replace: true });
                    return;
                }
                setOrder(fetchedOrder);
                setItems(fetchedOrder.items || []);
                setTotalAmount(fetchedOrder.totalAmount || 0);
            } catch {
                navigate("/orders", { replace: true });
            } finally {
                setLoading(false);
            }
        };

        loadOrder();
        window.scrollTo(0, 0);
    }, [orderId, navigate]);

    if (loading || !order) return null;

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow py-14 px-4 md:px-6">
                <div className="max-w-[640px] mx-auto">
                    {/* ── Success Hero ───────────────────────────────── */}
                    <div className="flex flex-col items-center text-center mb-10">
                        {/* Animated checkmark */}
                        <div className="w-20 h-20 rounded-full bg-[#1a1a1a] border-2 border-[var(--color-primary-gold)] flex items-center justify-center mb-5 animate-[scale-in_0.4s_ease]">
                            <svg
                                className="w-10 h-10 text-[var(--color-primary-gold)]"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth="2.5"
                                    d="M5 13l4 4L19 7"
                                />
                            </svg>
                        </div>

                        <h1 className="font-heading text-3xl md:text-4xl text-[var(--color-primary-gold)] mb-2">
                            Order Placed!
                        </h1>
                        <p className="text-gray-400 text-base">
                            Your order has been placed successfully.
                        </p>

                        {/* Order ID */}
                        <div className="mt-4 px-4 py-2 bg-[#111111] border border-[#2A2A2A] rounded-lg">
                            <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                                Order ID
                            </p>
                            <p className="font-mono text-sm text-[var(--color-primary-gold)] break-all">
                                {order._id}
                            </p>
                        </div>

                        <p className="mt-3 text-xs text-gray-500">
                            🚚 Delivered in{" "}
                            <span className="text-gray-400">
                                5–7 Business Days
                            </span>
                        </p>
                    </div>

                    {/* ── Ordered Items ──────────────────────────────── */}
                    {items.length > 0 && (
                        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 mb-6">
                            <h2 className="font-heading text-base text-[var(--color-primary-gold)] mb-4">
                                Items Ordered
                            </h2>
                            <div className="divide-y divide-[#2A2A2A]">
                                {items.map((item, i) => (
                                    <div
                                        key={
                                            item.bookId?._id || item.bookId || i
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
                                            <p className="text-sm text-white line-clamp-2">
                                                {item.title ||
                                                    item.bookId?.title ||
                                                    "Book"}
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

                            {/* Total */}
                            <div className="flex justify-between font-bold text-sm text-white border-t border-[#2A2A2A] pt-3 mt-2">
                                <span>Total Amount</span>
                                <span className="text-[var(--color-primary-gold)]">
                                    {formatPrice(totalAmount)}
                                </span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-2">
                                <span>Payment Method</span>
                                <span>{order.paymentMethod || "—"}</span>
                            </div>
                            <div className="flex justify-between text-xs text-gray-400 mt-1">
                                <span>Payment Status</span>
                                <span>{order.paymentStatus || "Pending"}</span>
                            </div>
                        </div>
                    )}

                    {/* ── CTA Buttons ────────────────────────────────── */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Link
                            to="/books"
                            className="flex-1 text-center py-3.5 rounded-xl bg-[var(--color-primary-gold)] text-black font-bold hover:bg-[var(--color-accent-gold)] transition-all hover:scale-[1.01]"
                        >
                            Order More
                        </Link>
                        <Link
                            to="/"
                            className="flex-1 text-center py-3.5 rounded-xl bg-[#111111] border border-[#2A2A2A] text-gray-300 font-medium hover:border-[#3A3A3A] transition-all"
                        >
                            Home
                        </Link>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default OrderSuccessPage;
