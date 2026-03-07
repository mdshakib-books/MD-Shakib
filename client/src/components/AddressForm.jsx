import React, { useState } from "react";
import { addressService } from "../services/addressService";

const AddressForm = ({ address, onClose, onSuccess }) => {
    const [form, setForm] = useState({
        fullName: address?.fullName || "",
        phone: address?.phone || "",
        pincode: address?.pincode || "",
        state: address?.state || "",
        city: address?.city || "",
        houseNo: address?.houseNo || "",
        area: address?.area || "",
        landmark: address?.landmark || "",
        isDefault: address?.isDefault || false,
    });

    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (address) {
            await addressService.updateAddress(address._id, form);
        } else {
            await addressService.addAddress(form);
        }

        onSuccess();
    };

    const inputStyle = "bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm outline-none focus:border-[var(--color-primary-gold)] w-full transition-colors";

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-8">
            <h2 className="font-heading text-lg text-[var(--color-primary-gold)] mb-6">
                {address ? "Edit Address" : "Add New Address"}
            </h2>

            <form onSubmit={handleSubmit} className="grid md:grid-cols-2 gap-4">
                <input
                    name="fullName"
                    placeholder="Full Name"
                    value={form.fullName}
                    onChange={handleChange}
                    className={inputStyle}
                    required
                />

                <input
                    className={inputStyle}
                    name="phone"
                    placeholder="Phone Number"
                    value={form.phone}
                    onChange={handleChange}
                    required
                />

                <input
                    name="pincode"
                    placeholder="Pincode"
                    value={form.pincode}
                    onChange={handleChange}
                    className={inputStyle}
                    required
                />

                <input
                    name="city"
                    placeholder="City"
                    value={form.city}
                    onChange={handleChange}
                    className={inputStyle}
                    required
                />

                <input
                    name="state"
                    placeholder="State"
                    value={form.state}
                    onChange={handleChange}
                    className={inputStyle}
                    required
                />

                <input
                    name="houseNo"
                    placeholder="House / Flat No."
                    value={form.houseNo}
                    onChange={handleChange}
                    className={inputStyle}
                />

                <input
                    name="area"
                    placeholder="Area / Street"
                    value={form.area}
                    onChange={handleChange}
                    className={inputStyle}
                    required
                />

                <input
                    name="landmark"
                    placeholder="Landmark (Optional)"
                    value={form.landmark}
                    onChange={handleChange}
                    className={inputStyle}
                />

                <label className="flex items-center gap-2 md:col-span-2 text-sm">
                    <input
                        type="checkbox"
                        checked={form.isDefault}
                        onChange={(e) =>
                            setForm({ ...form, isDefault: e.target.checked })
                        }
                    />
                    Set as default address
                </label>

                <div className="flex gap-4 md:col-span-2 mt-4">
                    <button
                        type="submit"
                        className="bg-[var(--color-primary-gold)] text-black px-6 py-2 rounded-lg font-semibold"
                    >
                        Save Address
                    </button>

                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AddressForm;
