import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { registerUser, loginUser } from "../redux/slices/authSlice";
import { validateField, inputBorder } from "../utils/validators";

const field_cls = (err) =>
    `w-full bg-[#0B0B0B] border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none transition ${inputBorder(err)}`;

const RegisterPage = () => {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { loading, error } = useSelector((state) => state.auth);

    // Read pre-verified email from sessionStorage
    const verifiedEmail = sessionStorage.getItem("registeredEmail") || "";

    // Guard: if no verified email, redirect to email-verify page
    useEffect(() => {
        if (!verifiedEmail) {
            navigate("/verify-email", { replace: true });
        }
    }, [verifiedEmail, navigate]);

    const [formData, setFormData] = useState({
        name: "",
        email: verifiedEmail, // pre-filled
        password: "",
    });
    const [confirmPassword, setConfirmPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [errors, setErrors] = useState({});

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((p) => ({ ...p, [name]: value }));
        if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
    };

    const validate = () => {
        const e = {};
        const nameErr = validateField("name", formData.name);
        if (nameErr) e.name = nameErr;

        const pwErr = validateField("password", formData.password);
        if (pwErr) e.password = pwErr;

        if (!confirmPassword)
            e.confirmPassword = "Please confirm your password";
        else if (formData.password !== confirmPassword)
            e.confirmPassword = "Passwords do not match";

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        const registerResult = await dispatch(registerUser(formData));
        if (registerResult.error) return;

        // Clear verified email from session
        sessionStorage.removeItem("registeredEmail");

        const loginResult = await dispatch(
            loginUser({ email: formData.email, password: formData.password }),
        );
        if (loginResult.payload) navigate("/");
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

                {/* API-level error */}
                {error && (
                    <div className="bg-red-500/10 text-red-400 p-3 rounded-lg mb-5 text-sm">
                        {error}
                    </div>
                )}

                <form
                    onSubmit={handleRegister}
                    noValidate
                    className="space-y-4"
                >
                    {/* Full Name */}
                    <div>
                        <input
                            name="name"
                            placeholder="Full Name"
                            value={formData.name}
                            onChange={handleChange}
                            className={field_cls(errors.name)}
                        />
                        {errors.name && (
                            <p className="text-red-400 text-xs mt-1">
                                {errors.name}
                            </p>
                        )}
                    </div>

                    {/* Email — prefilled & readonly */}
                    <div>
                        <div className="relative">
                            <input
                                type="email"
                                name="email"
                                value={formData.email}
                                readOnly
                                className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2.5 text-sm text-gray-400 cursor-not-allowed opacity-80 focus:outline-none"
                            />
                            <span className="absolute right-3 top-2.5 text-green-400 text-xs flex items-center gap-1">
                                ✓ Verified
                            </span>
                        </div>
                        <p className="text-gray-600 text-xs mt-1">
                            Email verified — cannot be changed
                        </p>
                    </div>

                    {/* Password */}
                    <div>
                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                name="password"
                                placeholder="Password"
                                value={formData.password}
                                onChange={handleChange}
                                className={
                                    field_cls(errors.password) + " pr-16"
                                }
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-2.5 text-gray-400 text-sm hover:text-white"
                            >
                                {showPassword ? "Hide" : "Show"}
                            </button>
                        </div>
                        {errors.password && (
                            <p className="text-red-400 text-xs mt-1">
                                {errors.password}
                            </p>
                        )}
                        {!errors.password && formData.password && (
                            <p className="text-gray-600 text-xs mt-1">
                                Must include uppercase, lowercase, digit &
                                special character
                            </p>
                        )}
                    </div>

                    {/* Confirm Password */}
                    <div>
                        <input
                            type={showPassword ? "text" : "password"}
                            placeholder="Confirm Password"
                            value={confirmPassword}
                            onChange={(e) => {
                                setConfirmPassword(e.target.value);
                                if (errors.confirmPassword)
                                    setErrors((p) => ({
                                        ...p,
                                        confirmPassword: "",
                                    }));
                            }}
                            className={field_cls(errors.confirmPassword)}
                        />
                        {errors.confirmPassword && (
                            <p className="text-red-400 text-xs mt-1">
                                {errors.confirmPassword}
                            </p>
                        )}
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 rounded-lg font-semibold bg-[var(--color-primary-gold)] text-black hover:bg-[var(--color-accent-gold)] transition disabled:opacity-50 disabled:cursor-not-allowed mt-1"
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
