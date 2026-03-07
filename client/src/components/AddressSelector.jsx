import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addressService } from "../services/addressService";

const AddressSelector = ({ onSelect, selectedId }) => {
    const [addresses, setAddresses] = useState([]);
    const [selected, setSelected] = useState(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const data = await addressService.getAddresses();
                const list = Array.isArray(data) ? data : data?.items || [];
                setAddresses(list);

                // Pick default, or first in list
                const def = list.find((a) => a.isDefault) || list[0] || null;
                setSelected(def);
                if (def) onSelect?.(def);
            } catch {
                setAddresses([]);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    // Sync if parent controlled selection changes
    useEffect(() => {
        if (selectedId && addresses.length) {
            const match = addresses.find((a) => a._id === selectedId);
            if (match) setSelected(match);
        }
    }, [selectedId, addresses]);

    const handleSelect = (addr) => {
        setSelected(addr);
        setOpen(false);
        onSelect?.(addr);
    };

    if (loading) {
        return (
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl px-4 py-4 md:px-6">
                <div className="h-4 w-48 bg-[#2A2A2A] rounded animate-pulse" />
            </div>
        );
    }

    if (!addresses.length) {
        return (
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl px-4 py-4 md:px-6 flex items-center justify-between">
                <span className="text-gray-400 text-sm">
                    No saved addresses
                </span>
                <Link
                    to="/addresses"
                    className="text-[var(--color-primary-gold)] text-sm hover:underline"
                >
                    + Add Address
                </Link>
            </div>
        );
    }

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl px-4 py-4 md:px-6 relative">
            <div className="flex items-start justify-between gap-4">
                {/* Selected address info */}
                <div className="text-sm leading-relaxed">
                    <p className="text-gray-400 text-xs mb-1">Deliver to:</p>
                    {selected ? (
                        <>
                            <p className="font-semibold text-white">
                                {selected.fullName}
                                {selected.isDefault && (
                                    <span className="ml-2 text-[10px] bg-[var(--color-primary-gold)] text-black px-1.5 py-0.5 rounded font-bold uppercase tracking-wide">
                                        Default
                                    </span>
                                )}
                            </p>
                            <p className="text-gray-300 mt-0.5">
                                {selected.houseNo}, {selected.area}
                                {selected.landmark
                                    ? `, ${selected.landmark}`
                                    : ""}
                            </p>
                            <p className="text-gray-300">
                                {selected.city}, {selected.state} —{" "}
                                {selected.pincode}
                            </p>
                            <p className="text-gray-400 text-xs mt-0.5">
                                📞 {selected.phone}
                            </p>
                        </>
                    ) : (
                        <p className="text-gray-400">Select an address</p>
                    )}
                </div>

                {/* Change button */}
                <button
                    onClick={() => setOpen(!open)}
                    className="flex-shrink-0 flex items-center gap-1 text-[var(--color-primary-gold)] text-sm hover:text-[var(--color-accent-gold)] transition font-medium mt-1"
                >
                    Change
                    <svg
                        className={`w-4 h-4 transition-transform ${open ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth="2"
                            d="M19 9l-7 7-7-7"
                        />
                    </svg>
                </button>
            </div>

            {/* Delivery time */}
            <p className="text-gray-500 text-xs mt-3 flex items-center gap-1.5">
                🚚 Delivered in{" "}
                <span className="text-gray-400">5–7 Business Days</span>
            </p>

            {/* Dropdown list */}
            {open && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-[#111111] border border-[#2A2A2A] rounded-xl shadow-xl overflow-hidden z-40">
                    {addresses.map((addr) => (
                        <button
                            key={addr._id}
                            onClick={() => handleSelect(addr)}
                            className={`w-full text-left px-4 py-3 text-sm hover:bg-[#1a1a1a] transition border-b border-[#1e1e1e] last:border-0 ${
                                selected?._id === addr._id
                                    ? "text-[var(--color-primary-gold)]"
                                    : "text-white"
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="font-medium">
                                        {addr.fullName}
                                    </p>
                                    <p className="text-gray-400 text-xs mt-0.5">
                                        {addr.houseNo}, {addr.city},{" "}
                                        {addr.pincode}
                                    </p>
                                </div>
                                {addr.isDefault && (
                                    <span className="text-[10px] bg-[var(--color-primary-gold)] text-black px-1.5 py-0.5 rounded font-bold uppercase">
                                        Default
                                    </span>
                                )}
                            </div>
                        </button>
                    ))}
                    <Link
                        to="/addresses"
                        className="block w-full text-center px-4 py-3 text-xs text-[var(--color-primary-gold)] hover:bg-[#1a1a1a] transition"
                    >
                        + Manage Addresses
                    </Link>
                </div>
            )}
        </div>
    );
};

export default AddressSelector;
