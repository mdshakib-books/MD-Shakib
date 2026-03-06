import api from "../api/axios";

export const paymentService = {
    createPaymentIntent: async (orderId) => {
        const response = await api.post(`/payments/intent`, { orderId });
        return response.data.data;
    },
    verifyPayment: async (paymentData) => {
        const response = await api.post(`/payments/verify`, paymentData);
        return response.data.data;
    },
};
