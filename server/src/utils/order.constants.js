export const ORDER_STATUS = {
    PENDING: "Pending",
    CONFIRMED: "Confirmed",
    PACKED: "Packed",
    SHIPPED: "Shipped",
    OUT_FOR_DELIVERY: "Out for Delivery",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
    REPLACEMENT_REQUESTED: "Replacement Requested",
    REPLACEMENT_APPROVED: "Replacement Approved",
    REPLACEMENT_REJECTED: "Replacement Rejected",
    REPLACEMENT_SHIPPED: "Replacement Shipped",
    REPLACEMENT_DELIVERED: "Replacement Delivered",
    RETURNED: "Returned",
};

export const PAYMENT_METHODS = {
    COD: "COD",
    ONLINE: "ONLINE",
};

export const normalizePaymentMethod = (paymentMethod = "") => {
    const normalized = String(paymentMethod || "")
        .trim()
        .toUpperCase();

    if (normalized === PAYMENT_METHODS.COD) return PAYMENT_METHODS.COD;
    if (normalized === PAYMENT_METHODS.ONLINE) return PAYMENT_METHODS.ONLINE;
    if (normalized === "ONLINE_PAYMENT" || normalized === "ONLINEPAYMENT") {
        return PAYMENT_METHODS.ONLINE;
    }

    // Backward-compatibility for existing stored "Online" values.
    if (String(paymentMethod || "").trim() === "Online") {
        return PAYMENT_METHODS.ONLINE;
    }

    return null;
};

// Define valid transitions to prevent invalid status flows
export const ORDER_STATUS_TRANSITIONS = {
    [ORDER_STATUS.PENDING]: [ORDER_STATUS.CONFIRMED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.CONFIRMED]: [ORDER_STATUS.PACKED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.PACKED]: [ORDER_STATUS.SHIPPED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.SHIPPED]: [ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.OUT_FOR_DELIVERY]: [ORDER_STATUS.DELIVERED, ORDER_STATUS.CANCELLED],
    [ORDER_STATUS.DELIVERED]: [ORDER_STATUS.REPLACEMENT_REQUESTED],
    [ORDER_STATUS.CANCELLED]: [],
    [ORDER_STATUS.RETURNED]: [],
    [ORDER_STATUS.REPLACEMENT_REQUESTED]: [
        ORDER_STATUS.REPLACEMENT_APPROVED,
        ORDER_STATUS.REPLACEMENT_REJECTED,
    ],
    [ORDER_STATUS.REPLACEMENT_APPROVED]: [ORDER_STATUS.REPLACEMENT_SHIPPED],
    [ORDER_STATUS.REPLACEMENT_REJECTED]: [],
    [ORDER_STATUS.REPLACEMENT_SHIPPED]: [ORDER_STATUS.REPLACEMENT_DELIVERED],
    [ORDER_STATUS.REPLACEMENT_DELIVERED]: [],
};
