import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { validateField } from "../utils/validators";
import api from "../api/axios";

const EmailVerificationPage = () => {
    const [email, setEmail] = useState("");
    const [emailError, setEmailError] = useState("");
    const [loading, setLoading] = useState(false);
    const [apiError, setApiError] = useState("");
    const navigate = useNavigate();

    const validate = () => {
        const err = validateField("email", email);
        setEmailError(err || "");
        return !err;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setLoading(true);
        setApiError("");
        try {
            await api.post("/users/send-registration-otp", {
                email: email.trim().toLowerCase(),
            });
            sessionStorage.setItem(
                "registeredEmail",
                email.trim().toLowerCase(),
            );
            navigate("/verify-registration-otp");
        } catch (err) {
            const msg =
                err.response?.data?.message || "Failed to send OTP. Try again.";
            setApiError(msg);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] px-4">
            <div className="w-full max-w-md bg-[#111111] border border-[#2A2A2A] rounded-xl p-8 shadow-xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-[#1a1a1a] border border-[#2A2A2A] rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">✉️</span>
                    </div>
                    <h2 className="font-heading text-3xl text-[var(--color-primary-gold)]">
                        Verify Your Email
                    </h2>
                    <p className="text-gray-400 text-sm mt-2">
                        We'll send a 6-digit OTP to confirm your email before
                        registration
                    </p>
                </div>

                {/* API Error */}
                {apiError && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-5 text-sm">
                        {apiError}
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate className="space-y-4">
                    <div>
                        <label className="text-sm text-gray-400 mb-1 block">
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (emailError) setEmailError("");
                                if (apiError) setApiError("");
                            }}
                            placeholder="you@example.com"
                            className={`w-full bg-[#0B0B0B] border rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none transition ${
                                emailError
                                    ? "border-red-600 focus:border-red-500"
                                    : "border-[#2A2A2A] focus:border-[var(--color-primary-gold)]"
                            }`}
                        />
                        {emailError && (
                            <p className="text-red-400 text-xs mt-1">
                                {emailError}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex items-center justify-center gap-2 py-3 rounded-lg font-semibold bg-[var(--color-primary-gold)] text-black hover:bg-[var(--color-accent-gold)] transition disabled:opacity-50 disabled:cursor-not-allowed"
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

                <div className="mt-6 text-center text-sm text-gray-400">
                    Already have an account?{" "}
                    <Link
                        to="/login"
                        className="text-[var(--color-primary-gold)] hover:underline"
                    >
                        Sign in
                    </Link>
                </div>
            </div>
        </div>
    );
};

export default EmailVerificationPage;
