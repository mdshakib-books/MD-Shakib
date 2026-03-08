export const ADMIN_ROLES = {
    SUPER_ADMIN: "super_admin",
    MANAGER: "manager",
};

export const ORDER_STATUS_TRANSITIONS = {
    Pending: ["Paid", "Cancelled"],
    Paid: ["Packed", "Cancelled"],
    Packed: ["Shipped"],
    Shipped: ["Delivered"],
    Delivered: [],
    Cancelled: [],
    Returned: [],
};

export const DASHBOARD_CONFIG = {
    TOP_SELLING_LIMIT: 5,
};
