import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { registerUser, loginUser } from "../redux/slices/authSlice";

const RegisterPage = () => {
    const [formData, setFormData] = useState({
        name: "",
        email: "",
        password: "",
    });

    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);

    const navigate = useNavigate();

    const handleRegister = async (e) => {
        e.preventDefault();

        if (formData.password !== confirmPassword) {
            alert("Passwords do not match");
            return;
        }

        const registerResult = await dispatch(registerUser(formData));

        if (registerResult.payload?.error) return;

        const loginResult = await dispatch(
            loginUser({
                email: formData.email,
                password: formData.password,
            }),
        );

        if (loginResult.payload) {
            navigate("/");
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-[#0B0B0B] px-4">
            <div className="w-full max-w-md bg-[#111111] border border-[#2A2A2A] rounded-xl p-8 shadow-xl">
                <div className="text-center mb-8">
                    <h2 className="font-heading text-3xl text-[var(--color-primary-gold)]">
                        Create Account
                    </h2>

                    <p className="text-gray-400 text-sm mt-2">
                        Join our Islamic book community
                    </p>
                </div>

                {error && (
                    <div className="bg-red-500/10 text-red-400 p-3 rounded mb-4 text-sm">
                        {error}
                    </div>
                )}

                <form onSubmit={handleRegister} className="space-y-5">
                    <input
                        placeholder="Full Name"
                        value={formData.name}
                        onChange={(e) =>
                            setFormData({ ...formData, name: e.target.value })
                        }
                        className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary-gold)]"
                    />

                    <input
                        type="email"
                        placeholder="Email Address"
                        value={formData.email}
                        onChange={(e) =>
                            setFormData({ ...formData, email: e.target.value })
                        }
                        className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary-gold)]"
                    />

                    <div className="relative">
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Password"
                            value={formData.password}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    password: e.target.value,
                                })
                            }
                            className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary-gold)]"
                        />

                        <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            className="absolute right-3 top-2.5 text-gray-400 text-sm"
                        >
                            {showPassword ? "Hide" : "Show"}
                        </button>
                    </div>

                    <input
                        type={showPassword ? "text" : "password"}
                        placeholder="Confirm Password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary-gold)]"
                    />

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 rounded-lg font-semibold bg-[var(--color-primary-gold)] text-black hover:bg-[var(--color-accent-gold)] transition disabled:opacity-50"
                    >
                        {loading ? "Creating..." : "Create Account"}
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

export default RegisterPage;
