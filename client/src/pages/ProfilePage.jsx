import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
    FiUser,
    FiBox,
    FiMapPin,
    FiKey,
    FiLogOut,
    FiEdit,
    FiSave,
    FiX,
} from "react-icons/fi";
import { logoutUser, changePassword, setUser } from "../redux/slices/authSlice";
import { authService } from "../services/authService";
import { addressService } from "../services/addressService";
import LogoutModal from "../components/LogoutModal";
import { useToast } from "../context/ToastContext";
import { validateField, inputBorder } from "../utils/validators";

// ── Reusable input style ──────────────────────────────────────────────────────
const inputCls = (err) =>
    `w-full bg-[#0B0B0B] border rounded-lg px-4 py-3 text-sm text-white placeholder-gray-600 focus:outline-none transition ${
        err
            ? "border-red-600 focus:border-red-500"
            : "border-[#2A2A2A] focus:border-[var(--color-primary-gold)]"
    }`;

// ── Change Password Panel ─────────────────────────────────────────────────────
const ChangePasswordPanel = () => {
    const dispatch = useDispatch();
    const { showToast } = useToast();
    const { loading } = useSelector((s) => s.auth);

    const [form, setForm] = useState({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [showPw, setShowPw] = useState(false);
    const [errors, setErrors] = useState({});

    const validate = () => {
        const e = {};
        if (!form.oldPassword) e.oldPassword = "Required";
        if (!form.newPassword) e.newPassword = "Required";
        else if (form.newPassword.length < 6)
            e.newPassword = "Min 6 characters";
        if (!form.confirmPassword) e.confirmPassword = "Required";
        else if (form.newPassword !== form.confirmPassword)
            e.confirmPassword = "Passwords do not match";
        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;
        const result = await dispatch(
            changePassword({
                oldPassword: form.oldPassword,
                newPassword: form.newPassword,
            }),
        );
        if (!result.error) {
            showToast("Password changed successfully!", "success");
            setForm({ oldPassword: "", newPassword: "", confirmPassword: "" });
            setErrors({});
        } else {
            showToast(result.payload || "Failed to change password", "error");
        }
    };

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
            <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-6">
                Change Password
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4 max-w-md">
                {/* Old Password */}
                <div>
                    <label className="text-gray-400 text-sm mb-2 block">
                        Current Password
                    </label>
                    <div className="relative">
                        <input
                            type={showPw ? "text" : "password"}
                            value={form.oldPassword}
                            onChange={(e) =>
                                setForm({
                                    ...form,
                                    oldPassword: e.target.value,
                                })
                            }
                            placeholder="Enter current password"
                            className={inputCls(errors.oldPassword) + " pr-16"}
                        />
                        <button
                            type="button"
                            onClick={() => setShowPw(!showPw)}
                            className="absolute right-3 top-3 text-xs text-gray-500 hover:text-[var(--color-primary-gold)] transition"
                        >
                            {showPw ? "Hide" : "Show"}
                        </button>
                    </div>
                    {errors.oldPassword && (
                        <p className="text-red-500 text-xs mt-1">
                            {errors.oldPassword}
                        </p>
                    )}
                </div>

                {/* New Password */}
                <div>
                    <label className="text-gray-400 text-sm mb-2 block">
                        New Password
                    </label>
                    <input
                        type={showPw ? "text" : "password"}
                        value={form.newPassword}
                        onChange={(e) =>
                            setForm({ ...form, newPassword: e.target.value })
                        }
                        placeholder="At least 6 characters"
                        className={inputCls(errors.newPassword)}
                    />
                    {errors.newPassword && (
                        <p className="text-red-500 text-xs mt-1">
                            {errors.newPassword}
                        </p>
                    )}
                </div>

                {/* Confirm Password */}
                <div>
                    <label className="text-gray-400 text-sm mb-2 block">
                        Confirm New Password
                    </label>
                    <input
                        type={showPw ? "text" : "password"}
                        value={form.confirmPassword}
                        onChange={(e) =>
                            setForm({
                                ...form,
                                confirmPassword: e.target.value,
                            })
                        }
                        placeholder="Repeat new password"
                        className={inputCls(errors.confirmPassword)}
                    />
                    {errors.confirmPassword && (
                        <p className="text-red-500 text-xs mt-1">
                            {errors.confirmPassword}
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={loading}
                    className="flex items-center gap-2 bg-[var(--color-primary-gold)] hover:bg-[var(--color-accent-gold)] text-black font-semibold px-6 py-2.5 rounded-lg transition disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {loading ? (
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
                    ) : (
                        <FiKey />
                    )}
                    {loading ? "Updating..." : "Update Password"}
                </button>
            </form>
        </div>
    );
};

// ── Profile Panel ─────────────────────────────────────────────────────────────
const ProfilePanel = ({ user, dispatch, navigate }) => {
    const { showToast } = useToast();
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: user?.name || "",
        phone: user?.phone || "",
    });
    const [profileErrors, setProfileErrors] = useState({});
    const [defaultAddress, setDefaultAddress] = useState(null);
    const [addrLoading, setAddrLoading] = useState(true);

    useEffect(() => {
        addressService
            .getAddresses()
            .then((list) => {
                setDefaultAddress(
                    list.find((a) => a.isDefault) || list[0] || null,
                );
            })
            .catch(() => {})
            .finally(() => setAddrLoading(false));
    }, []);

    const handleSave = async () => {
        const e = {};
        const nameErr = validateField("name", form.name);
        if (nameErr) e.name = nameErr;
        if (form.phone && form.phone.trim()) {
            const phoneErr = validateField("phone", form.phone);
            if (phoneErr) e.phone = phoneErr;
        }
        if (Object.keys(e).length) {
            setProfileErrors(e);
            return;
        }
        setProfileErrors({});

        setSaving(true);
        try {
            const updated = await authService.updateProfile({
                name: form.name,
                phone: form.phone,
            });
            dispatch(setUser(updated));
            localStorage.setItem("user", JSON.stringify(updated));
            showToast("Profile updated successfully!", "success");
            setEditing(false);
        } catch (err) {
            showToast(
                err?.response?.data?.message || "Failed to update profile",
                "error",
            );
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setForm({ name: user?.name || "", phone: user?.phone || "" });
        setProfileErrors({});
        setEditing(false);
    };

    return (
        <div className="space-y-6">
            {/* Personal Information */}
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="font-heading text-lg text-[var(--color-primary-gold)]">
                        Personal Information
                    </h3>
                    {!editing ? (
                        <button
                            onClick={() => setEditing(true)}
                            className="flex items-center gap-2 text-sm text-gray-300 hover:text-white transition"
                        >
                            <FiEdit /> Edit
                        </button>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="flex items-center gap-2 text-sm bg-[var(--color-primary-gold)] text-black px-4 py-1.5 rounded-lg font-semibold disabled:opacity-50"
                            >
                                {saving ? (
                                    <svg
                                        className="animate-spin w-3.5 h-3.5"
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
                                ) : (
                                    <FiSave />
                                )}
                                {saving ? "Saving..." : "Save"}
                            </button>
                            <button
                                onClick={handleCancel}
                                className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition"
                            >
                                <FiX /> Cancel
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                    {/* Name */}
                    <div>
                        <label className="text-gray-400 text-sm">
                            Full Name
                        </label>
                        {editing ? (
                            <>
                                <input
                                    value={form.name}
                                    onChange={(e) => {
                                        setForm({
                                            ...form,
                                            name: e.target.value,
                                        });
                                        if (profileErrors.name)
                                            setProfileErrors((p) => ({
                                                ...p,
                                                name: "",
                                            }));
                                    }}
                                    className={`mt-1 w-full bg-[#0B0B0B] border rounded-lg p-2 text-sm outline-none transition ${inputBorder(profileErrors.name)}`}
                                />
                                {profileErrors.name && (
                                    <p className="text-red-400 text-xs mt-1">
                                        {profileErrors.name}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="mt-1">{user?.name}</p>
                        )}
                    </div>

                    {/* Email — always readonly */}
                    <div>
                        <label className="text-gray-400 text-sm">Email</label>
                        <p className="mt-1 text-gray-300">{user?.email}</p>
                    </div>

                    {/* Phone */}
                    <div>
                        <label className="text-gray-400 text-sm">Phone</label>
                        {editing ? (
                            <>
                                <input
                                    value={form.phone}
                                    onChange={(e) => {
                                        setForm({
                                            ...form,
                                            phone: e.target.value,
                                        });
                                        if (profileErrors.phone)
                                            setProfileErrors((p) => ({
                                                ...p,
                                                phone: "",
                                            }));
                                    }}
                                    maxLength={10}
                                    className={`mt-1 w-full bg-[#0B0B0B] border rounded-lg p-2 text-sm outline-none transition ${inputBorder(profileErrors.phone)}`}
                                />
                                {profileErrors.phone && (
                                    <p className="text-red-400 text-xs mt-1">
                                        {profileErrors.phone}
                                    </p>
                                )}
                            </>
                        ) : (
                            <p className="mt-1">
                                {user?.phone || "Not provided"}
                            </p>
                        )}
                    </div>

                    {/* Account Type */}
                    <div>
                        <label className="text-gray-400 text-sm">
                            Account Type
                        </label>
                        <p className="mt-1 capitalize">
                            {user?.role || "User"}
                        </p>
                    </div>
                </div>
            </div>

            {/* Default Address */}
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-heading text-lg text-[var(--color-primary-gold)]">
                        Default Address
                    </h3>
                    <button
                        onClick={() => navigate("/addresses")}
                        className="text-sm text-gray-400 hover:text-white transition"
                    >
                        Manage →
                    </button>
                </div>

                {addrLoading ? (
                    <div className="h-8 w-32 bg-[#1a1a1a] animate-pulse rounded" />
                ) : defaultAddress ? (
                    <div className="border border-[#2A2A2A] rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-2">
                            <span className="text-xs bg-[#1a1a1a] px-2 py-1 rounded uppercase tracking-wide">
                                Home
                            </span>
                            <span className="text-green-400 text-xs">
                                ✓ Default
                            </span>
                        </div>
                        <p className="font-semibold">
                            {defaultAddress.fullName}
                        </p>
                        <p className="text-gray-400 text-sm mt-1 leading-relaxed">
                            {defaultAddress.houseNo}, {defaultAddress.area}
                            <br />
                            {defaultAddress.city}, {defaultAddress.state} –{" "}
                            {defaultAddress.pincode}
                        </p>
                        <p className="text-gray-400 text-sm mt-1">
                            📞 {defaultAddress.phone}
                        </p>
                    </div>
                ) : (
                    <div className="text-center py-6 text-gray-500 text-sm">
                        No address saved.{" "}
                        <button
                            onClick={() => navigate("/addresses")}
                            className="text-[var(--color-primary-gold)] hover:underline"
                        >
                            + Add one
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ── Main Page ─────────────────────────────────────────────────────────────────
const ProfilePage = () => {
    const user = useSelector((state) => state.auth.user);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [activePanel, setActivePanel] = useState("profile");
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    const handleLogoutConfirm = () => {
        dispatch(logoutUser());
        navigate("/login");
    };

    const sidebarItems = [
        { id: "profile", icon: <FiUser />, label: "Personal Information" },
        {
            id: "orders",
            icon: <FiBox />,
            label: "My Orders",
            navigate: "/orders",
        },
        {
            id: "addresses",
            icon: <FiMapPin />,
            label: "My Addresses",
            navigate: "/addresses",
        },
        { id: "change-password", icon: <FiKey />, label: "Change Password" },
    ];

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />
            <main className="flex-grow py-10 px-4 md:px-6">
                <div className="max-w-[1200px] mx-auto">
                    <h1 className="font-heading text-3xl text-[var(--color-primary-gold)] mb-8">
                        My Account
                    </h1>

                    <div className="grid md:grid-cols-[280px_1fr] gap-8">
                        {/* ── SIDEBAR ──────────────────────────────────────── */}
                        <div className="hidden md:block bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 self-start">
                            {/* Avatar */}
                            <div className="flex flex-col items-center mb-8">
                                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-[#C9A24A] to-[#E5C87B] flex items-center justify-center text-black text-2xl font-bold">
                                    {user?.name?.charAt(0)}
                                </div>
                                <h2 className="mt-4 font-semibold text-lg">
                                    {user?.name}
                                </h2>
                                <p className="text-gray-400 text-sm">
                                    {user?.email}
                                </p>
                            </div>

                            {/* Menu */}
                            <div className="space-y-1">
                                {sidebarItems.map((item) => (
                                    <button
                                        key={item.id}
                                        onClick={() =>
                                            item.navigate
                                                ? navigate(item.navigate)
                                                : setActivePanel(item.id)
                                        }
                                        className={`flex items-center gap-3 w-full p-3 rounded-lg transition text-sm ${
                                            activePanel === item.id
                                                ? "bg-[#1a1a1a] text-[var(--color-primary-gold)]"
                                                : "hover:bg-[#1a1a1a] text-gray-300"
                                        }`}
                                    >
                                        <span className="text-base">
                                            {item.icon}
                                        </span>
                                        {item.label}
                                    </button>
                                ))}

                                {/* Logout */}
                                <button
                                    onClick={() => setShowLogoutModal(true)}
                                    className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-[#1a1a1a] text-red-400 transition text-sm"
                                >
                                    <FiLogOut className="text-base" />
                                    Logout
                                </button>
                            </div>
                        </div>

                        {/* ── RIGHT PANEL ───────────────────────────────────── */}
                        <div>
                            {/* Mobile quick-nav */}
                            <div className="grid grid-cols-2 gap-4 md:hidden mb-6">
                                {[
                                    {
                                        label: "My Orders",
                                        emoji: "📦",
                                        path: "/orders",
                                    },
                                    {
                                        label: "Addresses",
                                        emoji: "🏠",
                                        path: "/addresses",
                                    },
                                ].map((item) => (
                                    <button
                                        key={item.path}
                                        onClick={() => navigate(item.path)}
                                        className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center gap-2"
                                    >
                                        <span className="text-2xl">
                                            {item.emoji}
                                        </span>
                                        <span className="text-sm">
                                            {item.label}
                                        </span>
                                    </button>
                                ))}
                                <button
                                    onClick={() => setActivePanel("profile")}
                                    className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center gap-2"
                                >
                                    <span className="text-2xl">👤</span>
                                    <span className="text-sm">
                                        Personal Info
                                    </span>
                                </button>
                                <button
                                    onClick={() =>
                                        setActivePanel("change-password")
                                    }
                                    className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center gap-2"
                                >
                                    <span className="text-2xl">🔑</span>
                                    <span className="text-sm">
                                        Change Password
                                    </span>
                                </button>
                            </div>

                            {/* Dynamic Panel */}
                            {activePanel === "profile" && (
                                <ProfilePanel
                                    user={user}
                                    dispatch={dispatch}
                                    navigate={navigate}
                                />
                            )}
                            {activePanel === "change-password" && (
                                <ChangePasswordPanel />
                            )}
                        </div>
                    </div>
                </div>

                {/* Mobile Logout */}
                <div className="md:hidden mt-10">
                    <button
                        onClick={() => setShowLogoutModal(true)}
                        className="w-full bg-[#111111] border border-[#2A2A2A] text-red-400 py-3 rounded-lg"
                    >
                        Logout
                    </button>
                </div>
            </main>

            <Footer />

            <LogoutModal
                isOpen={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                onConfirm={handleLogoutConfirm}
            />
        </div>
    );
};

export default ProfilePage;
