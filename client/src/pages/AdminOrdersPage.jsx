import { useEffect } from "react";
import AdminLayout from "../components/admin/AdminLayout";

const AdminOrdersPage = () => {
    useEffect(() => {
        fetchOrders();
    }, []);

    const fetchOrders = async () => {
        // TODO: fetch orders
    };

    return (
        <AdminLayout>
            <h1 className="text-3xl font-semibold mb-8">Manage Orders</h1>

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400">
                        <tr>
                            <th className="px-6 py-4 text-left">Order ID</th>
                            <th className="px-6 py-4 text-left">Customer</th>
                            <th className="px-6 py-4 text-left">Date</th>
                            <th className="px-6 py-4 text-left">Status</th>
                            <th className="px-6 py-4 text-left">Total</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr>
                            <td
                                colSpan="6"
                                className="text-center py-16 text-gray-500"
                            >
                                No orders found
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </AdminLayout>
    );
};

export default AdminOrdersPage;
