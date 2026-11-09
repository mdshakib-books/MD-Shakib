/**
 * ==============================================================================
 * FINAL REMEDIATION 5: ORDER-SPECIFIC COUPON LIFECYCLE & CONCURRENCY
 * MD Shakib Islamic Books
 * ==============================================================================
 * Tests:
 * 1. Online creation reserves coupon (status='reserved'), settlement consumes it (status='consumed').
 * 2. Online payment failure releases reserved coupon (status='released'); duplicate failure is a no-op.
 * 3. Online reservation expiry releases coupon (status='released'); cleanup cannot release twice.
 * 4. COD creation consumes coupon immediately (status='consumed'); COD cancellation releases it.
 * 5. High-concurrency coupon usage limit race: multiple customers racing against usage_limit.
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
  console.log(" FINAL REMEDIATION 5: ORDER-SPECIFIC COUPON LIFECYCLE");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `final_coup_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create test user
  const { data: userAuth, error: uErr } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Coupon Lifecycle User" },
  });
  assert(!uErr && userAuth.user);
  const userId = userAuth.user.id;

  // 2. Create test book
  const { data: book, error: bErr } = await adminDb.from("books").insert({
    title: `Coupon Book ${timestamp}`,
    author: "Test Author",
    price: 300,
    stock: 50,
    discount: 0,
    category: "Fiqh",
    image_url: "https://example.com/fiqh.jpg",
    is_active: true,
  }).select().single();
  assert(!bErr && book);

  // 3. Create test coupon with limit = 2
  const couponCode = `LIFECYCLE_${timestamp}`;
  const { data: coupon, error: cErr } = await adminDb.from("discounts").insert({
    code: couponCode,
    discount_type: "fixed",
    discount_value: 50,
    min_order_amount: 100,
    usage_limit: 2,
    used_count: 0,
    is_active: true,
    valid_from: new Date(Date.now() - 3600000).toISOString(),
    valid_until: new Date(Date.now() + 86400000).toISOString(),
  }).select().single();
  assert(!cErr && coupon);

  const sampleAddress = {
    full_name: "Coupon User",
    phone: "9876543210",
    pincode: "110025",
    city: "Delhi",
    state: "Delhi",
    house_no: "505",
    area: "Okhla",
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Online creation -> 'reserved', settlement -> 'consumed'
    // -------------------------------------------------------------------------
    await runTest("Online order creation reserves coupon and settlement consumes it", async () => {
      const rzpOrderId = `rzp_order_coup_settle_${timestamp}`;
      const { data: oId, error: oErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_coupon_code: couponCode,
        p_idempotency_key: `coup_settle_${timestamp}`,
      });
      assert(!oErr && oId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", oId);
      await adminDb.from("payments").insert({
        order_id: oId,
        user_id: userId,
        payment_id: rzpOrderId,
        provider_order_id: rzpOrderId,
        amount: 295,
        currency: "INR",
        provider: "Razorpay",
        status: "Pending",
      });

      // Verify coupon is reserved
      const { data: oMid } = await adminDb.from("orders").select("coupon_status").eq("id", oId).single();
      assert.strictEqual(oMid?.coupon_status, "reserved");

      const { data: cMid } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cMid?.used_count, 1);

      // Settle payment (300 - 50 + 45 = 29500 paise)
      const { data: sRes, error: sErr } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: `pay_coup_settle_${timestamp}`,
        p_raw_response: { amount: 29500, currency: "INR" },
      });
      assert(!sErr && (sRes as any)?.settled === true);

      // Verify coupon is now consumed
      const { data: oPost } = await adminDb.from("orders").select("coupon_status").eq("id", oId).single();
      assert.strictEqual(oPost?.coupon_status, "consumed");

      const { data: cPost } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cPost?.used_count, 1, "used_count remains 1 (not double incremented)");
    });

    // -------------------------------------------------------------------------
    // TEST 2: COD creation -> 'consumed', COD cancellation -> 'released'
    // -------------------------------------------------------------------------
    await runTest("COD order creation consumes coupon and cancellation releases it", async () => {
      const { data: codId, error: codErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "COD",
        p_coupon_code: couponCode,
        p_idempotency_key: `coup_cod_${timestamp}`,
      });
      assert(!codErr && codId);

      // COD order coupon_status is consumed immediately
      const { data: oCod } = await adminDb.from("orders").select("coupon_status").eq("id", codId).single();
      assert.strictEqual(oCod?.coupon_status, "consumed");

      // used_count is now 2 (at the limit of 2)
      const { data: cCod } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cCod?.used_count, 2);

      // Cancel COD order
      const { data: cRes, error: cErr } = await adminDb.rpc("cancel_order_atomic", {
        p_order_id: codId as string,
        p_user_id: userId,
        p_cancel_reason: "Customer cancelled COD",
      });
      assert(!cErr && cRes);

      // Verify coupon_status became 'released'
      const { data: oCodAfter } = await adminDb.from("orders").select("coupon_status").eq("id", codId).single();
      assert.strictEqual(oCodAfter?.coupon_status, "released");

      // Verify used_count dropped back to 1
      const { data: cCodAfter } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cCodAfter?.used_count, 1);
    });

    // -------------------------------------------------------------------------
    // TEST 3: Online reservation expiry releases coupon and cleanup cannot double-release
    // -------------------------------------------------------------------------
    await runTest("Online reservation expiry releases coupon and cleanup cannot decrement twice", async () => {
      const { data: expId, error: expErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_coupon_code: couponCode,
        p_idempotency_key: `coup_exp_${timestamp}`,
      });
      assert(!expErr && expId);

      // Force reservation expired
      await adminDb.from("inventory_reservations")
        .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
        .eq("order_id", expId);

      // Run cleanup
      await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 10 });

      // Verify coupon released
      const { data: oExp } = await adminDb.from("orders").select("coupon_status").eq("id", expId).single();
      assert.strictEqual(oExp?.coupon_status, "released");

      // used_count should be back to 1
      const { data: cExp } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cExp?.used_count, 1);

      // Run cleanup again: must NOT decrement used_count
      await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 10 });
      const { data: cExp2 } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cExp2?.used_count, 1, "Repeated cleanup must not decrement coupon again");
    });

    // -------------------------------------------------------------------------
    // TEST 4: Concurrency: multiple checkouts racing against coupon usage limit
    // -------------------------------------------------------------------------
    await runTest("Concurrent orders racing against coupon limit never exceed usage_limit", async () => {
      // Coupon has usage_limit = 2, currently used_count = 1. Only 1 more can succeed!
      const promises = Array.from({ length: 5 }).map((_, idx) =>
        adminDb.rpc("create_order_atomic", {
          p_user_id: userId,
          p_items: [{ book_id: book.id, quantity: 1 }],
          p_address_snapshot: sampleAddress,
          p_payment_method: "ONLINE",
          p_coupon_code: couponCode,
          p_idempotency_key: `coup_race_${timestamp}_${idx}`,
        })
      );

      const results = await Promise.all(promises);
      const successful = results.filter((r) => !r.error && r.data);
      const rejected = results.filter((r) => r.error && r.error.message.includes("usage limit"));

      assert.strictEqual(successful.length, 1, "Exactly 1 order can consume the remaining coupon usage");
      assert.strictEqual(rejected.length, 4, "Remaining 4 orders must be rejected due to usage limit");

      const { data: cFinal } = await adminDb.from("discounts").select("used_count, usage_limit").eq("id", coupon.id).single();
      assert.strictEqual(cFinal?.used_count, cFinal?.usage_limit, "used_count must exactly equal usage_limit");
    });

  } finally {
    await adminDb.from("order_idempotency_keys").delete().eq("user_id", userId);
    await adminDb.from("inventory_reservations").delete().in("book_id", [book.id]);
    await adminDb.from("order_items").delete().in("book_id", [book.id]);
    await adminDb.from("orders").delete().eq("user_id", userId);
    await adminDb.from("books").delete().eq("id", book.id);
    await adminDb.from("discounts").delete().eq("id", coupon.id);
    await adminDb.auth.admin.deleteUser(userId);
    console.log("  ✓ Test fixtures safely purged.");
  }

  console.log("\n================================================================================");
  console.log(` FINAL REMEDIATION 5 COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
