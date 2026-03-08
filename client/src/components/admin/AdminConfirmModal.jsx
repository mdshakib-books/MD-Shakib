import React, { useState } from "react";

/**
 * Reusable confirmation modal for admin destructive actions.
 *
 * Props:
 *   title        - Modal heading
 *   message      - Body text
 *   onConfirm    - Called with (reason?) when confirmed
 *   onCancel     - Called when dismissed
 *   dangerous    - true → red confirm button; false → gold button
 *   requireReason - true → shows a textarea; user must fill it before confirming
 *   loading      - Controlled externally; disables buttons while true
 */
const AdminConfirmModal = ({
    title = "Are you sure?",
    message = "",
    onConfirm,
    onCancel,
    dangerous = true,
    requireReason = false,
    loading = false,
}) => {
    const [reason, setReason] = useState("");
    const canConfirm = !requireReason || reason.trim().length >= 3;

    const handleConfirm = () => {
        if (!canConfirm || loading) return;
        onConfirm(reason.trim());
    };

    return (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4">
            <div className="w-full max-w-sm bg-[#111111] border border-[#2A2A2A] rounded-2xl p-6 shadow-2xl">
                {/* Title */}
                <h2
                    className={`font-heading text-lg mb-2 ${
                        dangerous
                            ? "text-red-400"
                            : "text-[var(--color-primary-gold)]"
                    }`}
                >
                    {title}
                </h2>

                {/* Message */}
                {message && (
                    <p className="text-gray-400 text-sm mb-4">{message}</p>
                )}

                {/* Optional reason textarea */}
                {requireReason && (
                    <div className="mb-4">
                        <label className="text-xs text-gray-500 mb-1 block">
                            Reason <span className="text-red-400">*</span>
                        </label>
                        <textarea
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Enter reason..."
                            rows={3}
                            className="w-full bg-[#0B0B0B] border border-[#2A2A2A] rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-[var(--color-primary-gold)]"
                        />
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3">
                    <button
                        onClick={onCancel}
                        disabled={loading}
                        className="flex-1 py-2.5 rounded-lg border border-[#2A2A2A] text-gray-400 text-sm hover:border-[#3A3A3A] transition disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!canConfirm || loading}
                        className={`flex-1 py-2.5 rounded-lg font-bold text-sm transition disabled:opacity-40 disabled:cursor-not-allowed ${
                            dangerous
                                ? "bg-red-600 text-white hover:bg-red-700"
                                : "bg-[var(--color-primary-gold)] text-black hover:bg-[var(--color-accent-gold)]"
                        }`}
                    >
                        {loading ? "Processing…" : "Confirm"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AdminConfirmModal;
