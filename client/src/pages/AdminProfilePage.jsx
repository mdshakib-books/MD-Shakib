import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
    FiUser,
    FiMail,
    FiPhone,
    FiShield,
    FiEdit,
    FiSave,
    FiX,
    FiKey,
    FiLogOut,
    FiChevronDown,
    FiChevronUp,
} from "react-icons/fi";
import { logoutUser, changePassword, setUser } from "../redux/slices/authSlice";
import { authService } from "../services/authService";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/admin/AdminLayout";
import { useToast } from "../context/ToastContext";
import {
    validateField,
    inputBorder,
    validatePasswordMatch,
} from "../utils/validators";

// ── inline spinner ─────────────────────────────────────────────────────────────
const Spinner = () => (
    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
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
);

const inputCls = (err) =>
    `w-full bg-[#0B0B0B] border rounded-lg px-4 py-2.5 text-sm text-white placeholder-gray-600 focus:outline-none transition ${
        err
            ? "border-red-600 focus:border-red-500"
            : "border-[#2A2A2A] focus:border-[var(--color-primary-gold)]"
    }`;

const AdminProfilePage = () => {
    const user = useSelector((state) => state.auth.user);
    const { loading } = useSelector((s) => s.auth);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { addToast } = useToast();

    // ── Profile edit state ─────────────────────────────────────────────────────
    const [editing, setEditing] = useState(false);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState({
        name: user?.name || "",
        phone: user?.phone || "",
    });
    const [profileErrors, setProfileErrors] = useState({});

    // ── Change password state ─────────────────────────────────────────────────
    const [showCpw, setShowCpw] = useState(false);
    const [showPw, setShowPw] = useState(false);
    const [cpwForm, setCpwForm] = useState({
        oldPassword: "",
        newPassword: "",
        confirmPassword: "",
    });
    const [cpwErrors, setCpwErrors] = useState({});
    const [changingPassword, setChangingPassword] = useState(false);

    // ── Profile handlers ───────────────────────────────────────────────────────
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
            addToast("Profile updated successfully!", "success");
            setEditing(false);
        } catch (err) {
            addToast(
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

    // ── Change password handlers ───────────────────────────────────────────────
    const validateCpw = () => {
        const e = {};
        if (!cpwForm.oldPassword) e.oldPassword = "Required";
        const passwordErr = validateField("password", cpwForm.newPassword);
        if (passwordErr) e.newPassword = passwordErr;

        const confirmErr = validatePasswordMatch(
            cpwForm.newPassword,
            cpwForm.confirmPassword,
        );
        if (confirmErr) e.confirmPassword = confirmErr;

        setCpwErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (loading || changingPassword) return;
        if (!validateCpw()) return;

        setChangingPassword(true);
        try {
            const result = await dispatch(
                changePassword({
                    oldPassword: cpwForm.oldPassword,
                    newPassword: cpwForm.newPassword,
                }),
            );
            if (!result.error) {
                addToast("Password changed successfully", "success");
                setCpwForm({
                    oldPassword: "",
                    newPassword: "",
                    confirmPassword: "",
                });
                setCpwErrors({});
                setShowCpw(false);
            } else {
                addToast(
                    result.payload || "Failed to change password",
                    "error",
                );
            }
        } finally {
            setChangingPassword(false);
        }
    };

    const handleLogout = async () => {
        await dispatch(logoutUser());
        navigate("/login");
    };

    return (
        <AdminLayout>
            <h1 className="text-3xl font-semibold mb-8">Admin Profile</h1>

            <div className="grid md:grid-cols-[300px_1fr] gap-8">
                {/* ── LEFT CARD ────────────────────────────────────────────── */}
                <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center self-start">
                    <div className="w-24 h-24 rounded-full bg-gradient-to-br from-[#C9A24A] to-[#E5C87B] flex items-center justify-center text-black text-3xl font-bold">
                        {user?.name?.charAt(0)}
                    </div>
                    <h2 className="mt-4 text-xl font-semibold">{user?.name}</h2>
                    <p className="text-gray-400 text-sm">{user?.email}</p>
                    <span className="mt-3 px-3 py-1 text-xs rounded bg-[#1a1a1a] text-[var(--color-primary-gold)]">
                        Admin
                    </span>
                    <button
                        onClick={handleLogout}
                        className="mt-6 flex items-center gap-2 text-red-400 hover:text-red-500 transition text-sm"
                    >
                        <FiLogOut /> Logout
                    </button>
                </div>

                {/* ── RIGHT CONTENT ─────────────────────────────────────────── */}
                <div className="space-y-6">
                    {/* PERSONAL INFO */}
                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold">
                                Personal Information
                            </h3>
                            {!editing ? (
                                <button
                                    onClick={() => setEditing(true)}
                                    className="flex items-center gap-2 text-gray-300 hover:text-white text-sm transition"
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
                                        {saving ? <Spinner /> : <FiSave />}
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
                                <label className="text-sm text-gray-400 flex items-center gap-2 mb-1">
                                    <FiUser /> Full Name
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
                                            className={`w-full bg-[#0B0B0B] border rounded-lg p-2 text-sm outline-none transition ${inputBorder(profileErrors.name)}`}
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

                            {/* Email — readonly */}
                            <div>
                                <label className="text-sm text-gray-400 flex items-center gap-2 mb-1">
                                    <FiMail /> Email
                                </label>
                                <p className="mt-1 text-gray-300">
                                    {user?.email}
                                </p>
                            </div>

                            {/* Phone */}
                            <div>
                                <label className="text-sm text-gray-400 flex items-center gap-2 mb-1">
                                    <FiPhone /> Phone
                                </label>
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
                                            className={`w-full bg-[#0B0B0B] border rounded-lg p-2 text-sm outline-none transition ${inputBorder(profileErrors.phone)}`}
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

                            {/* Role */}
                            <div>
                                <label className="text-sm text-gray-400 flex items-center gap-2 mb-1">
                                    <FiShield /> Role
                                </label>
                                <p className="mt-1 capitalize">{user?.role}</p>
                            </div>
                        </div>
                    </div>

                    {/* CHANGE PASSWORD — collapsible */}
                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                        <button
                            onClick={() => setShowCpw(!showCpw)}
                            className="flex items-center justify-between w-full"
                        >
                            <h3 className="text-lg font-semibold flex items-center gap-2">
                                <FiKey className="text-[var(--color-primary-gold)]" />
                                Change Password
                            </h3>
                            {showCpw ? <FiChevronUp /> : <FiChevronDown />}
                        </button>

                        {showCpw && (
                            <form
                                onSubmit={handleChangePassword}
                                className="mt-6 space-y-4 max-w-md"
                            >
                                {/* Old Password */}
                                <div>
                                    <label className="text-gray-400 text-sm mb-1 block">
                                        Current Password
                                    </label>
                                    <div className="relative">
                                        <input
                                            type={showPw ? "text" : "password"}
                                            value={cpwForm.oldPassword}
                                            onChange={(e) =>
                                                setCpwForm({
                                                    ...cpwForm,
                                                    oldPassword: e.target.value,
                                                })
                                            }
                                            placeholder="Enter current password"
                                            className={
                                                inputCls(
                                                    cpwErrors.oldPassword,
                                                ) + " pr-16"
                                            }
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setShowPw(!showPw)}
                                            className="absolute right-3 top-2.5 text-xs text-gray-500 hover:text-[var(--color-primary-gold)] transition"
                                        >
                                            {showPw ? "Hide" : "Show"}
                                        </button>
                                    </div>
                                    {cpwErrors.oldPassword && (
                                        <p className="text-red-500 text-xs mt-1">
                                            {cpwErrors.oldPassword}
                                        </p>
                                    )}
                                </div>

                                {/* New Password */}
                                <div>
                                    <label className="text-gray-400 text-sm mb-1 block">
                                        New Password
                                    </label>
                                    <input
                                        type={showPw ? "text" : "password"}
                                        value={cpwForm.newPassword}
                                        onChange={(e) =>
                                            setCpwForm({
                                                ...cpwForm,
                                                newPassword: e.target.value,
                                            })
                                        }
                                        placeholder="At least 6 characters"
                                        className={inputCls(
                                            cpwErrors.newPassword,
                                        )}
                                    />
                                    {cpwErrors.newPassword && (
                                        <p className="text-red-500 text-xs mt-1">
                                            {cpwErrors.newPassword}
                                        </p>
                                    )}
                                </div>

                                {/* Confirm Password */}
                                <div>
                                    <label className="text-gray-400 text-sm mb-1 block">
                                        Confirm New Password
                                    </label>
                                    <input
                                        type={showPw ? "text" : "password"}
                                        value={cpwForm.confirmPassword}
                                        onChange={(e) =>
                                            setCpwForm({
                                                ...cpwForm,
                                                confirmPassword: e.target.value,
                                            })
                                        }
                                        placeholder="Repeat new password"
                                        className={inputCls(
                                            cpwErrors.confirmPassword,
                                        )}
                                    />
                                    {cpwErrors.confirmPassword && (
                                        <p className="text-red-500 text-xs mt-1">
                                            {cpwErrors.confirmPassword}
                                        </p>
                                    )}
                                </div>

                                <button
                                    type="submit"
                                    disabled={loading || changingPassword}
                                    className="flex items-center gap-2 bg-[var(--color-primary-gold)] hover:bg-[var(--color-accent-gold)] text-black font-semibold px-6 py-2.5 rounded-lg transition disabled:opacity-50"
                                >
                                    {loading || changingPassword ? (
                                        <Spinner />
                                    ) : (
                                        <FiKey />
                                    )}
                                    {loading || changingPassword
                                        ? "Updating..."
                                        : "Update Password"}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminProfilePage;
