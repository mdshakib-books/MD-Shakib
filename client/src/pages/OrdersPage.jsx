import React, { useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import OrderCard from "../components/OrderCard";
import Loader from "../components/Loader";
import EmptyState from "../components/EmptyState";
import { useOrders } from "../hooks/useOrders";

const OrdersPage = () => {
    const { orders, loading, fetchOrders } = useOrders();

    useEffect(() => {
        fetchOrders();
        window.scrollTo(0, 0);
    }, []);

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