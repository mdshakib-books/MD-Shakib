export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Processing", "Packed", "Shipped", "Cancelled"],
  Processing: ["Packed", "Shipped", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out for Delivery", "Delivered", "Cancelled", "Returned"],
  "Out for Delivery": ["Delivered", "Cancelled", "Returned"],
  Delivered: ["Replacement Requested"],
  Cancelled: [],
  Returned: [],
  "Replacement Requested": ["Replacement Approved", "Replacement Rejected"],
  "Replacement Approved": ["Replacement Shipped"],
  "Replacement Rejected": [],
  "Replacement Shipped": ["Replacement Delivered"],
  "Replacement Delivered": [],
};

