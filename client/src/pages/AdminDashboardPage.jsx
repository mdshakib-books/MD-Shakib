import { useEffect } from "react";
import AdminLayout from "../components/admin/AdminLayout";

import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Tooltip,
    Legend,
} from "chart.js";

import { Bar, Doughnut } from "react-chartjs-2";

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    ArcElement,
    Tooltip,
    Legend,
);

const AdminDashboardPage = () => {
    useEffect(() => {
        fetchDashboardStats();
    }, []);

    const fetchDashboardStats = async () => {
        // TODO: fetch from API
    };

    /* ========================
       CHART DATA (PLACEHOLDER)
    ======================== */

    const salesChartData = {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"],
        datasets: [
            {
                label: "Revenue",
                data: [12000, 19000, 8000, 24000, 16000, 22000],
                backgroundColor: "#C9A24A",
                borderRadius: 6,
            },
        ],
    };

    const ordersChartData = {
        labels: ["Pending", "Packed", "Shipped", "Delivered", "Cancelled"],
        datasets: [
            {
                data: [12, 19, 7, 30, 3],
                backgroundColor: [
                    "#facc15",
                    "#3b82f6",
                    "#06b6d4",
                    "#22c55e",
                    "#ef4444",
                ],
            },
        ],
    };

    return (
        <AdminLayout>
            <h1 className="text-3xl font-semibold mb-8">Admin Dashboard</h1>

            {/* ========================
                STATS CARDS
            ======================== */}

            <div className="grid md:grid-cols-3 gap-6 mb-10">
                <div className="bg-[#111111] p-6 rounded-xl border border-[#2A2A2A]">
                    <p className="text-gray-400 text-sm">Total Books</p>
                    <h2 className="text-3xl font-bold mt-2">124</h2>
                </div>

                <div className="bg-[#111111] p-6 rounded-xl border border-[#2A2A2A]">
                    <p className="text-gray-400 text-sm">Total Orders</p>
                    <h2 className="text-3xl font-bold mt-2">48</h2>
                </div>

                <div className="bg-[#111111] p-6 rounded-xl border border-[#2A2A2A]">
                    <p className="text-gray-400 text-sm">Total Users</p>
                    <h2 className="text-3xl font-bold mt-2">85</h2>
                </div>
            </div>

            {/* ========================
                CHART SECTION
            ======================== */}

            <div className="grid md:grid-cols-2 gap-8 mb-10">
                {/* SALES CHART */}

                <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                    <h3 className="text-lg font-semibold mb-4">
                        Monthly Revenue
                    </h3>

                    <Bar data={salesChartData} />
                </div>

                {/* ORDER STATUS CHART */}

                <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                    <h3 className="text-lg font-semibold mb-4">Order Status</h3>

                    <Doughnut data={ordersChartData} />
                </div>
            </div>

            {/* ========================
                QUICK ACTIONS
            ======================== */}

            <div className="grid md:grid-cols-3 gap-6 mb-10">
                <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 hover:border-[var(--color-primary-gold)] transition">
                    <h3 className="text-lg font-semibold text-[var(--color-primary-gold)]">
                        Manage Books
                    </h3>

                    <p className="text-gray-400 text-sm mt-2">
                        Add, edit or remove books
                    </p>
                </div>

                <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 hover:border-[var(--color-primary-gold)] transition">
                    <h3 className="text-lg font-semibold text-[var(--color-primary-gold)]">
                        Manage Orders
                    </h3>

                    <p className="text-gray-400 text-sm mt-2">
                        Track and update order status
                    </p>
                </div>

                <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 hover:border-[var(--color-primary-gold)] transition">
                    <h3 className="text-lg font-semibold text-[var(--color-primary-gold)]">
                        Manage Users
                    </h3>

                    <p className="text-gray-400 text-sm mt-2">
                        Block / unblock users
                    </p>
                </div>
            </div>

            {/* ========================
                RECENT ORDERS
            ======================== */}

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-10">
                <h3 className="text-lg font-semibold mb-4">Recent Orders</h3>

                <table className="w-full text-sm">
                    <thead className="border-b border-[#2A2A2A] text-gray-400">
                        <tr>
                            <th className="py-3 text-left">Order ID</th>
                            <th className="py-3 text-left">Customer</th>
                            <th className="py-3 text-left">Amount</th>
                            <th className="py-3 text-left">Status</th>
                        </tr>
                    </thead>

                    <tbody>
                        <tr className="border-b border-[#2A2A2A]">
                            <td className="py-3">#ORD1021</td>
                            <td>Ahmed Khan</td>
                            <td>₹899</td>
                            <td className="text-green-500">Delivered</td>
                        </tr>

                        <tr className="border-b border-[#2A2A2A]">
                            <td className="py-3">#ORD1020</td>
                            <td>Fatima Ali</td>
                            <td>₹499</td>
                            <td className="text-yellow-400">Packed</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* ========================
                ALERTS / NOTIFICATIONS
            ======================== */}

            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6">
                <h3 className="text-lg font-semibold mb-4">Alerts</h3>

                <ul className="space-y-3 text-sm text-gray-400">
                    <li>⚠️ 3 books are running low on stock</li>

                    <li>🛒 5 new orders placed today</li>

                    <li>👤 2 new users registered</li>
                </ul>
            </div>
        </AdminLayout>
    );
};

export default AdminDashboardPage;
