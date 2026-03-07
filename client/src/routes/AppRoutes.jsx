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
import AdminAddBookPage from "../pages/AdminAddBookPage";
import AdminOrdersPage from "../pages/AdminOrdersPage";
import NotFoundPage from "../pages/NotFoundPage";
import AboutPage from "../pages/AboutPage";
import SupportPage from "../pages/SupportPage";
import AdminUsersPage from "../pages/AdminUsersPage";
import AdminProfilePage from "../pages/AdminProfilePage";
import OrderSuccessPage from "../pages/OrderSuccessPage";

const AppRoutes = () => {
    return (
        <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/books" element={<BooksPage />} />
            <Route path="/books/:id" element={<BookDetailsPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/support" element={<SupportPage />} />

            {/* Auth */}
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/cart" element={<CartPage />} />

            {/* User Protected Routes */}
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
            <Route
                path="/order-success"
                element={
                    <ProtectedRoute>
                        <OrderSuccessPage />
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
                path="/admin/books/add"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminAddBookPage />
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
            <Route
                path="/admin/users"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminUsersPage />
                    </ProtectedRoute>
                }
            />
            <Route
                path="/admin/profile"
                element={
                    <ProtectedRoute requireAdmin>
                        <AdminProfilePage />
                    </ProtectedRoute>
                }
            />

            <Route path="*" element={<NotFoundPage />} />
        </Routes>
    );
};

export default AppRoutes;
