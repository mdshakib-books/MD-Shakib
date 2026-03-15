import React, { useState } from "react";
import { addressService } from "../services/addressService";
import { validateField, inputBorder } from "../utils/validators";

const inputCls = (err) =>
    `bg-[#0B0B0B] border rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:outline-none transition w-full ${inputBorder(err)}`;

const ADDRESS_TYPES = ["Home", "Office", "Other"];

const INITIAL = {
    fullName: "",
    phone: "",
    pincode: "",
    state: "",
    city: "",
    houseNo: "",
    area: "",
    landmark: "",
    addressType: "Home",
    isDefault: false,
};

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
        addressType: ADDRESS_TYPES.includes(address?.addressType)
            ? address.addressType
            : INITIAL.addressType,
        isDefault: address?.isDefault || false,
    });
    const [errors, setErrors] = useState({});
    const [submitting, setSubmitting] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((p) => ({ ...p, [name]: value }));
        if (errors[name]) setErrors((p) => ({ ...p, [name]: "" }));
    };

    // ── validate all address fields ───────────────────────────────────────────
    const validate = () => {
        const e = {};

        // Name — letters only
        const nameErr = validateField("name", form.fullName);
        if (nameErr) e.fullName = nameErr;

        // Phone — 10 digits
        const phoneErr = validateField("phone", form.phone);
        if (phoneErr) e.phone = phoneErr;

        // Pincode — 6 digits
        const pinErr = validateField("pincode", form.pincode);
        if (pinErr) e.pincode = pinErr;

        // Required text fields — min 2 chars
        const required = [
            ["city", "City"],
            ["state", "State"],
            ["houseNo", "House / Flat No."],
            ["area", "Area / Street"],
        ];
        required.forEach(([key, label]) => {
            if (!form[key] || form[key].trim().length < 2)
                e[key] = `${label} is required (min 2 characters)`;
        });

        if (!ADDRESS_TYPES.includes(form.addressType)) {
            e.addressType = "Please select a valid address type";
        }

        setErrors(e);
        return Object.keys(e).length === 0;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!validate()) return;

        setSubmitting(true);
        try {
            const payload = {
                ...form,
                addressType: ADDRESS_TYPES.includes(form.addressType)
                    ? form.addressType
                    : INITIAL.addressType,
            };

            if (address) {
                await addressService.updateAddress(address._id, payload);
            } else {
                await addressService.addAddress(payload);
            }
            onSuccess();
        } catch (err) {
            console.error("Address save error:", err);
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-8">
            <h2 className="font-heading text-lg text-[var(--color-primary-gold)] mb-6">
                {address ? "Edit Address" : "Add New Address"}
            </h2>

            <form
                onSubmit={handleSubmit}
                noValidate
                className="grid md:grid-cols-2 gap-4"
            >
                {/* Full Name */}
                <div>
                    <input
                        name="fullName"
                        placeholder="Full Name"
                        value={form.fullName}
                        onChange={handleChange}
                        className={inputCls(errors.fullName)}
                    />
                    {errors.fullName && (
                        <p className="text-red-400 text-xs mt-1">
                            {errors.fullName}
                        </p>
                    )}
                </div>

                {/* Phone */}
                <div>
                    <input
                        name="phone"
                        placeholder="Phone Number (10 digits)"
                        value={form.phone}
                        onChange={handleChange}
                        maxLength={10}
                        className={inputCls(errors.phone)}
                    />
                    {errors.phone && (
                        <p className="text-red-400 text-xs mt-1">
                            {errors.phone}
                        </p>
                    )}
                </div>

                {/* Pincode */}
                <div>
                    <input
                        name="pincode"
                        placeholder="Pincode (6 digits)"
                        value={form.pincode}
                        onChange={handleChange}
                        maxLength={6}
                        className={inputCls(errors.pincode)}
                    />
                    {errors.pincode && (
                        <p className="text-red-400 text-xs mt-1">
                            {errors.pincode}
                        </p>
                    )}
                </div>

                {/* City */}
                <div>
                    <input
                        name="city"
                        placeholder="City"
                        value={form.city}
                        onChange={handleChange}
                        className={inputCls(errors.city)}
                    />
                    {errors.city && (
                        <p className="text-red-400 text-xs mt-1">
                            {errors.city}
                        </p>
                    )}
                </div>

                {/* State */}
                <div>
                    <input
                        name="state"
                        placeholder="State"
                        value={form.state}
                        onChange={handleChange}
                        className={inputCls(errors.state)}
                    />
                    {errors.state && (
                        <p className="text-red-400 text-xs mt-1">
                            {errors.state}
                        </p>
                    )}
                </div>

                {/* House No */}
                <div>
                    <input
                        name="houseNo"
                        placeholder="House / Flat No."
                        value={form.houseNo}
                        onChange={handleChange}
                        className={inputCls(errors.houseNo)}
                    />
                    {errors.houseNo && (
                        <p className="text-red-400 text-xs mt-1">
                            {errors.houseNo}
                        </p>
                    )}
                </div>

                {/* Area */}
                <div>
                    <input
                        name="area"
                        placeholder="Area / Street"
                        value={form.area}
                        onChange={handleChange}
                        className={inputCls(errors.area)}
                    />
                    {errors.area && (
                        <p className="text-red-400 text-xs mt-1">
                            {errors.area}
                        </p>
                    )}
                </div>

                {/* Landmark (optional) */}
                <div>
                    <input
                        name="landmark"
                        placeholder="Landmark (Optional)"
                        value={form.landmark}
                        onChange={handleChange}
                        className={inputCls(false)}
                    />
                </div>

                {/* Address type */}
                <div className="md:col-span-2">
                    <p className="text-gray-300 text-sm mb-2">Address Type</p>
                    <div className="flex flex-wrap gap-3">
                        {ADDRESS_TYPES.map((type) => {
                            const selected = form.addressType === type;
                            return (
                                <label
                                    key={type}
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm transition ${
                                        selected
                                            ? "border-[var(--color-primary-gold)] text-[var(--color-primary-gold)] bg-[#1a1a1a]"
                                            : "border-[#2A2A2A] text-gray-300 hover:border-[#3a3a3a]"
                                    }`}
                                >
                                    <input
                                        type="radio"
                                        name="addressType"
                                        value={type}
                                        checked={selected}
                                        onChange={handleChange}
                                        className="accent-[var(--color-primary-gold)]"
                                    />
                                    {type}
                                </label>
                            );
                        })}
                    </div>
                    {errors.addressType && (
                        <p className="text-red-400 text-xs mt-1">
                            {errors.addressType}
                        </p>
                    )}
                </div>

                {/* Default checkbox */}
                <label className="flex items-center gap-2 md:col-span-2 text-sm text-gray-400 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={form.isDefault}
                        onChange={(e) =>
                            setForm({ ...form, isDefault: e.target.checked })
                        }
                        className="accent-[var(--color-primary-gold)]"
                    />
                    Set as default address
                </label>

                {/* Actions */}
                <div className="flex gap-4 md:col-span-2 mt-2">
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex items-center gap-2 bg-[var(--color-primary-gold)] text-black px-6 py-2.5 rounded-lg font-semibold transition hover:bg-[var(--color-accent-gold)] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {submitting ? (
                            <svg
                                className="animate-spin w-4 h-4"
                                viewBox="0 0 24 24"
                                fill="none"
                            >
                                <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                />
                                <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8v8H4z"
                                />
                            </svg>
                        ) : null}
                        {submitting ? "Saving..." : "Save Address"}
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-gray-400 hover:text-white transition text-sm"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AddressForm;
