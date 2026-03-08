import { useEffect, useState } from "react";
import AdminLayout from "../components/admin/AdminLayout";
import AdminConfirmModal from "../components/admin/AdminConfirmModal";
import { adminService } from "../services/adminService";
import { useToast } from "../context/ToastContext";

const AdminUsersPage = () => {
    const { addToast } = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [selectedUser, setSelectedUser] = useState(null);
    const [blockTarget, setBlockTarget] = useState(null); // { user, action: "block"|"unblock" }
    const [deleteTarget, setDeleteTarget] = useState(null); // { user }
    const [actionLoading, setActionLoading] = useState(false);

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

    const confirmBlockToggle = async () => {
        if (!blockTarget) return;
        const { user, action } = blockTarget;
        setActionLoading(true);
        setBusyId(user._id);
        try {
            const updated =
                action === "block"
                    ? await adminService.blockUser(user._id)
                    : await adminService.unblockUser(user._id);
            setUsers((prev) =>
                prev.map((u) => (u._id === user._id ? updated : u)),
            );
            addToast(
                action === "block" ? "User blocked" : "User unblocked",
                "success",
            );
            setBlockTarget(null);
        } catch (err) {
            addToast(err.response?.data?.message || "Action failed", "error");
        } finally {
            setActionLoading(false);
            setBusyId(null);
        }
    };

    const confirmDelete = async () => {
        if (!deleteTarget) return;
        setActionLoading(true);
        setBusyId(deleteTarget.user._id);
        try {
            await adminService.deleteUser(deleteTarget.user._id);
            setUsers((prev) =>
                prev.filter((u) => u._id !== deleteTarget.user._id),
            );
            addToast("User deleted permanently", "info");
            setDeleteTarget(null);
            if (selectedUser?._id === deleteTarget.user._id)
                setSelectedUser(null);
        } catch (err) {
            addToast(err.response?.data?.message || "Delete failed", "error");
        } finally {
            setActionLoading(false);
            setBusyId(null);
        }
    };

    const viewUser = async (userId) => {
        try {
            const user = await adminService.getUserById(userId);
            setSelectedUser(user);
        } catch (err) {
            addToast(
                err.response?.data?.message || "Failed to load user",
                "error",
            );
        }
    };

    return (
        <AdminLayout>
            <h1 className="text-3xl font-semibold mb-8">Manage Users</h1>

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400 text-xs uppercase tracking-wide">
                        <tr>
                            <th className="px-5 py-4 text-left">Name</th>
                            <th className="px-5 py-4 text-left">Email</th>
                            <th className="px-5 py-4 text-left">Role</th>
                            <th className="px-5 py-4 text-left">Status</th>
                            <th className="px-5 py-4 text-left">Joined</th>
                            <th className="px-5 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-[#1a1a1a]">
                        {loading ? (
                            <tr>
                                <td colSpan="6" className="text-center py-16">
                                    <div className="inline-block w-7 h-7 border-2 border-[var(--color-primary-gold)] border-t-transparent rounded-full animate-spin" />
                                </td>
                            </tr>
                        ) : users.length === 0 ? (
                            <tr>
                                <td
                                    colSpan="6"
                                    className="text-center py-16 text-gray-500"
                                >
                                    No users found
                                </td>
                            </tr>
                        ) : (
                            users.map((user) => (
                                <tr
                                    key={user._id}
                                    className="hover:bg-[#161616] transition"
                                >
                                    <td className="px-5 py-3 text-gray-200">
                                        {user.name}
                                    </td>
                                    <td className="px-5 py-3 text-gray-400 text-xs">
                                        {user.email}
                                    </td>
                                    <td className="px-5 py-3 text-gray-300 capitalize">
                                        {user.role}
                                    </td>
                                    <td className="px-5 py-3">
                                        <span
                                            className={`text-xs px-2 py-1 rounded-full ${user.isBlocked ? "bg-red-900/30 text-red-400" : "bg-green-900/30 text-green-400"}`}
                                        >
                                            {user.isBlocked
                                                ? "Blocked"
                                                : "Active"}
                                        </span>
                                    </td>
                                    <td className="px-5 py-3 text-gray-500 text-xs">
                                        {new Date(
                                            user.createdAt,
                                        ).toLocaleDateString()}
                                    </td>
                                    <td className="px-5 py-3">
                                        <div className="flex justify-end items-center gap-2">
                                            <button
                                                onClick={() =>
                                                    viewUser(user._id)
                                                }
                                                className="px-2.5 py-1.5 rounded border border-[#2A2A2A] text-xs text-gray-300 hover:border-[var(--color-primary-gold)] hover:text-[var(--color-primary-gold)] transition"
                                            >
                                                View
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setBlockTarget({
                                                        user,
                                                        action: user.isBlocked
                                                            ? "unblock"
                                                            : "block",
                                                    })
                                                }
                                                disabled={busyId === user._id}
                                                className={`px-2.5 py-1.5 rounded border text-xs transition disabled:opacity-50 ${
                                                    user.isBlocked
                                                        ? "border-green-600 text-green-400 hover:bg-green-700 hover:text-white"
                                                        : "border-yellow-600 text-yellow-400 hover:bg-yellow-700 hover:text-white"
                                                }`}
                                            >
                                                {user.isBlocked
                                                    ? "Unblock"
                                                    : "Block"}
                                            </button>
                                            <button
                                                onClick={() =>
                                                    setDeleteTarget({ user })
                                                }
                                                disabled={busyId === user._id}
                                                className="px-2.5 py-1.5 rounded border border-red-600 text-xs text-red-400 hover:bg-red-700 hover:text-white transition disabled:opacity-50"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* User Detail Modal */}
            {selectedUser && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="w-full max-w-lg bg-[#111111] border border-[#2A2A2A] rounded-xl p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-lg font-semibold text-[var(--color-primary-gold)]">
                                User Profile
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
                                {selectedUser.phone || "—"}
                            </p>
                            <p>
                                <span className="text-gray-400">Status:</span>{" "}
                                <span
                                    className={
                                        selectedUser.isBlocked
                                            ? "text-red-400"
                                            : "text-green-400"
                                    }
                                >
                                    {selectedUser.isBlocked
                                        ? "Blocked"
                                        : "Active"}
                                </span>
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

            {/* Block/Unblock Confirmation */}
            {blockTarget && (
                <AdminConfirmModal
                    title={
                        blockTarget.action === "block"
                            ? "Block User?"
                            : "Unblock User?"
                    }
                    message={
                        blockTarget.action === "block"
                            ? `"${blockTarget.user.name}" will not be able to login or place orders.`
                            : `"${blockTarget.user.name}" will regain full access.`
                    }
                    dangerous={blockTarget.action === "block"}
                    loading={actionLoading}
                    onConfirm={confirmBlockToggle}
                    onCancel={() => setBlockTarget(null)}
                />
            )}

            {/* Delete Confirmation */}
            {deleteTarget && (
                <AdminConfirmModal
                    title="Delete User Account?"
                    message={`This will permanently delete "${deleteTarget.user.name}" and all their data. This cannot be undone.`}
                    dangerous
                    loading={actionLoading}
                    onConfirm={confirmDelete}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}
        </AdminLayout>
    );
};

export default AdminUsersPage;
