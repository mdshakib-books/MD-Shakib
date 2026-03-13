import api from "../api/axios";

export const paymentService = {
    createPaymentIntent: async ({ orderId, idempotencyKey }) => {
        const response = await api.post("/payments/create-intent", {
            orderId,
            idempotencyKey,
        });
        return response.data.data;
    },
    verifyPayment: async (paymentData) => {
        const response = await api.post(`/payments/verify`, paymentData);
        return response.data.data;
    },
    reportFailure: async (payload) => {
        const response = await api.post("/payments/failure", payload);
        return response.data.data;
    },
    retryPayment: async ({ orderId, idempotencyKey }) => {
        const response = await api.post("/payments/retry", {
            orderId,
            idempotencyKey,
        });
        return response.data.data;
    },
};
