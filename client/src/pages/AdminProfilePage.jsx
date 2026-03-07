import { useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
    FiUser,
    FiMail,
    FiPhone,
    FiShield,
    FiEdit,
    FiSave,
    FiLogOut,
} from "react-icons/fi";
import { logoutUser } from "../redux/slices/authSlice";
import { useNavigate } from "react-router-dom";
import AdminLayout from "../components/admin/AdminLayout";

const AdminProfilePage = () => {
    const user = useSelector((state) => state.auth.user);
    const dispatch = useDispatch();
    const navigate = useNavigate();

    const [editing, setEditing] = useState(false);

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

    const handleLogout = async () => {
        await dispatch(logoutUser());
        navigate("/login");
    };

    return (
        <AdminLayout>
            <h1 className="text-3xl font-semibold mb-8">Admin Profile</h1>

            <div className="grid md:grid-cols-[320px_1fr] gap-8">
                {/* LEFT CARD */}

                <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 flex flex-col items-center">
                    <div
                        className="w-24 h-24 rounded-full bg-[var(--color-primary-gold)]
                    flex items-center justify-center text-black text-3xl font-bold"
                    >
                        {user?.name?.charAt(0)}
                    </div>

                    <h2 className="mt-4 text-xl font-semibold">{user?.name}</h2>

                    <p className="text-gray-400 text-sm">{user?.email}</p>

                    <span className="mt-3 px-3 py-1 text-xs rounded bg-[#1a1a1a] text-[var(--color-primary-gold)]">
                        Admin
                    </span>

                    <button
                        onClick={handleLogout}
                        className="mt-6 flex items-center gap-2 text-red-400 hover:text-red-500"
                    >
                        <FiLogOut />
                        Logout
                    </button>
                </div>

                {/* RIGHT CONTENT */}

                <div className="space-y-8">
                    {/* PERSONAL INFO */}

                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-lg font-semibold">
                                Personal Information
                            </h3>

                            <button
                                onClick={() => setEditing(!editing)}
                                className="flex items-center gap-2 text-gray-300 hover:text-white"
                            >
                                <FiEdit />
                                Edit
                            </button>
                        </div>

                        <div className="grid md:grid-cols-2 gap-6">
                            {/* NAME */}

                            <div>
                                <label className="text-sm text-gray-400 flex items-center gap-2">
                                    <FiUser />
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

                            {/* EMAIL */}

                            <div>
                                <label className="text-sm text-gray-400 flex items-center gap-2">
                                    <FiMail />
                                    Email
                                </label>

                                <p className="mt-1">{form.email}</p>
                            </div>

                            {/* PHONE */}

                            <div>
                                <label className="text-sm text-gray-400 flex items-center gap-2">
                                    <FiPhone />
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

                            {/* ROLE */}

                            <div>
                                <label className="text-sm text-gray-400 flex items-center gap-2">
                                    <FiShield />
                                    Role
                                </label>

                                <p className="mt-1 capitalize">{user?.role}</p>
                            </div>
                        </div>

                        {editing && (
                            <button className="mt-6 bg-[var(--color-primary-gold)] text-black px-6 py-2 rounded-lg flex items-center gap-2 font-semibold">
                                <FiSave />
                                Save Changes
                            </button>
                        )}
                    </div>

                    {/* SECURITY */}

                    <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                        <h3 className="text-lg font-semibold mb-4">Security</h3>

                        <button className="bg-[#1a1a1a] px-4 py-2 rounded-lg hover:bg-[#222]">
                            Change Password
                        </button>
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

export default AdminProfilePage;
