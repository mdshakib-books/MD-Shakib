import { useCallback, useEffect, useState } from "react";
import AdminLayout from "../components/admin/AdminLayout";
import AdminConfirmModal from "../components/admin/AdminConfirmModal";
import { adminService } from "../services/adminService";
import { formatPrice } from "../utils/formatPrice";
import { useToast } from "../context/ToastContext";
import { useSocket } from "../hooks/useSocket";

const NEXT_STATUS = {
    Pending: ["Confirmed", "Cancelled"],
    Confirmed: ["Packed", "Cancelled"],
    Packed: ["Shipped", "Cancelled"],
    Shipped: ["Out for Delivery", "Cancelled"],
    "Out for Delivery": ["Delivered", "Cancelled"],
    Delivered: ["Replacement Requested"],
    Cancelled: [],
    Returned: [],
    "Replacement Requested": ["Replacement Approved", "Replacement Rejected"],
    "Replacement Approved": ["Replacement Shipped"],
    "Replacement Rejected": [],
    "Replacement Shipped": ["Replacement Delivered"],
    "Replacement Delivered": [],
};

const orderStatusBadge = (status) => {
    const map = {
        Pending: "text-yellow-400 bg-yellow-900/20",
        Confirmed: "text-blue-400 bg-blue-900/20",
        Packed: "text-purple-400 bg-purple-900/20",
        Shipped: "text-indigo-400 bg-indigo-900/20",
        "Out for Delivery": "text-orange-400 bg-orange-900/20",
        Delivered: "text-green-400 bg-green-900/20",
        Cancelled: "text-red-400 bg-red-900/20",
        "Replacement Requested": "text-yellow-500 bg-yellow-900/20",
        "Replacement Approved": "text-blue-500 bg-blue-900/20",
        "Replacement Rejected": "text-red-400 bg-red-900/20",
        "Replacement Shipped": "text-indigo-500 bg-indigo-900/20",
        "Replacement Delivered": "text-green-500 bg-green-900/20",
    };
    return map[status] || "text-gray-400 bg-gray-700/20";
};

const paymentStatusBadge = (status) => {
    const map = {
        Paid: "text-green-400 bg-green-900/20",
        Pending: "text-yellow-400 bg-yellow-900/20",
        Failed: "text-red-400 bg-red-900/20",
        Refunded: "text-blue-400 bg-blue-900/20",
    };
    return map[status] || "text-gray-400 bg-gray-700/20";
};

const isOnlineMethod = (method = "") =>
    String(method || "").toUpperCase() === "ONLINE" ||
    String(method || "") === "Online";

const AdminOrdersPage = () => {
    const { addToast } = useToast();
    const { socket, joinAdminRoom } = useSocket();

    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [statusBusyId, setStatusBusyId] = useState(null);
    const [selectedOrder, setSelectedOrder] = useState(null);
    const [cancelTarget, setCancelTarget] = useState(null);
    const [cancelLoading, setCancelLoading] = useState(false);
    const [replacementRejectTarget, setReplacementRejectTarget] = useState(null);
    const [replacementRejectLoading, setReplacementRejectLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState("");
    const [paymentStatusFilter, setPaymentStatusFilter] = useState("");
    const [paymentMethodFilter, setPaymentMethodFilter] = useState("");

    const fetchOrders = useCallback(async () => {
        setLoading(true);
        try {
            const data = await adminService.getOrders({
                limit: 100,
                ...(statusFilter ? { status: statusFilter } : {}),
                ...(paymentStatusFilter
                    ? { paymentStatus: paymentStatusFilter }
                    : {}),
                ...(paymentMethodFilter
                    ? { paymentMethod: paymentMethodFilter }
                    : {}),
            });
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
    }, [addToast, statusFilter, paymentMethodFilter, paymentStatusFilter]);

    useEffect(() => {
        fetchOrders();
    }, [fetchOrders]);

    useEffect(() => {
        const interval = setInterval(fetchOrders, 30000);
        return () => clearInterval(interval);
    }, [fetchOrders]);

    useEffect(() => {
        if (!socket) return;

        joinAdminRoom();

        const refresh = () => {
            fetchOrders();
            if (selectedOrder?._id) {
                adminService
                    .getOrderById(selectedOrder._id)
                    .then((order) => setSelectedOrder(order))
                    .catch(() => {});
            }
        };

        const events = [
            "orderCreated",
            "orderStatusUpdated",
            "paymentUpdated",
            "orderPaid",
            "paymentSuccess",
            "paymentFailed",
            "replacementUpdated",
        ];

        events.forEach((evt) => socket.on(evt, refresh));

        return () => {
            events.forEach((evt) => socket.off(evt, refresh));
        };
    }, [socket, joinAdminRoom, fetchOrders, selectedOrder?._id]);

    const updateStatus = async (orderId, nextStatus) => {
        setStatusBusyId(orderId);
        try {
            const updated = await adminService.updateOrderStatus(orderId, nextStatus);
            setOrders((prev) => prev.map((o) => (o._id === orderId ? updated : o)));
            if (selectedOrder?._id === orderId) {
                setSelectedOrder(updated);
            }
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

    const handleCreateShipment = async (orderId) => {
        setStatusBusyId(orderId);
        try {
            const updated = await adminService.createShipment(orderId);
            setOrders((prev) => prev.map((o) => (o._id === orderId ? updated : o)));
            if (selectedOrder?._id === orderId) {
                setSelectedOrder(updated);
            }
            addToast("Shipment created", "success");
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to create shipment",
                "error",
            );
        } finally {
            setStatusBusyId(null);
        }
    };

    const handleApproveReplacement = async (orderId) => {
        setStatusBusyId(orderId);
        try {
            const updated = await adminService.approveReplacement(orderId);
            setOrders((prev) => prev.map((o) => (o._id === orderId ? updated : o)));
            if (selectedOrder?._id === orderId) {
                setSelectedOrder(updated);
            }
            addToast("Replacement approved", "success");
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to approve replacement",
                "error",
            );
        } finally {
            setStatusBusyId(null);
        }
    };

    const confirmRejectReplacement = async (reason) => {
        if (!replacementRejectTarget) return;
        setReplacementRejectLoading(true);
        try {
            const updated = await adminService.rejectReplacement(
                replacementRejectTarget.orderId,
                reason,
            );
            setOrders((prev) =>
                prev.map((o) =>
                    o._id === replacementRejectTarget.orderId ? updated : o,
                ),
            );
            if (selectedOrder?._id === replacementRejectTarget.orderId) {
                setSelectedOrder(updated);
            }
            addToast("Replacement rejected", "info");
            setReplacementRejectTarget(null);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to reject replacement",
                "error",
            );
        } finally {
            setReplacementRejectLoading(false);
        }
    };

    const confirmCancel = async (reason) => {
        if (!cancelTarget) return;
        setCancelLoading(true);
        try {
            const updated = await adminService.cancelOrder(cancelTarget.orderId, reason);
            setOrders((prev) =>
                prev.map((o) => (o._id === cancelTarget.orderId ? updated : o)),
            );
            if (selectedOrder?._id === cancelTarget.orderId) {
                setSelectedOrder(updated);
            }
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
            addToast(err.response?.data?.message || "Failed to load order", "error");
        }
    };

    return (
        <AdminLayout>
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
                <h1 className="text-3xl font-semibold">Manage Orders</h1>
                <div className="flex flex-wrap gap-2">
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="bg-[#111111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-gray-200"
                    >
                        <option value="">All Order Status</option>
                        {Object.keys(NEXT_STATUS).map((status) => (
                            <option key={status} value={status}>
                                {status}
                            </option>
                        ))}
                    </select>
                    <select
                        value={paymentStatusFilter}
                        onChange={(e) => setPaymentStatusFilter(e.target.value)}
                        className="bg-[#111111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-gray-200"
                    >
                        <option value="">All Payment Status</option>
                        <option value="Pending">Pending</option>
                        <option value="Paid">Paid</option>
                        <option value="Failed">Failed</option>
                        <option value="Refunded">Refunded</option>
                    </select>
                    <select
                        value={paymentMethodFilter}
                        onChange={(e) => setPaymentMethodFilter(e.target.value)}
                        className="bg-[#111111] border border-[#2A2A2A] rounded-lg px-3 py-2 text-xs text-gray-200"
                    >
                        <option value="">All Payment Methods</option>
                        <option value="COD">COD</option>
                        <option value="ONLINE">ONLINE</option>
                    </select>
                </div>
            </div>

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-x-auto">
                <table className="w-full min-w-[1250px] text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="px-5 py-4 text-left">Order ID</th>
                            <th className="px-5 py-4 text-left">Customer</th>
                            <th className="px-5 py-4 text-left">Date</th>
                            <th className="px-5 py-4 text-left">Order Status</th>
                            <th className="px-5 py-4 text-left">Payment Status</th>
                            <th className="px-5 py-4 text-left">Method</th>
                            <th className="px-5 py-4 text-left">Razorpay ID</th>
                            <th className="px-5 py-4 text-left">Total</th>
                            <th className="px-5 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                        {loading ? (
                            <tr>
                                <td colSpan="9" className="text-center py-16">
                                    <div className="inline-block w-7 h-7 border-2 border-[var(--color-primary-gold)] border-t-transparent rounded-full animate-spin" />
                                </td>
                            </tr>
                        ) : orders.length === 0 ? (
                            <tr>
                                <td colSpan="9" className="text-center py-16 text-gray-500">
                                    No orders found
                                </td>
                            </tr>
                        ) : (
                            orders.map((order) => {
                                const nextOptions = NEXT_STATUS[order.orderStatus] || [];
                                const isBusy = statusBusyId === order._id;
                                const canCancel = ![
                                    "Delivered",
                                    "Cancelled",
                                    "Replacement Shipped",
                                    "Replacement Delivered",
                                ].includes(order.orderStatus);

                                return (
                                    <tr key={order._id} className="hover:bg-[#161616] transition">
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
                                            {new Date(order.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={`text-xs px-2 py-1 rounded-full font-medium ${orderStatusBadge(order.orderStatus)}`}
                                            >
                                                {order.orderStatus}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3">
                                            <span
                                                className={`text-xs px-2 py-1 rounded-full font-medium ${paymentStatusBadge(order.paymentStatus)}`}
                                            >
                                                {order.paymentStatus || "Pending"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-gray-300 text-xs">
                                            {order.paymentMethod || "—"}
                                        </td>
                                        <td className="px-5 py-3 font-mono text-[11px] text-gray-400">
                                            {order.razorpayPaymentId ||
                                                (isOnlineMethod(order.paymentMethod)
                                                    ? "Awaiting payment"
                                                    : "—")}
                                        </td>
                                        <td className="px-5 py-3 text-[var(--color-primary-gold)] font-semibold">
                                            {formatPrice(order.totalAmount || 0)}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex justify-end items-center gap-2 flex-wrap">
                                                <button
                                                    onClick={() => openOrderDetails(order._id)}
                                                    className="px-2.5 py-1.5 rounded border border-[#2A2A2A] text-xs text-gray-300 hover:border-[var(--color-primary-gold)] hover:text-[var(--color-primary-gold)] transition"
                                                >
                                                    View
                                                </button>

                                                {nextOptions.filter(
                                                    (s) =>
                                                        s !== "Cancelled" &&
                                                        s !== "Replacement Rejected",
                                                ).length > 0 && (
                                                    <select
                                                        value=""
                                                        disabled={isBusy}
                                                        onChange={(e) =>
                                                            e.target.value &&
                                                            updateStatus(order._id, e.target.value)
                                                        }
                                                        className="bg-[#0B0B0B] border border-[#2A2A2A] rounded px-2 py-1.5 text-xs text-white disabled:opacity-50"
                                                    >
                                                        <option value="">Update Status</option>
                                                        {nextOptions
                                                            .filter(
                                                                (s) =>
                                                                    s !== "Cancelled" &&
                                                                    s !==
                                                                        "Replacement Rejected",
                                                            )
                                                            .map((s) => (
                                                                <option key={s} value={s}>
                                                                    {s}
                                                                </option>
                                                            ))}
                                                    </select>
                                                )}

                                                {["Confirmed", "Packed"].includes(order.orderStatus) && (
                                                    <button
                                                        onClick={() => handleCreateShipment(order._id)}
                                                        disabled={isBusy}
                                                        className="px-2.5 py-1.5 rounded bg-indigo-600/20 border border-indigo-500/50 text-xs text-indigo-300 hover:bg-indigo-600/40 transition disabled:opacity-50"
                                                    >
                                                        Ship
                                                    </button>
                                                )}

                                                {order.orderStatus === "Replacement Requested" && (
                                                    <button
                                                        onClick={() => handleApproveReplacement(order._id)}
                                                        disabled={isBusy}
                                                        className="px-2.5 py-1.5 rounded bg-blue-600/20 border border-blue-500/50 text-xs text-blue-300 hover:bg-blue-600/40 transition disabled:opacity-50"
                                                    >
                                                        Approve
                                                    </button>
                                                )}

                                                {order.orderStatus === "Replacement Requested" && (
                                                    <button
                                                        onClick={() =>
                                                            setReplacementRejectTarget({
                                                                orderId: order._id,
                                                            })
                                                        }
                                                        disabled={isBusy}
                                                        className="px-2.5 py-1.5 rounded border border-red-600 text-xs text-red-400 hover:bg-red-700 hover:text-white transition disabled:opacity-50"
                                                    >
                                                        Reject
                                                    </button>
                                                )}

                                                {canCancel && (
                                                    <button
                                                        onClick={() =>
                                                            setCancelTarget({
                                                                orderId: order._id,
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
                        <div className="space-y-2 text-sm text-gray-300 mb-4">
                            <p>
                                <span className="text-gray-400">Order ID:</span>{" "}
                                {selectedOrder._id}
                            </p>
                            <p>
                                <span className="text-gray-400">Customer:</span>{" "}
                                {selectedOrder.userId?.name} ({selectedOrder.userId?.email})
                            </p>
                            <p className="flex items-center gap-2">
                                <span className="text-gray-400">Order Status:</span>
                                <span
                                    className={`text-xs px-2 py-1 rounded-full font-medium ${orderStatusBadge(selectedOrder.orderStatus)}`}
                                >
                                    {selectedOrder.orderStatus}
                                </span>
                            </p>
                            <p className="flex items-center gap-2">
                                <span className="text-gray-400">Payment Status:</span>
                                <span
                                    className={`text-xs px-2 py-1 rounded-full font-medium ${paymentStatusBadge(selectedOrder.paymentStatus)}`}
                                >
                                    {selectedOrder.paymentStatus}
                                </span>
                                <span className="text-xs text-gray-400">
                                    ({selectedOrder.paymentMethod})
                                </span>
                            </p>
                            {isOnlineMethod(selectedOrder.paymentMethod) && (
                                <>
                                    <p>
                                        <span className="text-gray-400">Razorpay Order ID:</span>{" "}
                                        <span className="font-mono text-xs">
                                            {selectedOrder.razorpayOrderId || "—"}
                                        </span>
                                    </p>
                                    <p>
                                        <span className="text-gray-400">Razorpay Payment ID:</span>{" "}
                                        <span className="font-mono text-xs">
                                            {selectedOrder.razorpayPaymentId || "—"}
                                        </span>
                                    </p>
                                </>
                            )}
                            {selectedOrder.cancelReason && (
                                <p>
                                    <span className="text-gray-400">Cancel Reason:</span>{" "}
                                    {selectedOrder.cancelReason}
                                </p>
                            )}
                            {selectedOrder.shipping?.trackingUrl && (
                                <p>
                                    <span className="text-gray-400">Tracking:</span>{" "}
                                    <a
                                        href={selectedOrder.shipping.trackingUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="text-blue-400 hover:underline"
                                    >
                                        {selectedOrder.shipping.awb} ↗
                                    </a>
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
                                        <p className="text-white text-sm">{item.title}</p>
                                        <p className="text-xs text-gray-400">Qty: {item.quantity}</p>
                                    </div>
                                    <p className="text-[var(--color-primary-gold)] font-semibold">
                                        {formatPrice(item.price * item.quantity)}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {selectedOrder.statusHistory?.length > 0 && (
                            <div className="border-t border-[#2A2A2A] pt-4">
                                <p className="text-gray-400 text-xs mb-2 uppercase tracking-wide">
                                    Status History
                                </p>
                                <div className="space-y-1.5">
                                    {selectedOrder.statusHistory.map((h, i) => (
                                        <div key={i} className="flex justify-between text-xs gap-3">
                                            <span className="text-gray-300">{h.status}</span>
                                            <span className="text-gray-500 text-right">
                                                {new Date(h.timestamp).toLocaleString()}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {cancelTarget && (
                <AdminConfirmModal
                    title="Cancel Order?"
                    message="This will cancel the order and restore stock. A reason is required."
                    dangerous
                    requireReason
                    loading={cancelLoading}
                    onConfirm={confirmCancel}
                    onCancel={() => setCancelTarget(null)}
                />
            )}

            {replacementRejectTarget && (
                <AdminConfirmModal
                    title="Reject Replacement?"
                    message="Please provide a reason. This reason will be visible in order history."
                    dangerous
                    requireReason
                    loading={replacementRejectLoading}
                    onConfirm={confirmRejectReplacement}
                    onCancel={() => setReplacementRejectTarget(null)}
                />
            )}
        </AdminLayout>
    );
};

export default AdminOrdersPage;
