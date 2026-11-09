/**
 * Phase 0: Already-Paid Order / Pending Payment Inconsistency Remediation Suite
 * MD Shakib Islamic Books Modernization Project
 * 
 * Verifies all 15 scenarios from Section 6 of User Request:
 * 1. Consistent Paid/Paid replay.
 * 2. Paid order + Pending payment record (Safe Reconciliation).
 * 3. Paid order + conflicting payment ID.
 * 4. Paid order + missing amount.
 * 5. Paid order + missing currency.
 * 6. Paid order + mismatched amount.
 * 7. Paid order + mismatched currency.
 * 8. Paid order + Failed payment record.
 * 9. Paid order + Refunded payment record.
 * 10. Duplicate webhook replay.
 * 11. Two concurrent identical settlement requests.
 * 12. Two concurrent conflicting settlement requests.
 * 13. Existing payment identity is never overwritten.
 * 14. No duplicate inventory restoration.
 * 15. No duplicate coupon release.
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

const SUPABASE_URL = process.env.LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.LOCAL_SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

let testUserId: string;
let testBookId: string;
let testCouponId: string;
let testCouponCode: string;
const runId = Date.now().toString().slice(-6);

const sampleAddress = {
  full_name: "Phase0 Auditor",
  phone: "+919876543210",
  house_no: "Suite 505",
  area: "Audit Enclave",
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
  console.log("--- PROVISIONING FIXTURES FOR ALREADY-PAID RECONCILIATION SUITE ---");
  const email = `phase0_reconcile_${runId}@example.com`;
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
    name: "Phase 0 Reconcile Auditor",
    role: "user",
  });

  // Create book
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: `Kitab al-Amwal ${runId}`,
      description: "Classical treatise on Islamic public finance",
      category: "Fiqh",
      author: "Abu Ubayd",
      price: 500,
      discount: 100, // effective: 400
      stock: 100,
      image_url: "https://example.com/amwal.jpg",
    })
    .select()
    .single();
  testBookId = book.id;

  // Create coupon
  testCouponCode = `RECON${runId}`;
  const now = new Date();
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const { data: coupon, error: cErr } = await adminDb
    .from("discounts")
    .insert({
      code: testCouponCode,
      discount_type: "fixed",
      discount_value: 50,
      min_order_amount: 100,
      usage_limit: 50,
      used_count: 0,
      valid_from: now.toISOString(),
      valid_until: validUntil.toISOString(),
      is_active: true,
    })
    .select()
    .single();
  if (cErr || !coupon) {
    throw new Error(`Failed to create test coupon: ${cErr?.message}`);
  }
  testCouponId = coupon.id;

  console.log(`Fixtures initialized: User=${testUserId}, Book=${testBookId}, Coupon=${testCouponCode}`);
}

async function cleanupFixtures() {
  console.log("\n--- CLEANING UP TEST FIXTURES ---");
  try {
    const { data: userOrders } = await adminDb.from("orders").select("id").eq("user_id", testUserId);
    const orderIds = userOrders?.map((o) => o.id) || [];
    if (orderIds.length > 0) {
      await adminDb.from("inventory_reservations").delete().in("order_id", orderIds);
      await adminDb.from("order_items").delete().in("order_id", orderIds);
      await adminDb.from("payments").delete().in("order_id", orderIds);
      await adminDb.from("order_status_history").delete().in("order_id", orderIds);
      await adminDb.from("orders").delete().in("id", orderIds);
    }
    if (testBookId) await adminDb.from("books").delete().eq("id", testBookId);
    if (testCouponId) await adminDb.from("discounts").delete().eq("id", testCouponId);
    if (testUserId) await adminDb.auth.admin.deleteUser(testUserId);
    console.log("Cleanup completed.");
  } catch (err: any) {
    console.error("Cleanup error (non-fatal):", err?.message);
  }
}

/**
 * Helper to build an order + order_items + payment record fixture
 */
async function createOrderFixture(params: {
  suffix: string;
  orderStatus?: string;
  paymentStatus?: string;
  isPaid?: boolean;
  orderPaymentId?: string | null;
  paymentRecordStatus?: string;
  paymentRecordPaymentId?: string | null;
  couponStatus?: string;
  reserveStock?: boolean;
}) {
  const rzpOrderId = `order_rc_${runId}_${params.suffix}`;
  const totalAmount = 405.0; // 400 + 5 platform_fee

  const { data: order, error: oErr } = await adminDb
    .from("orders")
    .insert({
      user_id: testUserId,
      order_number: `ORD-RC-${runId}-${params.suffix}`,
      total_amount: totalAmount,
      subtotal: 400.0,
      platform_fee: 5.0,
      delivery_fee: 0.0,
      discount_amount: 0.0,
      order_status: params.orderStatus ?? "Pending",
      payment_status: params.paymentStatus ?? "Pending",
      payment_method: "ONLINE",
      is_paid: params.isPaid ?? false,
      razorpay_order_id: rzpOrderId,
      razorpay_payment_id: params.orderPaymentId ?? null,
      address_snapshot: sampleAddress,
      coupon_code: params.couponStatus ? testCouponCode : null,
      coupon_status: params.couponStatus ?? "none",
    })
    .select()
    .single();

  if (oErr || !order) {
    throw new Error(`Failed to create order fixture: ${oErr?.message}`);
  }

  await adminDb.from("order_items").insert({
    order_id: order.id,
    book_id: testBookId,
    quantity: 1,
    unit_price: 400.0,
    total_price: 400.0,
  });

  if (params.reserveStock) {
    const { error: rErr } = await adminDb.from("inventory_reservations").insert({
      order_id: order.id,
      book_id: testBookId,
      quantity: 1,
      status: "reserved",
      payment_method: "ONLINE",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
    if (rErr) {
      throw new Error(`Failed to create reservation fixture: ${rErr.message}`);
    }
  }

  const { data: payment, error: pErr } = await adminDb
    .from("payments")
    .insert({
      order_id: order.id,
      user_id: testUserId,
      payment_id: rzpOrderId,
      provider_order_id: rzpOrderId,
      provider_payment_id: params.paymentRecordPaymentId ?? null,
      amount: totalAmount,
      currency: "INR",
      provider: "Razorpay",
      status: params.paymentRecordStatus ?? "Pending",
    })
    .select()
    .single();

  if (pErr || !payment) {
    throw new Error(`Failed to create payment fixture: ${pErr?.message}`);
  }

  return { order, payment, rzpOrderId, totalAmount };
}

async function runAllTests() {
  await setupFixtures();

  try {
    console.log("\n========================================================");
    console.log("PHASE 0: ALREADY-PAID / PENDING RECONCILIATION VERIFICATION");
    console.log("========================================================\n");

    // -------------------------------------------------------------------------
    // TEST 1: Consistent Paid/Paid replay
    // -------------------------------------------------------------------------
    console.log("--- TEST 1: Consistent Paid/Paid Replay ---");
    {
      const legitPaymentId = `pay_legit_${runId}_01`;
      const fixture = await createOrderFixture({
        suffix: "01",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Paid",
        paymentRecordPaymentId: legitPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_signature: "sig_replay_01",
        p_raw_response: { amount: 40500, currency: "INR" },
      });

      const r = res as any;
      assert(r?.success === true, "Consistent Paid/Paid replay returns success = true");
      assert(r?.status === "already_paid", "Consistent Paid/Paid replay returns status = already_paid");
      assert(r?.settled === false, "Consistent Paid/Paid replay returns settled = false (no duplicate email)");
      assert(r?.reconciled === false, "Consistent Paid/Paid replay returns reconciled = false (no re-mutation)");

      // Verify DB state remains untouched
      const { data: oCheck } = await adminDb.from("orders").select("payment_status, is_paid, razorpay_payment_id").eq("id", fixture.order.id).single();
      const { data: pCheck } = await adminDb.from("payments").select("status, provider_payment_id").eq("id", fixture.payment.id).single();
      assert(oCheck?.payment_status === "Paid" && oCheck?.is_paid === true && oCheck?.razorpay_payment_id === legitPaymentId, "Order DB state preserved as Paid");
      assert(pCheck?.status === "Paid" && pCheck?.provider_payment_id === legitPaymentId, "Payment DB state preserved as Paid");
    }

    // -------------------------------------------------------------------------
    // TEST 2: Paid order + Pending payment record (Safe Reconciliation)
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 2: Paid Order + Pending Payment Record (Safe Reconciliation) ---");
    {
      const legitPaymentId = `pay_reconcile_${runId}_02`;
      const fixture = await createOrderFixture({
        suffix: "02",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Pending", // INCONSISTENT!
        paymentRecordPaymentId: null,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_signature: "sig_reconcile_02",
        p_raw_response: { amount: 40500, currency: "INR" },
      });

      const r = res as any;
      assert(r?.success === true, "Paid order with Pending payment record returns success = true");
      assert(r?.status === "already_paid", "Returns status = already_paid");
      assert(r?.settled === false, "Returns settled = false (prevents duplicate emails/inventory actions)");
      assert(r?.reconciled === true, "Returns reconciled = true (safely reconciled payment record)");

      // Verify final database state: payments.status MUST now be 'Paid' and have provider_payment_id
      const { data: oCheck } = await adminDb.from("orders").select("payment_status, is_paid, razorpay_payment_id").eq("id", fixture.order.id).single();
      const { data: pCheck } = await adminDb.from("payments").select("status, provider_payment_id").eq("id", fixture.payment.id).single();
      assert(oCheck?.payment_status === "Paid" && oCheck?.is_paid === true, "Order remains Paid");
      assert(pCheck?.status === "Paid", "Payment record is safely reconciled from Pending to Paid");
      assert(pCheck?.provider_payment_id === legitPaymentId, "Payment record has matching provider_payment_id populated");
    }

    // -------------------------------------------------------------------------
    // TEST 3: Paid order + conflicting payment ID
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 3: Paid Order + Conflicting Payment ID ---");
    {
      const legitPaymentId = `pay_orig_${runId}_03`;
      const conflictPaymentId = `pay_CONFLICT_${runId}_03`;
      const fixture = await createOrderFixture({
        suffix: "03",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Paid",
        paymentRecordPaymentId: legitPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: conflictPaymentId,
        p_signature: "sig_conflict_03",
        p_raw_response: { amount: 40500, currency: "INR" },
      });

      const r = res as any;
      assert(r?.success === false, "Conflicting payment ID settlement returns success = false");
      assert(r?.status === "payment_id_conflict", "Conflicting payment ID returns status = payment_id_conflict");

      // Verify identities were preserved
      const { data: oCheck } = await adminDb.from("orders").select("razorpay_payment_id").eq("id", fixture.order.id).single();
      const { data: pCheck } = await adminDb.from("payments").select("provider_payment_id").eq("id", fixture.payment.id).single();
      assert(oCheck?.razorpay_payment_id === legitPaymentId, "Order payment ID was NOT overwritten");
      assert(pCheck?.provider_payment_id === legitPaymentId, "Payment record payment ID was NOT overwritten");
    }

    // -------------------------------------------------------------------------
    // TEST 4: Paid order + missing amount
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 4: Paid Order + Missing Amount ---");
    {
      const legitPaymentId = `pay_miss_amt_${runId}_04`;
      const fixture = await createOrderFixture({
        suffix: "04",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Paid",
        paymentRecordPaymentId: legitPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { currency: "INR" }, // Missing amount!
      });

      const r = res as any;
      assert(r?.success === false, "Missing amount on Paid order returns success = false");
      assert(r?.status === "missing_provider_amount", "Returns status = missing_provider_amount");
    }

    // -------------------------------------------------------------------------
    // TEST 5: Paid order + missing currency
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 5: Paid Order + Missing Currency ---");
    {
      const legitPaymentId = `pay_miss_cur_${runId}_05`;
      const fixture = await createOrderFixture({
        suffix: "05",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Paid",
        paymentRecordPaymentId: legitPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 40500 }, // Missing currency!
      });

      const r = res as any;
      assert(r?.success === false, "Missing currency on Paid order returns success = false");
      assert(r?.status === "missing_provider_currency", "Returns status = missing_provider_currency");
    }

    // -------------------------------------------------------------------------
    // TEST 6: Paid order + mismatched amount
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 6: Paid Order + Mismatched Amount ---");
    {
      const legitPaymentId = `pay_mis_amt_${runId}_06`;
      const fixture = await createOrderFixture({
        suffix: "06",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Paid",
        paymentRecordPaymentId: legitPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 10000, currency: "INR" }, // 100 INR instead of 405 INR!
      });

      const r = res as any;
      assert(r?.success === false, "Mismatched amount on Paid order returns success = false");
      assert(r?.status === "amount_mismatch", "Returns status = amount_mismatch");
    }

    // -------------------------------------------------------------------------
    // TEST 7: Paid order + mismatched currency
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 7: Paid Order + Mismatched Currency ---");
    {
      const legitPaymentId = `pay_mis_cur_${runId}_07`;
      const fixture = await createOrderFixture({
        suffix: "07",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Paid",
        paymentRecordPaymentId: legitPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 40500, currency: "USD" }, // USD instead of INR!
      });

      const r = res as any;
      assert(r?.success === false, "Mismatched currency on Paid order returns success = false");
      assert(r?.status === "currency_mismatch", "Returns status = currency_mismatch");
    }

    // -------------------------------------------------------------------------
    // TEST 8: Paid order + Failed payment record
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 8: Paid Order + Failed Payment Record ---");
    {
      const legitPaymentId = `pay_failed_rec_${runId}_08`;
      const fixture = await createOrderFixture({
        suffix: "08",
        orderStatus: "Cancelled",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Failed",
        paymentRecordPaymentId: legitPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 40500, currency: "INR" },
      });

      const r = res as any;
      assert(r?.success === false, "Settlement with Failed payment record returns success = false");
      assert(r?.status === "payment_record_status_invalid", "Returns status = payment_record_status_invalid");

      // Verify payment record was NOT converted to Paid
      const { data: pCheck } = await adminDb.from("payments").select("status").eq("id", fixture.payment.id).single();
      assert(pCheck?.status === "Failed", "Payment record status remains strictly Failed");
    }

    // -------------------------------------------------------------------------
    // TEST 9: Paid order + Refunded payment record
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 9: Paid Order + Refunded Payment Record ---");
    {
      const legitPaymentId = `pay_refunded_rec_${runId}_09`;
      const fixture = await createOrderFixture({
        suffix: "09",
        orderStatus: "Cancelled",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: legitPaymentId,
        paymentRecordStatus: "Refunded",
        paymentRecordPaymentId: legitPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 40500, currency: "INR" },
      });

      const r = res as any;
      assert(r?.success === false, "Settlement with Refunded payment record returns success = false");
      assert(r?.status === "payment_record_status_invalid", "Returns status = payment_record_status_invalid");

      // Verify payment record was NOT converted to Paid
      const { data: pCheck } = await adminDb.from("payments").select("status").eq("id", fixture.payment.id).single();
      assert(pCheck?.status === "Refunded", "Payment record status remains strictly Refunded");
    }

    // -------------------------------------------------------------------------
    // TEST 10: Duplicate webhook replay
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 10: Duplicate Webhook Replay ---");
    {
      const legitPaymentId = `pay_webhook_dup_${runId}_10`;
      const fixture = await createOrderFixture({
        suffix: "10",
        orderStatus: "Pending",
        paymentStatus: "Pending",
        isPaid: false,
        reserveStock: true,
      });

      // Initial settlement
      const { data: res1 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_signature: "sig_first_10",
        p_raw_response: { amount: 40500, currency: "INR" },
      });
      assert((res1 as any)?.success === true && (res1 as any)?.settled === true, "First webhook settlement succeeds with settled = true");

      // Duplicate webhook replay
      const { data: res2 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_signature: "sig_replay_10",
        p_raw_response: { amount: 40500, currency: "INR" },
      });
      const r2 = res2 as any;
      assert(r2?.success === true, "Duplicate webhook replay returns success = true");
      assert(r2?.status === "already_paid", "Duplicate webhook replay returns status = already_paid");
      assert(r2?.settled === false, "Duplicate webhook replay returns settled = false");
    }

    // -------------------------------------------------------------------------
    // TEST 11: Two concurrent identical settlement requests
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 11: Two Concurrent Identical Settlement Requests ---");
    {
      const legitPaymentId = `pay_concurrent_id_${runId}_11`;
      const fixture = await createOrderFixture({
        suffix: "11",
        orderStatus: "Pending",
        paymentStatus: "Pending",
        isPaid: false,
        reserveStock: true,
      });

      const [resA, resB] = await Promise.all([
        adminDb.rpc("settle_payment_atomic", {
          p_razorpay_order_id: fixture.rzpOrderId,
          p_razorpay_payment_id: legitPaymentId,
          p_signature: "sig_concurrent_A",
          p_raw_response: { amount: 40500, currency: "INR" },
        }),
        adminDb.rpc("settle_payment_atomic", {
          p_razorpay_order_id: fixture.rzpOrderId,
          p_razorpay_payment_id: legitPaymentId,
          p_signature: "sig_concurrent_B",
          p_raw_response: { amount: 40500, currency: "INR" },
        }),
      ]);

      const dataA = resA.data as any;
      const dataB = resB.data as any;

      assert(dataA?.success === true && dataB?.success === true, "Both concurrent identical requests succeed");
      const settledCount = (dataA?.settled ? 1 : 0) + (dataB?.settled ? 1 : 0);
      assert(settledCount === 1, "Exactly one concurrent request settled initial transaction (settled = true)");
      const alreadyPaidCount = (dataA?.status === "already_paid" ? 1 : 0) + (dataB?.status === "already_paid" ? 1 : 0);
      assert(alreadyPaidCount === 1, "Second concurrent request received status = already_paid");
    }

    // -------------------------------------------------------------------------
    // TEST 12: Two concurrent conflicting settlement requests
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 12: Two Concurrent Conflicting Settlement Requests ---");
    {
      const payA = `pay_conflict_A_${runId}_12`;
      const payB = `pay_conflict_B_${runId}_12`;
      const fixture = await createOrderFixture({
        suffix: "12",
        orderStatus: "Pending",
        paymentStatus: "Pending",
        isPaid: false,
        reserveStock: true,
      });

      const [resA, resB] = await Promise.all([
        adminDb.rpc("settle_payment_atomic", {
          p_razorpay_order_id: fixture.rzpOrderId,
          p_razorpay_payment_id: payA,
          p_signature: "sig_conflict_A",
          p_raw_response: { amount: 40500, currency: "INR" },
        }),
        adminDb.rpc("settle_payment_atomic", {
          p_razorpay_order_id: fixture.rzpOrderId,
          p_razorpay_payment_id: payB,
          p_signature: "sig_conflict_B",
          p_raw_response: { amount: 40500, currency: "INR" },
        }),
      ]);

      const dataA = resA.data as any;
      const dataB = resB.data as any;

      const oneSucceeded = (dataA?.success && !dataB?.success) || (dataB?.success && !dataA?.success);
      assert(oneSucceeded, "Exactly one conflicting request succeeded and one was rejected");
      const conflictRejected = dataA?.status === "payment_id_conflict" || dataB?.status === "payment_id_conflict";
      assert(conflictRejected, "Rejected request explicitly reported status = payment_id_conflict");
    }

    // -------------------------------------------------------------------------
    // TEST 13: Existing payment identity is never overwritten
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 13: Existing Payment Identity is Never Overwritten ---");
    {
      const origPaymentId = `pay_orig_safe_${runId}_13`;
      const attackerPaymentId = `pay_attacker_${runId}_13`;
      const fixture = await createOrderFixture({
        suffix: "13",
        orderStatus: "Confirmed",
        paymentStatus: "Paid",
        isPaid: true,
        orderPaymentId: origPaymentId,
        paymentRecordStatus: "Paid",
        paymentRecordPaymentId: origPaymentId,
      });

      const { data: res } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: attackerPaymentId,
        p_raw_response: { amount: 40500, currency: "INR" },
      });

      assert((res as any)?.success === false, "Attack with differing payment ID is rejected");
      assert((res as any)?.status === "payment_id_conflict", "Returns payment_id_conflict");

      const { data: pCheck } = await adminDb.from("payments").select("provider_payment_id").eq("id", fixture.payment.id).single();
      const { data: oCheck } = await adminDb.from("orders").select("razorpay_payment_id").eq("id", fixture.order.id).single();
      assert(pCheck?.provider_payment_id === origPaymentId, "Payment provider_payment_id remains strictly pay_orig");
      assert(oCheck?.razorpay_payment_id === origPaymentId, "Order razorpay_payment_id remains strictly pay_orig");
    }

    // -------------------------------------------------------------------------
    // TEST 14: No duplicate inventory restoration
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 14: No Duplicate Inventory Restoration on Replay ---");
    {
      const legitPaymentId = `pay_stock_safe_${runId}_14`;
      const fixture = await createOrderFixture({
        suffix: "14",
        orderStatus: "Pending",
        paymentStatus: "Pending",
        isPaid: false,
        reserveStock: true,
      });

      // Capture stock before initial settlement
      const { data: bookBefore } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
      const initialStock = bookBefore?.stock ?? 0;

      // Settle
      const { data: sRes1, error: sErr1 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 40500, currency: "INR" },
      });
      if (sErr1 || !(sRes1 as any)?.success) {
        console.error("TEST 14 initial settlement failed:", sErr1, sRes1);
      }

      // Reservation is committed
      const { data: resAfter1 } = await adminDb.from("inventory_reservations").select("status").eq("order_id", fixture.order.id).single();
      assert(resAfter1?.status === "committed", "Inventory reservation transitioned to committed");

      // Repeated replay
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 40500, currency: "INR" },
      });

      const { data: bookAfterReplay } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
      const { data: resAfterReplay } = await adminDb.from("inventory_reservations").select("status").eq("order_id", fixture.order.id).single();
      assert(bookAfterReplay?.stock === initialStock, "Book physical stock is completely unchanged by replay");
      assert(resAfterReplay?.status === "committed", "Reservation remains committed; no duplicate inventory restoration occurs");
    }

    // -------------------------------------------------------------------------
    // TEST 15: No duplicate coupon release
    // -------------------------------------------------------------------------
    console.log("\n--- TEST 15: No Duplicate Coupon Release on Replay ---");
    {
      const legitPaymentId = `pay_coupon_safe_${runId}_15`;
      const fixture = await createOrderFixture({
        suffix: "15",
        orderStatus: "Pending",
        paymentStatus: "Pending",
        isPaid: false,
        couponStatus: "reserved",
        reserveStock: true,
      });

      // Initial used_count
      const { data: cBefore } = await adminDb.from("discounts").select("used_count").eq("id", testCouponId).single();
      const countBefore = cBefore?.used_count ?? 0;

      // Settle
      const { data: sRes1, error: sErr1 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 40500, currency: "INR" },
      });
      if (sErr1 || !(sRes1 as any)?.success) {
        console.error("TEST 15 initial settlement failed:", sErr1, sRes1);
      }

      const { data: oAfter1 } = await adminDb.from("orders").select("coupon_status").eq("id", fixture.order.id).single();
      assert(oAfter1?.coupon_status === "consumed", "Order coupon_status transitioned from reserved to consumed");

      // Replay
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: fixture.rzpOrderId,
        p_razorpay_payment_id: legitPaymentId,
        p_raw_response: { amount: 40500, currency: "INR" },
      });

      const { data: cAfterReplay } = await adminDb.from("discounts").select("used_count").eq("id", testCouponId).single();
      const { data: oAfterReplay } = await adminDb.from("orders").select("coupon_status").eq("id", fixture.order.id).single();

      assert(cAfterReplay?.used_count === countBefore, "Coupon used_count was NOT mutated on settlement replay");
      assert(oAfterReplay?.coupon_status === "consumed", "Order coupon_status remains consumed; no duplicate release occurred");
    }

    console.log("\n========================================================");
    console.log(`ALL TESTS COMPLETED: ${passedCount}/${totalCount} assertions passed (100%)`);
    console.log("========================================================\n");
  } finally {
    await cleanupFixtures();
  }
}

runAllTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
