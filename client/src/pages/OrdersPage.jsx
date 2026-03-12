import React, { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import OrderCard from "../components/OrderCard";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useOrders } from "../hooks/useOrders";
import { useSocket } from "../hooks/useSocket";

const OrdersPage = () => {
    const { orders, loading, fetchOrders } = useOrders();
    const { socket, joinUserRoom } = useSocket();

    useEffect(() => {
        fetchOrders();
        window.scrollTo(0, 0);
    }, []);

    useEffect(() => {
        const interval = setInterval(fetchOrders, 30000);
        return () => clearInterval(interval);
    }, [fetchOrders]);

    useEffect(() => {
        if (!socket) return;

        try {
            const user = JSON.parse(localStorage.getItem("user") || "null");
            if (user?._id) joinUserRoom(user._id);
        } catch {
            // fallback polling already enabled
        }

        const refresh = () => fetchOrders();
        socket.on("orderCreated", refresh);
        socket.on("orderStatusUpdated", refresh);
        socket.on("paymentUpdated", refresh);
        socket.on("replacementUpdated", refresh);
        socket.on("order_status_updated", refresh);

        return () => {
            socket.off("orderCreated", refresh);
            socket.off("orderStatusUpdated", refresh);
            socket.off("paymentUpdated", refresh);
            socket.off("replacementUpdated", refresh);
            socket.off("order_status_updated", refresh);
        };
    }, [socket, joinUserRoom, fetchOrders]);

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow py-14 px-4 md:px-6">
                <div className="max-w-[1100px] mx-auto">
                    <h1 className="font-heading text-3xl text-[var(--color-primary-gold)] mb-10">
                        My Orders
                    </h1>

                    {loading ? (
                        <Loader />
                    ) : !Array.isArray(orders) || orders.length === 0 ? (
                        <EmptyState
                            message="You haven't placed any orders yet."
                            actionText="Start Shopping"
                            actionUrl="/books"
                        />
                    ) : (
                        <div className="space-y-6">
                            {orders?.map((order) => (
                                <OrderCard key={order._id} order={order} />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default OrdersPage;
