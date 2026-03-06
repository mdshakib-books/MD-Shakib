import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginUser } from "../redux/slices/authSlice";

const LoginPage = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);
    const navigate = useNavigate();
    const location = useLocation();

    const handleLogin = async (e) => {
        e.preventDefault();
        const result = await dispatch(loginUser({ email, password }));
        if (result.payload) {
            const from = location.state?.from?.pathname || "/";
            navigate(from, { replace: true });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
            <div className="max-w-md w-full bg-white p-8 rounded-lg shadow-sm">
                <div className="text-center mb-8">
                    <h2 className="text-3xl font-extrabold text-gray-900">
                        Sign in to your account
                    </h2>
                </div>
                {error && (
                    <div className="bg-red-50 text-red-500 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}
                <form className="space-y-6" onSubmit={handleLogin}>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Email address
                        </label>
                        <input
                            type="email"
                            required
                            className="mt-1 appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                className="mt-1 appearance-none rounded relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-gray-500 hover:text-gray-700 text-sm"
                            >
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </div>
                    </div>
                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                    >
                        {loading ? "Signing in..." : "Sign in"}
                    </button>
                </form>
                <div className="mt-6 space-y-4 text-center">
                    <p className="text-sm text-gray-600">
                        <Link
                            to="/forgot-password"
                            className="font-medium text-blue-600 hover:text-blue-500"
                        >
                            Forgot your password?
                        </Link>
                    </p>
                    <p className="text-sm text-gray-600">
                        Don't have an account?{" "}
                        <Link
                            to="/register"
                            className="font-medium text-blue-600 hover:text-blue-500"
                        >
                            Register here
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
