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
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] px-4">
            <div className="w-full max-w-md bg-[#111111] border border-[#2A2A2A] rounded-xl p-8 shadow-xl">
                {/* TITLE */}

                <div className="text-center mb-8">
                    <h2 className="font-heading text-3xl text-[var(--color-primary-gold)]">
                        Welcome Back
                    </h2>

                    <p className="text-gray-400 text-sm mt-2">
                        Sign in to continue
                    </p>
                </div>

                {/* ERROR */}

                {error && (
                    <div className="bg-red-500/10 text-red-400 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} className="space-y-5">
                    {/* EMAIL */}

                    <div>
                        <label className="text-sm text-gray-400">
                            Email Address
                        </label>

                        <input
                            type="email"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="mt-1 w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary-gold)]"
                        />
                    </div>

                    {/* PASSWORD */}

                    <div>
                        <label className="text-sm text-gray-400">
                            Password
                        </label>

                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="mt-1 w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary-gold)]"
                            />

                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-2.5 text-gray-400 text-sm hover:text-white"
                            >
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </div>
                    </div>

                    {/* BUTTON */}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 rounded-lg font-semibold bg-[var(--color-primary-gold)] text-black hover:bg-[var(--color-accent-gold)] transition disabled:opacity-50"
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                {/* LINKS */}

                <div className="mt-6 text-center text-sm text-gray-400">
                    <p>
                        <Link
                            to="/forgot-password"
                            className="hover:text-white"
                        >
                            Forgot Password?
                        </Link>
                    </p>

                    <p className="mt-3">
                        Don't have an account?{" "}
                        <Link
                            to="/register"
                            className="text-[var(--color-primary-gold)] hover:underline"
                        >
                            Create one
                        </Link>
                    </p>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
