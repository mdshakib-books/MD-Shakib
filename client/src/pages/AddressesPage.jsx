import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Loader from "../components/Loader";
import { addressService } from "../services/addressService";

const AddressesPage = () => {
    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchAddresses = async () => {
            try {
                setLoading(true);
                console.log("Fetching addresses...");
                const data = await addressService.getAddresses();
                setAddresses(data);
            } catch (err) {
                console.error(err);
            } finally {
                setLoading(false);
            }
        };
        fetchAddresses();
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-gray-50">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-8 max-w-4xl">
                <Link
                    to="/profile"
                    className="text-blue-600 hover:underline mb-4 inline-block"
                >
                    &larr; Back to Profile
                </Link>
                <div className="flex justify-between items-center mb-6">
                    <h1 className="text-3xl font-bold">My Addresses</h1>
                    <button className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700">
                        Add New
                    </button>
                </div>

                {loading ? (
                    <Loader />
                ) : !Array.isArray(addresses) || addresses.length === 0 ? (
                    <div className="bg-white p-8 rounded-lg shadow-sm text-center">
                        <p className="text-gray-500 mb-4">
                            You have not saved any addresses yet.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {addresses?.map((address, idx) => (
                            <div
                                key={idx}
                                className="bg-white p-6 rounded-lg shadow-sm border border-gray-100 hover:border-blue-300 transition-colors"
                            >
                                <span className="inline-block px-2 py-1 bg-gray-100 text-xs rounded mb-3 font-semibold uppercase">
                                    {address.type || "Home"}
                                </span>
                                <p className="font-semibold mb-1">
                                    {address.fullName}
                                </p>
                                <p className="text-gray-600 text-sm leading-relaxed">
                                    {address.streetAddress}
                                    <br />
                                    {address.city}, {address.state}{" "}
                                    {address.zipCode}
                                    <br />
                                    {address.country}
                                </p>
                                <p className="text-gray-600 text-sm mt-3 flex items-center">
                                    <span className="mr-2">📞</span>{" "}
                                    {address.phoneNumber}
                                </p>
                                <div className="mt-4 pt-4 border-t flex gap-4">
                                    <button className="text-sm text-blue-600 font-medium hover:underline">
                                        Edit
                                    </button>
                                    <button className="text-sm text-red-600 font-medium hover:underline">
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </main>
            <Footer />
        </div>
    );
};

export default AddressesPage;
