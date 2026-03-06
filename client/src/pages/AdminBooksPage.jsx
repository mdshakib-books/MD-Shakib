import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";

const AdminBooksPage = () => {
    useEffect(() => {
        console.log("AdminBooksPage loaded.");
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow flex">
                <aside className="w-64 bg-gray-800 text-white p-6 hidden md:block">
                    <h2 className="text-xl font-bold mb-8">Admin Panel</h2>
                    <nav className="space-y-4">
                        <Link
                            to="/admin"
                            className="block p-2 hover:bg-gray-700 rounded text-gray-300"
                        >
                            Dashboard
                        </Link>
                        <Link
                            to="/admin/books"
                            className="block p-2 bg-gray-700 rounded text-gray-200"
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

                <div className="flex-1 p-8">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-3xl font-bold">Manage Books</h1>
                        <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                            Add New Book
                        </button>
                    </div>

                    <div className="bg-white rounded-lg shadow-sm overflow-hidden border">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Title
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Author
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Price
                                    </th>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Stock
                                    </th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                <tr>
                                    <td
                                        colSpan="5"
                                        className="px-6 py-12 text-center text-gray-500"
                                    >
                                        <p>
                                            No books found or fetch
                                            implementation missing.
                                        </p>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default AdminBooksPage;
