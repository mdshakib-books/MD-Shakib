import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { sendOtp } from "../redux/slices/authSlice";

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState("");
    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const result = await dispatch(sendOtp(email));
        if (!result.error) {
            // Store email in sessionStorage for the next step
            sessionStorage.setItem("otp_email", email);
            navigate("/verify-otp");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] px-4 py-12">
            <div className="w-full max-w-md">
                {/* Logo / Brand */}
                <div className="text-center mb-8">
                    <h1 className="font-heading text-2xl text-[var(--color-primary-gold)] tracking-widest mb-2">
                        MD SHAKIB BOOKS
                    </h1>
                    <h2 className="text-white text-xl font-semibold">
                        Forgot Password
                    </h2>
                    <p className="text-gray-500 text-sm mt-2">
                        Enter your registered email to receive a 6-digit OTP
                    </p>
                </div>

                {/* Card */}
                <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-8">
                    {/* Lock icon */}
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-[#0B0B0B] border border-[#2A2A2A] flex items-center justify-center text-3xl">
                            🔐
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div className="mb-4 px-4 py-3 bg-red-950/50 border border-red-800/50 text-red-400 rounded-lg text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-5">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-2">
                                Email Address
                            </label>
                            <input
                                type="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] text-white placeholder-gray-600 rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-[var(--color-primary-gold)] transition"
                            />
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
                                    Sending OTP...
                                </>
                            ) : (
                                "Send OTP"
                            )}
                        </button>
                    </form>

                    <p className="text-center text-sm text-gray-500 mt-6">
                        Remember your password?{" "}
                        <Link
                            to="/login"
                            className="text-[var(--color-primary-gold)] hover:underline font-medium"
                        >
                            Sign In
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default ForgotPasswordPage;
