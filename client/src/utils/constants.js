export const CONSTANTS = {
    API_URL:
        import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1",
    CURRENCY: "INR",
    ROLES: {
        USER: "user",
        ADMIN: "admin",
    },
};
