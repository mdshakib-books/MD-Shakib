import React from "react";
import {
    FiClock,
    FiCheckCircle,
    FiPackage,
    FiTruck,
    FiHome,
    FiXCircle,
} from "react-icons/fi";

const STEPS = [
    {
        key: "Pending",
        label: "Pending",
        icon: FiClock,
        desc: "Order placed",
    },
    {
        key: "Paid",
        label: "Paid",
        icon: FiCheckCircle,
        desc: "Payment completed",
    },
    {
        key: "Packed",
        label: "Packed",
        icon: FiPackage,
        desc: "Packed & ready",
    },
    {
        key: "Shipped",
        label: "Shipped",
        icon: FiTruck,
        desc: "On the way",
    },
    {
        key: "Delivered",
        label: "Delivered",
        icon: FiHome,
        desc: "Delivered!",
    },
];

const formatDate = (ts) => {
    if (!ts) return null;
    return new Date(ts).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
    });
};

const OrderTrackingTimeline = ({
    orderStatus,
    statusHistory = [],
    cancelReason = "",
}) => {
    const isCancelled =
        orderStatus === "Cancelled" || orderStatus === "Returned";

    // Build a lookup of status → timestamp from history
    const historyMap = {};
    for (const entry of statusHistory) {
        historyMap[entry.status] = entry.timestamp;
    }

    const currentIdx = STEPS.findIndex((s) => s.key === orderStatus);

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
            <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-6">
                Order Tracking
            </h3>

            {isCancelled ? (
                <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-600/30 rounded-xl">
                    <FiXCircle className="text-red-400 w-6 h-6 shrink-0" />
                    <div>
                        <p className="text-red-400 font-semibold">
                            Order {orderStatus}
                        </p>
                        {cancelReason && (
                            <p className="text-gray-400 text-sm mt-0.5">
                                Reason: {cancelReason}
                            </p>
                        )}
                        {historyMap[orderStatus] && (
                            <p className="text-gray-500 text-xs mt-1">
                                {formatDate(historyMap[orderStatus])}
                            </p>
                        )}
                    </div>
                </div>
            ) : (
                <>
                    {/* ── Desktop: horizontal steps ─────────────────────── */}
                    <div className="hidden md:flex items-start relative">
                        {STEPS.map((step, idx) => {
                            const isDone = idx <= currentIdx;
                            const isCurrent = idx === currentIdx;
                            const Icon = step.icon;
                            const ts = historyMap[step.key];

                            return (
                                <div
                                    key={step.key}
                                    className="flex-1 flex flex-col items-center relative"
                                >
                                    {/* Connector line */}
                                    {idx < STEPS.length - 1 && (
                                        <div
                                            className={`absolute top-5 left-1/2 w-full h-0.5 transition-all ${
                                                isDone && idx < currentIdx
                                                    ? "bg-[var(--color-primary-gold)]"
                                                    : "bg-[#2A2A2A]"
                                            }`}
                                        />
                                    )}

                                    {/* Circle */}
                                    <div
                                        className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                                            isDone
                                                ? "bg-[var(--color-primary-gold)] border-[var(--color-primary-gold)]"
                                                : "bg-[#1a1a1a] border-[#2A2A2A]"
                                        } ${isCurrent ? "ring-4 ring-[var(--color-primary-gold)]/20 animate-pulse" : ""}`}
                                    >
                                        <Icon
                                            className={`w-4 h-4 ${isDone ? "text-black" : "text-gray-600"}`}
                                        />
                                    </div>

                                    {/* Label */}
                                    <p
                                        className={`mt-2 text-xs font-semibold text-center leading-tight ${
                                            isDone
                                                ? "text-[var(--color-primary-gold)]"
                                                : "text-gray-600"
                                        }`}
                                    >
                                        {step.label}
                                    </p>

                                    {/* Timestamp */}
                                    {ts && (
                                        <p className="text-[10px] text-gray-500 mt-0.5 text-center">
                                            {formatDate(ts)}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    {/* ── Mobile: vertical timeline ─────────────────────── */}
                    <div className="md:hidden space-y-0">
                        {STEPS.map((step, idx) => {
                            const isDone = idx <= currentIdx;
                            const isCurrent = idx === currentIdx;
                            const Icon = step.icon;
                            const ts = historyMap[step.key];

                            return (
                                <div key={step.key} className="flex gap-3">
                                    {/* Left: icon + line */}
                                    <div className="flex flex-col items-center">
                                        <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 ${
                                                isDone
                                                    ? "bg-[var(--color-primary-gold)] border-[var(--color-primary-gold)]"
                                                    : "bg-[#1a1a1a] border-[#2A2A2A]"
                                            } ${isCurrent ? "ring-2 ring-[var(--color-primary-gold)]/30 animate-pulse" : ""}`}
                                        >
                                            <Icon
                                                className={`w-3.5 h-3.5 ${isDone ? "text-black" : "text-gray-600"}`}
                                            />
                                        </div>
                                        {idx < STEPS.length - 1 && (
                                            <div
                                                className={`w-0.5 flex-1 min-h-[24px] my-1 ${
                                                    isDone && idx < currentIdx
                                                        ? "bg-[var(--color-primary-gold)]"
                                                        : "bg-[#2A2A2A]"
                                                }`}
                                            />
                                        )}
                                    </div>

                                    {/* Right: text */}
                                    <div className="pb-4 pt-0.5">
                                        <p
                                            className={`text-sm font-medium ${
                                                isDone
                                                    ? "text-[var(--color-primary-gold)]"
                                                    : "text-gray-600"
                                            }`}
                                        >
                                            {step.label}
                                        </p>
                                        {ts && (
                                            <p className="text-xs text-gray-500 mt-0.5">
                                                {formatDate(ts)}
                                            </p>
                                        )}
                                        <p className="text-xs text-gray-600 mt-0.5">
                                            {step.desc}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

export default OrderTrackingTimeline;
