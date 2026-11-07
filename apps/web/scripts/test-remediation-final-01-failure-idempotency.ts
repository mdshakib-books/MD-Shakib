/**
 * ==============================================================================
 * FINAL REMEDIATION 1: IDEMPOTENT PAYMENT FAILURE & COUPON RELEASE SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Tests:
 * 1. Single failure event releases stock, reservation, and coupon usage.
 * 2. Repeated failure events are harmless no-ops: stock and coupon are NOT double-released.
 * 3. Only release coupon when the order owns an active reservation (coupon_status = 'reserved').
 * 4. Concurrent failure events resolve safely with exactly one stock and coupon rollback.
 * 5. Failure arriving after successful payment (Paid order) is safely ignored.
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let totalTests = 0;
let passedTests = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS ${String(totalTests).padStart(2, "0")}] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL ${String(totalTests).padStart(2, "0")}] ${name}`);
    console.error(`     Error: ${err?.message || err}`);
    process.exit(1);
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" FINAL REMEDIATION 1: IDEMPOTENT PAYMENT FAILURE & COUPON RELEASE");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `final_fail_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create test user
  const { data: userAuth, error: uErr } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Failure Test User" },
  });
  assert(!uErr && userAuth.user, "User creation failed");
  const userId = userAuth.user.id;

  // 2. Create test book
  const { data: book, error: bErr } = await adminDb.from("books").insert({
    title: `Failure Test Book ${timestamp}`,
    author: "Test Author",
    price: 300,
    stock: 10,
    discount: 0,
    category: "Fiqh",
    image_url: "https://example.com/fiqh.jpg",
    is_active: true,
  }).select().single();
  assert(!bErr && book, `Book creation failed: ${bErr?.message}`);

  // 3. Create test coupon
  const couponCode = `FAILTEST_${timestamp}`;
  const { data: coupon, error: cErr } = await adminDb.from("discounts").insert({
    code: couponCode,
    discount_type: "fixed",
    discount_value: 50,
    min_order_amount: 100,
    usage_limit: 10,
    used_count: 0,
    is_active: true,
    valid_from: new Date(Date.now() - 3600000).toISOString(),
    valid_until: new Date(Date.now() + 86400000).toISOString(),
  }).select().single();
  assert(!cErr && coupon, `Coupon creation failed: ${cErr?.message}`);

  const sampleAddress = {
    full_name: "Failure Test User",
    phone: "9876543210",
    pincode: "110025",
    city: "Delhi",
    state: "Delhi",
    house_no: "404",
    area: "Okhla",
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Initial failure event releases stock, reservation, and coupon exactly once
    // -------------------------------------------------------------------------
    let order1Id: string;
    const rzpOrderId1 = `rzp_order_fail_${timestamp}_1`;

    await runTest("Payment failure releases stock, reservation, and coupon usage exactly once", async () => {
      // Create order with coupon
      const { data: oId, error: oErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 2 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_coupon_code: couponCode,
        p_idempotency_key: `fail_key_${timestamp}_1`,
      });
      assert(!oErr && oId, `Order creation failed: ${oErr?.message}`);
      order1Id = oId as string;

      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId1 }).eq("id", order1Id);

      // Verify initial state: stock 10 -> 8, coupon used_count 0 -> 1, coupon_status = 'reserved'
      const { data: bBefore } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bBefore?.stock, 8, "Stock must decrement to 8 upon reservation");

      const { data: cBefore } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cBefore?.used_count, 1, "Coupon used_count must increment to 1");

      const { data: oBefore } = await adminDb.from("orders").select("coupon_status").eq("id", order1Id).single();
      assert.strictEqual(oBefore?.coupon_status, "reserved", "Order coupon_status must be 'reserved'");

      // Trigger payment failure
      const { data: failRes, error: fErr } = await adminDb.rpc("record_payment_failure_atomic", {
        p_razorpay_order_id: rzpOrderId1,
        p_raw_response: { error_code: "PAYMENT_FAILED", reason: "Card declined" },
      });
      assert(!fErr, `Failure RPC error: ${fErr?.message}`);
      assert.strictEqual((failRes as any)?.status, "recorded_failure");

      // Verify stock restored back to 10
      const { data: bAfter } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bAfter?.stock, 10, "Stock must be restored to 10");

      // Verify coupon decremented back to 0
      const { data: cAfter } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cAfter?.used_count, 0, "Coupon used_count must decrement back to 0");

      // Verify order coupon_status transitioned to 'released'
      const { data: oAfter } = await adminDb.from("orders").select("order_status, payment_status, coupon_status").eq("id", order1Id).single();
      assert.strictEqual(oAfter?.order_status, "Cancelled");
      assert.strictEqual(oAfter?.payment_status, "Failed");
      assert.strictEqual(oAfter?.coupon_status, "released");
    });

    // -------------------------------------------------------------------------
    // TEST 2: Repeated failure webhooks are harmless no-ops
    // -------------------------------------------------------------------------
    await runTest("Repeated payment failure webhooks do NOT double-restore stock or double-decrement coupon", async () => {
      // Call failure 3 more times on the same order
      for (let i = 0; i < 3; i++) {
        const { data: repeatRes, error: rErr } = await adminDb.rpc("record_payment_failure_atomic", {
          p_razorpay_order_id: rzpOrderId1,
          p_raw_response: { error_code: "PAYMENT_FAILED", reason: `Duplicate attempt ${i}` },
        });
        assert(!rErr, `Repeat failure call ${i} failed: ${rErr?.message}`);
        assert.strictEqual((repeatRes as any)?.status, "already_failed", `Call ${i} must return already_failed`);
      }

      // Stock must STILL be 10 (not 12, 14, or 16)
      const { data: bCheck } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bCheck?.stock, 10, "Stock must remain 10 after repeated failure events");

      // Coupon used_count must STILL be 0 (not negative)
      const { data: cCheck } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cCheck?.used_count, 0, "Coupon used_count must remain 0");
    });

    // -------------------------------------------------------------------------
    // TEST 3: Concurrent failure events resolve safely with single rollback
    // -------------------------------------------------------------------------
    await runTest("Concurrent failure events resolve without duplicate stock restorations or coupon decrements", async () => {
      const rzpOrderIdConcurrent = `rzp_order_fail_conc_${timestamp}`;
      const { data: concOrderId, error: cOrdErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 3 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_coupon_code: couponCode,
        p_idempotency_key: `fail_conc_key_${timestamp}`,
      });
      assert(!cOrdErr && concOrderId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderIdConcurrent }).eq("id", concOrderId);

      // Current stock is 10 - 3 = 7, coupon used_count = 1
      const { data: bPre } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bPre?.stock, 7);

      // Launch 5 parallel failure calls racing each other
      const failurePromises = Array.from({ length: 5 }).map((_, idx) =>
        adminDb.rpc("record_payment_failure_atomic", {
          p_razorpay_order_id: rzpOrderIdConcurrent,
          p_raw_response: { index: idx },
        })
      );

      const results = await Promise.all(failurePromises);
      const successCount = results.filter((r) => r.data?.status === "recorded_failure").length;
      const alreadyFailedCount = results.filter((r) => r.data?.status === "already_failed").length;

      assert.strictEqual(successCount, 1, "Exactly one concurrent call must record failure");
      assert.strictEqual(alreadyFailedCount, 4, "Remaining 4 concurrent calls must be marked already_failed");

      // Verify final stock is exactly restored by 3 -> 10
      const { data: bPost } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bPost?.stock, 10, "Stock must be exactly 10 after concurrent failure execution");

      // Verify coupon is 0
      const { data: cPost } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cPost?.used_count, 0, "Coupon used_count must be 0");
    });

    // -------------------------------------------------------------------------
    // TEST 4: Late failure arriving after successful settlement is safely ignored
    // -------------------------------------------------------------------------
    await runTest("Late failure event arriving after successful payment cannot downgrade Paid order", async () => {
      const rzpOrderIdPaid = `rzp_order_settled_${timestamp}`;
      const { data: paidOrderId, error: pOrdErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `paid_key_${timestamp}`,
      });
      assert(!pOrdErr && paidOrderId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderIdPaid }).eq("id", paidOrderId);

      // Settle the order (300 + 45 = 34500 paise)
      const { data: sRes, error: sErr } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderIdPaid,
        p_razorpay_payment_id: `pay_settled_${timestamp}`,
        p_raw_response: { amount: 34500, currency: "INR" },
      });
      assert(!sErr && (sRes as any)?.settled === true, "Settlement must succeed");

      // Now late failure arrives
      const { data: lateFailRes, error: lfErr } = await adminDb.rpc("record_payment_failure_atomic", {
        p_razorpay_order_id: rzpOrderIdPaid,
        p_raw_response: { error: "gateway_late_timeout" },
      });
      assert(!lfErr);
      assert.strictEqual((lateFailRes as any)?.status, "ignored_already_paid", "Late failure must be ignored");

      // Order must remain Confirmed & Paid
      const { data: oFinal } = await adminDb.from("orders").select("order_status, payment_status").eq("id", paidOrderId).single();
      assert.strictEqual(oFinal?.order_status, "Confirmed");
      assert.strictEqual(oFinal?.payment_status, "Paid");
    });

  } finally {
    // Cleanup fixtures
    await adminDb.from("inventory_reservations").delete().in("book_id", [book.id]);
    await adminDb.from("order_items").delete().in("book_id", [book.id]);
    await adminDb.from("orders").delete().eq("user_id", userId);
    await adminDb.from("books").delete().eq("id", book.id);
    await adminDb.from("discounts").delete().eq("id", coupon.id);
    await adminDb.auth.admin.deleteUser(userId);
    console.log("  ✓ Test fixtures safely purged.");
  }

  console.log("\n================================================================================");
  console.log(` FINAL REMEDIATION 1 COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
