import React, { useState, useEffect } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Loader from "../components/Loader";
import AddressCard from "../components/AddressCard";
import AddressForm from "../components/AddressForm";
import { addressService } from "../services/addressService";

const AddressesPage = () => {
    const [addresses, setAddresses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingAddress, setEditingAddress] = useState(null);

    const fetchAddresses = async () => {
        try {
            setLoading(true);
            const data = await addressService.getAddresses();
            setAddresses(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchAddresses();
    }, []);

    return (
        <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-white">
            <Navbar />

            <main className="flex-grow py-12 px-4 md:px-6">
                <div className="max-w-[1100px] mx-auto">
                    {/* HEADER */}

                    <div className="flex justify-between items-center mb-8">
                        <h1 className="font-heading text-3xl text-[var(--color-primary-gold)]">
                            My Addresses
                        </h1>

                        <button
                            onClick={() => {
                                setEditingAddress(null);
                                setShowForm(true);
                            }}
                            className="bg-[var(--color-primary-gold)] text-black px-5 py-2 rounded-lg font-semibold hover:bg-[var(--color-accent-gold)] transition"
                        >
                            + Add New Address
                        </button>
                    </div>

                    {/* ADDRESS FORM */}

                    {showForm && (
                        <AddressForm
                            address={editingAddress}
                            onClose={() => setShowForm(false)}
                            onSuccess={() => {
                                setShowForm(false);
                                fetchAddresses();
                            }}
                        />
                    )}

                    {/* ADDRESS LIST */}

                    {loading ? (
                        <Loader />
                    ) : addresses.length === 0 ? (
                        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-10 text-center">
                            <p className="text-gray-400">
                                No saved addresses yet
                            </p>
                        </div>
                    ) : (
                        <div className="grid md:grid-cols-2 gap-6">
                            {addresses.map((addr) => (
                                <AddressCard
                                    key={addr._id}
                                    address={addr}
                                    onEdit={() => {
                                        setEditingAddress(addr);
                                        setShowForm(true);
                                    }}
                                    onDelete={fetchAddresses}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default AddressesPage;
