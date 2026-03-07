import React, { useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { FiUser, FiBox, FiMapPin, FiKey, FiLogOut } from "react-icons/fi";
import { logoutUser } from "../redux/slices/authSlice";
import LogoutModal from "../components/LogoutModal";

const ProfilePage = () => {
    const user = useSelector((state) => state.auth.user);
    const navigate = useNavigate();
    const [editing, setEditing] = useState(false);
    const dispatch = useDispatch();
    const [showLogoutModal, setShowLogoutModal] = useState(false);

    const [form, setForm] = useState({
        name: user?.name || "",
        email: user?.email || "",
        phone: user?.phone || "",
    });

    const handleChange = (e) => {
        setForm({
            ...form,
            [e.target.name]: e.target.value,
        });
    };

    const handleLogoutConfirm = () => {
        dispatch(logoutUser());
        navigate("/login");
    };

    const handleLogout = () => {
        setShowLogoutModal(true);
    };

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow py-10 px-4 md:px-6">
                <div className="max-w-[1200px] mx-auto">
                    <h1 className="font-heading text-3xl text-[var(--color-primary-gold)] mb-8">
                        My Account
                    </h1>

                    <div className="grid md:grid-cols-[280px_1fr] gap-8">
                        {/* SIDEBAR (DESKTOP ONLY) */}
                        <div className="hidden md:block bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
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

                            {/* MENU */}
                            <div className="space-y-2">
                                <button className="flex items-center gap-3 w-full p-3 rounded-lg bg-[#1a1a1a] text-[var(--color-primary-gold)]">
                                    <FiUser className="text-lg" />
                                    <span>Personal Information</span>
                                </button>

                                <button
                                    onClick={() => navigate("/orders")}
                                    className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-[#1a1a1a] transition"
                                >
                                    <FiBox className="text-lg" />
                                    <span>My Orders</span>
                                </button>

                                <button
                                    onClick={() => navigate("/addresses")}
                                    className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-[#1a1a1a] transition"
                                >
                                    <FiMapPin className="text-lg" />
                                    <span>My Addresses</span>
                                </button>

                                <button className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-[#1a1a1a] transition">
                                    <FiKey className="text-lg" />
                                    <span>Change Password</span>
                                </button>

                                <button
                                    onClick={handleLogout}
                                    className="flex items-center gap-3 w-full p-3 rounded-lg hover:bg-[#1a1a1a] text-red-400 transition"
                                >
                                    <FiLogOut className="text-lg" />
                                    <span>Logout</span>
                                </button>
                            </div>
                        </div>

                        {/* RIGHT CONTENT */}
                        <div className="space-y-8">
                            {/* MOBILE DASHBOARD */}
                            <div className="grid grid-cols-2 gap-4 md:hidden">
                                <button
                                    onClick={() => navigate("/orders")}
                                    className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center gap-2"
                                >
                                    <span className="text-2xl">📦</span>
                                    <span className="text-sm">My Orders</span>
                                </button>

                                <button
                                    onClick={() => navigate("/addresses")}
                                    className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center gap-2"
                                >
                                    <span className="text-2xl">🏠</span>
                                    <span className="text-sm">
                                        My Addresses
                                    </span>
                                </button>

                                <button className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center gap-2">
                                    <span className="text-2xl">👤</span>
                                    <span className="text-sm">
                                        Personal Info
                                    </span>
                                </button>

                                <button className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center gap-2">
                                    <span className="text-2xl">🔑</span>
                                    <span className="text-sm">
                                        Forgot Password
                                    </span>
                                </button>
                            </div>

                            {/* PERSONAL INFORMATION */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-heading text-lg text-[var(--color-primary-gold)]">
                                        Personal Information
                                    </h3>

                                    <button
                                        onClick={() => setEditing(!editing)}
                                        className="flex items-center gap-2 text-sm text-gray-300"
                                    >
                                        ✏️ Edit
                                    </button>
                                </div>

                                <div className="grid md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-gray-400 text-sm">
                                            Full Name
                                        </label>

                                        {editing ? (
                                            <input
                                                name="name"
                                                value={form.name}
                                                onChange={handleChange}
                                                className="mt-1 w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg p-2"
                                            />
                                        ) : (
                                            <p className="mt-1">{form.name}</p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-gray-400 text-sm">
                                            Email
                                        </label>
                                        <p className="mt-1">{form.email}</p>
                                    </div>

                                    <div>
                                        <label className="text-gray-400 text-sm">
                                            Phone
                                        </label>

                                        {editing ? (
                                            <input
                                                name="phone"
                                                value={form.phone}
                                                onChange={handleChange}
                                                className="mt-1 w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg p-2"
                                            />
                                        ) : (
                                            <p className="mt-1">
                                                {form.phone || "Not provided"}
                                            </p>
                                        )}
                                    </div>

                                    <div>
                                        <label className="text-gray-400 text-sm">
                                            Account Type
                                        </label>
                                        <p className="mt-1 capitalize">
                                            {user?.role || "User"}
                                        </p>
                                    </div>
                                </div>

                                {editing && (
                                    <button className="mt-6 bg-[var(--color-primary-gold)] text-black px-6 py-2 rounded-lg font-semibold">
                                        Save Changes
                                    </button>
                                )}
                            </div>

                            {/* ADDRESS SECTION */}
                            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                                <div className="flex justify-between items-center mb-6">
                                    <h3 className="font-heading text-lg text-[var(--color-primary-gold)]">
                                        My Addresses
                                    </h3>

                                    <button className="bg-[#1a1a1a] px-4 py-2 rounded-lg text-sm">
                                        + Add Address
                                    </button>
                                </div>

                                <div className="border border-[#2A2A2A] rounded-lg p-4">
                                    <span className="text-xs bg-[#1a1a1a] px-2 py-1 rounded">
                                        HOME
                                    </span>

                                    <p className="mt-2 font-semibold">
                                        Arif Ansari
                                    </p>

                                    <p className="text-gray-400 text-sm mt-1">
                                        DDU Hostel, CCS University, Meerut,
                                        Uttar Pradesh - 250004
                                    </p>

                                    <p className="text-gray-400 text-sm mt-1">
                                        📞 7081168219
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* MOBILE LOGOUT */}
                <div className="md:hidden mt-10">
                    <button
                        onClick={handleLogout}
                        className="w-full bg-[#111111] border border-[#2A2A2A] text-red-400 py-3 rounded-lg"
                    >
                        Logout
                    </button>
                </div>
            </main>

            <Footer />

            {/* Logout Modal */}
            <LogoutModal
                isOpen={showLogoutModal}
                onClose={() => setShowLogoutModal(false)}
                onConfirm={handleLogoutConfirm}
            />
        </div>
    );
};

export default ProfilePage;
