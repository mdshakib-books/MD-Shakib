import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/axios";

const VerifyRegistrationOTPPage = () => {
    const [otp, setOtp] = useState(Array(6).fill(""));
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [resending, setResending] = useState(false);
    const [resendCooldown, setResendCooldown] = useState(0);
    const inputRefs = useRef([]);
    const navigate = useNavigate();

    const email = sessionStorage.getItem("registeredEmail");

    // Guard: if no email in session, send back to verify-email
    useEffect(() => {
        if (!email) navigate("/verify-email", { replace: true });
    }, [email, navigate]);

    // Cooldown countdown
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const t = setTimeout(() => setResendCooldown((p) => p - 1), 1000);
        return () => clearTimeout(t);
    }, [resendCooldown]);

    const handleChange = (idx, val) => {
        if (!/^\d?$/.test(val)) return;
        const next = [...otp];
        next[idx] = val;
        setOtp(next);
        setError("");
        if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
    };

    const handleKeyDown = (idx, e) => {
        if (e.key === "Backspace" && !otp[idx] && idx > 0) {
            inputRefs.current[idx - 1]?.focus();
        }
    };

    const handlePaste = (e) => {
        const pasted = e.clipboardData
            .getData("text")
            .replace(/\D/g, "")
            .slice(0, 6);
        if (pasted.length === 6) {
            setOtp(pasted.split(""));
            inputRefs.current[5]?.focus();
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const code = otp.join("");
        if (code.length < 6) {
            setError("Enter the complete 6-digit OTP");
            return;
        }

        setLoading(true);
        setError("");
        try {
            await api.post("/users/verify-registration-otp", {
                email,
                otp: Number(code),
            });
            navigate("/register");
        } catch (err) {
            setError(err.response?.data?.message || "Invalid or expired OTP");
            setOtp(Array(6).fill(""));
            inputRefs.current[0]?.focus();
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async () => {
        if (resendCooldown > 0 || !email) return;
        setResending(true);
        setError("");
        try {
            await api.post("/users/send-registration-otp", { email });
            setResendCooldown(60);
            setOtp(Array(6).fill(""));
            inputRefs.current[0]?.focus();
        } catch (err) {
            setError(err.response?.data?.message || "Could not resend OTP");
        } finally {
            setResending(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] px-4">
            <div className="w-full max-w-md bg-[#111111] border border-[#2A2A2A] rounded-xl p-8 shadow-xl">
                {/* Header */}
                <div className="text-center mb-8">
                    <div className="w-14 h-14 bg-[#1a1a1a] border border-[#2A2A2A] rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="text-2xl">🔑</span>
                    </div>
                    <h2 className="font-heading text-3xl text-[var(--color-primary-gold)]">
                        Enter OTP
                    </h2>
                    <p className="text-gray-400 text-sm mt-2">
                        We sent a 6-digit code to
                    </p>
                    <p className="text-white font-medium text-sm mt-1">
                        {email}
                    </p>
                </div>

                {/* Error Banner */}
                {error && (
                    <div className="bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg mb-5 text-sm text-center">
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} noValidate>
                    {/* OTP Boxes */}
                    <div
                        className="flex gap-3 justify-center mb-6"
                        onPaste={handlePaste}
                    >
                        {otp.map((digit, idx) => (
                            <input
                                key={idx}
                                ref={(el) => (inputRefs.current[idx] = el)}
                                type="text"
                                inputMode="numeric"
                                maxLength={1}
                                value={digit}
                                onChange={(e) =>
                                    handleChange(idx, e.target.value)
                                }
                                onKeyDown={(e) => handleKeyDown(idx, e)}
                                className="w-12 h-14 text-center text-xl font-bold bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg text-white focus:outline-none focus:border-[var(--color-primary-gold)] transition"
                            />
                        ))}
                    </div>

                    {/* Submit */}
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
                                Verifying...
                            </>
                        ) : (
                            "Verify & Continue"
                        )}
                    </button>
                </form>

                {/* Resend */}
                <p className="mt-5 text-center text-sm text-gray-400">
                    Didn't receive it?{" "}
                    {resendCooldown > 0 ? (
                        <span className="text-gray-500">
                            Resend in {resendCooldown}s
                        </span>
                    ) : (
                        <button
                            onClick={handleResend}
                            disabled={resending}
                            className="text-[var(--color-primary-gold)] hover:underline disabled:opacity-50"
                        >
                            {resending ? "Sending..." : "Resend OTP"}
                        </button>
                    )}
                </p>

                <p className="mt-3 text-center text-sm text-gray-500">
                    Wrong email?{" "}
                    <button
                        onClick={() => navigate("/verify-email")}
                        className="text-gray-400 hover:text-white transition"
                    >
                        Go back
                    </button>
                </p>
            </div>
        </div>
    );
};

export default VerifyRegistrationOTPPage;
