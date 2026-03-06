import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Loader from "../components/Loader";
import { orderService } from "../services/orderService";
import { formatPrice } from "../utils/formatPrice";

const OrderDetailsPage = () => {
    const { id } = useParams();
    const [order, setOrder] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchOrder = async () => {
            try {
                setLoading(true);
                console.log(`Fetching details for order ID: ${id}`);
                const data = await orderService.getOrderById(id);
                setOrder(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchOrder();
    }, [id]);

    if (loading)
        return (
            <>
                <Navbar />
                <Loader fullScreen />
                <Footer />
            </>
        );
    if (!order)
        return (
            <>
                <Navbar />
                <div className="py-20 text-center">Order not found</div>
                <Footer />
            </>
        );

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
                <Link
                    to="/orders"
                    className="text-blue-600 hover:underline mb-4 inline-block"
                >
                    &larr; Back to Orders
                </Link>
                <h1 className="text-3xl font-bold mb-6">Order Details</h1>

                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <div className="grid grid-cols-2 gap-4 mb-6">
                        <div>
                            <p className="text-sm text-gray-500">Order ID</p>
                            <p className="font-semibold">{order._id}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Date</p>
                            <p className="font-semibold">
                                {new Date(order.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">Status</p>
                            <p className="font-semibold">{order.status}</p>
                        </div>
                        <div>
                            <p className="text-sm text-gray-500">
                                Total Amount
                            </p>
                            <p className="font-semibold text-blue-600">
                                {formatPrice(order.totalAmount)}
                            </p>
                        </div>
                    </div>

                    <h3 className="font-bold text-lg border-b pb-2 mb-4">
                        Items
                    </h3>
                    <div className="space-y-4">
                        {order.items?.map((item, idx) => (
                            <div
                                key={idx}
                                className="flex justify-between items-center bg-gray-50 p-3 rounded"
                            >
                                <span className="font-medium">
                                    {item.product?.title || "Unknown Item"}{" "}
                                    <span className="text-gray-500 font-normal">
                                        x{item.quantity}
                                    </span>
                                </span>
                                <span>
                                    {formatPrice(item.price * item.quantity)}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default OrderDetailsPage;
