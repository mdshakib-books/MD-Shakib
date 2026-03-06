import React, { createContext, useContext, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchProfile } from "../redux/slices/authSlice";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const dispatch = useDispatch();
    const { user, isAuthenticated, loading } = useSelector(
        (state) => state.auth,
    );
    const token = localStorage.getItem("token");

    useEffect(() => {
        if (token && !user) {
            dispatch(fetchProfile());
        }
    }, [token, user, dispatch]);

    return (
        <AuthContext.Provider value={{ user, isAuthenticated, loading }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => useContext(AuthContext);

if (!useAuthContext) {
    throw new Error("useAuthContext must be used within AuthProvider");
}
