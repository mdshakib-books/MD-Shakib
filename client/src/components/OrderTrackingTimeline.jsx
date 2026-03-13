import React from "react";
import {
    FiClock,
    FiCheckCircle,
    FiCreditCard,
    FiPackage,
    FiTruck,
    FiMapPin,
    FiHome,
    FiXCircle,
} from "react-icons/fi";

const PAYMENT_COMPLETED_STEP_KEY = "__PAYMENT_COMPLETED__";

const BASE_STEPS = [
    {
        key: "Pending",
        label: "Pending",
        icon: FiClock,
        desc: "Order placed",
    },
    {
        key: "Confirmed",
        label: "Confirmed",
        icon: FiCheckCircle,
        desc: "Order confirmed",
    },
    {
        key: "Packed",
        label: "Packed",
        icon: FiPackage,
        desc: "Packed and ready",
    },
    {
        key: "Shipped",
        label: "Shipped",
        icon: FiTruck,
        desc: "Courier picked up",
    },
    {
        key: "Out for Delivery",
        label: "Out for Delivery",
        icon: FiMapPin,
        desc: "Nearby for delivery",
    },
    {
        key: "Delivered",
        label: "Delivered",
        icon: FiHome,
        desc: "Successfully delivered",
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
    paymentMethod = "",
    paymentStatus = "",
    paidAt = null,
}) => {
    const isCancelled = orderStatus === "Cancelled" || orderStatus === "Returned";
    const isOnlinePayment =
        String(paymentMethod || "").toUpperCase() === "ONLINE" ||
        String(paymentMethod || "") === "Online";

    const steps = isOnlinePayment
        ? [
              BASE_STEPS[0],
              {
                  key: PAYMENT_COMPLETED_STEP_KEY,
                  label: "Payment Completed",
                  icon: FiCreditCard,
                  desc: "Online payment captured",
              },
              ...BASE_STEPS.slice(1),
          ]
        : BASE_STEPS;

    const historyMap = {};
    for (const entry of statusHistory) {
        historyMap[entry.status] = entry.timestamp;
    }

    if (isOnlinePayment && paidAt) {
        historyMap[PAYMENT_COMPLETED_STEP_KEY] = paidAt;
    }

    let currentIdx = steps.findIndex((s) => s.key === orderStatus);
    if (currentIdx === -1 && String(orderStatus || "").startsWith("Replacement")) {
        currentIdx = steps.findIndex((s) => s.key === "Delivered");
    }

    if (isOnlinePayment && paymentStatus === "Paid") {
        const paymentStepIndex = steps.findIndex(
            (s) => s.key === PAYMENT_COMPLETED_STEP_KEY,
        );
        if (paymentStepIndex >= 0) {
            currentIdx = Math.max(currentIdx, paymentStepIndex);
        }
    }

    const extraEvents = (statusHistory || []).filter(
        (entry) => !steps.some((s) => s.key === entry.status),
    );

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
            <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-6">
                Order Tracking
            </h3>

            {isCancelled ? (
                <div className="flex items-center gap-3 p-4 bg-red-900/20 border border-red-600/30 rounded-xl">
                    <FiXCircle className="text-red-400 w-6 h-6 shrink-0" />
                    <div>
                        <p className="text-red-400 font-semibold">Order {orderStatus}</p>
                        {cancelReason && (
                            <p className="text-gray-400 text-sm mt-0.5">Reason: {cancelReason}</p>
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
                    <div className="hidden md:flex items-start relative">
                        {steps.map((step, idx) => {
                            const isDone = currentIdx >= 0 && idx <= currentIdx;
                            const isCurrent = idx === currentIdx;
                            const Icon = step.icon;
                            const ts = historyMap[step.key];

                            return (
                                <div key={step.key} className="flex-1 flex flex-col items-center relative">
                                    {idx < steps.length - 1 && (
                                        <div
                                            className={`absolute top-5 left-1/2 w-full h-0.5 transition-all ${
                                                isDone && idx < currentIdx
                                                    ? "bg-[var(--color-primary-gold)]"
                                                    : "bg-[#2A2A2A]"
                                            }`}
                                        />
                                    )}

                                    <div
                                        className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all ${
                                            isDone
                                                ? "bg-[var(--color-primary-gold)] border-[var(--color-primary-gold)]"
                                                : "bg-[#1a1a1a] border-[#2A2A2A]"
                                        } ${
                                            isCurrent
                                                ? "ring-4 ring-[var(--color-primary-gold)]/20 animate-pulse"
                                                : ""
                                        }`}
                                    >
                                        <Icon
                                            className={`w-4 h-4 ${
                                                isDone ? "text-black" : "text-gray-600"
                                            }`}
                                        />
                                    </div>

                                    <p
                                        className={`mt-2 text-xs font-semibold text-center leading-tight ${
                                            isDone
                                                ? "text-[var(--color-primary-gold)]"
                                                : "text-gray-600"
                                        }`}
                                    >
                                        {step.label}
                                    </p>

                                    {ts && (
                                        <p className="text-[10px] text-gray-500 mt-0.5 text-center">
                                            {formatDate(ts)}
                                        </p>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div className="md:hidden space-y-0">
                        {steps.map((step, idx) => {
                            const isDone = currentIdx >= 0 && idx <= currentIdx;
                            const isCurrent = idx === currentIdx;
                            const Icon = step.icon;
                            const ts = historyMap[step.key];

                            return (
                                <div key={step.key} className="flex gap-3">
                                    <div className="flex flex-col items-center">
                                        <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center border-2 shrink-0 ${
                                                isDone
                                                    ? "bg-[var(--color-primary-gold)] border-[var(--color-primary-gold)]"
                                                    : "bg-[#1a1a1a] border-[#2A2A2A]"
                                            } ${
                                                isCurrent
                                                    ? "ring-2 ring-[var(--color-primary-gold)]/30 animate-pulse"
                                                    : ""
                                            }`}
                                        >
                                            <Icon
                                                className={`w-3.5 h-3.5 ${
                                                    isDone ? "text-black" : "text-gray-600"
                                                }`}
                                            />
                                        </div>
                                        {idx < steps.length - 1 && (
                                            <div
                                                className={`w-0.5 flex-1 min-h-[24px] my-1 ${
                                                    isDone && idx < currentIdx
                                                        ? "bg-[var(--color-primary-gold)]"
                                                        : "bg-[#2A2A2A]"
                                                }`}
                                            />
                                        )}
                                    </div>

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
                                        <p className="text-xs text-gray-600 mt-0.5">{step.desc}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {extraEvents.length > 0 && (
                        <div className="border-t border-[#2A2A2A] mt-6 pt-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">
                                Additional Updates
                            </p>
                            <div className="space-y-1.5">
                                {extraEvents.map((entry, idx) => (
                                    <div key={`${entry.status}-${idx}`} className="flex justify-between text-xs">
                                        <span className="text-gray-300">{entry.status}</span>
                                        <span className="text-gray-500">{formatDate(entry.timestamp)}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default OrderTrackingTimeline;
