import React from "react";
import { Routes, Route } from "react-router-dom";
import ProtectedRoute from "../components/ProtectedRoute";

// Pages
import HomePage from "../pages/HomePage";
import BooksPage from "../pages/BooksPage";
import BookDetailsPage from "../pages/BookDetailsPage";
import CartPage from "../pages/CartPage";
import CheckoutPage from "../pages/CheckoutPage";
import OrdersPage from "../pages/OrdersPage";
import OrderDetailsPage from "../pages/OrderDetailsPage";
import ProfilePage from "../pages/ProfilePage";
import AddressesPage from "../pages/AddressesPage";
import LoginPage from "../pages/LoginPage";
import RegisterPage from "../pages/RegisterPage";
import ForgotPasswordPage from "../pages/ForgotPasswordPage";
import ResetPasswordPage from "../pages/ResetPasswordPage";
import AdminDashboardPage from "../pages/AdminDashboardPage";
import AdminBooksPage from "../pages/AdminBooksPage";
import AdminOrdersPage from "../pages/AdminOrdersPage";
import NotFoundPage from "../pages/NotFoundPage";

const AppRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/:id" element={<BookDetailsPage />} />

            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />

            {/* User Protected Routes */}
            <Route
                path="/cart"
                element={
                    <ProtectedRoute>
                        <CartPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/checkout"
                element={
                    <ProtectedRoute>
                        <CheckoutPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/orders"
                element={
                    <ProtectedRoute>
                        <OrdersPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/orders/:id"
                element={
                    <ProtectedRoute>
                        <OrderDetailsPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/profile"
                element={
                    <ProtectedRoute>
                        <ProfilePage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/addresses"
                element={
                    <ProtectedRoute>
                        <AddressesPage />
                    </ProtectedRoute>
                }
            />

            {/* Admin Protected Routes */}
            <Route
                path="/admin"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminDashboardPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/books"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminBooksPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/orders"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminOrdersPage />
                    </ProtectedRoute>
                }
            />

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};

export default AppRoutes;
