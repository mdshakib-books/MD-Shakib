/**
 * Phase 0: Final Security Remediation Verification Suite
 * MD Shakib Islamic Books — Master Security Verification
 * 
 * Verifies all 20 mandatory scenarios specified in Section 3 of Phase 0 Final Security Audit:
 * 1. Missing payment amount.
 * 2. Missing currency.
 * 3. Incorrect currency.
 * 4. Incorrect amount.
 * 5. Exact valid settlement.
 * 6. Exact duplicate webhook replay.
 * 7. Duplicate replay with missing evidence.
 * 8. Duplicate replay with conflicting amount.
 * 9. Duplicate replay with conflicting currency.
 * 10. NULL payment provider.
 * 11. Unexpected payment provider.
 * 12. Failed payment settlement attempt.
 * 13. Refunded payment settlement attempt.
 * 14. Existing conflicting provider payment ID.
 * 15. Existing matching provider payment ID.
 * 16. Order/payment identity mismatch.
 * 17. Multiple payment records for one provider order ID (uniqueness constraint).
 * 18. Unauthorized settlement RPC invocation (anonymous & customer).
 * 19. Invalid webhook signature.
 * 20. Valid webhook signature using the raw request body.
 * 
 * PLUS Concurrency & Invariant Checks:
 * - Simultaneous identical settlement requests
 * - Conflicting settlement requests for the same order
 * - Repeated webhook delivery
 * - Refund amount boundaries
 * - Duplicate inventory restoration defense
 * - Duplicate coupon release defense
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import { validateWebhookSignature } from "../lib/integrations/razorpay/webhook";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY =
  process.env.LOCAL_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE_ROLE_KEY =
  process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const anonDb = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
});

let testUserId: string;
let customerClient: any;
let testBookId: string;
let testCouponId: string;
let testCouponCode: string;
const runId = Date.now().toString().slice(-6);

const sampleAddress = {
  full_name: "Phase0 Security Auditor",
  phone: "+919876543210",
  house_no: "Suite 404",
  area: "Cyber Security Enclave",
  city: "New Delhi",
  state: "Delhi",
  pincode: "110025",
};

let passedCount = 0;
let totalCount = 0;

function assert(condition: any, message: string) {
  totalCount++;
  if (!condition) {
    console.error(`  ✗ [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedCount++;
  console.log(`  ✓ [PASS ${passedCount.toString().padStart(2, "0")}] ${message}`);
}

async function setupFixtures() {
  console.log("--- PROVISIONING PHASE 0 TEST FIXTURES ---");
  const email = `phase0_audit_${runId}@example.com`;
  const password = "Password123!Secure";
  const { data: authUser, error: authErr } = await adminDb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (authErr || !authUser.user) {
    throw new Error(`Failed to create test user: ${authErr?.message}`);
  }
  testUserId = authUser.user.id;

  await adminDb.from("profiles").upsert({
    id: testUserId,
    email,
    name: "Phase 0 Security Auditor",
    role: "user",
  });

  customerClient = createClient(SUPABASE_URL, ANON_KEY);
  await customerClient.auth.signInWithPassword({ email, password });

  // Create test book (effective price: 400 - 50 = 350)
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: `Fiqh of Financial Transactions ${runId}`,
      description: "Islamic jurisprudence on contracts and currency",
      category: "Fiqh",
      author: "Imam Ash-Shafi'i",
      price: 400,
      discount: 50, // effective: 350
      stock: 50,
      image_url: "https://example.com/fiqh.jpg",
      is_active: true,
    })
    .select("id")
    .single();

  testBookId = book!.id;

  // Create test coupon (fixed 50 discount)
  testCouponCode = `SEC_${runId}`;
  const { data: coupon, error: coupErr } = await adminDb
    .from("discounts")
    .insert({
      code: testCouponCode,
      discount_type: "fixed",
      discount_value: 50,
      min_order_amount: 100,
      is_active: true,
      usage_limit: 10,
      used_count: 0,
    })
    .select("id")
    .single();

  if (coupErr) {
    throw new Error(`Failed to create test coupon: ${coupErr.message}`);
  }
  testCouponId = coupon!.id;
  console.log("✓ Fixtures initialized.\n");
}

async function cleanupFixtures() {
  console.log("\n--- CLEANING UP PHASE 0 TEST FIXTURES ---");
  if (testUserId) {
    await adminDb.from("payments").delete().eq("user_id", testUserId);
    const { data: userOrders } = await adminDb.from("orders").select("id").eq("user_id", testUserId);
    if (userOrders && userOrders.length > 0) {
      const orderIds = userOrders.map((o) => o.id);
      await adminDb.from("inventory_reservations").delete().in("order_id", orderIds);
      await adminDb.from("order_items").delete().in("order_id", orderIds);
      await adminDb.from("order_status_history").delete().in("order_id", orderIds);
      await adminDb.from("orders").delete().in("id", orderIds);
    }
    await adminDb.from("addresses").delete().eq("user_id", testUserId);
    await adminDb.from("profiles").delete().eq("id", testUserId);
    await adminDb.auth.admin.deleteUser(testUserId);
  }
  if (testBookId) {
    await adminDb.from("books").delete().eq("id", testBookId);
  }
  if (testCouponId) {
    await adminDb.from("discounts").delete().eq("id", testCouponId);
  }
  console.log("✓ Fixtures cleaned up.");
}

async function runTests() {
  console.log("================================================================================");
  console.log(" PHASE 0: FINAL SECURITY REMEDIATION VERIFICATION SUITE");
  console.log(" MD Shakib Islamic Books — Payment Settlement & Core Invariant Hardening");
  console.log("================================================================================");

  // Helper to create an order
  async function createTestOrder(paymentMethod = "ONLINE") {
    const { data: orderId, error } = await adminDb.rpc("create_order_atomic", {
      p_user_id: testUserId,
      p_items: [{ book_id: testBookId, quantity: 1 }],
      p_address_snapshot: sampleAddress,
      p_payment_method: paymentMethod,
    });
    if (error || !orderId) throw new Error(`create_order_atomic failed: ${error?.message}`);

    const { data: order } = await adminDb.from("orders").select("*").eq("id", orderId).single();
    return order!;
  }

  // Helper to create order and attach matching payment record
  async function createOrderWithPaymentRecord(paymentOverrides: any = {}) {
    const order = await createTestOrder("ONLINE");
    const rzpOrderId = `order_test_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    
    await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", order.id);

    const { data: pmt, error: pmtErr } = await adminDb
      .from("payments")
      .insert({
        order_id: order.id,
        user_id: testUserId,
        payment_id: rzpOrderId,
        provider_order_id: rzpOrderId,
        amount: order.total_amount,
        currency: "INR",
        provider: "Razorpay",
        status: "Pending",
        ...paymentOverrides,
      })
      .select("*")
      .single();

    if (pmtErr && !paymentOverrides._allowError) {
      throw new Error(`Failed to create test payment record: ${pmtErr.message}`);
    }

    const orderAmountPaise = Math.round(Number(order.total_amount) * 100);
    return { order, rzpOrderId, pmt: pmt!, orderAmountPaise, pmtErr };
  }

  // ----------------------------------------------------------------------------
  // 1. Missing payment amount -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[1] Missing payment amount");
  {
    const { order, rzpOrderId } = await createOrderWithPaymentRecord();
    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: `pay_test_${Date.now()}`,
      p_signature: "sig_01",
      p_raw_response: { currency: "INR" }, // amount missing!
    });
    assert(
      res?.status === "missing_provider_amount" && res?.success === false,
      "settle_payment_atomic strictly rejects settlement when provider amount is missing"
    );

    const { data: ordCheck } = await adminDb.from("orders").select("payment_status").eq("id", order.id).single();
    assert(ordCheck?.payment_status === "Pending", "Order payment_status remains 'Pending'");
  }

  // ----------------------------------------------------------------------------
  // 2. Missing currency -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[2] Missing currency");
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: `pay_test_${Date.now()}`,
      p_signature: "sig_02",
      p_raw_response: { amount: orderAmountPaise }, // currency missing!
    });
    assert(
      res?.status === "missing_provider_currency" && res?.success === false,
      "settle_payment_atomic strictly rejects settlement when provider currency is missing"
    );

    const { data: ordCheck } = await adminDb.from("orders").select("payment_status").eq("id", order.id).single();
    assert(ordCheck?.payment_status === "Pending", "Order payment_status remains 'Pending'");
  }

  // ----------------------------------------------------------------------------
  // 3. Incorrect currency -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[3] Incorrect currency");
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: `pay_test_${Date.now()}`,
      p_signature: "sig_03",
      p_raw_response: { amount: orderAmountPaise, currency: "USD" }, // USD not allowed!
    });
    assert(
      res?.status === "currency_mismatch" && res?.success === false,
      "settle_payment_atomic strictly rejects non-INR currency evidence (USD)"
    );

    const { data: ordCheck } = await adminDb.from("orders").select("payment_status").eq("id", order.id).single();
    assert(ordCheck?.payment_status === "Pending", "Order payment_status remains 'Pending'");
  }

  // ----------------------------------------------------------------------------
  // 4. Incorrect amount -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[4] Incorrect amount");
  {
    const { order, rzpOrderId } = await createOrderWithPaymentRecord();
    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: `pay_test_${Date.now()}`,
      p_signature: "sig_04",
      p_raw_response: { amount: 1000, currency: "INR" }, // 10 INR instead of order total
    });
    assert(
      res?.status === "amount_mismatch" && res?.success === false,
      "settle_payment_atomic strictly rejects settlement when provider amount mismatches order total"
    );

    const { data: ordCheck } = await adminDb.from("orders").select("payment_status").eq("id", order.id).single();
    assert(ordCheck?.payment_status === "Pending", "Order payment_status remains 'Pending'");
  }

  // ----------------------------------------------------------------------------
  // 5. Exact valid settlement -> Success
  // ----------------------------------------------------------------------------
  console.log("\n[5] Exact valid settlement");
  let validOrderId: string;
  let validRzpOrderId: string;
  let validPaymentId: string;
  let validAmountPaise: number;
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    validOrderId = order.id;
    validRzpOrderId = rzpOrderId;
    validPaymentId = `pay_valid_${Date.now()}`;
    validAmountPaise = orderAmountPaise;

    const { data: res, error } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: validRzpOrderId,
      p_razorpay_payment_id: validPaymentId,
      p_signature: "sig_valid_05",
      p_raw_response: { amount: validAmountPaise, currency: "INR" },
    });
    assert(!error && res?.status === "settled" && res?.settled === true, "Exact valid settlement succeeds authoritatively");

    const { data: ordCheck } = await adminDb.from("orders").select("payment_status, order_status, is_paid").eq("id", validOrderId).single();
    assert(ordCheck?.payment_status === "Paid" && ordCheck?.order_status === "Confirmed" && ordCheck?.is_paid === true, "Order state transitions to Paid & Confirmed");
  }

  // ----------------------------------------------------------------------------
  // 6. Exact duplicate webhook replay -> Idempotent success ('already_paid', settled: false)
  // ----------------------------------------------------------------------------
  console.log("\n[6] Exact duplicate webhook replay");
  {
    const { data: dupRes } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: validRzpOrderId,
      p_razorpay_payment_id: validPaymentId,
      p_signature: "sig_valid_05",
      p_raw_response: { amount: validAmountPaise, currency: "INR" },
    });
    assert(
      dupRes?.status === "already_paid" && dupRes?.settled === false && dupRes?.success === true,
      "Exact duplicate replay with matching evidence returns idempotent success ('already_paid', settled: false)"
    );
  }

  // ----------------------------------------------------------------------------
  // 7. Duplicate replay with missing evidence -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[7] Duplicate replay with missing evidence");
  {
    // Duplicate call on already-paid order omitting amount
    const { data: rejNoAmt } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: validRzpOrderId,
      p_razorpay_payment_id: validPaymentId,
      p_signature: "sig_valid_05",
      p_raw_response: { currency: "INR" }, // missing amount!
    });
    assert(
      rejNoAmt?.status === "missing_provider_amount" && rejNoAmt?.success === false,
      "Duplicate replay with missing amount evidence is strictly rejected"
    );

    // Duplicate call omitting currency
    const { data: rejNoCurr } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: validRzpOrderId,
      p_razorpay_payment_id: validPaymentId,
      p_signature: "sig_valid_05",
      p_raw_response: { amount: validAmountPaise }, // missing currency!
    });
    assert(
      rejNoCurr?.status === "missing_provider_currency" && rejNoCurr?.success === false,
      "Duplicate replay with missing currency evidence is strictly rejected"
    );
  }

  // ----------------------------------------------------------------------------
  // 8. Duplicate replay with conflicting amount -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[8] Duplicate replay with conflicting amount");
  {
    const { data: rejAmtConflict } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: validRzpOrderId,
      p_razorpay_payment_id: validPaymentId,
      p_signature: "sig_valid_05",
      p_raw_response: { amount: 99999, currency: "INR" }, // wrong amount on duplicate replay!
    });
    assert(
      rejAmtConflict?.status === "amount_mismatch" && rejAmtConflict?.success === false,
      "Duplicate replay with conflicting amount evidence is strictly rejected with 'amount_mismatch'"
    );
  }

  // ----------------------------------------------------------------------------
  // 9. Duplicate replay with conflicting currency -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[9] Duplicate replay with conflicting currency");
  {
    const { data: rejCurrConflict } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: validRzpOrderId,
      p_razorpay_payment_id: validPaymentId,
      p_signature: "sig_valid_05",
      p_raw_response: { amount: validAmountPaise, currency: "USD" }, // wrong currency on duplicate!
    });
    assert(
      rejCurrConflict?.status === "currency_mismatch" && rejCurrConflict?.success === false,
      "Duplicate replay with non-INR currency is strictly rejected with 'currency_mismatch'"
    );
  }

  // ----------------------------------------------------------------------------
  // 10. NULL payment provider -> Database check & RPC rejection
  // ----------------------------------------------------------------------------
  console.log("\n[10] NULL payment provider");
  {
    const order = await createTestOrder("ONLINE");
    const rzpOrderId = `order_null_prov_${Date.now()}`;
    await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", order.id);

    // Database schema enforces NOT NULL on payments.provider
    const { error: insertNullErr } = await adminDb.from("payments").insert({
      order_id: order.id,
      user_id: testUserId,
      payment_id: rzpOrderId,
      provider_order_id: rzpOrderId,
      amount: order.total_amount,
      currency: "INR",
      provider: null as any,
      status: "Pending",
    });
    assert(!!insertNullErr, "Database constraint strictly rejects NULL payment provider on insert");
  }

  // ----------------------------------------------------------------------------
  // 11. Unexpected payment provider -> Settlement rejected
  // ----------------------------------------------------------------------------
  console.log("\n[11] Unexpected payment provider");
  {
    const order = await createTestOrder("ONLINE");
    const rzpOrderId = `order_stripe_prov_${Date.now()}`;
    const orderAmountPaise = Math.round(Number(order.total_amount) * 100);
    await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", order.id);

    // Insert payment record with unexpected provider 'Stripe'
    await adminDb.from("payments").insert({
      order_id: order.id,
      user_id: testUserId,
      payment_id: rzpOrderId,
      provider_order_id: rzpOrderId,
      amount: order.total_amount,
      currency: "INR",
      provider: "Stripe",
      status: "Pending",
    });

    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: `pay_stripe_${Date.now()}`,
      p_signature: "sig_stripe",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });
    assert(
      res?.status === "payment_record_provider_mismatch" && res?.success === false,
      "settle_payment_atomic strictly rejects settlement when payment provider is not Razorpay"
    );
  }

  // ----------------------------------------------------------------------------
  // 12. Failed payment settlement attempt -> Settlement rejected
  // ----------------------------------------------------------------------------
  console.log("\n[12] Failed payment settlement attempt");
  {
    const order = await createTestOrder("ONLINE");
    const rzpOrderId = `order_failed_status_${Date.now()}`;
    const orderAmountPaise = Math.round(Number(order.total_amount) * 100);
    await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", order.id);

    // Insert payment record with status 'Failed'
    await adminDb.from("payments").insert({
      order_id: order.id,
      user_id: testUserId,
      payment_id: rzpOrderId,
      provider_order_id: rzpOrderId,
      amount: order.total_amount,
      currency: "INR",
      provider: "Razorpay",
      status: "Failed",
    });

    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: `pay_failed_${Date.now()}`,
      p_signature: "sig_failed",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });
    assert(
      res?.status === "payment_record_status_invalid" && res?.success === false,
      "settle_payment_atomic rejects settlement attempt on payment record with status 'Failed'"
    );
  }

  // ----------------------------------------------------------------------------
  // 13. Refunded payment settlement attempt -> Settlement rejected
  // ----------------------------------------------------------------------------
  console.log("\n[13] Refunded payment settlement attempt");
  {
    const order = await createTestOrder("ONLINE");
    const rzpOrderId = `order_refunded_status_${Date.now()}`;
    const orderAmountPaise = Math.round(Number(order.total_amount) * 100);
    await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", order.id);

    // Insert payment record with status 'Refunded'
    await adminDb.from("payments").insert({
      order_id: order.id,
      user_id: testUserId,
      payment_id: rzpOrderId,
      provider_order_id: rzpOrderId,
      amount: order.total_amount,
      currency: "INR",
      provider: "Razorpay",
      status: "Refunded",
    });

    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: `pay_refunded_${Date.now()}`,
      p_signature: "sig_refunded",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });
    assert(
      res?.status === "payment_record_status_invalid" && res?.success === false,
      "settle_payment_atomic rejects settlement attempt on payment record with status 'Refunded'"
    );
  }

  // ----------------------------------------------------------------------------
  // 14. Existing conflicting provider payment ID -> Rejected (Conflict)
  // ----------------------------------------------------------------------------
  console.log("\n[14] Existing conflicting provider payment ID");
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    const payA = `pay_first_${Date.now()}`;
    const payConflict = `pay_CONFLICTING_${Date.now()}`;

    // Settle with payA
    await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: payA,
      p_signature: "sig_a",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });

    // Attempt second settlement with payConflict
    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: payConflict,
      p_signature: "sig_conflict",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });
    assert(
      res?.status === "payment_id_conflict" && res?.success === false,
      "settle_payment_atomic strictly rejects conflicting payment ID with 'payment_id_conflict'"
    );

    const { data: ordCheck } = await adminDb.from("orders").select("razorpay_payment_id").eq("id", order.id).single();
    assert(ordCheck?.razorpay_payment_id === payA, "Stored payment ID remains unaltered");
  }

  // ----------------------------------------------------------------------------
  // 15. Existing matching provider payment ID -> Idempotent success
  // ----------------------------------------------------------------------------
  console.log("\n[15] Existing matching provider payment ID");
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    const payA = `pay_matching_${Date.now()}`;

    await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: payA,
      p_signature: "sig_a",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });

    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: payA,
      p_signature: "sig_a",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });
    assert(
      res?.status === "already_paid" && res?.settled === false && res?.success === true,
      "Existing matching payment ID returns idempotent success ('already_paid', settled: false)"
    );
  }

  // ----------------------------------------------------------------------------
  // 16. Order/payment identity mismatch -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[16] Order/payment identity mismatch");
  {
    const orderA = await createTestOrder("ONLINE");
    const orderB = await createTestOrder("ONLINE");
    const rzpOrderId = `order_cross_mismatch_${Date.now()}`;
    const orderAmountPaise = Math.round(Number(orderA.total_amount) * 100);

    await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", orderA.id);

    // Payment record belongs to orderB instead of orderA
    await adminDb.from("payments").insert({
      order_id: orderB.id,
      user_id: testUserId,
      payment_id: rzpOrderId,
      provider_order_id: rzpOrderId,
      amount: orderA.total_amount,
      currency: "INR",
      provider: "Razorpay",
      status: "Pending",
    });

    const { data: res } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: `pay_mismatch_${Date.now()}`,
      p_signature: "sig_mismatch",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });
    assert(
      res?.status === "payment_record_order_mismatch" && res?.success === false,
      "settle_payment_atomic rejects settlement when payment record order_id mismatches candidate order"
    );
  }

  // ----------------------------------------------------------------------------
  // 17. Multiple payment records for one provider order ID -> Prevented by unique constraint
  // ----------------------------------------------------------------------------
  console.log("\n[17] Multiple payment records for one provider order ID");
  {
    const order = await createTestOrder("ONLINE");
    const rzpOrderId = `order_uniq_test_${Date.now()}`;
    await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", order.id);

    // Insert first payment record
    await adminDb.from("payments").insert({
      order_id: order.id,
      user_id: testUserId,
      payment_id: rzpOrderId,
      provider_order_id: rzpOrderId,
      amount: order.total_amount,
      currency: "INR",
      provider: "Razorpay",
      status: "Pending",
    });

    // Attempt inserting second payment record with duplicate provider_order_id
    const { error: dupPmtErr } = await adminDb.from("payments").insert({
      order_id: order.id,
      user_id: testUserId,
      payment_id: `${rzpOrderId}_dup`,
      provider_order_id: rzpOrderId,
      amount: order.total_amount,
      currency: "INR",
      provider: "Razorpay",
      status: "Pending",
    });
    assert(
      !!dupPmtErr && (dupPmtErr.code === "23505" || dupPmtErr.message.includes("unique")),
      "Database constraint payments_provider_order_id_key strictly prevents duplicate payment records for same provider order"
    );
  }

  // ----------------------------------------------------------------------------
  // 18. Unauthorized settlement RPC invocation -> Rejected for anon and customer
  // ----------------------------------------------------------------------------
  console.log("\n[18] Unauthorized settlement RPC invocation");
  {
    const { error: anonErr } = await anonDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: "order_fake",
      p_razorpay_payment_id: "pay_fake",
      p_raw_response: { amount: 10000, currency: "INR" },
    });
    assert(!!anonErr, "Anonymous caller cannot invoke settle_payment_atomic (permission denied)");

    const { error: custErr } = await customerClient.rpc("settle_payment_atomic", {
      p_razorpay_order_id: "order_fake",
      p_razorpay_payment_id: "pay_fake",
      p_raw_response: { amount: 10000, currency: "INR" },
    });
    assert(!!custErr, "Authenticated ordinary customer cannot invoke settle_payment_atomic (permission denied)");
  }

  // ----------------------------------------------------------------------------
  // 19. Invalid webhook signature -> Rejected
  // ----------------------------------------------------------------------------
  console.log("\n[19] Invalid webhook signature");
  {
    const secret = "test_webhook_secret_12345";
    const payload = JSON.stringify({ event: "payment.captured", id: `evt_${Date.now()}` });
    const forgedSignature = "0000000000000000000000000000000000000000000000000000000000000000";

    const isValid = validateWebhookSignature(payload, forgedSignature, secret);
    assert(isValid === false, "validateWebhookSignature strictly rejects forged HMAC signature");
  }

  // ----------------------------------------------------------------------------
  // 20. Valid webhook signature using the raw request body -> Accepted
  // ----------------------------------------------------------------------------
  console.log("\n[20] Valid webhook signature using the raw request body");
  {
    const secret = "test_webhook_secret_12345";
    const rawBody = JSON.stringify({
      event: "order.paid",
      id: `evt_raw_${Date.now()}`,
      payload: { payment: { entity: { amount: 39500, currency: "INR" } } },
    });
    const genuineSignature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

    const isValidGenuine = validateWebhookSignature(rawBody, genuineSignature, secret);
    assert(isValidGenuine === true, "validateWebhookSignature accepts genuine HMAC signature computed from raw body");

    const tamperedBody = rawBody.replace("39500", "10000");
    const isTamperedValid = validateWebhookSignature(tamperedBody, genuineSignature, secret);
    assert(isTamperedValid === false, "validateWebhookSignature rejects tampered request body");
  }

  // ----------------------------------------------------------------------------
  // CONCURRENCY & LIFECYCLE INVARIANT TESTS
  // ----------------------------------------------------------------------------
  console.log("\n--- CONCURRENCY & LIFECYCLE INVARIANT VERIFICATIONS ---");

  // Concurrency 1: Two simultaneous identical settlement requests
  console.log("\n[Concurrency 1] Two simultaneous identical settlement requests");
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    const concPayId = `pay_simul_${Date.now()}`;

    const [res1, res2] = await Promise.all([
      adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: concPayId,
        p_signature: "sig_simul",
        p_raw_response: { amount: orderAmountPaise, currency: "INR" },
      }),
      adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: concPayId,
        p_signature: "sig_simul",
        p_raw_response: { amount: orderAmountPaise, currency: "INR" },
      }),
    ]);

    const statuses = [res1.data?.status, res2.data?.status].sort();
    assert(
      statuses[0] === "already_paid" && statuses[1] === "settled",
      `Two simultaneous identical settlement requests resolved atomically: 1 'settled' and 1 'already_paid' (got ${statuses.join(", ")})`
    );
  }

  // Concurrency 2: Two conflicting settlement requests for the same order
  console.log("\n[Concurrency 2] Two conflicting settlement requests for the same order");
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    const pay1 = `pay_race_1_${Date.now()}`;
    const pay2 = `pay_race_2_${Date.now()}`;

    const [res1, res2] = await Promise.all([
      adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: pay1,
        p_signature: "sig_race_1",
        p_raw_response: { amount: orderAmountPaise, currency: "INR" },
      }),
      adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: pay2,
        p_signature: "sig_race_2",
        p_raw_response: { amount: orderAmountPaise, currency: "INR" },
      }),
    ]);

    const statuses = [res1.data?.status, res2.data?.status].sort();
    assert(
      statuses.includes("payment_id_conflict") && statuses.includes("settled"),
      `Conflicting settlement requests resolved safely: 1 'settled' and 1 'payment_id_conflict' (got ${statuses.join(", ")})`
    );
  }

  // Concurrency 3: Repeated webhook delivery
  console.log("\n[Concurrency 3] Repeated webhook delivery");
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    const wbkId = `pay_wbk_rep_${Date.now()}`;

    const payload = {
      entity: "event",
      payload: {
        payment: { entity: { id: wbkId, order_id: rzpOrderId, amount: orderAmountPaise, currency: "INR" } },
      },
    };

    const { data: wbk1 } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: wbkId,
      p_signature: "sig_wbk_1",
      p_raw_response: payload,
    });
    assert(wbk1?.settled === true, "First webhook delivery successfully settles payment");

    const { data: wbk2 } = await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: wbkId,
      p_signature: "sig_wbk_1",
      p_raw_response: payload,
    });
    assert(
      wbk2?.status === "already_paid" && wbk2?.settled === false,
      "Duplicate webhook delivery is idempotent without re-mutating"
    );
  }

  // Invariant: Refund amount exceeding order total is rejected
  console.log("\n[Invariant] Refund amount boundaries");
  {
    const { order, rzpOrderId, orderAmountPaise } = await createOrderWithPaymentRecord();
    const rfndPayId = `pay_rfnd_chk_${Date.now()}`;

    await adminDb.rpc("settle_payment_atomic", {
      p_razorpay_order_id: rzpOrderId,
      p_razorpay_payment_id: rfndPayId,
      p_signature: "sig_rfnd_chk",
      p_raw_response: { amount: orderAmountPaise, currency: "INR" },
    });

    const { error: excessErr } = await adminDb.rpc("record_refund_atomic", {
      p_order_id: order.id,
      p_refund_id: `rfnd_ex_${Date.now()}`,
      p_refund_amount: 99999,
      p_refund_status: "processed",
    });
    assert(!!excessErr, "record_refund_atomic rejects refund amount exceeding order total");
  }

  // Invariant: Duplicate inventory restoration defense
  console.log("\n[Invariant] Duplicate inventory restoration defense");
  {
    const { data: bookBefore } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
    const stockStart = bookBefore!.stock;

    const order = await createTestOrder("COD");
    const { data: bookMid } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
    assert(bookMid!.stock === stockStart - 1, `Stock decremented by 1 (from ${stockStart} to ${bookMid!.stock})`);

    const { data: c1 } = await adminDb.rpc("cancel_order_atomic", {
      p_order_id: order.id,
      p_user_id: testUserId,
      p_cancel_reason: "Customer cancelled",
    });
    assert(c1 === true, "First cancellation succeeds");

    const { data: bookAfterC1 } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
    assert(bookAfterC1!.stock === stockStart, `Stock restored to ${stockStart}`);

    const { error: c2Err } = await adminDb.rpc("cancel_order_atomic", {
      p_order_id: order.id,
      p_user_id: testUserId,
      p_cancel_reason: "Customer cancelled again",
    });
    assert(!!c2Err, "Repeated cancellation attempt on already cancelled order is rejected");

    const { data: bookAfterC2 } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
    assert(
      bookAfterC2!.stock === stockStart,
      `Duplicate cancellation defense verified: Stock remained ${stockStart} (zero double-restoration)`
    );
  }

  // Invariant: Duplicate coupon release defense
  console.log("\n[Invariant] Duplicate coupon release defense");
  {
    const { data: coupStart } = await adminDb.from("discounts").select("used_count").eq("id", testCouponId).single();
    const initialUsedCount = coupStart!.used_count;

    const { data: orderWithCoupId } = await adminDb.rpc("create_order_atomic", {
      p_user_id: testUserId,
      p_items: [{ book_id: testBookId, quantity: 1 }],
      p_address_snapshot: sampleAddress,
      p_payment_method: "COD",
      p_coupon_code: testCouponCode,
    });

    const { data: coupAfterOrder } = await adminDb.from("discounts").select("used_count").eq("id", testCouponId).single();
    assert(
      coupAfterOrder!.used_count === initialUsedCount + 1,
      `Coupon used_count atomically incremented to ${coupAfterOrder!.used_count}`
    );

    await adminDb.rpc("cancel_order_atomic", {
      p_order_id: orderWithCoupId,
      p_user_id: testUserId,
      p_cancel_reason: "Customer cancelled",
    });

    const { data: coupAfterCancel } = await adminDb.from("discounts").select("used_count").eq("id", testCouponId).single();
    assert(
      coupAfterCancel!.used_count === initialUsedCount,
      `Coupon used_count atomically released back to ${initialUsedCount}`
    );

    await adminDb.rpc("cancel_order_atomic", {
      p_order_id: orderWithCoupId,
      p_user_id: testUserId,
      p_cancel_reason: "Customer cancelled repeat",
    });

    const { data: coupAfterRepeat } = await adminDb.from("discounts").select("used_count").eq("id", testCouponId).single();
    assert(
      coupAfterRepeat!.used_count === initialUsedCount,
      `Duplicate release defense verified: used_count remained ${initialUsedCount} (no double decrement)`
    );
  }
}

async function main() {
  try {
    await setupFixtures();
    await runTests();
  } catch (err: any) {
    console.error("\nUnexpected error in test execution:", err);
    process.exitCode = 1;
  } finally {
    await cleanupFixtures();
    console.log("\n================================================================================");
    console.log(` PHASE 0 FINAL SECURITY VERIFICATION: ${passedCount}/${totalCount} TESTS PASSED (${Math.round((passedCount / totalCount) * 100)}%)`);
    console.log("================================================================================\n");
  }
}

main();
