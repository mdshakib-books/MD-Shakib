import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const AdminDashboardPage = () => {
    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow flex">
                {/* Sidebar */}
                <aside className="w-64 bg-gray-800 text-white p-6 hidden md:block">
                    <h2 className="text-xl font-bold mb-8">Admin Panel</h2>
                    <nav className="space-y-4">
                        <Link
                            to="/admin"
                            className="block p-2 bg-gray-700 rounded text-gray-200"
                        >
                            Dashboard
                        </Link>
                        <Link
                            to="/admin/books"
                            className="block p-2 hover:bg-gray-700 rounded text-gray-300"
                        >
                            Manage Books
                        </Link>
                        <Link
                            to="/admin/orders"
                            className="block p-2 hover:bg-gray-700 rounded text-gray-300"
                        >
                            Manage Orders
                        </Link>
                    </nav>
                </aside>

                {/* Main Content */}
                <div className="flex-1 p-8">
                    <h1 className="text-3xl font-bold mb-8">Admin Dashboard</h1>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-blue-100 border-l-4 border-l-blue-500">
                            <h3 className="text-gray-500 font-medium">
                                Total Books
                            </h3>
                            <p className="text-3xl font-bold mt-2">124</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-green-100 border-l-4 border-l-green-500">
                            <h3 className="text-gray-500 font-medium">
                                Total Orders
                            </h3>
                            <p className="text-3xl font-bold mt-2">48</p>
                        </div>
                        <div className="bg-white p-6 rounded-lg shadow-sm border border-purple-100 border-l-4 border-l-purple-500">
                            <h3 className="text-gray-500 font-medium">
                                Total Users
                            </h3>
                            <p className="text-3xl font-bold mt-2">85</p>
                        </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow-sm flex flex-col md:flex-row gap-6">
                        <Link
                            to="/admin/books"
                            className="flex-1 text-center bg-gray-50 p-8 rounded border hover:border-blue-500 transition-colors"
                        >
                            <span className="text-blue-600 font-bold block mb-2">
                                Books Management
                            </span>
                            <span className="text-sm text-gray-500">
                                Add, Edit or Delete books
                            </span>
                        </Link>
                        <Link
                            to="/admin/orders"
                            className="flex-1 text-center bg-gray-50 p-8 rounded border hover:border-blue-500 transition-colors"
                        >
                            <span className="text-blue-600 font-bold block mb-2">
                                Orders Management
                            </span>
                            <span className="text-sm text-gray-500">
                                View and update order status
                            </span>
                        </Link>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default AdminDashboardPage;
