import React from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { useAuthContext } from "../context/AuthContext";

const ProfilePage = () => {
    const { user } = useAuthContext();

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
                <h1 className="text-3xl font-bold mb-8">My Account</h1>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="md:col-span-1 bg-white shadow-sm rounded-lg p-6 h-fit">
                        <div className="flex flex-col items-center mb-6">
                            <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 text-3xl font-bold mb-4">
                                {user?.name?.charAt(0) || "U"}
                            </div>
                            <h2 className="text-xl font-bold">
                                {user?.name || "User Name"}
                            </h2>
                            <p className="text-gray-500">
                                {user?.email || "user@example.com"}
                            </p>
                        </div>
                        <div className="space-y-2 flex flex-col">
                            <Link
                                to="/orders"
                                className="p-3 bg-gray-50 rounded hover:bg-gray-100 font-medium"
                            >
                                My Orders
                            </Link>
                            <Link
                                to="/addresses"
                                className="p-3 bg-gray-50 rounded hover:bg-gray-100 font-medium"
                            >
                                My Addresses
                            </Link>
                            <Link
                                to="/profile/edit"
                                className="p-3 bg-gray-50 rounded hover:bg-gray-100 font-medium"
                            >
                                Edit Profile
                            </Link>
                        </div>
                    </div>

                    <div className="md:col-span-2 bg-white shadow-sm rounded-lg p-6">
                        <h3 className="text-xl font-bold mb-4 border-b pb-2">
                            Profile Information
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-gray-500 text-sm">
                                    Full Name
                                </label>
                                <div className="font-medium text-lg">
                                    {user?.name || "User Name"}
                                </div>
                            </div>
                            <div>
                                <label className="text-gray-500 text-sm">
                                    Email Address
                                </label>
                                <div className="font-medium text-lg">
                                    {user?.email || "user@example.com"}
                                </div>
                            </div>
                            <div>
                                <label className="text-gray-500 text-sm">
                                    Phone Number
                                </label>
                                <div className="font-medium text-lg">
                                    {user?.phone || "Not provided"}
                                </div>
                            </div>
                            <div>
                                <label className="text-gray-500 text-sm">
                                    Account Type
                                </label>
                                <div className="font-medium text-lg capitalize">
                                    {user?.role || "User"}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
            <Footer />
        </div>
    );
};

export default ProfilePage;
