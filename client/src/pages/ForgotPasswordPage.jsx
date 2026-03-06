import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { forgotPassword } from "../redux/slices/authSlice";

const ForgotPasswordPage = () => {
    const [email, setEmail] = useState("");
    const [resetSent, setResetSent] = useState(false);
    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        const result = await dispatch(forgotPassword(email));
        if (!result.payload?.error) {
            setResetSent(true);
        }
    };

    if (resetSent) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
                <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm">
                    <div className="text-center mb-6">
                        <div className="text-5xl mb-4">✅</div>
                        <h1 className="text-2xl font-bold text-green-600 mb-2">
                            Check Your Email
                        </h1>
                        <p className="text-gray-600 text-sm">
                            We've sent a password reset link to{" "}
                            <strong>{email}</strong>. The link will expire in 24
                            hours.
                        </p>
                    </div>
                    <p className="text-gray-500 text-sm text-center mb-4">
                        Didn't receive the email? Check your spam folder or try
                        again.
                    </p>
                    <button
                        onClick={() => navigate("/login")}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm font-medium"
                    >
                        Back to Login
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
                        Reset Your Password
                    </h2>
                    <p className="text-gray-600 text-sm mt-2">
                        Enter your email address and we'll send you a link to
                        reset your password.
                    </p>
                </div>

                {error && (
                    <div className="bg-red-50 text-red-500 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form className="space-y-6" onSubmit={handleSubmit}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                            Email Address
                        </label>
                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-blue-500 focus:border-blue-500 text-sm"
                            placeholder="you@example.com"
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition text-sm font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                        {loading ? "Sending..." : "Send Reset Link"}
                    </button>
                </form>

                <div className="text-center mt-6">
                    <p className="text-gray-600 text-sm">
                        Remember your password?{" "}
                        <Link
                            to="/login"
                            className="text-blue-600 hover:underline font-medium"
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
