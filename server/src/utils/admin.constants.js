export const ADMIN_ROLES = {
    SUPER_ADMIN: "super_admin",
    MANAGER: "manager",
};

export const ORDER_STATUS_TRANSITIONS = {
    "Pending": ["Confirmed", "Cancelled"],
    "Confirmed": ["Packed", "Cancelled"],
    "Packed": ["Shipped", "Cancelled"],
    "Shipped": ["Out for Delivery", "Cancelled"],
    "Out for Delivery": ["Delivered", "Cancelled"],
    "Delivered": ["Replacement Requested"],
    "Cancelled": [],
    "Returned": [],
    "Replacement Requested": ["Replacement Approved", "Replacement Rejected"],
    "Replacement Approved": ["Replacement Shipped"],
    "Replacement Rejected": [],
    "Replacement Shipped": ["Replacement Delivered"],
    "Replacement Delivered": [],
};

export const DASHBOARD_CONFIG = {
    TOP_SELLING_LIMIT: 5,
};
