import React from "react";

const LogoutModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 w-[90%] max-w-sm text-center shadow-xl">

                <h3 className="text-lg font-semibold text-white">
                    Confirm Logout
                </h3>

                <p className="text-gray-400 text-sm mt-2">
                    Are you sure you want to logout?
                </p>

                <div className="flex gap-4 mt-6">
                    <button
                        onClick={onClose}
                        className="flex-1 py-2 rounded-lg border border-[#2A2A2A] text-gray-300 hover:bg-[#1a1a1a]"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={onConfirm}
                        className="flex-1 py-2 rounded-lg bg-red-500 text-white font-medium hover:bg-red-600"
                    >
                        Logout
                    </button>
                </div>
            </div>
        </div>
    );
};

export default LogoutModal;