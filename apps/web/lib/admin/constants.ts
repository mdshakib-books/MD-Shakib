export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Packed", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out for Delivery", "Cancelled"],
  "Out for Delivery": ["Delivered", "Cancelled"],
  Delivered: ["Replacement Requested"],
  Cancelled: [],
  Returned: [],
  "Replacement Requested": ["Replacement Approved", "Replacement Rejected"],
  "Replacement Approved": ["Replacement Shipped"],
  "Replacement Rejected": [],
  "Replacement Shipped": ["Replacement Delivered"],
  "Replacement Delivered": [],
};

