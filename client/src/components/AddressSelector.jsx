import React, { useState } from "react";

const mockAddresses = [
    {
        id: 1,
        city: "Meerut",
        pincode: "250004",
        label: "Home",
    },
    {
        id: 2,
        city: "Delhi",
        pincode: "110025",
        label: "Office",
    },
    {
        id: 3,
        city: "Lucknow",
        pincode: "226010",
        label: "Other",
    },
];

const AddressSelector = () => {
    const [selected, setSelected] = useState(mockAddresses[0]);
    const [open, setOpen] = useState(false);

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl px-4 py-4 md:px-6 flex items-center justify-between relative">

            {/* LEFT */}
            <div className="text-sm md:text-base">
                <span className="text-gray-400">Deliver to:</span>{" "}
                <span className="font-semibold">
                    {selected.city} - {selected.pincode}
                </span>
            </div>

            {/* CHANGE BUTTON */}
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 text-[var(--color-primary-gold)] text-sm hover:text-[var(--color-accent-gold)] transition"
            >
                Change

                <svg
                    className={`w-4 h-4 transition ${
                        open ? "rotate-180" : ""
                    }`}
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

            {/* DROPDOWN */}
            {open && (
                <div className="absolute right-4 top-[60px] w-[220px] bg-[#111111] border border-[#2A2A2A] rounded-lg shadow-xl overflow-hidden z-40">

                    {mockAddresses.map((addr) => (
                        <button
                            key={addr.id}
                            onClick={() => {
                                setSelected(addr);
                                setOpen(false);
                            }}
                            className="w-full text-left px-4 py-3 hover:bg-[#1a1a1a] text-sm flex justify-between"
                        >
                            <span>
                                {addr.city} - {addr.pincode}
                            </span>

                            <span className="text-gray-400 text-xs">
                                {addr.label}
                            </span>
                        </button>
                    ))}

                </div>
            )}
        </div>
    );
};

export default AddressSelector;