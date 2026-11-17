/**
 * Authoritative Single Source of Truth (SSOT) for Cart, Checkout, Invoice,
 * Courier Payload, and Gateway Pricing & Shipping Fee Calculations.
 *
 * Matches PostgreSQL `calculate_cart_pricing` and `create_order_atomic`
 * 2-decimal arithmetic (`ROUND(..., 2)`) and fixed fee policy:
 *   - Platform Fee: ₹10.00 per non-empty order
 *   - Standard Delivery Fee: ₹35.00 per non-empty order
 */

export const PLATFORM_FEE = 10;
export const DELIVERY_FEE = 35;

export interface PricingLineInput {
  price: number;
  discount?: number | null;
  quantity: number;
}

export interface ComputedPricingLine extends PricingLineInput {
  effectivePrice: number;
  lineTotal: number;
}

export interface OrderPricingSummary {
  subtotal: number;
  platformFee: number;
  deliveryFee: number;
  discountAmount: number;
  totalAmount: number;
  totalPaise: number;
  itemCount: number;
  items: ComputedPricingLine[];
}

/**
 * Rounds currency figures accurately to 2 decimal places, matching SQL NUMERIC(10,2).
 */
export function roundCurrency(value: number): number {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round((num + Math.sign(num) * Number.EPSILON) * 100) / 100;
}

/**
 * Converts a rupee amount into integer paise cleanly for Razorpay / integer reconciliation.
 */
export function toPaise(rupees: number): number {
  return Math.round(roundCurrency(rupees) * 100);
}

/**
 * Computes discounted unit price using the exact 2-decimal precision rule used by SQL RPCs.
 */
export function calculateDiscountedUnitPrice(
  basePrice: number,
  discountPercent?: number | null
): number {
  const safeBase = Math.max(0, Number(basePrice) || 0);
  const safeDiscount = Math.max(0, Math.min(100, Number(discountPercent) || 0));
  if (safeDiscount <= 0) {
    return roundCurrency(safeBase);
  }
  return roundCurrency(safeBase * (1 - safeDiscount / 100));
}

/**
 * Computes rounded line total = effectivePrice * quantity.
 */
export function calculateLineTotal(unitPrice: number, quantity: number): number {
  const safeQty = Math.max(0, Math.floor(Number(quantity) || 0));
  return roundCurrency((Number(unitPrice) || 0) * safeQty);
}

/**
 * Authoritative fee resolver for non-empty vs empty carts/orders.
 */
export function calculateOrderFees(hasItems: boolean): {
  platformFee: number;
  deliveryFee: number;
} {
  if (!hasItems) {
    return { platformFee: 0, deliveryFee: 0 };
  }
  return {
    platformFee: PLATFORM_FEE,
    deliveryFee: DELIVERY_FEE,
  };
}

/**
 * Computes full order/cart pricing breakdown across UI, Server Actions, Gateway, and Courier payloads.
 */
export function calculateOrderPricing(params: {
  items: PricingLineInput[];
  couponDiscount?: number;
  overrideFees?: { platformFee?: number; deliveryFee?: number };
}): OrderPricingSummary {
  const items: ComputedPricingLine[] = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const raw of params.items || []) {
    const qty = Math.max(0, Math.floor(Number(raw.quantity) || 0));
    if (qty <= 0) continue;
    const effectivePrice = calculateDiscountedUnitPrice(raw.price, raw.discount);
    const lineTotal = calculateLineTotal(effectivePrice, qty);
    items.push({
      ...raw,
      quantity: qty,
      effectivePrice,
      lineTotal,
    });
    subtotal = roundCurrency(subtotal + lineTotal);
    itemCount += qty;
  }

  const defaultFees = calculateOrderFees(itemCount > 0);
  const platformFee =
    params.overrideFees?.platformFee !== undefined
      ? roundCurrency(Math.max(0, Number(params.overrideFees.platformFee) || 0))
      : defaultFees.platformFee;
  const deliveryFee =
    params.overrideFees?.deliveryFee !== undefined
      ? roundCurrency(Math.max(0, Number(params.overrideFees.deliveryFee) || 0))
      : defaultFees.deliveryFee;

  const requestedDiscount = roundCurrency(Math.max(0, Number(params.couponDiscount) || 0));
  const discountAmount = Math.min(requestedDiscount, subtotal);
  const totalAmount = roundCurrency(Math.max(0, subtotal + platformFee + deliveryFee - discountAmount));

  return {
    subtotal,
    platformFee,
    deliveryFee,
    discountAmount,
    totalAmount,
    totalPaise: toPaise(totalAmount),
    itemCount,
    items,
  };
}
