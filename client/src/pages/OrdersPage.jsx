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
        console.log("OrdersPage loaded. Fetching user orders...");
        fetchOrders();
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
                <h1 className="text-3xl font-bold mb-6">My Orders</h1>

                {loading ? (
                    <Loader />
                ) : !Array.isArray(orders) || orders.length === 0 ? (
                    <EmptyState
                        message="You haven't placed any orders yet."
                        actionText="Start Shopping"
                        actionUrl="/books"
                    />
                ) : (
                    <div className="space-y-4">
                        {orders?.map((order) => (
                            <OrderCard key={order._id} order={order} />
                        ))}
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default OrdersPage;
