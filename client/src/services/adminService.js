import api from "../api/axios";

// ─── BOOKS ────────────────────────────────────────────────────────────────────

const getBooks = async (params = {}) => {
    const res = await api.get("/admin/books", { params });
    const data = res.data.data;
    return Array.isArray(data) ? data : (data?.items ?? []);
};

const getBookById = async (id) => {
    const res = await api.get(`/admin/books/${id}`);
    return res.data.data;
};

/**
 * @param {FormData} formData  — includes: title, author, description,
 *   category, price, stock, image (file)
 */
const createBook = async (formData) => {
    const res = await api.post("/admin/books", formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data;
};

const updateBook = async (id, formData) => {
    const res = await api.patch(`/admin/books/${id}`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
    });
    return res.data.data;
};

const deleteBook = async (id) => {
    const res = await api.delete(`/admin/books/${id}`);
    return res.data.data;
};

// ─── ORDERS ───────────────────────────────────────────────────────────────────

const getOrders = async (params = {}) => {
    const res = await api.get("/admin/orders", { params });
    const data = res.data.data;
    return Array.isArray(data) ? data : (data?.items ?? []);
};

const updateOrderStatus = async (id, status) => {
    const res = await api.patch(`/admin/orders/${id}/status`, { status });
    return res.data.data;
};

const cancelOrder = async (id, cancelReason = "") => {
    const res = await api.patch(`/admin/orders/${id}/cancel`, { cancelReason });
    return res.data.data;
};

const getOrderById = async (id) => {
    const res = await api.get(`/admin/orders/${id}`);
    return res.data.data;
};

const createShipment = async (id) => {
    const res = await api.post(`/admin/orders/${id}/shipment`);
    return res.data.data;
};

const approveReplacement = async (id) => {
    const res = await api.post(`/admin/orders/${id}/replacement/approve`);
    return res.data.data;
};

const rejectReplacement = async (id, reason) => {
    const res = await api.post(`/admin/orders/${id}/replacement/reject`, {
        reason,
    });
    return res.data.data;
};

// ─── USERS ────────────────────────────────────────────────────────────────────

const getUsers = async (params = {}) => {
    const res = await api.get("/admin/users", { params });
    const data = res.data.data;
    return Array.isArray(data) ? data : (data?.items ?? []);
};

const blockUser = async (id) => {
    const res = await api.patch(`/admin/users/${id}/block`);
    return res.data.data;
};

const unblockUser = async (id) => {
    const res = await api.patch(`/admin/users/${id}/unblock`);
    return res.data.data;
};

const deleteUser = async (id) => {
    const res = await api.delete(`/admin/users/${id}`);
    return res.data.data;
};

const getUserById = async (id) => {
    const res = await api.get(`/admin/users/${id}`);
    return res.data.data;
};

const setCoverImage = async (id, imageUrl) => {
    const res = await api.patch(`/admin/books/${id}/cover`, { imageUrl });
    return res.data.data;
};

const deleteBookImage = async (id, imageUrl) => {
    const res = await api.delete(`/admin/books/${id}/image`, {
        data: { imageUrl },
    });
    return res.data.data;
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

const getDashboardStats = async () => {
    const res = await api.get("/admin/dashboard/stats");
    return res.data.data;
};

export const adminService = {
    getBooks,
    getBookById,
    createBook,
    updateBook,
    deleteBook,
    setCoverImage,
    deleteBookImage,
    getOrders,
    getOrderById,
    updateOrderStatus,
    cancelOrder,
    createShipment,
    approveReplacement,
    rejectReplacement,
    getUsers,
    getUserById,
    blockUser,
    unblockUser,
    deleteUser,
    getDashboardStats,
};
