import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { resetPasswordOtp } from "../redux/slices/authSlice";

const ResetPasswordPage = () => {
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState({});

    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);
    const navigate = useNavigate();

    const email = sessionStorage.getItem("otp_email") || "";

    // Guard: no email → go back to start
    useEffect(() => {
        if (!email) navigate("/forgot-password");
    }, [email, navigate]);

    const validate = () => {
        const newErrors = {};
        if (!password) newErrors.password = "Password is required";
        else if (password.length < 6)
            newErrors.password = "Must be at least 6 characters";
        if (!confirmPassword)
            newErrors.confirmPassword = "Please confirm your password";
        else if (password !== confirmPassword)
            newErrors.confirmPassword = "Passwords do not match";
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        const result = await dispatch(
            resetPasswordOtp({ email, newPassword: password }),
        );
        if (!result.error) {
            // Clear sessionStorage
            sessionStorage.removeItem("otp_email");
            navigate("/");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] px-4 py-12">
            <div className="w-full max-w-md">
                {/* Brand */}
                <div className="text-center mb-8">
                    <h1 className="font-heading text-2xl text-[var(--color-primary-gold)] tracking-widest mb-2">
                        MD SHAKIB BOOKS
                    </h1>
                    <h2 className="text-white text-xl font-semibold">
                        Set New Password
                    </h2>
                    <p className="text-gray-500 text-sm mt-2">
                        Choose a strong password for your account
                    </p>
                </div>

                {/* Card */}
                <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-8">
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-[#0B0B0B] border border-[#2A2A2A] flex items-center justify-center text-3xl">
                            🔑
                        </div>
                    </div>

                    {/* API error */}
                    {error && (
                        <div className="mb-4 px-4 py-3 bg-red-950/50 border border-red-800/50 text-red-400 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* New Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                New Password
                            </label>
                            <div className="relative">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    value={password}
                                    onChange={(e) =>
                                        setPassword(e.target.value)
                                    }
                                    placeholder="At least 6 characters"
                                    className={`w-full bg-[#0B0B0B] border text-white placeholder-gray-600 rounded-lg px-4 py-3 text-sm focus:outline-none transition pr-16 ${
                                        errors.password
                                            ? "border-red-600"
                                            : "border-[#2A2A2A] focus:border-[var(--color-primary-gold)]"
                                    }`}
                                />
                                <button
                                    type="button"
                                    onClick={() =>
                                        setShowPassword(!showPassword)
                                    }
                                    className="absolute right-3 top-3 text-xs text-gray-500 hover:text-[var(--color-primary-gold)] transition"
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

                        {/* Confirm Password */}
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Confirm Password
                            </label>
                            <input
                                type={showPassword ? "text" : "password"}
                                value={confirmPassword}
                                onChange={(e) =>
                                    setConfirmPassword(e.target.value)
                                }
                                placeholder="Repeat your password"
                                className={`w-full bg-[#0B0B0B] border text-white placeholder-gray-600 rounded-lg px-4 py-3 text-sm focus:outline-none transition ${
                                    errors.confirmPassword
                                        ? "border-red-600"
                                        : "border-[#2A2A2A] focus:border-[var(--color-primary-gold)]"
                                }`}
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
                            className="w-full flex items-center justify-center gap-2 bg-[var(--color-primary-gold)] hover:bg-[var(--color-accent-gold)] text-black font-semibold py-3 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? (
                                <>
                                    <svg
                                        className="animate-spin w-4 h-4"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                    >
                                        <circle
                                            className="opacity-25"
                                            cx="12"
                                            cy="12"
                                            r="10"
                                            stroke="currentColor"
                                            strokeWidth="4"
                                        />
                                        <path
                                            className="opacity-75"
                                            fill="currentColor"
                                            d="M4 12a8 8 0 018-8v8H4z"
                                        />
                                    </svg>
                                    Resetting...
                                </>
                            ) : (
                                "Reset Password"
                            )}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
