import api from "../api/axios";

export const orderService = {
    getOrders: async () => {
        const response = await api.get("/orders");
        return response.data.data.items || response.data.data;
    },

    getOrderById: async (id) => {
        const response = await api.get(`/orders/${id}`);
        return response.data.data;
    },

    /**
     * Create an order.
     * @param {object} payload
     * @param {string} payload.addressId  - MongoDB _id of selected address
     * @param {string} payload.paymentMethod - "COD" | "Online"
     * @param {string} payload.idempotencyKey - unique UUID per submit attempt
     */
    createOrder: async ({ addressId, paymentMethod, idempotencyKey }) => {
        const response = await api.post("/orders", {
            addressId,
            paymentMethod,
            idempotencyKey,
        });
        return response.data.data;
    },

    requestReplacement: async (id, reason) => {
        const response = await api.post(`/orders/${id}/replacement`, { reason });
        return response.data.data;
    },
};
