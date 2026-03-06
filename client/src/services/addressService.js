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
};
