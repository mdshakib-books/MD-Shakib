import React from "react";
import { formatPrice } from "../utils/formatPrice";

const Row = ({ label, value, bold, highlight, strikethrough, green }) => (
    <div
        className={`flex justify-between text-sm py-1.5 ${bold ? "font-semibold" : ""}`}
    >
        <span className={`${highlight ? "text-white" : "text-gray-400"}`}>
            {label}
        </span>
        <span
            className={`${
                green
                    ? "text-green-400"
                    : highlight
                      ? "text-[var(--color-primary-gold)] text-base"
                      : strikethrough
                        ? "text-gray-500 line-through"
                        : "text-white"
            }`}
        >
            {value}
        </span>
    </div>
);

const DELIVERY_FEE = 35;
const PLATFORM_FEE = 10;

const PriceBreakdownCard = ({ order }) => {
    if (!order) return null;

    const items = order.items || [];

    // MRP total = sum of (price * quantity) for each item
    const mrpTotal = items.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0,
    );

    // We use the stored totalAmount as the actual amount charged
    // The difference between mrp and charged = effective discount
    const charged = order.totalAmount || mrpTotal;
    const discount = Math.max(
        0,
        mrpTotal - charged + DELIVERY_FEE + PLATFORM_FEE,
    );

    // Final = mrpTotal - discount + delivery + platform
    const finalAmount = mrpTotal - discount + DELIVERY_FEE + PLATFORM_FEE;

    return (
        <div className="bg-[#111111] border border-[#2A2A2A] rounded-xl p-6 mb-6">
            <h3 className="font-heading text-lg text-[var(--color-primary-gold)] mb-4">
                Price Breakdown
            </h3>

            <div className="divide-y divide-[#1a1a1a]">
                <Row
                    label="Items Subtotal (MRP)"
                    value={formatPrice(mrpTotal)}
                />
                {discount > 0 && (
                    <Row
                        label="Discount"
                        value={`- ${formatPrice(discount)}`}
                        green
                    />
                )}
                <Row
                    label="Delivery Charges"
                    value={formatPrice(DELIVERY_FEE)}
                />
                <Row label="Platform Fee" value={formatPrice(PLATFORM_FEE)} />
                <div className="pt-2">
                    <Row
                        label="Total Amount"
                        value={formatPrice(finalAmount)}
                        bold
                        highlight
                    />
                </div>
            </div>

            {order.paymentMethod && (
                <p className="text-xs text-gray-500 mt-4 pt-3 border-t border-[#1a1a1a]">
                    Payment: {order.paymentMethod}
                    {order.paymentStatus === "Paid" && (
                        <span className="ml-2 text-green-400">● Paid</span>
                    )}
                    {order.paymentStatus === "Refunded" && (
                        <span className="ml-2 text-blue-400">● Refunded</span>
                    )}
                </p>
            )}
        </div>
    );
};

export default PriceBreakdownCard;
