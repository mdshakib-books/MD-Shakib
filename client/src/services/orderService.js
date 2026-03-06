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
    createOrder: async (orderData) => {
        const response = await api.post("/orders", orderData);
        return response.data.data;
    },
};
