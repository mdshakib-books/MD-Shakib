import React, { useCallback, useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Loader from "../components/Loader";
import OrderTrackingTimeline from "../components/OrderTrackingTimeline";
import PriceBreakdownCard from "../components/PriceBreakdownCard";
import { orderService } from "../services/orderService";
import { formatPrice } from "../utils/formatPrice";
import { useSocket } from "../hooks/useSocket";

const statusColor = (status) => {
    const map = {
        Pending: "text-yellow-400",
        Confirmed: "text-blue-400",
        Packed: "text-purple-400",
        Shipped: "text-indigo-400",
        "Out for Delivery": "text-orange-400",
        Delivered: "text-green-400",
        Cancelled: "text-red-400",
        "Replacement Requested": "text-yellow-500",
        "Replacement Approved": "text-blue-500",
        "Replacement Rejected": "text-red-500",
        "Replacement Shipped": "text-indigo-500",
        "Replacement Delivered": "text-green-500",
        Returned: "text-pink-400",
    };
    return map[status] || "text-gray-400";
};

const paymentBadge = (status) => {
    const map = {
        Paid: "text-green-400 border-green-500/50",
        Pending: "text-yellow-400 border-yellow-500/50",
        Failed: "text-red-400 border-red-500/50",
        Refunded: "text-blue-400 border-blue-500/50",
    };
    return map[status] || "text-gray-400 border-gray-600/50";
};

const OrderDetailsPage = () => {
    const { id } = useParams();
    const { socket, joinUserRoom } = useSocket();

    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    const [replacing, setReplacing] = useState(false);
    const [replacementReason, setReplacementReason] = useState("");
    const [showReplaceModal, setShowReplaceModal] = useState(false);

    const fetchOrder = useCallback(async () => {
        try {
            setLoading(true);
            const data = await orderService.getOrderById(id);
            setOrder(data.order);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        if (id) fetchOrder();
    }, [id, fetchOrder]);

    useEffect(() => {
        const interval = setInterval(() => {
            if (id) fetchOrder();
        }, 30000);
        return () => clearInterval(interval);
    }, [id, fetchOrder]);

    useEffect(() => {
        if (!socket || !id) return;

        try {
            const user = JSON.parse(localStorage.getItem("user") || "null");
            if (user?._id) {
                joinUserRoom(user._id);
            }
        } catch {
            // ignore JSON parse issues and continue with polling fallback
        }

        const handleRealtimeUpdate = (payload) => {
            if (!payload?.orderId || payload.orderId !== id) return;
            fetchOrder();
        };

        const handleLegacyOrderStatus = (payload) => {
            if (!payload?.orderId || payload.orderId !== id) return;
            fetchOrder();
        };

        socket.on("orderStatusUpdated", handleRealtimeUpdate);
        socket.on("paymentUpdated", handleRealtimeUpdate);
        socket.on("orderPaid", handleRealtimeUpdate);
        socket.on("paymentSuccess", handleRealtimeUpdate);
        socket.on("paymentFailed", handleRealtimeUpdate);
        socket.on("replacementUpdated", handleRealtimeUpdate);
        socket.on("order_status_updated", handleLegacyOrderStatus);

        return () => {
            socket.off("orderStatusUpdated", handleRealtimeUpdate);
            socket.off("paymentUpdated", handleRealtimeUpdate);
            socket.off("orderPaid", handleRealtimeUpdate);
            socket.off("paymentSuccess", handleRealtimeUpdate);
            socket.off("paymentFailed", handleRealtimeUpdate);
            socket.off("replacementUpdated", handleRealtimeUpdate);
            socket.off("order_status_updated", handleLegacyOrderStatus);
        };
    }, [socket, id, joinUserRoom, fetchOrder]);

    const handleRequestReplacement = async () => {
        if (!replacementReason.trim()) return;
        try {
            setReplacing(true);
            await orderService.requestReplacement(order._id, replacementReason);
            setShowReplaceModal(false);
            await fetchOrder();
        } catch (err) {
            console.error(err);
            alert(
                "Failed to request replacement: " +
                    (err.response?.data?.message || err.message),
            );
        } finally {
            setReplacing(false);
        }
    };

    if (loading) {
        return (
            <>
                <Navbar />
                <Loader fullScreen />
                <Footer />
            </>
        );
    }

    if (!order) {
        return (
            <>
                <Navbar />
                <div className="py-20 text-center text-gray-400">Order not found</div>
                <Footer />
            </>
        );
    }

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow py-14 px-4 md:px-6">
                <div className="max-w-[1100px] mx-auto">
                    <Link
                        to="/orders"
                        className="text-gray-400 hover:text-white mb-6 inline-block text-sm"
                    >
                        ← Back to Orders
                    </Link>

                    <h1 className="font-heading text-3xl text-[var(--color-primary-gold)] mb-8">
                        Order Details
                    </h1>

                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
                        <div className="grid md:grid-cols-5 gap-6 text-sm">
                            <div>
                                <p className="text-gray-400 mb-1">Order ID</p>
                                <p className="font-mono text-xs text-gray-300 break-all">
                                    {order._id}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-400 mb-1">Date</p>
                                <p className="font-medium">
                                    {new Date(order.createdAt).toLocaleDateString("en-IN", {
                                        day: "numeric",
                                        month: "short",
                                        year: "numeric",
                                    })}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-400 mb-1">Payment Method</p>
                                <p className="font-medium">{order.paymentMethod}</p>
                            </div>
                            <div>
                                <p className="text-gray-400 mb-1">Order Status</p>
                                <p className={`font-semibold ${statusColor(order.orderStatus)}`}>
                                    {order.orderStatus}
                                </p>
                            </div>
                            <div>
                                <p className="text-gray-400 mb-1">Payment Status</p>
                                <span
                                    className={`inline-flex text-xs px-2 py-1 rounded-full border font-semibold ${paymentBadge(order.paymentStatus)}`}
                                >
                                    {order.paymentStatus}
                                </span>
                            </div>
                        </div>
                    </div>

                    <OrderTrackingTimeline
                        orderStatus={order.orderStatus}
                        statusHistory={order.statusHistory || []}
                        cancelReason={order.cancelReason}
                        paymentMethod={order.paymentMethod}
                        paymentStatus={order.paymentStatus}
                        paidAt={order.paidAt}
                    />

                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
                        <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-6">
                            Items
                        </h3>
                        <div className="space-y-5">
                            {order.items?.map((item, idx) => (
                                <div key={idx} className="flex gap-5 items-center">
                                    <img
                                        src={item.imageUrl}
                                        alt={item.title}
                                        className="w-16 h-20 object-cover rounded"
                                    />
                                    <div className="flex-grow">
                                        <p className="font-medium">{item.title}</p>
                                        <p className="text-sm text-gray-400 mt-0.5">
                                            Qty: {item.quantity} × {formatPrice(item.price)}
                                        </p>
                                    </div>
                                    <p className="font-semibold text-[var(--color-primary-gold)]">
                                        {formatPrice(item.price * item.quantity)}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {(order.shipping?.awb || order.shipping?.courier) && (
                        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
                            <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-4">
                                Courier & Tracking
                            </h3>
                            <div className="space-y-2 text-sm text-gray-300">
                                <p>
                                    <span className="text-gray-500 w-28 inline-block">Partner:</span>
                                    <span className="font-medium text-white">
                                        {order.shipping?.courier || "Not assigned"}
                                    </span>
                                </p>
                                <p>
                                    <span className="text-gray-500 w-28 inline-block">Tracking ID:</span>
                                    <span className="font-mono text-white">
                                        {order.shipping?.awb || "Not available"}
                                    </span>
                                </p>
                                {order.shipping?.trackingUrl && (
                                    <p className="mt-2 text-[var(--color-primary-gold)] hover:underline">
                                        <a
                                            href={order.shipping.trackingUrl}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            Track Shipment ↗
                                        </a>
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {((String(order.paymentMethod || "").toUpperCase() === "ONLINE" ||
                        order.paymentMethod === "Online") &&
                        (order.razorpayOrderId || order.razorpayPaymentId)) && (
                        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
                            <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-4">
                                Payment Reference
                            </h3>
                            <div className="space-y-2 text-sm text-gray-300">
                                <p>
                                    <span className="text-gray-500 w-40 inline-block">
                                        Razorpay Order ID:
                                    </span>
                                    <span className="font-mono text-xs text-white">
                                        {order.razorpayOrderId || "—"}
                                    </span>
                                </p>
                                <p>
                                    <span className="text-gray-500 w-40 inline-block">
                                        Razorpay Payment ID:
                                    </span>
                                    <span className="font-mono text-xs text-white">
                                        {order.razorpayPaymentId || "—"}
                                    </span>
                                </p>
                            </div>
                        </div>
                    )}

                    {order.replacement?.replacementRequested && (
                        <div className="bg-[#111111] border border-yellow-800 rounded-xl p-6 mb-6">
                            <h3 className="font-heading text-lg text-yellow-500 mb-2">
                                Replacement Status: {order.replacement.replacementStatus}
                            </h3>
                            <p className="text-sm text-gray-300">
                                Reason: {order.replacement.replacementReason || "—"}
                            </p>
                            {order.replacement.replacementRejectionReason && (
                                <p className="text-sm text-red-400 mt-1">
                                    Rejection: {order.replacement.replacementRejectionReason}
                                </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                                Requested at:{" "}
                                {order.replacement.replacementRequestedAt
                                    ? new Date(
                                          order.replacement.replacementRequestedAt,
                                      ).toLocaleString()
                                    : "—"}
                            </p>
                        </div>
                    )}

                    {!order.replacement?.replacementRequested && order.orderStatus === "Delivered" && (
                        <div className="mb-6">
                            <button
                                onClick={() => setShowReplaceModal(true)}
                                className="px-4 py-2 border border-[#2A2A2A] rounded text-sm hover:border-[var(--color-primary-gold)] transition text-gray-300 hover:text-white"
                            >
                                Request Replacement
                            </button>
                        </div>
                    )}

                    <PriceBreakdownCard order={order} />

                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                        <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-4">
                            Delivery Address
                        </h3>
                        <p className="font-medium">{order.address.fullName}</p>
                        <p className="text-gray-400 text-sm mt-1">
                            {order.address.houseNo}, {order.address.area}
                            <br />
                            {order.address.city}, {order.address.state} – {order.address.pincode}
                        </p>
                        <p className="text-gray-400 text-sm mt-1">📞 {order.address.phone}</p>
                    </div>
                </div>
            </main>

            <Footer />

            {showReplaceModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-[#111111] border border-[#2A2A2A] p-6 rounded-xl w-full max-w-md">
                        <h2 className="text-xl font-heading text-[var(--color-primary-gold)] mb-4">
                            Request Replacement
                        </h2>
                        <p className="text-sm text-gray-400 mb-4">
                            Replacement can only be requested within 7 days of delivery.
                        </p>
                        <textarea
                            value={replacementReason}
                            onChange={(e) => setReplacementReason(e.target.value)}
                            placeholder="Please describe the issue..."
                            className="w-full bg-[#1a1a1a] border border-[#2A2A2A] p-3 rounded-lg text-white text-sm mb-4 outline-none focus:border-[var(--color-primary-gold)]"
                            rows={4}
                        />
                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowReplaceModal(false)}
                                className="px-4 py-2 text-sm text-gray-400 hover:text-white"
                                disabled={replacing}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRequestReplacement}
                                disabled={replacing || !replacementReason.trim()}
                                className="px-4 py-2 bg-[var(--color-primary-gold)] text-black font-semibold rounded hover:bg-[var(--color-accent-gold)] disabled:opacity-50 text-sm"
                            >
                                {replacing ? "Submitting..." : "Submit Request"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrderDetailsPage;
