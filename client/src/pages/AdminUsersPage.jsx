import { useEffect, useState } from "react";
import AdminLayout from "../components/admin/AdminLayout";
import { adminService } from "../services/adminService";
import { useToast } from "../context/ToastContext";

const AdminUsersPage = () => {
    const { addToast } = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        setLoading(true);
        try {
            const data = await adminService.getUsers();
            setUsers(Array.isArray(data) ? data : []);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to load users",
                "error",
            );
            setUsers([]);
        } finally {
            setLoading(false);
        }
    };

    const toggleBlock = async (user) => {
        setBusyId(user._id);
        try {
            const updated = user.isBlocked
                ? await adminService.unblockUser(user._id)
                : await adminService.blockUser(user._id);
            setUsers((prev) =>
                prev.map((u) => (u._id === user._id ? updated : u)),
            );
            addToast(
                user.isBlocked
                    ? "User unblocked successfully"
                    : "User blocked successfully",
                "success",
            );
        } catch (err) {
            addToast(
                err.response?.data?.message || "User update failed",
                "error",
            );
        } finally {
            setBusyId(null);
        }
    };

    const viewUserDetails = async (userId) => {
        try {
            const user = await adminService.getUserById(userId);
            setSelectedUser(user);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to load user details",
                "error",
            );
        }
    };

    return (
        <AdminLayout>
            <h1 className="text-3xl font-semibold mb-8">Manage Users</h1>

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400">
                        <tr>
                            <th className="px-6 py-4 text-left">Name</th>
                            <th className="px-6 py-4 text-left">Email</th>
                            <th className="px-6 py-4 text-left">Role</th>
                            <th className="px-6 py-4 text-left">Phone</th>
                            <th className="px-6 py-4 text-left">
                                Account Status
                            </th>
                            <th className="px-6 py-4 text-left">Created At</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        {loading ? (
                            <tr>
                                <td
                                    colSpan="7"
                                    className="text-center py-16 text-gray-500"
                                >
                                    Loading users...
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td
                                    colSpan="7"
                                    className="text-center py-16 text-gray-500"
                                >
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr
                                    key={user._id}
                                    className="border-b border-[#1f1f1f] last:border-0"
                                >
                                    <td className="px-6 py-4 text-gray-200">
                                        {user.name}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {user.email}
                                    </td>
                                    <td className="px-6 py-4 text-gray-300 capitalize">
                                        {user.role}
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {user.phone || "-"}
                                    </td>
                                    <td className="px-6 py-4">
                                        <span
                                            className={`text-xs px-2 py-1 rounded-full ${
                                                user.isBlocked
                                                    ? "bg-red-900/40 text-red-400"
                                                    : "bg-green-900/40 text-green-400"
                                            }`}
                                        >
                                            {user.isBlocked
                                                ? "Blocked"
                                                : "Active"}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4 text-gray-400">
                                        {new Date(
                                            user.createdAt,
                                        ).toLocaleDateString()}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-end items-center gap-2">
                                            <button
                                                onClick={() =>
                                                    viewUserDetails(user._id)
                                                }
                                                className="px-2.5 py-1.5 rounded border border-[#2A2A2A] text-xs text-gray-300 hover:border-[var(--color-primary-gold)] hover:text-[var(--color-primary-gold)] transition"
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={() =>
                                                    toggleBlock(user)
                                                }
                                                disabled={busyId === user._id}
                                                className={`px-2.5 py-1.5 rounded border text-xs transition disabled:opacity-50 ${
                                                    user.isBlocked
                                                        ? "border-green-600 text-green-400 hover:bg-green-700 hover:text-white"
                                                        : "border-red-600 text-red-400 hover:bg-red-700 hover:text-white"
                                                }`}
                                            >
                                                {user.isBlocked
                                                    ? "Unblock"
                                                    : "Block"}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {selectedUser && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-[var(--color-primary-gold)]">
                                User Details
                            </h2>
                            <button
                                onClick={() => setSelectedUser(null)}
                                className="text-gray-400 hover:text-white"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="space-y-2 text-sm text-gray-300">
                            <p>
                                <span className="text-gray-400">Name:</span>{" "}
                                {selectedUser.name}
                            </p>
                            <p>
                                <span className="text-gray-400">Email:</span>{" "}
                                {selectedUser.email}
                            </p>
                            <p>
                                <span className="text-gray-400">Role:</span>{" "}
                                {selectedUser.role}
                            </p>
                            <p>
                                <span className="text-gray-400">Phone:</span>{" "}
                                {selectedUser.phone || "-"}
                            </p>
                            <p>
                                <span className="text-gray-400">
                                    Account Status:
                                </span>{" "}
                                {selectedUser.isBlocked ? "Blocked" : "Active"}
                            </p>
                            <p>
                                <span className="text-gray-400">Joined:</span>{" "}
                                {new Date(
                                    selectedUser.createdAt,
                                ).toLocaleString()}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AdminUsersPage;
