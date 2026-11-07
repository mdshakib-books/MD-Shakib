/**
 * ==============================================================================
 * REMEDIATION 4: COUPON ACCOUNTING, CONCURRENCY & RESTORATION VERIFICATION
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. Two concurrent checkouts race for the last available coupon usage (limit: 1):
 *    Exactly one succeeds, one is rejected with limit exceeded. used_count never exceeds 1.
 * 2. Payment failure releases coupon reservation:
 *    used_count is decremented, allowing coupon to be reused by another customer.
 * 3. Expired reservation cleanup releases coupon reservation:
 *    used_count is decremented upon expiration.
 * 4. Order cancellation releases coupon reservation:
 *    Customer cancellation decrements used_count.
 * 5. Payment success preserves coupon consumption:
 *    used_count remains permanently consumed upon payment settlement.
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function runTest(name: string, fn: () => Promise<void>) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ [PASS ${String(totalTests).padStart(2, "0")}] ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ [FAIL ${String(totalTests).padStart(2, "0")}] ${name}`);
    console.error(`     Error: ${err?.message || err}`);
    failedTests++;
  }
}

async function main() {
  console.log("================================================================================");
  console.log(" REMEDIATION 4: COUPON ACCOUNTING, CONCURRENCY & RESTORATION VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const emailCustA = `coupon_custA_${timestamp}@example.com`;
  const emailCustB = `coupon_custB_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create customers
  const { data: authA } = await adminDb.auth.admin.createUser({
    email: emailCustA,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Alpha" },
  });
  assert(authA?.user);
  const custAId = authA.user.id;

  const clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientA.auth.signInWithPassword({ email: emailCustA, password: defaultPassword });

  const { data: authB } = await adminDb.auth.admin.createUser({
    email: emailCustB,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Beta" },
  });
  assert(authB?.user);
  const custBId = authB.user.id;

  const clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientB.auth.signInWithPassword({ email: emailCustB, password: defaultPassword });

  // 2. Seed a test book
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: `Coupon Test Book ${timestamp}`,
      author: "Scholar",
      description: "Book for coupon accounting test",
      price: 300.0,
      discount: 0,
      stock: 20,
      category: "Fiqh",
      image_url: "https://example.com/cpn.jpg",
      is_active: true,
    })
    .select()
    .single();
  assert(book);

  const sampleAddress = {
    full_name: "Customer",
    phone: "9876543210",
    pincode: "110025",
    city: "New Delhi",
    state: "Delhi",
    house_no: "5",
    area: "Okhla",
  };

  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Concurrent checkouts racing for last coupon usage limit (limit = 1)
    // ----------------------------------------------------------------------------
    const singleCouponCode = `ONEUSE_${timestamp}`;
    await adminDb.from("discounts").insert({
      code: singleCouponCode,
      discount_type: "fixed",
      discount_value: 30,
      min_order_amount: 100,
      usage_limit: 1, // Strictly 1 use allowed!
      used_count: 0,
      is_active: true,
      valid_from: new Date(Date.now() - 3600000).toISOString(),
    });

    await runTest("Concurrent checkouts racing for last coupon usage: Exactly 1 succeeds, limit never exceeded", async () => {
      const [resA, resB] = await Promise.all([
        clientA.rpc("create_order_atomic", {
          p_user_id: custAId,
          p_items: [{ book_id: book.id, quantity: 1, price: 300 }],
          p_address_snapshot: sampleAddress,
          p_payment_method: "ONLINE",
          p_idempotency_key: `cpn_race_a_${timestamp}`,
          p_coupon_code: singleCouponCode,
        }),
        clientB.rpc("create_order_atomic", {
          p_user_id: custBId,
          p_items: [{ book_id: book.id, quantity: 1, price: 300 }],
          p_address_snapshot: sampleAddress,
          p_payment_method: "ONLINE",
          p_idempotency_key: `cpn_race_b_${timestamp}`,
          p_coupon_code: singleCouponCode,
        }),
      ]);

      const successCount = [resA, resB].filter((r) => !r.error && r.data).length;
      const failureCount = [resA, resB].filter((r) => r.error).length;

      assert.strictEqual(successCount, 1, "Exactly one concurrent checkout must acquire the coupon");
      assert.strictEqual(failureCount, 1, "Exactly one concurrent checkout must be rejected");

      // Verify used_count is exactly 1
      const { data: cpnAfter } = await adminDb.from("discounts").select("used_count").eq("code", singleCouponCode).single();
      assert.strictEqual(cpnAfter?.used_count, 1, "Coupon used_count must be exactly 1");
    });

    // ----------------------------------------------------------------------------
    // TEST 2: Payment failure releases coupon reservation
    // ----------------------------------------------------------------------------
    const failCouponCode = `FAILCPN_${timestamp}`;
    await adminDb.from("discounts").insert({
      code: failCouponCode,
      discount_type: "fixed",
      discount_value: 40,
      min_order_amount: 100,
      usage_limit: 1,
      used_count: 0,
      is_active: true,
      valid_from: new Date(Date.now() - 3600000).toISOString(),
    });

    await runTest("Payment failure releases coupon reservation, restoring used_count to 0", async () => {
      const rzpOrderId = `order_cpn_fail_${timestamp}`;

      // Customer A checks out with fail coupon -> used_count becomes 1
      const { data: orderId, error: oErr } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 1, price: 300 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `cpn_fail_ord_${timestamp}`,
        p_coupon_code: failCouponCode,
      });
      assert(!oErr && orderId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", orderId);

      const { data: cpnMid } = await adminDb.from("discounts").select("used_count").eq("code", failCouponCode).single();
      assert.strictEqual(cpnMid?.used_count, 1, "Coupon used_count should be 1 after checkout");

      // Payment fails
      const { data: failRes } = await adminDb.rpc("record_payment_failure_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_raw_response: { error_code: "PAYMENT_FAILED" },
      });
      assert(failRes?.success === true);

      // Verify used_count is restored to 0
      const { data: cpnAfter } = await adminDb.from("discounts").select("used_count").eq("code", failCouponCode).single();
      assert.strictEqual(cpnAfter?.used_count, 0, "Coupon used_count must be restored to 0 upon payment failure");

      // Verify Customer B can now use the coupon!
      const { data: orderBId, error: oBErr } = await clientB.rpc("create_order_atomic", {
        p_user_id: custBId,
        p_items: [{ book_id: book.id, quantity: 1, price: 300 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `cpn_reuse_ord_${timestamp}`,
        p_coupon_code: failCouponCode,
      });
      assert(!oBErr && orderBId, "Customer B should successfully use restored coupon");
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Expired reservation cleanup releases coupon reservation
    // ----------------------------------------------------------------------------
    const expCouponCode = `EXPCPN_${timestamp}`;
    await adminDb.from("discounts").insert({
      code: expCouponCode,
      discount_type: "fixed",
      discount_value: 25,
      min_order_amount: 100,
      usage_limit: 1,
      used_count: 0,
      is_active: true,
      valid_from: new Date(Date.now() - 3600000).toISOString(),
    });

    await runTest("Expired reservation cleanup releases coupon reservation, restoring used_count to 0", async () => {
      const { data: orderId } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 1, price: 300 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `cpn_exp_ord_${timestamp}`,
        p_coupon_code: expCouponCode,
      });
      assert(orderId);

      // Backdate reservation to expired threshold
      await adminDb
        .from("inventory_reservations")
        .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
        .eq("order_id", orderId);

      // Trigger cleanup
      await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 10 });

      // Verify used_count is restored to 0
      const { data: cpnAfter } = await adminDb.from("discounts").select("used_count").eq("code", expCouponCode).single();
      assert.strictEqual(cpnAfter?.used_count, 0, "Coupon used_count must be restored to 0 after reservation cleanup");
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Order cancellation releases coupon reservation
    // ----------------------------------------------------------------------------
    const cancelCouponCode = `CANCCPN_${timestamp}`;
    await adminDb.from("discounts").insert({
      code: cancelCouponCode,
      discount_type: "fixed",
      discount_value: 35,
      min_order_amount: 100,
      usage_limit: 1,
      used_count: 0,
      is_active: true,
      valid_from: new Date(Date.now() - 3600000).toISOString(),
    });

    await runTest("Order cancellation releases coupon reservation, restoring used_count to 0", async () => {
      const { data: orderId } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 1, price: 300 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `cpn_canc_ord_${timestamp}`,
        p_coupon_code: cancelCouponCode,
      });
      assert(orderId);

      // Customer cancels order
      await clientA.rpc("cancel_order_atomic", {
        p_order_id: orderId,
        p_user_id: custAId,
        p_cancel_reason: "Changed my mind",
        p_is_admin: false,
      });

      // Verify used_count is restored to 0
      const { data: cpnAfter } = await adminDb.from("discounts").select("used_count").eq("code", cancelCouponCode).single();
      assert.strictEqual(cpnAfter?.used_count, 0, "Coupon used_count must be restored to 0 after cancellation");
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Successful payment keeps coupon consumed
    // ----------------------------------------------------------------------------
    const paidCouponCode = `PAIDCPN_${timestamp}`;
    await adminDb.from("discounts").insert({
      code: paidCouponCode,
      discount_type: "fixed",
      discount_value: 50,
      min_order_amount: 100,
      usage_limit: 5,
      used_count: 0,
      is_active: true,
      valid_from: new Date(Date.now() - 3600000).toISOString(),
    });

    await runTest("Successful payment preserves coupon consumption (used_count remains consumed)", async () => {
      const rzpOrderId = `order_cpn_paid_${timestamp}`;

      const { data: orderId } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 1, price: 300 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `cpn_paid_ord_${timestamp}`,
        p_coupon_code: paidCouponCode,
      });
      assert(orderId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", orderId);

      // Settle payment (300 - 50 + 45 = 295 -> 29500 paise)
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: `pay_cpn_settle_${timestamp}`,
        p_signature: `sig_cpn_${timestamp}`,
        p_raw_response: { amount: 29500, currency: "INR" },
      });

      // used_count MUST remain 1
      const { data: cpnAfter } = await adminDb.from("discounts").select("used_count").eq("code", paidCouponCode).single();
      assert.strictEqual(cpnAfter?.used_count, 1, "Coupon used_count must remain 1 after settlement");
    });

  } finally {
    // Cleanup
    await adminDb.from("inventory_reservations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("orders").delete().in("user_id", [custAId, custBId]);
    await adminDb.from("discounts").delete().ilike("code", `%${timestamp}%`);
    await adminDb.from("books").delete().eq("id", book?.id);
    await adminDb.auth.admin.deleteUser(custAId);
    await adminDb.auth.admin.deleteUser(custBId);
    console.log("  ✓ Test fixtures safely purged.\n");
  }

  console.log("================================================================================");
  console.log(` REMEDIATION 4 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
