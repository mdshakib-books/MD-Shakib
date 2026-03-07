import React from "react";
import { FiEdit, FiTrash2, FiCheck } from "react-icons/fi";
import { addressService } from "../services/addressService";

const AddressCard = ({ address, onEdit, onDelete }) => {
    const handleDelete = async () => {
        await addressService.deleteAddress(address._id);
        onDelete();
    };

    const setDefault = async () => {
        await addressService.setDefaultAddress(address._id);
        onDelete();
    };

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 hover:border-[var(--color-primary-gold)] transition">
            <div className="flex justify-between items-start">
                <span className="text-xs bg-[#1a1a1a] px-2 py-1 rounded uppercase">
                    Home
                </span>

                {address.isDefault && (
                    <span className="text-green-400 text-xs flex items-center gap-1">
                        <FiCheck /> Default
                    </span>
                )}
            </div>

            <h3 className="mt-3 font-semibold">{address.fullName}</h3>

            <p className="text-gray-400 text-sm mt-2 leading-relaxed">
                {address.houseNo}, {address.area}
                <br />
                {address.city}, {address.state} - {address.pincode}
            </p>

            <p className="text-gray-400 text-sm mt-2">📞 {address.phone}</p>

            <div className="flex gap-5 mt-4 text-sm">
                <button
                    onClick={onEdit}
                    className="flex items-center gap-1 text-[var(--color-primary-gold)]"
                >
                    <FiEdit /> Edit
                </button>

                <button
                    onClick={handleDelete}
                    className="flex items-center gap-1 text-red-400"
                >
                    <FiTrash2 /> Delete
                </button>

                {!address.isDefault && (
                    <button
                        onClick={setDefault}
                        className="text-gray-400 hover:text-white"
                    >
                        Set Default
                    </button>
                )}
            </div>
        </div>
    );
};

export default AddressCard;
