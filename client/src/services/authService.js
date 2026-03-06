import api from "../api/axios";

export const authService = {
    register: async (userData) => {
        const response = await api.post("/users/register", userData);
        return response.data;
    },

    login: async (credentials) => {
        const response = await api.post("/users/login", credentials);
        const { accessToken, refreshToken, user } = response.data.data;

        localStorage.setItem("token", accessToken);
        localStorage.setItem("refreshToken", refreshToken);
        localStorage.setItem("user", JSON.stringify(user));

        return response.data;
    },

    logout: async () => {
        try {
            await api.post("/users/logout");
        } catch (error) {
            console.error("Logout error:", error);
        } finally {
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
        }
    },

    getProfile: async () => {
        const response = await api.get("/users/profile");
        return response.data.data;
    },

    updateProfile: async (data) => {
        const response = await api.patch("/users/profile", data);
        return response.data.data;
    },

    changePassword: async (oldPassword, newPassword) => {
        const response = await api.patch("/users/change-password", {
            oldPassword,
            newPassword,
        });
        return response.data;
    },

    forgotPassword: async (email) => {
        const response = await api.post("/users/forgot-password", { email });
        return response.data;
    },

    resetPassword: async (token, newPassword) => {
        const response = await api.post("/users/reset-password", {
            token,
            newPassword,
        });
        return response.data;
    },

    refreshToken: async (refreshToken) => {
        const response = await api.post("/users/refresh-token", {
            refreshToken,
        });
        return response.data.data;
    },
};
