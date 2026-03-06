import { useState, useEffect } from "react";
import { authService } from "../services/authService";

export const useAuth = () => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const initAuth = async () => {
            try {
                const token = localStorage.getItem("token");
                if (token) {
                    const profile = await authService.getProfile();
                    setUser(profile);
                }
            } catch (err) {
                console.error("Failed to restore session", err);
            } finally {
                setLoading(false);
            }
        };
        initAuth();
    }, []);

    const login = async (credentials) => {
        const data = await authService.login(credentials);
        localStorage.setItem("token", data.token);
        setUser(data.user);
        return data;
    };

    const logout = () => {
        localStorage.removeItem("token");
        setUser(null);
    };

    return { user, loading, login, logout };
};
