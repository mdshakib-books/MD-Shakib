/**
 * Authoritative allowed status transitions (mirrors validate_order_state_transitions trigger).
 * Dispatched orders ('Shipped', 'Out for Delivery') NEVER allow direct transition to 'Cancelled';
 * post-dispatch cancellation must use the courier-confirmed cancellation workflow.
 */
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Processing", "Packed", "Shipped", "Cancelled"],
  Processing: ["Packed", "Shipped", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out for Delivery", "Delivered", "Returned"],
  "Out for Delivery": ["Delivered", "Returned"],
  Delivered: ["Replacement Requested", "Returned"],
  Cancelled: [],
  Returned: [],
  "Replacement Requested": ["Replacement Approved", "Replacement Rejected"],
  "Replacement Approved": ["Replacement Shipped"],
  "Replacement Rejected": [],
  "Replacement Shipped": ["Replacement Delivered"],
  "Replacement Delivered": [],
};

export const FULFILLMENT_SHIPPING_STATUSES = new Set([
  "Shipped",
  "Out for Delivery",
  "Delivered",
  "Returned",
]);

export const DISPATCHED_ORDER_STATUSES = new Set(["Shipped", "Out for Delivery"]);

/**
 * Resolves a real external tracking URL strictly when valid and appropriate.
 * Never constructs a Delhivery URL for non-Delhivery or manual shipments without a link.
 */
export function resolveOrderTrackingUrl(params: {
  courier?: string | null;
  awb?: string | null;
  trackingUrl?: string | null;
  bookingMode?: string | null;
}): string | null {
  const explicit = (params.trackingUrl || "").trim();
  if (explicit && /^https?:\/\//i.test(explicit)) {
    return explicit;
  }

  const courierNormalized = (params.courier || "").trim().toLowerCase();
  const awb = (params.awb || "").trim();
  const isDelhivery =
    params.bookingMode === "delhivery" || courierNormalized === "delhivery";

  if (isDelhivery && awb) {
    return `https://track.delhivery.com/p/${encodeURIComponent(awb)}`;
  }

  return null;
}

/**
 * Returns true if the order is managed as a Delhivery shipment.
 */
export function isDelhiveryShipment(params: {
  courier?: string | null;
  bookingMode?: string | null;
  trackingUrl?: string | null;
}): boolean {
  if (params.bookingMode === "manual") return false;
  if (params.bookingMode === "delhivery") return true;
  if ((params.courier || "").trim().toLowerCase() === "delhivery") return true;
  if ((params.trackingUrl || "").toLowerCase().includes("track.delhivery.com")) return true;
  return false;
}

/**
 * Validates that an AWB string is not a fabricated placeholder like DLH-xxxxxxxx.
 */
export function isSyntheticPlaceholderAwb(awb?: string | null): boolean {
  const clean = (awb || "").trim();
  if (!clean) return false;
  return /^DLH-[0-9A-F]{8}$/i.test(clean);
}

