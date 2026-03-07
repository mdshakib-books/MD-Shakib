import { Link, useLocation } from "react-router-dom";
import Navbar from "../Navbar";
import { useState } from "react";
import { useDispatch } from "react-redux";
import { useNavigate } from "react-router-dom";
import { logoutUser } from "../../redux/slices/authSlice";

import {
    FiHome,
    FiBook,
    FiShoppingCart,
    FiUsers,
    FiChevronLeft,
    FiChevronRight,
} from "react-icons/fi";
import { FiSettings, FiUser, FiLogOut } from "react-icons/fi";

const AdminLayout = ({ children }) => {
    const location = useLocation();
    const [collapsed, setCollapsed] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);

    const dispatch = useDispatch();
    const navigate = useNavigate();

    const handleLogout = () => {
        dispatch(logoutUser());
        navigate("/login");
    };

    const menu = [
        { name: "Dashboard", path: "/admin", icon: <FiHome size={20} /> },
        {
            name: "Manage Books",
            path: "/admin/books",
            icon: <FiBook size={20} />,
        },
        {
            name: "Manage Orders",
            path: "/admin/orders",
            icon: <FiShoppingCart size={20} />,
        },
        {
            name: "Manage Users",
            path: "/admin/users",
            icon: <FiUsers size={20} />,
        },
    ];

    return (
        <div className="min-h-screen bg-[#0B0B0B] text-white">
            <Navbar />

            <div className="flex">
                {/* SIDEBAR */}

                <aside
                    className={`sticky top-[72px] h-[calc(100vh-72px)]
                    bg-[#111111] border-r border-[#2A2A2A]
                    transition-all duration-300
                    ${collapsed ? "w-[80px]" : "w-64"}
                    `}
                >
                    {/* TOP AVATAR */}

                    <div className="flex justify-center py-6 relative group">
                        <div className="relative">
                            {/* AVATAR */}

                            <div
                                className="w-12 h-12 rounded-full bg-[var(--color-primary-gold)]
                            flex items-center justify-center text-black font-bold text-lg"
                            >
                                AP
                            </div>

                            {/* EXPAND BUTTON OVERLAY */}

                            {collapsed && (
                                <button
                                    onClick={() => setCollapsed(false)}
                                    className="absolute inset-0 flex items-center justify-center
                                    bg-black/60 rounded-full opacity-0 group-hover:opacity-100
                                    transition"
                                >
                                    <FiChevronRight size={18} />
                                </button>
                            )}
                        </div>

                        {/* COLLAPSE BUTTON */}

                        {!collapsed && (
                            <button
                                onClick={() => setCollapsed(true)}
                                className="absolute right-4 top-6 bg-[#1a1a1a]
                                border border-[#2A2A2A] p-1 rounded hover:bg-[#222]"
                            >
                                <FiChevronLeft size={16} />
                            </button>
                        )}
                    </div>

                    {/* MENU */}

                    <nav className="mt-6 flex flex-col items-center">
                        {menu.map((item) => {
                            const active = location.pathname === item.path;

                            return (
                                <Link
                                    key={item.name}
                                    to={item.path}
                                    className={`group relative flex items-center
                                    ${collapsed ? "justify-center w-full" : "gap-3 w-[85%]"}
                                    p-3 my-2 rounded-xl transition
                                    
                                    ${
                                        active
                                            ? "bg-[#1a1a1a] text-[var(--color-primary-gold)]"
                                            : "text-gray-400 hover:bg-[#1a1a1a]"
                                    }`}
                                >
                                    {/* ICON */}

                                    <span className="flex items-center justify-center w-6">
                                        {item.icon}
                                    </span>

                                    {/* TEXT */}

                                    {!collapsed && (
                                        <span className="text-sm">
                                            {item.name}
                                        </span>
                                    )}

                                    {/* TOOLTIP */}

                                    {collapsed && (
                                        <span
                                            className="absolute left-16 bg-black text-xs px-2 py-1 rounded
                                            opacity-0 group-hover:opacity-100
                                            whitespace-nowrap pointer-events-none"
                                        >
                                            {item.name}
                                        </span>
                                    )}
                                </Link>
                            );
                        })}
                    </nav>
                    <div className="absolute bottom-6 w-full flex justify-center">
                        <div
                            className={`relative ${collapsed ? "w-full flex justify-center" : "w-[85%]"}`}
                        >
                            {/* SETTINGS BUTTON */}

                            <button
                                onClick={() => setSettingsOpen(!settingsOpen)}
                                className={`group flex items-center ${collapsed ? "justify-center w-full" : "gap-3 w-full"} p-3 rounded-xl transition text-gray-400 hover:bg-[#1a1a1a]`}
                            >
                                <span className="flex items-center justify-center w-6 transition-transform duration-300 group-hover:rotate-180">
                                    <FiSettings size={20} />
                                </span>

                                {!collapsed && (
                                    <span className="text-sm">Settings</span>
                                )}

                                {/* Tooltip */}

                                {collapsed && (
                                    <span className="absolute left-16 bg-black text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap">
                                        Settings
                                    </span>
                                )}
                            </button>

                            {/* DROPDOWN */}

                            {settingsOpen && (
                                <div
                                    className={`absolute bottom-14 ${collapsed ? "left-14" : "left-0"} bg-[#111111] border border-[#2A2A2A] rounded-xl shadow-xl p-2 w-40`}
                                >
                                    <Link
                                        to="/admin/profile"
                                        className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[#1a1a1a]"
                                    >
                                        <FiUser size={16} />
                                        <span>Profile</span>
                                    </Link>

                                    <button
                                        onClick={handleLogout}
                                        className="flex items-center gap-3 px-3 py-2 rounded hover:bg-[#1a1a1a] w-full text-left text-red-400"
                                    >
                                        <FiLogOut size={16} />
                                        <span>Logout</span>
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </aside>

                {/* CONTENT */}

                <main className="flex-1 p-10">{children}</main>
            </div>
        </div>
    );
};

export default AdminLayout;
