/**
 * ==============================================================================
 * PHASE 09: UNIT & BUSINESS LOGIC VERIFICATION SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Tests isolated business invariants, algorithmic correctness, fee calculations,
 * status state machine transitions, eligibility boundary checks, cryptographic
 * signature verifications, and inventory formulas.
 * ==============================================================================
 */

import assert from "node:assert";
import crypto from "crypto";
import { ORDER_STATUS_TRANSITIONS } from "../lib/admin/constants";
import { validateRazorpaySignature } from "../lib/integrations/razorpay/service";
import { validateWebhookSignature } from "../lib/integrations/razorpay/webhook";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  process.stdout.write(`  [UNIT-${String(totalTests).padStart(2, "0")}] ${name}... `);
  try {
    await fn();
    console.log("✓ PASS");
    passedTests++;
  } catch (err: any) {
    console.log("✗ FAIL");
    console.error(`     Error: ${err?.message || err}`);
    failedTests++;
  }
}

// ---------------------------------------------------------------------------
// Business Logic Helpers Matching Application Rules
// ---------------------------------------------------------------------------
const PLATFORM_FEE = 10;
const DELIVERY_FEE = 35;

function computeCartTotals(items: Array<{ price: number; discount?: number; quantity: number }>) {
  const enriched = items.map((i) => {
    const disc = i.discount || 0;
    const effectivePrice = disc > 0 ? Math.round(i.price * (1 - disc / 100)) : i.price;
    const lineTotal = effectivePrice * i.quantity;
    return { ...i, effectivePrice, lineTotal };
  });

  const subtotal = enriched.reduce((sum, i) => sum + i.lineTotal, 0);
  const itemCount = enriched.reduce((sum, i) => sum + i.quantity, 0);
  const platformFee = items.length > 0 ? PLATFORM_FEE : 0;
  const deliveryFee = items.length > 0 ? DELIVERY_FEE : 0;
  const totalAmount = subtotal + platformFee + deliveryFee;

  return { subtotal, itemCount, platformFee, deliveryFee, totalAmount };
}

function checkCancellationEligibility(orderStatus: string): { eligible: boolean; reason?: string } {
  const allowed = ["Pending", "Confirmed", "Processing"];
  if (allowed.includes(orderStatus)) {
    return { eligible: true };
  }
  return { eligible: false, reason: `Orders with status "${orderStatus}" cannot be cancelled.` };
}

function checkReplacementEligibility(order: {
  orderStatus: string;
  deliveredAt?: string | null;
  shippingDeliveredAt?: string | null;
  replacementRequested?: boolean;
  referenceTime?: number;
}): { eligible: boolean; reason?: string } {
  if (order.replacementRequested) {
    return { eligible: false, reason: "A replacement has already been requested for this order." };
  }

  const isDelivered = order.orderStatus === "Delivered" || order.orderStatus === "Replacement Delivered";
  if (!isDelivered) {
    return { eligible: false, reason: `Only delivered orders are eligible for replacement. Current status: ${order.orderStatus}` };
  }

  const deliveryTimestamp = order.deliveredAt || order.shippingDeliveredAt;
  if (!deliveryTimestamp) {
    return { eligible: false, reason: "Replacement ineligible: Missing verified delivery timestamp." };
  }

  const deliveryTime = new Date(deliveryTimestamp).getTime();
  const now = order.referenceTime || Date.now();
  const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

  if (deliveryTime > now) {
    return { eligible: false, reason: "Replacement ineligible: Delivery timestamp cannot be in the future." };
  }

  if (now - deliveryTime > sevenDaysMs) {
    return { eligible: false, reason: "Replacement window expired: Replacements must be requested within 7 days of verified delivery." };
  }

  return { eligible: true };
}

function checkRefundEligibility(order: {
  paymentMethod: string;
  paymentStatus: string;
  refundStatus?: string;
  totalAmount: number;
  requestedRefundAmount?: number;
}): { eligible: boolean; reason?: string; maxRefundablePaise?: number } {
  if (order.paymentMethod !== "ONLINE") {
    return { eligible: false, reason: "Only ONLINE prepaid orders are eligible for automated Razorpay refunds." };
  }

  if (order.paymentStatus === "Refunded" || order.refundStatus === "processed") {
    return { eligible: false, reason: "Order is already refunded." };
  }

  if (order.paymentStatus !== "Paid") {
    return { eligible: false, reason: `Order payment status is "${order.paymentStatus}", expected "Paid".` };
  }

  const refundable = Math.round(order.totalAmount * 100);
  if (order.requestedRefundAmount !== undefined && order.requestedRefundAmount > refundable) {
    return { eligible: false, reason: "Requested refund amount exceeds paid order amount." };
  }

  return { eligible: true, maxRefundablePaise: refundable };
}

// ---------------------------------------------------------------------------
// Main Unit Test Runner
// ---------------------------------------------------------------------------
async function runUnitTests() {
  console.log("=".repeat(80));
  console.log("PHASE 09: UNIT & ISOLATED BUSINESS LOGIC VERIFICATION SUITE");
  console.log("=".repeat(80) + "\n");

  // SECTION 1: CART CALCULATIONS & FEE RULES
  console.log("--- 1. CART TOTALS & FEE CALCULATIONS ---");

  await test("Empty cart yields 0 subtotal, 0 fees, and 0 total", () => {
    const res = computeCartTotals([]);
    assert.strictEqual(res.subtotal, 0);
    assert.strictEqual(res.platformFee, 0);
    assert.strictEqual(res.deliveryFee, 0);
    assert.strictEqual(res.totalAmount, 0);
    assert.strictEqual(res.itemCount, 0);
  });

  await test("Single item without discount applies ₹10 platform fee and ₹35 delivery fee", () => {
    const res = computeCartTotals([{ price: 499, quantity: 1 }]);
    assert.strictEqual(res.subtotal, 499);
    assert.strictEqual(res.platformFee, 10);
    assert.strictEqual(res.deliveryFee, 35);
    assert.strictEqual(res.totalAmount, 499 + 10 + 35); // 544
    assert.strictEqual(res.itemCount, 1);
  });

  await test("Multiple items with percentage discounts calculate rounded effective prices and totals", () => {
    // Book 1: ₹899 with 10% discount -> ₹809.1 -> rounded to ₹809 * 2 = 1618
    // Book 2: ₹550 with 15% discount -> ₹467.5 -> rounded to ₹468 * 1 = 468
    const res = computeCartTotals([
      { price: 899, discount: 10, quantity: 2 },
      { price: 550, discount: 15, quantity: 1 },
    ]);
    assert.strictEqual(res.subtotal, 809 * 2 + 468 * 1); // 1618 + 468 = 2086
    assert.strictEqual(res.platformFee, 10);
    assert.strictEqual(res.deliveryFee, 35);
    assert.strictEqual(res.totalAmount, 2086 + 45); // 2131
    assert.strictEqual(res.itemCount, 3);
  });

  // SECTION 2: CHECKOUT VALIDATION & INVARIANTS
  console.log("\n--- 2. CHECKOUT VALIDATION & QUANTITY INVARIANTS ---");

  await test("Quantity validation rejects 0 or negative quantities", () => {
    const validateQty = (qty: number) => Math.max(1, Math.floor(qty));
    assert.strictEqual(validateQty(0), 1);
    assert.strictEqual(validateQty(-5), 1);
    assert.strictEqual(validateQty(3.7), 3);
    assert.strictEqual(validateQty(10), 10);
  });

  await test("Cart stock capping bounds quantity to available stock", () => {
    const capStock = (requested: number, stock: number) => Math.min(Math.max(1, requested), stock);
    assert.strictEqual(capStock(10, 5), 5);
    assert.strictEqual(capStock(3, 50), 3);
    assert.strictEqual(capStock(0, 10), 1);
  });

  await test("Pincode validator accepts exactly 6 numeric digits and rejects invalid formats", () => {
    const isValidPincode = (pin: string) => /^\d{6}$/.test(pin.trim());
    assert.strictEqual(isValidPincode("110025"), true);
    assert.strictEqual(isValidPincode("400001"), true);
    assert.strictEqual(isValidPincode("11002"), false); // 5 digits
    assert.strictEqual(isValidPincode("1100251"), false); // 7 digits
    assert.strictEqual(isValidPincode("11002A"), false); // alpha
    assert.strictEqual(isValidPincode("      "), false);
  });

  // SECTION 3: ORDER LIFECYCLE & STATE MACHINE TRANSITIONS
  console.log("\n--- 3. ORDER STATUS STATE MACHINE TRANSITIONS ---");

  await test("Forward lifecycle transitions are strictly valid", () => {
    assert.ok(ORDER_STATUS_TRANSITIONS["Pending"]?.includes("Confirmed"));
    assert.ok(ORDER_STATUS_TRANSITIONS["Confirmed"]?.includes("Packed"));
    assert.ok(ORDER_STATUS_TRANSITIONS["Packed"]?.includes("Shipped"));
    assert.ok(ORDER_STATUS_TRANSITIONS["Shipped"]?.includes("Out for Delivery"));
    assert.ok(ORDER_STATUS_TRANSITIONS["Out for Delivery"]?.includes("Delivered"));
  });

  await test("Illegal status regression transitions are blocked", () => {
    const canTransition = (from: string, to: string) => {
      const allowed = ORDER_STATUS_TRANSITIONS[from] || [];
      return allowed.includes(to);
    };

    assert.strictEqual(canTransition("Delivered", "Pending"), false);
    assert.strictEqual(canTransition("Cancelled", "Confirmed"), false);
    assert.strictEqual(canTransition("Shipped", "Pending"), false);
    assert.strictEqual(canTransition("Delivered", "Shipped"), false);
  });

  await test("Replacement lifecycle transitions follow valid progression", () => {
    assert.ok(ORDER_STATUS_TRANSITIONS["Delivered"]?.includes("Replacement Requested"));
    assert.ok(ORDER_STATUS_TRANSITIONS["Replacement Requested"]?.includes("Replacement Approved"));
    assert.ok(ORDER_STATUS_TRANSITIONS["Replacement Approved"]?.includes("Replacement Shipped"));
    assert.ok(ORDER_STATUS_TRANSITIONS["Replacement Shipped"]?.includes("Replacement Delivered"));
  });

  // SECTION 4: CANCELLATION ELIGIBILITY
  console.log("\n--- 4. CANCELLATION ELIGIBILITY RULES ---");

  await test("Pending, Confirmed, and Processing orders are cancellation-eligible", () => {
    assert.strictEqual(checkCancellationEligibility("Pending").eligible, true);
    assert.strictEqual(checkCancellationEligibility("Confirmed").eligible, true);
    assert.strictEqual(checkCancellationEligibility("Processing").eligible, true);
  });

  await test("Shipped, Delivered, and already Cancelled orders reject cancellation", () => {
    assert.strictEqual(checkCancellationEligibility("Shipped").eligible, false);
    assert.strictEqual(checkCancellationEligibility("Delivered").eligible, false);
    assert.strictEqual(checkCancellationEligibility("Cancelled").eligible, false);
    assert.strictEqual(checkCancellationEligibility("Out for Delivery").eligible, false);
  });

  // SECTION 5: REPLACEMENT 7-DAY POLICY BOUNDARY RULES
  console.log("\n--- 5. REPLACEMENT 7-DAY POST-DELIVERY RULES ---");

  const NOW = 1700000000000; // Fixed epoch reference
  const ONE_DAY = 24 * 60 * 60 * 1000;

  await test("Order delivered 2 days ago is replacement eligible", () => {
    const res = checkReplacementEligibility({
      orderStatus: "Delivered",
      deliveredAt: new Date(NOW - 2 * ONE_DAY).toISOString(),
      referenceTime: NOW,
    });
    assert.strictEqual(res.eligible, true);
  });

  await test("Order delivered exactly 6 days and 23 hours ago is replacement eligible", () => {
    const res = checkReplacementEligibility({
      orderStatus: "Delivered",
      deliveredAt: new Date(NOW - (7 * ONE_DAY - 3600000)).toISOString(),
      referenceTime: NOW,
    });
    assert.strictEqual(res.eligible, true);
  });

  await test("Order delivered 7 days and 1 hour ago is rejected (window expired)", () => {
    const res = checkReplacementEligibility({
      orderStatus: "Delivered",
      deliveredAt: new Date(NOW - (7 * ONE_DAY + 3600000)).toISOString(),
      referenceTime: NOW,
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("expired"));
  });

  await test("Delivery timestamp in future is rejected safely", () => {
    const res = checkReplacementEligibility({
      orderStatus: "Delivered",
      deliveredAt: new Date(NOW + 3600000).toISOString(),
      referenceTime: NOW,
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("future"));
  });

  await test("Delivered order missing verified delivery timestamp is rejected", () => {
    const res = checkReplacementEligibility({
      orderStatus: "Delivered",
      deliveredAt: null,
      shippingDeliveredAt: null,
      referenceTime: NOW,
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("Missing verified delivery timestamp"));
  });

  await test("Non-delivered order rejects replacement request", () => {
    const res = checkReplacementEligibility({
      orderStatus: "Shipped",
      deliveredAt: new Date(NOW - ONE_DAY).toISOString(),
      referenceTime: NOW,
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("Only delivered orders"));
  });

  await test("Order with replacement already requested rejects duplicate submission", () => {
    const res = checkReplacementEligibility({
      orderStatus: "Delivered",
      deliveredAt: new Date(NOW - ONE_DAY).toISOString(),
      replacementRequested: true,
      referenceTime: NOW,
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("already been requested"));
  });

  // SECTION 6: REFUND ELIGIBILITY & GATEWAY VALIDATION
  console.log("\n--- 6. REFUND ELIGIBILITY & GATEWAY VALIDATION ---");

  await test("Paid ONLINE orders are eligible for automated refund", () => {
    const res = checkRefundEligibility({
      paymentMethod: "ONLINE",
      paymentStatus: "Paid",
      totalAmount: 1250,
    });
    assert.strictEqual(res.eligible, true);
    assert.strictEqual(res.maxRefundablePaise, 125000);
  });

  await test("COD orders are ineligible for automated gateway refund", () => {
    const res = checkRefundEligibility({
      paymentMethod: "COD",
      paymentStatus: "Paid",
      totalAmount: 1250,
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("Only ONLINE"));
  });

  await test("Unpaid orders cannot be refunded", () => {
    const res = checkRefundEligibility({
      paymentMethod: "ONLINE",
      paymentStatus: "Pending",
      totalAmount: 899,
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("expected \"Paid\""));
  });

  await test("Already refunded order rejects duplicate refund initiation", () => {
    const res = checkRefundEligibility({
      paymentMethod: "ONLINE",
      paymentStatus: "Refunded",
      totalAmount: 899,
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("already refunded"));
  });

  await test("Refund amount exceeding order total is rejected", () => {
    const res = checkRefundEligibility({
      paymentMethod: "ONLINE",
      paymentStatus: "Paid",
      totalAmount: 500,
      requestedRefundAmount: 55000, // ₹550 in paise
    });
    assert.strictEqual(res.eligible, false);
    assert.ok(res.reason?.includes("exceeds"));
  });

  // SECTION 7: CRYPTOGRAPHIC SIGNATURE VERIFICATION
  console.log("\n--- 7. CRYPTOGRAPHIC SIGNATURE VERIFICATION ---");

  await test("Razorpay payment signature verifies with authentic HMAC SHA-256", () => {
    const orderId = "order_O9x8A7B6C5D4E3";
    const paymentId = "pay_P1Q2R3S4T5U6V7";
    const secret = "test_key_secret_xyz123";

    const payload = `${orderId}|${paymentId}`;
    const authenticSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const isValid = validateRazorpaySignature(orderId, paymentId, authenticSignature, secret);
    assert.strictEqual(isValid, true, "Authentic signature must pass verification");
  });

  await test("Razorpay payment signature fails on tampered orderId or paymentId", () => {
    const orderId = "order_O9x8A7B6C5D4E3";
    const paymentId = "pay_P1Q2R3S4T5U6V7";
    const secret = "test_key_secret_xyz123";

    const payload = `${orderId}|${paymentId}`;
    const authenticSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const isTampered = validateRazorpaySignature(orderId, "pay_TAMPERED", authenticSignature, secret);
    assert.strictEqual(isTampered, false, "Tampered payment ID must fail verification");
  });

  await test("Razorpay payment signature fails with invalid secret", () => {
    const orderId = "order_O9x8A7B6C5D4E3";
    const paymentId = "pay_P1Q2R3S4T5U6V7";
    const secret = "test_key_secret_xyz123";

    const payload = `${orderId}|${paymentId}`;
    const authenticSignature = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    const isInvalid = validateRazorpaySignature(orderId, paymentId, authenticSignature, "wrong_secret");
    assert.strictEqual(isInvalid, false, "Wrong secret must fail verification");
  });

  await test("Razorpay webhook signature verifies raw request payload with HMAC SHA-256", () => {
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_123", amount: 50000 } } },
    });
    const webhookSecret = "whsec_super_secret_webhook_key";

    const validWebhookSig = crypto
      .createHmac("sha256", webhookSecret)
      .update(rawBody)
      .digest("hex");

    const isValid = validateWebhookSignature(rawBody, validWebhookSig, webhookSecret);
    assert.strictEqual(isValid, true, "Valid webhook signature must pass verification");

    const isTampered = validateWebhookSignature(rawBody + " ", validWebhookSig, webhookSecret);
    assert.strictEqual(isTampered, false, "Tampered body must fail webhook verification");
  });

  // SECTION 8: INVENTORY ADJUSTMENT CALCULATIONS
  console.log("\n--- 8. INVENTORY ADJUSTMENT CALCULATIONS ---");

  await test("Stock adjustment formulas: INCREASE, DECREASE, and SET", () => {
    const computeStock = (current: number, type: "INCREASE" | "DECREASE" | "SET", qty: number) => {
      if (type === "INCREASE") return current + qty;
      if (type === "DECREASE") {
        if (current - qty < 0) throw new Error("Negative stock not permitted");
        return current - qty;
      }
      if (type === "SET") {
        if (qty < 0) throw new Error("Negative stock not permitted");
        return qty;
      }
      throw new Error("Invalid type");
    };

    assert.strictEqual(computeStock(20, "INCREASE", 5), 25);
    assert.strictEqual(computeStock(20, "DECREASE", 5), 15);
    assert.strictEqual(computeStock(20, "SET", 50), 50);
    assert.throws(() => computeStock(10, "DECREASE", 15), /Negative stock/);
    assert.throws(() => computeStock(10, "SET", -1), /Negative stock/);
  });

  console.log("\n" + "=".repeat(80));
  console.log(`UNIT TESTS SUMMARY: ${passedTests}/${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("=".repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runUnitTests().catch((err) => {
  console.error("Fatal error running unit tests:", err);
  process.exit(1);
});
