import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { loginUser } from "../redux/slices/authSlice";
import { validateField, inputBorder } from "../utils/validators";

const field_cls = (err) =>
    `mt-1 w-full bg-[#0B0B0B] border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none transition ${inputBorder(err)}`;

const LoginPage = () => {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState({});

    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);
    const navigate = useNavigate();
    const location = useLocation();

    const validate = () => {
        const e = {};
        const emailErr = validateField("email", email);
        if (emailErr) e.email = emailErr;
        if (!password || !password.trim()) e.password = "Password is required";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        const result = await dispatch(loginUser({ email, password }));
        if (loginUser.fulfilled.match(result)) {
            const user = result.payload;
            if (user?.role === "admin") {
                navigate("/admin/dashboard", { replace: true });
                return;
            }
            const from = location.state?.from?.pathname || "/";
            navigate(from, { replace: true });
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] px-4">
            <div className="w-full max-w-md bg-[#111111] border border-[#2A2A2A] rounded-xl p-8 shadow-xl">
                <div className="text-center mb-8">
                    <h2 className="font-heading text-3xl text-[var(--color-primary-gold)]">
                        Welcome Back
                    </h2>
                    <p className="text-gray-400 text-sm mt-2">
                        Sign in to continue
                    </p>
                </div>

                {/* API-level error */}
                {error && (
                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg mb-5 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleLogin} noValidate className="space-y-4">
                    {/* Email */}
                    <div>
                        <label className="text-sm text-gray-400">
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => {
                                setEmail(e.target.value);
                                if (errors.email)
                                    setErrors((p) => ({ ...p, email: "" }));
                            }}
                            placeholder="you@example.com"
                            className={field_cls(errors.email)}
                        />
                        {errors.email && (
                            <p className="text-red-400 text-xs mt-1">
                                {errors.email}
                            </p>
                        )}
                    </div>

                    {/* Password */}
                    <div>
                        <label className="text-sm text-gray-400">
                            Password
                        </label>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                value={password}
                                onChange={(e) => {
                                    setPassword(e.target.value);
                                    if (errors.password)
                                        setErrors((p) => ({
                                            ...p,
                                            password: "",
                                        }));
                                }}
                                placeholder="Enter your password"
                                className={
                                    field_cls(errors.password) + " pr-16"
                                }
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-3 text-gray-400 text-sm hover:text-white"
                            >
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </div>
                        {errors.password && (
                            <p className="text-red-400 text-xs mt-1">
                                {errors.password}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 rounded-lg font-semibold bg-[var(--color-primary-gold)] text-black hover:bg-[var(--color-accent-gold)] transition disabled:opacity-50 disabled:cursor-not-allowed mt-1"
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                <div className="mt-6 text-center text-sm text-gray-400 space-y-3">
                    <p>
                        <Link
                            to="/forgot-password"
                            className="hover:text-white transition"
                        >
                            Forgot Password?
                        </Link>
                    </p>
                    <p>
                        Don't have an account?{" "}
                        <Link
                            to="/verify-email"
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
