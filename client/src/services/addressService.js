import api from "../api/axios";

export const addressService = {
    getAddresses: async () => {
        const response = await api.get("/addresses");
        return response.data.data.items || response.data.data;
    },

    addAddress: async (addressData) => {
        const response = await api.post("/addresses", addressData);
        return response.data.data;
    },

    updateAddress: async (id, addressData) => {
        const response = await api.patch(`/addresses/${id}`, addressData);
        return response.data.data;
    },

    deleteAddress: async (id) => {
        const response = await api.delete(`/addresses/${id}`);
        return response.data;
    },

    setDefaultAddress: async (id) => {
        const response = await api.patch(`/addresses/${id}/default`);
        return response.data.data;
    },
};
