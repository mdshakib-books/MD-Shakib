import { useEffect, useState } from "react";
import AdminLayout from "../components/admin/AdminLayout";
import { adminService } from "../services/adminService";
import { formatPrice } from "../utils/formatPrice";
import { useToast } from "../context/ToastContext";

const STATUS_OPTIONS = [
    "Pending",
    "Paid",
    "Packed",
    "Shipped",
    "Delivered",
    "Cancelled",
    "Returned",
];

const AdminOrdersPage = () => {
    const { addToast } = useToast();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusBusyId, setStatusBusyId] = useState(null);
    const [cancelBusyId, setCancelBusyId] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);

    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const data = await adminService.getOrders();
            setOrders(Array.isArray(data) ? data : []);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to load orders",
                "error",
            );
            setOrders([]);
        } finally {
            setLoading(false);
        }
    };

    const updateStatus = async (orderId, nextStatus) => {
        setStatusBusyId(orderId);
        try {
            const updated = await adminService.updateOrderStatus(
                orderId,
                nextStatus,
            );
            setOrders((prev) =>
                prev.map((order) => (order._id === orderId ? updated : order)),
            );
            addToast("Order status updated", "success");
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to update status",
                "error",
            );
        } finally {
            setStatusBusyId(null);
        }
    };

    const cancelOrder = async (orderId) => {
        setCancelBusyId(orderId);
        try {
            const updated = await adminService.cancelOrder(orderId);
            setOrders((prev) =>
                prev.map((order) => (order._id === orderId ? updated : order)),
            );
            addToast("Order cancelled", "info");
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to cancel order",
                "error",
            );
        } finally {
            setCancelBusyId(null);
        }
    };

    const openOrderDetails = async (orderId) => {
        try {
            const order = await adminService.getOrderById(orderId);
            setSelectedOrder(order);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to load order details",
                "error",
            );
        }
    };

    return (
        <AdminLayout>
            <h1 className="text-3xl font-semibold mb-8">Manage Orders</h1>

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400">
                        <tr>
                            <th className="px-6 py-4 text-left">Order ID</th>
                            <th className="px-6 py-4 text-left">Customer Name</th>
                            <th className="px-6 py-4 text-left">Customer Email</th>
                            <th className="px-6 py-4 text-left">Date</th>
                            <th className="px-6 py-4 text-left">Order Status</th>
                            <th className="px-6 py-4 text-left">Payment Status</th>
                            <th className="px-6 py-4 text-left">Total Amount</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {loading ? (
                            <tr>
                                <td
                                    colSpan="8"
                                    className="text-center py-16 text-gray-500"
                                >
                                    Loading orders...
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td
                                    colSpan="8"
                                    className="text-center py-16 text-gray-500"
                                >
                                    No orders found
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => (
                                <tr
                                    key={order._id}
                                    className="border-b border-[#1f1f1f] last:border-0"
                                >
                                    <td className="px-6 py-4 font-mono text-xs text-gray-300 max-w-[140px] truncate">
                                        {order._id}
                                    </td>
                                    <td className="px-6 py-4 text-gray-200">
                                        {order.userId?.name || "-"}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {order.userId?.email || "-"}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {new Date(
                                            order.createdAt,
                                        ).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4 text-gray-200">
                                        {order.orderStatus}
                                    </td>
                                    <td className="px-6 py-4 text-gray-300">
                                        {order.paymentStatus}
                                    </td>
                                    <td className="px-6 py-4 text-[var(--color-primary-gold)] font-semibold">
                                        {formatPrice(order.totalAmount || 0)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-end items-center gap-2">
                                            <button
                                                onClick={() =>
                                                    openOrderDetails(order._id)
                                                }
                                                className="px-2.5 py-1.5 rounded border border-[#2A2A2A] text-xs text-gray-300 hover:border-[var(--color-primary-gold)] hover:text-[var(--color-primary-gold)] transition"
                                            >
                                                View
                                            </button>
                                            <select
                                                value={order.orderStatus}
                                                disabled={
                                                    statusBusyId === order._id
                                                }
                                                onChange={(e) =>
                                                    updateStatus(
                                                        order._id,
                                                        e.target.value,
                                                    )
                                                }
                                                className="bg-[#0B0B0B] border border-[#2A2A2A] rounded px-2 py-1.5 text-xs text-white"
                                            >
                                                {STATUS_OPTIONS.map(
                                                    (status) => (
                                                        <option
                                                            key={status}
                                                            value={status}
                                                        >
                                                            {status}
                                                        </option>
                                                    ),
                                                )}
                                            </select>
                                            <button
                                                onClick={() =>
                                                    cancelOrder(order._id)
                                                }
                                                disabled={
                                                    cancelBusyId === order._id
                                                }
                                                className="px-2.5 py-1.5 rounded border border-red-600 text-xs text-red-400 hover:bg-red-700 hover:text-white transition disabled:opacity-50"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {selectedOrder && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-2xl bg-[#111111] border border-[#2A2A2A] rounded-xl p-5 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-[var(--color-primary-gold)]">
                                Order Details
                            </h2>
                            <button
                                onClick={() => setSelectedOrder(null)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-1 text-sm text-gray-300 mb-4">
                            <p>
                                <span className="text-gray-400">Order ID:</span>{" "}
                                {selectedOrder._id}
                            </p>
                            <p>
                                <span className="text-gray-400">Customer:</span>{" "}
                                {selectedOrder.userId?.name || "-"} (
                                {selectedOrder.userId?.email || "-"})
                            </p>
                            <p>
                                <span className="text-gray-400">Status:</span>{" "}
                                {selectedOrder.orderStatus} /{" "}
                                {selectedOrder.paymentStatus}
                            </p>
                        </div>
                        <div className="space-y-3">
                            {(selectedOrder.items || []).map((item) => (
                                <div
                                    key={item.bookId}
                                    className="flex justify-between border border-[#2A2A2A] rounded-lg p-3"
                                >
                                    <div>
                                        <p className="text-white text-sm">
                                            {item.title}
                                        </p>
                                        <p className="text-xs text-gray-400">
                                            Qty: {item.quantity}
                                        </p>
                                    </div>
                                    <p className="text-[var(--color-primary-gold)] font-semibold">
                                        {formatPrice(
                                            item.price * item.quantity,
                                        )}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AdminOrdersPage;
