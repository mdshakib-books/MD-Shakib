import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useSelector } from "react-redux";
import Loader from "./Loader";

const ProtectedRoute = ({ children, requireAdmin = false }) => {
    const { user, loading, isAuthenticated } = useSelector(
        (state) => state.auth,
    );
    const location = useLocation();

    if (loading) {
        return <Loader fullScreen />;
    }

    if (!isAuthenticated || !user) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (requireAdmin && user.role !== "admin") {
        return <Navigate to="/" replace />;
    }

    return children;
};

export default ProtectedRoute;
