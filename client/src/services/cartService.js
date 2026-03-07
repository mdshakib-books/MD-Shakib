import api from "../api/axios";

export const cartService = {
    getCart: async () => {
        const response = await api.get("/cart");
        return response.data.data;
    },

    addToCart: async (productId, quantity) => {
        const response = await api.post("/cart/add", {
            bookId: productId,
            quantity,
        });
        return response.data.data;
    },

    updateCartItem: async (bookId, quantity) => {
        const response = await api.patch(`/cart/update/${bookId}`, {
            quantity,
        });
        return response.data.data;
    },

    removeFromCart: async (productId) => {
        const response = await api.delete(`/cart/remove/${productId}`);
        return response.data.data;
    },

    mergeCart: async (guestCart) => {
        const response = await api.post("/cart/merge", { guestCart });
        return response.data.data;
    },
};
