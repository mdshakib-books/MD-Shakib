import { useEffect, useState } from "react";
import AdminLayout from "../components/admin/AdminLayout";
import AdminConfirmModal from "../components/admin/AdminConfirmModal";
import { adminService } from "../services/adminService";
import { formatPrice } from "../utils/formatPrice";
import { useToast } from "../context/ToastContext";

// Valid next statuses for each current status
const NEXT_STATUS = {
    Pending: ["Paid", "Cancelled"],
    Paid: ["Packed"],
    Packed: ["Shipped"],
    Shipped: ["Delivered"],
    Delivered: [],
    Cancelled: [],
    Returned: [],
};

const statusColor = (s) => {
    const map = {
        Pending: "text-yellow-400 bg-yellow-900/20",
        Paid: "text-blue-400 bg-blue-900/20",
        Packed: "text-purple-400 bg-purple-900/20",
        Shipped: "text-indigo-400 bg-indigo-900/20",
        Delivered: "text-green-400 bg-green-900/20",
        Cancelled: "text-red-400 bg-red-900/20",
        Returned: "text-pink-400 bg-pink-900/20",
    };
    return map[s] || "text-gray-400 bg-gray-700/20";
};

const AdminOrdersPage = () => {
    const { addToast } = useToast();
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusBusyId, setStatusBusyId] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null); // { orderId }
    const [cancelLoading, setCancelLoading] = useState(false);

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
                prev.map((o) => (o._id === orderId ? updated : o)),
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

    const confirmCancel = async (reason) => {
        if (!cancelTarget) return;
        setCancelLoading(true);
        try {
            const updated = await adminService.cancelOrder(
                cancelTarget.orderId,
                reason,
            );
            setOrders((prev) =>
                prev.map((o) => (o._id === cancelTarget.orderId ? updated : o)),
            );
            addToast("Order cancelled", "info");
            setCancelTarget(null);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to cancel order",
                "error",
            );
        } finally {
            setCancelLoading(false);
        }
    };

    const openOrderDetails = async (orderId) => {
        try {
            const order = await adminService.getOrderById(orderId);
            setSelectedOrder(order);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to load order",
                "error",
            );
        }
    };

    return (
        <AdminLayout>
            <h1 className="text-3xl font-semibold mb-8">Manage Orders</h1>

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="px-5 py-4 text-left">Order ID</th>
                            <th className="px-5 py-4 text-left">Customer</th>
                            <th className="px-5 py-4 text-left">Date</th>
                            <th className="px-5 py-4 text-left">Status</th>
                            <th className="px-5 py-4 text-left">Total</th>
                            <th className="px-5 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                        {loading ? (
                            <tr>
                                <td colSpan="6" className="text-center py-16">
                                    <div className="inline-block w-7 h-7 border-2 border-[var(--color-primary-gold)] border-t-transparent rounded-full animate-spin" />
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td
                                    colSpan="6"
                                    className="text-center py-16 text-gray-500"
                                >
                                    No orders found
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => {
                                const nextOptions =
                                    NEXT_STATUS[order.orderStatus] || [];
                                const isBusy = statusBusyId === order._id;
                                const canCancel = ![
                                    "Delivered",
                                    "Cancelled",
                                    "Returned",
                                ].includes(order.orderStatus);

                                return (
                                    <tr
                                        key={order._id}
                                        className="hover:bg-[#161616] transition"
                                    >
                                        <td className="px-5 py-3 font-mono text-xs text-gray-400 max-w-[130px] truncate">
                                            {order._id}
                                        </td>
                                        <td className="px-5 py-3">
                                            <p className="text-gray-200 text-sm">
                                                {order.userId?.name || "—"}
                                            </p>
                                            <p className="text-gray-500 text-xs">
                                                {order.userId?.email || ""}
                                            </p>
                                        </td>
                                        <td className="px-5 py-3 text-gray-400 text-xs">
                                            {new Date(
                                                order.createdAt,
                                            ).toLocaleDateString()}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor(order.orderStatus)}`}
                                            >
                                                {order.orderStatus}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-[var(--color-primary-gold)] font-semibold">
                                            {formatPrice(
                                                order.totalAmount || 0,
                                            )}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex justify-end items-center gap-2">
                                                {/* View */}
                                                <button
                                                    onClick={() =>
                                                        openOrderDetails(
                                                            order._id,
                                                        )
                                                    }
                                                    className="px-2.5 py-1.5 rounded border border-[#2A2A2A] text-xs text-gray-300 hover:border-[var(--color-primary-gold)] hover:text-[var(--color-primary-gold)] transition"
                                                >
                                                    View
                                                </button>

                                                {/* Status advance */}
                                                {nextOptions.filter(
                                                    (s) => s !== "Cancelled",
                                                ).length > 0 && (
                                                    <select
                                                        value=""
                                                        disabled={isBusy}
                                                        onChange={(e) =>
                                                            e.target.value &&
                                                            updateStatus(
                                                                order._id,
                                                                e.target.value,
                                                            )
                                                        }
                                                        className="bg-[#0B0B0B] border border-[#2A2A2A] rounded px-2 py-1.5 text-xs text-white disabled:opacity-50"
                                                    >
                                                        <option value="">
                                                            Update Status
                                                        </option>
                                                        {nextOptions
                                                            .filter(
                                                                (s) =>
                                                                    s !==
                                                                    "Cancelled",
                                                            )
                                                            .map((s) => (
                                                                <option
                                                                    key={s}
                                                                    value={s}
                                                                >
                                                                    {s}
                                                                </option>
                                                            ))}
                                                    </select>
                                                )}

                                                {/* Cancel */}
                                                {canCancel && (
                                                    <button
                                                        onClick={() =>
                                                            setCancelTarget({
                                                                orderId:
                                                                    order._id,
                                                            })
                                                        }
                                                        className="px-2.5 py-1.5 rounded border border-red-600 text-xs text-red-400 hover:bg-red-700 hover:text-white transition"
                                                    >
                                                        Cancel
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {/* Order Detail Modal */}
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
                                {selectedOrder.userId?.name} (
                                {selectedOrder.userId?.email})
                            </p>
                            <p>
                                <span className="text-gray-400">Status:</span>{" "}
                                {selectedOrder.orderStatus} /{" "}
                                {selectedOrder.paymentStatus}
                            </p>
                            {selectedOrder.cancelReason && (
                                <p>
                                    <span className="text-gray-400">
                                        Cancel Reason:
                                    </span>{" "}
                                    {selectedOrder.cancelReason}
                                </p>
                            )}
                        </div>
                        <div className="space-y-3 mb-4">
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
                        {/* Status history */}
                        {selectedOrder.statusHistory?.length > 0 && (
                            <div className="border-t border-[#2A2A2A] pt-4">
                                <p className="text-gray-400 text-xs mb-2 uppercase tracking-wide">
                                    Status History
                                </p>
                                <div className="space-y-1.5">
                                    {selectedOrder.statusHistory.map((h, i) => (
                                        <div
                                            key={i}
                                            className="flex justify-between text-xs"
                                        >
                                            <span className="text-gray-300">
                                                {h.status}
                                            </span>
                                            <span className="text-gray-500">
                                                {new Date(
                                                    h.timestamp,
                                                ).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            {cancelTarget && (
                <AdminConfirmModal
                    title="Cancel Order?"
                    message="This will cancel the order and restore book stock. A reason is required."
                    dangerous
                    requireReason
                    loading={cancelLoading}
                    onConfirm={confirmCancel}
                    onCancel={() => setCancelTarget(null)}
                />
            )}
        </AdminLayout>
    );
};

export default AdminOrdersPage;
