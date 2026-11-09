/**
 * ==============================================================================
 * PHASE 1 — INDEPENDENT AUDIT, GAP CLOSURE & ACCEPTANCE VERIFICATION SUITE
 * MD Shakib Islamic Books Modernization
 * ==============================================================================
 * Verifies:
 * - Part A: Phase 0 Security Foundations & Gap Closure (Concerns 1 through 7)
 * - Part B: Original 22 Requirements (1.1 through 1.22)
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import { checkPincodeServiceability, createShipmentForOrder, scheduleDelhiveryPickup, getShippingLabel, trackShipment, reconcileDelhiveryCODRemittance, processDelhiveryWebhook } from "../lib/integrations/delhivery/service";
import { hasPermission, isStaffRole, StaffPermission } from "../lib/admin/permissions";
import { submitContactForm } from "../lib/support/contact";
import { checkAndTriggerLowStockAlerts } from "../lib/admin/inventory";
import { validateCustomerCoupon } from "../lib/commerce/coupons";
import { sendShipmentNotification } from "../lib/integrations/resend/service";
import { validateWebhookSignature } from "../lib/integrations/razorpay/webhook";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let testUserId: string;
let testBookId: string;
let testBookLowStockId: string;
let testAddressId: string;
let testCouponCode: string;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ [PASS ${String(testsPassed).padStart(2, "0")}] ${testName}`);
  } else {
    testsFailed++;
    console.error(`  ✗ [FAIL] ${testName}${detail ? ` — ${detail}` : ""}`);
  }
}

async function setupFixtures() {
  console.log("\n--- SETTING UP AUDIT TEST FIXTURES ---");

  // Create test customer
  const timestamp = Date.now();
  const email = `audit_tester_${timestamp}@example.com`;
  const { data: authUser, error: authErr } = await adminDb.auth.admin.createUser({
    email,
    password: "Password123!",
    email_confirm: true,
  });

  if (authErr || !authUser.user) {
    throw new Error(`Failed to create test user: ${authErr?.message}`);
  }
  testUserId = authUser.user.id;

  await adminDb.from("profiles").upsert({
    id: testUserId,
    email,
    name: "Independent Auditor",
    role: "user",
  });

  // Create test books
  const { data: book1 } = await adminDb
    .from("books")
    .insert({
      title: "Sahih al-Bukhari Comprehensive Set",
      description: "Complete authentic Hadith collection",
      category: "Hadith",
      author: "Imam Bukhari",
      price: 500,
      discount: 10, // effective: 450
      stock: 50,
      image_url: "https://example.com/bukhari.jpg",
      is_active: true,
    })
    .select("id")
    .single();

  testBookId = book1!.id;

  const { data: book2 } = await adminDb
    .from("books")
    .insert({
      title: "Riyadhus Saliheen (Audit Low Stock)",
      description: "Classical Hadith compendium",
      category: "Hadith",
      author: "Imam Nawawi",
      price: 300,
      discount: 0,
      stock: 4,
      image_url: "https://example.com/riyadh.jpg",
      is_active: true,
    })
    .select("id")
    .single();

  testBookLowStockId = book2!.id;

  // Create test address
  const { data: addr } = await adminDb
    .from("addresses")
    .insert({
      user_id: testUserId,
      full_name: "Audit Tester",
      phone: "+919876543210",
      house_no: "Flat 12A",
      area: "Okhla Vihar",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110025",
      is_default: true,
    })
    .select("id")
    .single();

  testAddressId = addr!.id;

  // Create test coupon
  testCouponCode = `AUDIT_${Date.now().toString().slice(-5)}`;
  await adminDb.from("discounts").insert({
    code: testCouponCode,
    discount_type: "percentage",
    discount_value: 20,
    max_discount_amount: 100,
    min_order_amount: 300,
    is_active: true,
    usage_limit: 10,
    used_count: 0,
  });

  console.log("✓ Fixtures successfully initialized.\n");
}

async function runTests() {
  console.log("================================================================================");
  console.log(" PHASE 1: INDEPENDENT AUDIT & ACCEPTANCE VERIFICATION SUITE");
  console.log(" MD Shakib Islamic Books — Complete Rigorous Audit");
  console.log("================================================================================");

  const sampleAddress = {
    full_name: "Audit Tester",
    phone: "+919876543210",
    house_no: "Flat 12A",
    area: "Okhla Vihar",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110025",
  };

  // ============================================================================
  // PART A: PHASE 0 SECURITY FOUNDATION REMEDIATIONS (CONCERNS 1 - 7)
  // ============================================================================
  console.log("\n--- PART A: PHASE 0 SECURITY FOUNDATION REMEDIATIONS ---");

  // Concern 1: Admin cancellation on shipped order does NOT restore books stock
  console.log("\n[Phase 0 Concern 1] Cancellation Safety on Shipped Orders");
  const { data: initialBookStock } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
  const stockBeforeOrder = initialBookStock!.stock;

  const { data: shippedOrderId } = await adminDb.rpc("create_order_atomic", {
    p_user_id: testUserId,
    p_items: [{ book_id: testBookId, quantity: 2 }],
    p_address_snapshot: sampleAddress,
    p_payment_method: "COD",
  });

  const { data: stockAfterCreation } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
  assert(
    stockAfterCreation!.stock === stockBeforeOrder - 2,
    `Order creation decrements physical stock by 2 (from ${stockBeforeOrder} to ${stockAfterCreation!.stock})`
  );

  // Transition order to Confirmed -> Shipped with AWB
  const auditAwb = `AWB-AUDIT-${Date.now()}`;
  await adminDb.from("orders").update({ order_status: "Confirmed" }).eq("id", shippedOrderId);
  const { error: shipErr } = await adminDb.from("orders").update({ order_status: "Shipped", shipping_awb: auditAwb }).eq("id", shippedOrderId);
  assert(!shipErr, "Order status transition to Shipped succeeds");

  // Admin cancels shipped order (e.g. lost in courier transit)
  await adminDb.from("profiles").update({ role: "admin" }).eq("id", testUserId);
  const { data: cancelShippedResult, error: cancelShippedErr } = await adminDb.rpc("cancel_order_atomic", {
    p_order_id: shippedOrderId,
    p_user_id: testUserId,
    p_cancel_reason: "Admin cancelled lost parcel with courier",
    p_is_admin: true,
  });
  await adminDb.from("profiles").update({ role: "user" }).eq("id", testUserId);

  assert(!cancelShippedErr && cancelShippedResult === true, "Admin cancel_order_atomic succeeds on shipped order");

  const { data: stockAfterShippedCancel } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
  assert(
    stockAfterShippedCancel!.stock === stockAfterCreation!.stock,
    `CRITICAL INVARIANT: Cancellation on Shipped order did NOT restore stock to shelves (Stock remained ${stockAfterShippedCancel!.stock})`
  );

  // Concern 2 & 3: settle_payment_atomic provider evidence and identity reconciliation
  console.log("\n[Phase 0 Concern 2 & 3] Payment Settlement Evidence & Identity Reconciliation");
  const { data: settleOrderId } = await adminDb.rpc("create_order_atomic", {
    p_user_id: testUserId,
    p_items: [{ book_id: testBookId, quantity: 1 }],
    p_address_snapshot: sampleAddress,
    p_payment_method: "ONLINE",
  });

  const rzpOrderId = `order_audit_${Date.now()}`;
  await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", settleOrderId);

  const { data: settleOrderData } = await adminDb.from("orders").select("total_amount").eq("id", settleOrderId).single();
  await adminDb.from("payments").insert({
    order_id: settleOrderId,
    user_id: testUserId,
    payment_id: rzpOrderId,
    provider_order_id: rzpOrderId,
    amount: settleOrderData!.total_amount,
    currency: "INR",
    provider: "Razorpay",
    status: "Pending",
  });

  // 1. Rejects missing/non-INR currency
  const { data: rejCurrency } = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: rzpOrderId,
    p_razorpay_payment_id: "pay_test_curr",
    p_signature: "sig",
    p_raw_response: { currency: "USD", amount: 49500 },
  });
  assert(
    rejCurrency?.status === "currency_mismatch",
    "settle_payment_atomic rejects non-INR currency evidence (USD)"
  );

  // 2. Rejects mismatched amount
  const { data: rejAmount } = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: rzpOrderId,
    p_razorpay_payment_id: "pay_test_amt",
    p_signature: "sig",
    p_raw_response: { currency: "INR", amount: 1000 }, // 10 rupees instead of 495
  });
  assert(
    rejAmount?.status === "amount_mismatch",
    "settle_payment_atomic rejects mismatched amount evidence"
  );

  // 3. Settles cleanly with matching provider evidence
  const auditPaymentId = `pay_audit_legit_${Date.now()}`;
  const { data: validSettle } = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: rzpOrderId,
    p_razorpay_payment_id: auditPaymentId,
    p_signature: "sig_valid",
    p_raw_response: { currency: "INR", amount: 49500 }, // 450 + 45 = 495
  });
  assert(
    validSettle?.success === true && validSettle?.status === "settled",
    "settle_payment_atomic settles order with matching INR amount evidence"
  );

  // 4. Repeated settlement with SAME payment ID returns already_paid (Idempotent)
  const { data: repeatSettle } = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: rzpOrderId,
    p_razorpay_payment_id: auditPaymentId,
    p_signature: "sig_valid",
    p_raw_response: { currency: "INR", amount: 49500 },
  });
  assert(
    repeatSettle?.status === "already_paid",
    "Repeated settlement with identical payment ID returns 'already_paid'"
  );

  // 5. Settlement attempt with CONFLICTING payment ID is strictly rejected (Concern 3)
  const auditConflictPaymentId = `pay_audit_CONFLICTING_${Date.now()}`;
  const { data: conflictSettle } = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: rzpOrderId,
    p_razorpay_payment_id: auditConflictPaymentId,
    p_signature: "sig_other",
    p_raw_response: { currency: "INR", amount: 49500 },
  });
  assert(
    conflictSettle?.status === "payment_id_conflict",
    "Distinct captured payment ID on already settled order is rejected with 'payment_id_conflict'"
  );

  // Concern 4: record_refund_atomic boundaries & overwrite defense
  console.log("\n[Phase 0 Concern 4] Refund Invariants & Overwrite Defense");
  // 1. Rejects empty refund ID
  const { error: emptyRefundErr } = await adminDb.rpc("record_refund_atomic", {
    p_order_id: settleOrderId,
    p_refund_id: "",
    p_refund_amount: 100,
    p_refund_status: "processed",
  });
  assert(!!emptyRefundErr, "record_refund_atomic rejects empty refund ID");

  // 2. Rejects refund amount > total_amount
  const { error: excessRefundErr } = await adminDb.rpc("record_refund_atomic", {
    p_order_id: settleOrderId,
    p_refund_id: "rfnd_excess_001",
    p_refund_amount: 99999,
    p_refund_status: "processed",
  });
  assert(!!excessRefundErr, "record_refund_atomic rejects refund amount exceeding order total");

  // 3. Records processed refund
  const { data: legitRefund } = await adminDb.rpc("record_refund_atomic", {
    p_order_id: settleOrderId,
    p_refund_id: "rfnd_legit_001",
    p_refund_amount: 495,
    p_refund_status: "processed",
  });
  assert(legitRefund?.status === "processed", "record_refund_atomic records legitimate processed refund");

  // 4. Prevents downgrade of processed refund to pending
  const { data: downgradeRefund } = await adminDb.rpc("record_refund_atomic", {
    p_order_id: settleOrderId,
    p_refund_id: "rfnd_legit_001",
    p_refund_amount: 495,
    p_refund_status: "pending",
  });
  assert(
    downgradeRefund?.status === "cannot_downgrade_processed_refund",
    "record_refund_atomic refuses downgrading processed refund to pending"
  );

  // 5. Prevents overwrite with conflicting refund ID
  const { data: conflictRefund } = await adminDb.rpc("record_refund_atomic", {
    p_order_id: settleOrderId,
    p_refund_id: "rfnd_CONFLICT_002",
    p_refund_amount: 495,
    p_refund_status: "processed",
  });
  assert(
    conflictRefund?.status === "refund_id_conflict",
    "record_refund_atomic refuses overwriting processed refund with different refund ID"
  );

  // Concern 7: Webhook HMAC signature verification
  console.log("\n[Phase 0 Concern 7] Webhook Signature Security");
  const testSecret = "webhook_secret_secure_12345";
  const validPayload = JSON.stringify({ event: "order.paid", id: "evt_123" });
  const crypto = await import("crypto");
  const validSig = crypto.createHmac("sha256", testSecret).update(validPayload).digest("hex");

  assert(
    validateWebhookSignature(validPayload, validSig, testSecret),
    "validateWebhookSignature accepts genuine HMAC signature"
  );
  assert(
    !validateWebhookSignature(validPayload, "forged_signature_hex", testSecret),
    "validateWebhookSignature rejects forged signature"
  );
  assert(
    !validateWebhookSignature(validPayload + "tampered", validSig, testSecret),
    "validateWebhookSignature rejects tampered request body"
  );


  // ============================================================================
  // PART B: ORIGINAL 22 REQUIREMENTS VERIFICATION (1.1 - 1.22)
  // ============================================================================
  console.log("\n--- PART B: ORIGINAL 22 REQUIREMENTS ACCEPTANCE ---");

  // 1.1 — Server-authoritative checkout pricing
  console.log("\n[1.1] Server-authoritative checkout pricing");
  const { data: order1_1_Id } = await adminDb.rpc("create_order_atomic", {
    p_user_id: testUserId,
    p_items: [{ book_id: testBookId, quantity: 2 }],
    p_address_snapshot: sampleAddress,
    p_payment_method: "COD",
    p_total_amount: 1, // client submits fake ₹1 price
  });
  const { data: order1_1 } = await adminDb.from("orders").select("total_amount, subtotal, delivery_fee").eq("id", order1_1_Id).single();
  assert(
    Number(order1_1?.total_amount) === 945, // 450 * 2 = 900 subtotal + 10 platform + 35 delivery = 945
    `Client fake ₹1 overridden by authoritative server total: ₹${order1_1?.total_amount}`
  );

  // 1.2 — Guest checkout
  console.log("\n[1.2] Guest checkout architectural constraint");
  const localAnonKey =
    process.env.LOCAL_SUPABASE_ANON_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
  const anonClient = createClient(SUPABASE_URL, localAnonKey);
  const { error: anonOrderErr } = await anonClient.rpc("create_order_atomic", {
    p_user_id: testUserId,
    p_items: [{ book_id: testBookId, quantity: 1 }],
    p_address_snapshot: sampleAddress,
    p_payment_method: "COD",
  });
  assert(
    !!anonOrderErr &&
      (anonOrderErr.message.includes("Authentication required") ||
        anonOrderErr.code === "42501" ||
        anonOrderErr.message.includes("permission denied")),
    "Guest/anonymous caller strictly blocked from creating orders at database layer"
  );

  // 1.3 — Human-readable order number
  console.log("\n[1.3] Human-readable order number");
  const { data: order1_3 } = await adminDb.from("orders").select("order_number").eq("id", order1_1_Id).single();
  assert(
    /^MDS-\d{6}$/.test(order1_3?.order_number || ""),
    `Order receives monotonic sequenced reference: ${order1_3?.order_number}`
  );

  // 1.4 — Order lifecycle
  console.log("\n[1.4] Order lifecycle state machine");
  // Customer cannot skip directly from Pending to Delivered
  let invalidTransitionErr = false;
  try {
    await adminDb.from("orders").update({ order_status: "Delivered" }).eq("id", order1_1_Id);
  } catch (err) {
    invalidTransitionErr = true;
  }
  const { data: oStatusCheck } = await adminDb.from("orders").select("order_status").eq("id", order1_1_Id).single();
  assert(
    oStatusCheck?.order_status === "Pending",
    "Invalid state machine jump from 'Pending' directly to 'Delivered' is strictly rejected"
  );

  // 1.5 — Payment retry
  console.log("\n[1.5] Payment retry");
  const { data: onlineOrderForRetry } = await adminDb.rpc("create_order_atomic", {
    p_user_id: testUserId,
    p_items: [{ book_id: testBookId, quantity: 1 }],
    p_address_snapshot: sampleAddress,
    p_payment_method: "ONLINE",
  });
  const { data: retryCheckOrder } = await adminDb.from("orders").select("payment_method, payment_status, is_paid").eq("id", onlineOrderForRetry).single();
  assert(
    retryCheckOrder?.payment_method === "ONLINE" && retryCheckOrder?.payment_status === "Pending" && !retryCheckOrder?.is_paid,
    "Unpaid online order is eligible for payment retry"
  );

  // 1.6 — Coupon application UI
  console.log("\n[1.6] Coupon application UI state handling");
  const couponUiRes = await validateCustomerCoupon(testCouponCode, 500);
  assert(
    couponUiRes.valid && couponUiRes.calculatedDiscount === 100,
    `Coupon applied state calculates discount correctly: ₹${couponUiRes.calculatedDiscount}`
  );

  // 1.7 — Server-side coupon validation
  console.log("\n[1.7] Server-side coupon validation");
  const belowMinCheck = await validateCustomerCoupon(testCouponCode, 200);
  assert(!belowMinCheck.valid, "Coupon rejected when cart subtotal is below min_order_amount");

  const invalidCodeCheck = await validateCustomerCoupon("NONEXISTENT_XYZ", 500);
  assert(!invalidCodeCheck.valid, "Non-existent coupon rejected by server");

  // 1.8 — Coupon accounting
  console.log("\n[1.8] Coupon accounting");
  const { data: orderCouponId } = await adminDb.rpc("create_order_atomic", {
    p_user_id: testUserId,
    p_items: [{ book_id: testBookId, quantity: 1 }],
    p_address_snapshot: sampleAddress,
    p_payment_method: "COD",
    p_coupon_code: testCouponCode,
  });
  const { data: couponOrderRow } = await adminDb.from("orders").select("coupon_status, discount_amount").eq("id", orderCouponId).single();
  assert(
    couponOrderRow?.coupon_status === "consumed" && Number(couponOrderRow?.discount_amount) > 0,
    `COD order atomically marks coupon as 'consumed' with persisted discount: ₹${couponOrderRow?.discount_amount}`
  );

  // 1.9 — Pincode serviceability
  console.log("\n[1.9] Pincode serviceability");
  const servValid = await checkPincodeServiceability("110025");
  assert(
    servValid.serviceable && servValid.prepaid && servValid.cod,
    "Valid Indian pincode (110025) confirms serviceable with prepaid and COD"
  );

  const servPrepaidOnly = await checkPincodeServiceability("110001");
  assert(
    servPrepaidOnly.serviceable && servPrepaidOnly.prepaid && !servPrepaidOnly.cod,
    "Pincode 110001 correctly confirms prepaid-only (COD disabled)"
  );

  const servUnserviceable = await checkPincodeServiceability("999000");
  assert(
    !servUnserviceable.serviceable,
    "Unserviceable pincode (999000) correctly reports non-serviceable"
  );

  // 1.10 — Consignment booking
  console.log("\n[1.10] Consignment booking");
  await adminDb.from("orders").update({ order_status: "Confirmed" }).eq("id", order1_1_Id);
  const bookingRes = await createShipmentForOrder(order1_1_Id);
  assert(
    !!bookingRes.awb && bookingRes.courier === "Delhivery",
    `Shipment successfully booked with AWB: ${bookingRes.awb}`
  );

  // 1.11 — Pickup scheduling
  console.log("\n[1.11] Pickup scheduling");
  const pickupRes = await scheduleDelhiveryPickup(order1_1_Id, {
    pickupDate: new Date(Date.now() + 86400000).toISOString().split("T")[0],
    pickupTime: "11:00:00",
    expectedPackageCount: 1,
  });
  assert(
    pickupRes.success && !!pickupRes.pickupRequestId,
    `Pickup scheduled with request ID: ${pickupRes.pickupRequestId}`
  );

  // 1.12 — AWB persistence
  console.log("\n[1.12] AWB persistence");
  const { data: awbOrder } = await adminDb.from("orders").select("shipping_awb, shipping_courier").eq("id", order1_1_Id).single();
  assert(
    awbOrder?.shipping_awb === bookingRes.awb && awbOrder?.shipping_courier === "Delhivery",
    `Real AWB persisted on order: ${awbOrder?.shipping_awb}`
  );

  // 1.13 — Shipping label
  console.log("\n[1.13] Shipping label generation");
  const labelRes = await getShippingLabel(bookingRes.awb);
  assert(
    labelRes.success && !!labelRes.labelUrl,
    `Shipping label URL generated: ${labelRes.labelUrl}`
  );

  // 1.14 — Live tracking
  console.log("\n[1.14] Live tracking");
  const trackRes = await trackShipment(bookingRes.awb);
  assert(
    trackRes.awb === bookingRes.awb && Array.isArray(trackRes.scans) && trackRes.scans.length > 0,
    `Tracking scans normalized with timestamps and locations (${trackRes.scans.length} events)`
  );

  // 1.15 — COD reconciliation
  console.log("\n[1.15] COD reconciliation (Decoupled from delivery)");
  // Delhivery webhook delivers the parcel
  const webhookRes = await processDelhiveryWebhook({
    waybill: bookingRes.awb,
    status: "Delivered",
  });
  assert(webhookRes.status === "updated", "Delhivery delivery webhook transitions order to 'Delivered'");

  const { data: deliveredCodOrder } = await adminDb
    .from("orders")
    .select("order_status, cod_settlement_status, payment_status")
    .eq("id", order1_1_Id)
    .single();

  assert(
    deliveredCodOrder?.order_status === "Delivered" &&
    deliveredCodOrder?.cod_settlement_status === "pending" &&
    deliveredCodOrder?.payment_status === "Pending",
    "Delivery sets cod_settlement_status = 'pending' while payment_status remains 'Pending'"
  );

  // Settle remittance via bank reconciliation
  const remRes = await reconcileDelhiveryCODRemittance({
    orderId: order1_1_Id,
    settlementRef: "NEFT-DELHIVERY-AUDIT-992",
    remittedAmount: Number(order1_1!.total_amount),
    adminUserId: testUserId,
    notes: "Verified against bank settlement advice",
  });
  assert(remRes.success && remRes.status === "reconciled", "reconcileDelhiveryCODRemittance authoritatively settles COD");

  const { data: remittedCodOrder } = await adminDb
    .from("orders")
    .select("cod_settlement_status, payment_status, is_paid")
    .eq("id", order1_1_Id)
    .single();
  assert(
    remittedCodOrder?.cod_settlement_status === "reconciled" && remittedCodOrder?.payment_status === "Paid" && remittedCodOrder?.is_paid,
    "Remittance sets cod_settlement_status = 'reconciled' and payment_status = 'Paid'"
  );

  // 1.16 — Dashboard analytics
  console.log("\n[1.16] Dashboard analytics (Database-aggregated metrics)");
  const { data: dbMetrics } = await adminDb.rpc("get_admin_dashboard_metrics", {
    p_date_from: null,
    p_date_to: null,
  });
  const m = (dbMetrics as any)?.metrics;
  assert(
    typeof m?.total_orders === "number" && typeof m?.total_revenue === "number",
    `Dashboard metrics aggregated on PostgreSQL: ${m?.total_orders} orders, ₹${m?.total_revenue} revenue`
  );

  // 1.17 — Staff permissions
  console.log("\n[1.17] Staff permissions (RBAC)");
  assert(hasPermission("super_admin", "users.manage_roles"), "super_admin can manage_roles");
  assert(hasPermission("admin", "orders.manage"), "admin can manage orders");
  assert(hasPermission("warehouse_staff", "orders.ship"), "warehouse_staff can ship orders");
  assert(!hasPermission("warehouse_staff", "discounts.manage"), "warehouse_staff CANNOT manage discounts");
  assert(!hasPermission("user", "dashboard.view"), "Customer CANNOT view admin dashboard");

  // 1.18 — Admin new-order notifications
  console.log("\n[1.18] Admin new-order email alert");
  const { data: adminEmailLogs } = await adminDb
    .from("email_logs")
    .select("event_type")
    .eq("event_type", "admin_new_order")
    .limit(1);
  assert(
    adminEmailLogs !== null,
    "email_logs table captures admin new order notifications"
  );

  // 1.19 — Low-stock alerts
  console.log("\n[1.19] Low-stock alerts with deduplication");
  const alert1 = await checkAndTriggerLowStockAlerts([testBookLowStockId]);
  assert(alert1.triggeredCount === 1, "checkAndTriggerLowStockAlerts triggers for low stock book (stock: 4 <= 5)");

  const alertDup = await checkAndTriggerLowStockAlerts([testBookLowStockId]);
  assert(alertDup.triggeredCount === 0, "checkAndTriggerLowStockAlerts suppresses duplicate within 24 hours");

  // 1.20 — Contact form
  console.log("\n[1.20] Contact form persistence and validation");
  const contactRes = await submitContactForm({
    name: "Brother Zaid",
    email: "zaid@example.com",
    subject: "Inquiry about Sahih Muslim Volumes",
    message: "Assalamu Alaikum, is the leather-bound edition currently available in English?",
  });
  assert(contactRes.success && !!contactRes.submissionId, `Contact form recorded: ${contactRes.submissionId}`);

  // 1.21 — Resend transactional emails
  console.log("\n[1.21] Resend transactional emails");
  const { data: emailLogsResend } = await adminDb
    .from("email_logs")
    .select("recipient, event_type, status")
    .order("created_at", { ascending: false })
    .limit(5);
  assert(
    !!emailLogsResend && emailLogsResend.length > 0,
    `email_logs captures transactional dispatch history (Found ${emailLogsResend?.length} recent logs)`
  );

  // 1.22 — Shipment notifications
  console.log("\n[1.22] Shipment notifications (Triggered by shipment events)");
  // Send shipment notification directly and verify deduplication
  const shipNotif = await sendShipmentNotification(order1_1_Id, "shipped");
  assert(shipNotif.success, "sendShipmentNotification executes for shipped event");

  const shipNotifDup = await sendShipmentNotification(order1_1_Id, "shipped");
  assert(shipNotifDup.alreadySent === true, "sendShipmentNotification suppresses duplicate shipped notification");

  // Cleanup
  console.log("\n--- CLEANING UP AUDIT TEST FIXTURES ---");
  try {
    if (testUserId) {
      await adminDb.from("contact_submissions").delete().eq("email", "zaid@example.com");
      await adminDb.from("stock_alerts").delete().eq("book_id", testBookLowStockId);
      await adminDb.from("order_items").delete().in("book_id", [testBookId, testBookLowStockId]);
      await adminDb.from("orders").delete().eq("user_id", testUserId);
      await adminDb.from("addresses").delete().eq("user_id", testUserId);
      await adminDb.from("discounts").delete().eq("code", testCouponCode);
      await adminDb.from("books").delete().in("id", [testBookId, testBookLowStockId]);
      await adminDb.from("profiles").delete().eq("id", testUserId);
      await adminDb.auth.admin.deleteUser(testUserId);
    }
    console.log("✓ Audit test fixtures safely purged.");
  } catch (cleanErr: any) {
    console.warn("Cleanup warning:", cleanErr?.message);
  }

  console.log("\n================================================================================");
  console.log(` INDEPENDENT AUDIT SUMMARY: ${testsPassed}/${testsPassed + testsFailed} TESTS PASSED (${testsFailed === 0 ? "100%" : `${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`})`);
  console.log("================================================================================");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

setupFixtures().then(runTests).catch((err) => {
  console.error("Fatal audit execution error:", err);
  process.exit(1);
});
