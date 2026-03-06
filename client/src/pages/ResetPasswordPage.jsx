import React, { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { resetPassword as resetPasswordAction } from "../redux/slices/authSlice";

const ResetPasswordPage = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get("token");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState({});
    const [resetSuccess, setResetSuccess] = useState(false);
    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);
    const navigate = useNavigate();

    const validateForm = () => {
        const newErrors = {};

        if (!password) {
            newErrors.password = "Password is required";
        } else if (password.length < 8) {
            newErrors.password = "Password must be at least 8 characters";
        }

        if (!confirmPassword) {
            newErrors.confirmPassword = "Please confirm your password";
        } else if (password !== confirmPassword) {
            newErrors.confirmPassword = "Passwords do not match";
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!token) {
            setErrors({
                token: "Invalid reset link. Please request a new one.",
            });
            return;
        }

        if (!validateForm()) {
            return;
        }

        const result = await dispatch(
            resetPasswordAction({ token, newPassword: password }),
        );

        if (result.payload && !result.payload.error) {
            setResetSuccess(true);
        }
    };

    if (resetSuccess) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
                <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm">
                    <div className="text-center mb-6">
                        <div className="text-5xl mb-4">✅</div>
                        <h1 className="text-2xl font-bold text-green-600 mb-2">
                            Password Reset Successful
                        </h1>
                        <p className="text-gray-600 text-sm">
                            Your password has been successfully changed. You can
                            now log in with your new password.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate("/login")}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm font-medium"
                    >
                        Go to Login
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12 sm:px-6 lg:px-8">
            <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-extrabold text-gray-900">
                        Set New Password
                    </h2>
                    <p className="text-gray-600 text-sm mt-2">
                        Enter your new password below
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-500 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                {errors.token && (
                    <div className="bg-red-50 text-red-500 p-3 rounded mb-4 text-sm">
                        {errors.token}
                    </div>
                )}

                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            New Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className={`w-full px-3 py-2 border rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm ${
                                    errors.password
                                        ? "border-red-500"
                                        : "border-gray-300"
                                }`}
                                placeholder="At least 8 characters"
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-2 text-gray-500 hover:text-gray-700 text-sm"
                            >
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </div>
                        {errors.password && (
                            <p className="text-red-500 text-xs mt-1">
                                {errors.password}
                            </p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Confirm Password
                        </label>
                        <input
                            type={showPassword ? "text" : "password"}
                            required
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            className={`w-full px-3 py-2 border rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm ${
                                errors.confirmPassword
                                    ? "border-red-500"
                                    : "border-gray-300"
                            }`}
                            placeholder="Confirm your password"
                        />
                        {errors.confirmPassword && (
                            <p className="text-red-500 text-xs mt-1">
                                {errors.confirmPassword}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {loading ? "Resetting..." : "Reset Password"}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
