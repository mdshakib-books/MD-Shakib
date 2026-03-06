import React from "react";
import { Link } from "react-router-dom";
import { formatPrice } from "../utils/formatPrice";

const OrderCard = ({ order }) => {
    const getStatusColor = (status) => {
        switch (status) {
            case "Delivered":
                return "bg-green-100 text-green-800";
            case "Processing":
                return "bg-blue-100 text-blue-800";
            case "Shipped":
                return "bg-yellow-100 text-yellow-800";
            case "Cancelled":
                return "bg-red-100 text-red-800";
            default:
                return "bg-gray-100 text-gray-800";
        }
    };

    return (
        <div className="border rounded p-4 mb-4 bg-white shadow-sm">
            <div className="flex justify-between items-center mb-4 border-b pb-2">
                <div>
                    <span className="text-gray-500 text-sm">
                        Order ID: #{order._id.slice(-6)}
                    </span>
                    <p className="text-sm text-gray-400">
                        {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                </div>
                <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}
                >
                    {order.status}
                </span>
            </div>
            <div className="flex justify-between items-center">
                <div>
                    <p className="font-semibold">
                        Total: {formatPrice(order.totalAmount)}
                    </p>
                    <p className="text-sm text-gray-500">
                        {order.items?.length || 0} items
                    </p>
                </div>
                <Link
                    to={`/orders/${order._id}`}
                    className="text-blue-600 hover:underline text-sm font-medium"
                >
                    View Details
                </Link>
            </div>
        </div>
    );
};

export default OrderCard;
