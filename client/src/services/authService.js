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

    sendOtp: async (email) => {
        const response = await api.post("/users/send-otp", { email });
        return response.data;
    },

    verifyOtp: async (email, otp) => {
        const response = await api.post("/users/verify-otp", { email, otp });
        return response.data;
    },

    resetPasswordOtp: async (email, newPassword) => {
        const response = await api.post("/users/reset-password", {
            email,
            newPassword,
        });
        // Backend returns user + tokens for auto-login
        const { accessToken, refreshToken, user } = response.data.data;
        if (accessToken) {
            localStorage.setItem("token", accessToken);
            localStorage.setItem("refreshToken", refreshToken);
            localStorage.setItem("user", JSON.stringify(user));
        }
        return response.data;
    },

    refreshToken: async (refreshToken) => {
        const response = await api.post("/users/refresh-token", {
            refreshToken,
        });
        return response.data.data;
    },
};
