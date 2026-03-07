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
                const data = await orderService.getOrderById(id);
                setOrder(data.order);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };

        if (id) fetchOrder();
    }, [id]);

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
                <div className="py-20 text-center">Order not found</div>
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
                        className="text-gray-400 hover:text-white mb-6 inline-block"
                    >
                        ← Back to Orders
                    </Link>

                    <h1 className="font-heading text-3xl text-[var(--color-primary-gold)] mb-8">
                        Order Details
                    </h1>

                    {/* ORDER INFO */}

                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
                        <div className="grid md:grid-cols-4 gap-6 text-sm">
                            <div>
                                <p className="text-gray-400">Order ID</p>
                                <p className="font-medium">{order._id}</p>
                            </div>

                            <div>
                                <p className="text-gray-400">Date</p>
                                <p className="font-medium">
                                    {new Date(
                                        order.createdAt,
                                    ).toLocaleDateString()}
                                </p>
                            </div>

                            <div>
                                <p className="text-gray-400">Payment</p>
                                <p className="font-medium">
                                    {order.paymentMethod}
                                </p>
                            </div>

                            <div>
                                <p className="text-gray-400">Status</p>
                                <p className="font-medium text-green-400">
                                    {order.orderStatus}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* ITEMS */}

                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
                        <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-6">
                            Items
                        </h3>

                        <div className="space-y-5">
                            {order.items?.map((item, idx) => (
                                <div
                                    key={idx}
                                    className="flex gap-5 items-center"
                                >
                                    <img
                                        src={item.imageUrl}
                                        className="w-16 h-20 object-cover rounded"
                                    />

                                    <div className="flex-grow">
                                        <p className="font-medium">
                                            {item.title}
                                        </p>

                                        <p className="text-sm text-gray-400">
                                            Quantity: {item.quantity}
                                        </p>
                                    </div>

                                    <p className="font-semibold text-[var(--color-primary-gold)]">
                                        {formatPrice(
                                            item.price * item.quantity,
                                        )}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* ADDRESS */}

                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                        <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-4">
                            Delivery Address
                        </h3>

                        <p className="font-medium">{order.address.fullName}</p>

                        <p className="text-gray-400 text-sm mt-1">
                            {order.address.houseNo}, {order.address.area}
                            <br />
                            {order.address.city}, {order.address.state} -{" "}
                            {order.address.pincode}
                        </p>

                        <p className="text-gray-400 text-sm mt-1">
                            📞 {order.address.phone}
                        </p>
                    </div>

                    {/* TOTAL */}

                    <div className="mt-6 text-right">
                        <p className="text-gray-400 text-sm">Total Amount</p>

                        <p className="text-2xl font-semibold text-[var(--color-primary-gold)]">
                            {formatPrice(order.totalAmount)}
                        </p>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default OrderDetailsPage;
