import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { verifyOtp } from "../redux/slices/authSlice";

const VerifyOTPPage = () => {
    const [otp, setOtp] = useState(["", "", "", "", "", ""]);
    const [localError, setLocalError] = useState("");
    const inputRefs = useRef([]);
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);

    // Read email set by ForgotPasswordPage
    const email = sessionStorage.getItem("otp_email") || "";

    // Guard: if no email in session, redirect back
    useEffect(() => {
        if (!email) navigate("/forgot-password");
    }, [email, navigate]);

    // ── OTP input handlers ───────────────────────────────────────────────────
    const handleChange = (index, value) => {
        if (!/^\d*$/.test(value)) return; // digits only
        const newOtp = [...otp];
        newOtp[index] = value.slice(-1);
        setOtp(newOtp);
        if (value && index < 5) inputRefs.current[index + 1]?.focus();
    };

    const handleKeyDown = (index, e) => {
        if (e.key === "Backspace" && !otp[index] && index > 0) {
            inputRefs.current[index - 1]?.focus();
        }
    };

    const handlePaste = (e) => {
        e.preventDefault();
        const pasted = e.clipboardData
            .getData("text")
            .replace(/\D/g, "")
            .slice(0, 6);
        const newOtp = [...otp];
        pasted.split("").forEach((char, i) => {
            newOtp[i] = char;
        });
        setOtp(newOtp);
        inputRefs.current[Math.min(pasted.length, 5)]?.focus();
    };

    // ── Submit ────────────────────────────────────────────────────────────────
    const handleSubmit = async (e) => {
        e.preventDefault();
        setLocalError("");
        const otpValue = otp.join("");
        if (otpValue.length < 6) {
            setLocalError("Please enter all 6 digits.");
            return;
        }

        const result = await dispatch(
            verifyOtp({ email, otp: Number(otpValue) }),
        );
        if (!result.error) {
            navigate("/reset-password");
        }
    };

    const displayError = localError || error;

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] px-4 py-12">
            <div className="w-full max-w-md">
                {/* Brand */}
                <div className="text-center mb-8">
                    <h1 className="font-heading text-2xl text-[var(--color-primary-gold)] tracking-widest mb-2">
                        MD SHAKIB BOOKS
                    </h1>
                    <h2 className="text-white text-xl font-semibold">
                        Enter OTP
                    </h2>
                    <p className="text-gray-500 text-sm mt-2">
                        We sent a 6-digit code to{" "}
                        <span className="text-gray-300 font-medium">
                            {email}
                        </span>
                    </p>
                </div>

                {/* Card */}
                <div className="bg-[#111111] border border-[#2A2A2A] rounded-2xl p-8">
                    <div className="flex justify-center mb-6">
                        <div className="w-16 h-16 rounded-full bg-[#0B0B0B] border border-[#2A2A2A] flex items-center justify-center text-3xl">
                            📩
                        </div>
                    </div>

                    {/* Error */}
                    {displayError && (
                        <div className="mb-4 px-4 py-3 bg-red-950/50 border border-red-800/50 text-red-400 rounded-lg text-sm text-center">
                            {displayError}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">
                        {/* 6-box OTP input */}
                        <div
                            className="flex gap-3 justify-center"
                            onPaste={handlePaste}
                        >
                            {otp.map((digit, index) => (
                                <input
                                    key={index}
                                    ref={(el) =>
                                        (inputRefs.current[index] = el)
                                    }
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={digit}
                                    onChange={(e) =>
                                        handleChange(index, e.target.value)
                                    }
                                    onKeyDown={(e) => handleKeyDown(index, e)}
                                    className={`w-12 h-14 text-center text-xl font-bold bg-[#0B0B0B] border-2 rounded-lg text-white transition focus:outline-none ${
                                        digit
                                            ? "border-[var(--color-primary-gold)] text-[var(--color-primary-gold)]"
                                            : "border-[#2A2A2A] focus:border-[var(--color-primary-gold)]"
                                    }`}
                                />
                            ))}
                        </div>

                        <p className="text-center text-xs text-gray-600">
                            OTP is valid for{" "}
                            <span className="text-[var(--color-primary-gold)]">
                                5 minutes
                            </span>
                        </p>

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
                                    Verifying...
                                </>
                            ) : (
                                "Verify OTP"
                            )}
                        </button>
                    </form>

                    {/* Resend */}
                    <p className="text-center text-sm text-gray-500 mt-6">
                        Didn't receive it?{" "}
                        <button
                            onClick={() => navigate("/forgot-password")}
                            className="text-[var(--color-primary-gold)] hover:underline font-medium"
                        >
                            Resend OTP
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default VerifyOTPPage;
