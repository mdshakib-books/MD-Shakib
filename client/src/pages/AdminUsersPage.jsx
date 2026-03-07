import { useEffect } from "react";
import AdminLayout from "../components/admin/AdminLayout";

const AdminUsersPage = () => {
    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        // TODO: API
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
                            <th className="px-6 py-4 text-left">Status</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr>
                            <td
                                colSpan="5"
                                className="text-center py-16 text-gray-500"
                            >
                                No users found
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </AdminLayout>
    );
};

export default AdminUsersPage;
