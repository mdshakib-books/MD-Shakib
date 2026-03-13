import React from "react";
import { Link } from "react-router-dom";
import { formatPrice } from "../utils/formatPrice";

const OrderCard = ({ order }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case "Delivered":
                return "text-green-400";
            case "Shipped":
                return "text-yellow-400";
            case "Packed":
                return "text-blue-400";
            case "Cancelled":
                return "text-red-400";
            default:
                return "text-gray-400";
        }
    };

    const getPaymentColor = (status) => {
        switch (status) {
            case "Paid":
                return "text-green-400";
            case "Pending":
                return "text-yellow-400";
            case "Failed":
                return "text-red-400";
            case "Refunded":
                return "text-blue-400";
            default:
                return "text-gray-500";
        }
    };

    const firstItem = order.items?.[0];

    return (
        <Link
            to={`/orders/${order._id}`}
            className="block bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 hover:border-[var(--color-primary-gold)] transition"
        >
            <div className="flex items-center gap-5">
                {/* BOOK IMAGE */}
                {firstItem?.imageUrl && (
                    <img
                        src={firstItem.imageUrl}
                        alt={firstItem.title}
                        className="w-16 h-20 object-cover rounded"
                    />
                )}

                {/* ORDER INFO */}
                <div className="flex-grow">
                    <p className="font-medium">
                        {firstItem?.title || "Book"}
                    </p>

                    <p className="text-sm text-gray-400 mt-1">
                        Order #{order._id.slice(-6)}
                    </p>

                    <p className="text-sm text-gray-400">
                        {new Date(order.createdAt).toLocaleDateString()}
                    </p>

                    <p className="text-sm text-gray-500">
                        {order.items?.length || 0} items
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                        Method: {order.paymentMethod || "—"}
                    </p>
                </div>

                {/* RIGHT SIDE */}
                <div className="text-right">
                    <p className="font-semibold text-[var(--color-primary-gold)]">
                        {formatPrice(order.totalAmount)}
                    </p>

                    <p
                        className={`text-sm mt-1 font-medium ${getStatusColor(
                            order.orderStatus
                        )}`}
                    >
                        {order.orderStatus}
                    </p>
                    <p
                        className={`text-xs mt-1 font-medium ${getPaymentColor(
                            order.paymentStatus,
                        )}`}
                    >
                        {order.paymentStatus || "Pending"}
                    </p>
                </div>
            </div>
        </Link>
    );
};

export default OrderCard;
