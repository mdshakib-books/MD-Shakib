import axios from "axios";

const api = axios.create({
    baseURL:
        import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1",
    withCredentials: true,
    headers: {
        "Content-Type": "application/json",
    },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

api.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem("token");
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error),
);

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                }).then((token) => {
                    originalRequest.headers.Authorization = `Bearer ${token}`;
                    return api(originalRequest);
                });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            const refreshToken = localStorage.getItem("refreshToken");
            if (!refreshToken) {
                localStorage.removeItem("token");
                localStorage.removeItem("refreshToken");
                localStorage.removeItem("user");
                window.location.href = "/login";
                return Promise.reject(error);
            }

            return api
                .post("/users/refresh-token", { refreshToken })
                .then((res) => {
                    const { accessToken, refreshToken: newRefreshToken } =
                        res.data.data;
                    localStorage.setItem("token", accessToken);
                    if (newRefreshToken) {
                        localStorage.setItem("refreshToken", newRefreshToken);
                    }
                    api.defaults.headers.common.Authorization = `Bearer ${accessToken}`;
                    originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                    processQueue(null, accessToken);
                    return api(originalRequest);
                })
                .catch((err) => {
                    processQueue(err, null);
                    localStorage.removeItem("token");
                    localStorage.removeItem("refreshToken");
                    localStorage.removeItem("user");
                    window.location.href = "/login";
                    return Promise.reject(err);
                })
                .finally(() => {
                    isRefreshing = false;
                });
        }

        if (error.response?.status === 403) {
            localStorage.removeItem("token");
            localStorage.removeItem("refreshToken");
            localStorage.removeItem("user");
            window.location.href = "/login";
        }

        return Promise.reject(error);
    },
);

export default api;
