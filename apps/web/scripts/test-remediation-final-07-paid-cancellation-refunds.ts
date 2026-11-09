/**
 * ==============================================================================
 * FINAL REMEDIATION 7: PAID-ORDER CANCELLATION & REFUNDS LIFECYCLE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Tests:
 * 1. Paid order cancellation: marks Cancelled, payment_status='Refund Pending',
 *    refund_status='pending', refund_amount=total_amount, restores inventory, releases coupon.
 * 2. Unpaid order cancellation: marks Cancelled, payment_status='Failed', refund_status=NULL.
 * 3. Repeated cancellation attempt is rejected; does not double-restore stock or double-refund.
 * 4. Refund failure: record_refund_atomic with 'failed' reverts payment_status to 'Paid' with refund_status='failed'.
 * 5. Refund success: record_refund_atomic with 'processed' transitions payment_status to 'Refunded' with refund_status='processed'.
 * 6. Repeated refund recording is idempotent without corrupting refund state.
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
  console.log(" FINAL REMEDIATION 7: PAID-ORDER CANCELLATION & REFUNDS LIFECYCLE");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `final_refund_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create test user
  const { data: userAuth } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Refund User" },
  });
  assert(userAuth?.user);
  const userId = userAuth.user.id;

  // 2. Create test book
  const { data: book } = await adminDb.from("books").insert({
    title: `Refund Book ${timestamp}`,
    author: "Test Author",
    price: 500,
    stock: 20,
    discount: 0,
    category: "Fiqh",
    image_url: "https://example.com/fiqh.jpg",
    is_active: true,
  }).select().single();
  assert(book);

  // 3. Create test coupon
  const couponCode = `REFUND_${timestamp}`;
  const { data: coupon } = await adminDb.from("discounts").insert({
    code: couponCode,
    discount_type: "fixed",
    discount_value: 100,
    min_order_amount: 200,
    usage_limit: 10,
    used_count: 0,
    is_active: true,
    valid_from: new Date(Date.now() - 3600000).toISOString(),
    valid_until: new Date(Date.now() + 86400000).toISOString(),
  }).select().single();
  assert(coupon);

  const sampleAddress = {
    full_name: "Refund User",
    phone: "9876543210",
    pincode: "110025",
    city: "Delhi",
    state: "Delhi",
    house_no: "707",
    area: "Okhla",
  };

  try {
    let paidOrderId: string;
    const rzpOrderIdPaid = `rzp_order_paid_cancel_${timestamp}`;
    const rzpPaymentIdPaid = `pay_paid_cancel_${timestamp}`;

    // -------------------------------------------------------------------------
    // TEST 1: Paid order cancellation creates Refund Pending state & restores inventory
    // -------------------------------------------------------------------------
    await runTest("Paid order cancellation sets Refund Pending, restores inventory, and releases coupon", async () => {
      // Create and settle paid order: (500 - 100 + 45 = 445.00 total)
      const { data: oId } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_coupon_code: couponCode,
        p_idempotency_key: `paid_cancel_${timestamp}`,
      });
      assert(oId);
      paidOrderId = oId as string;
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderIdPaid }).eq("id", paidOrderId);

      // Create matching pending payment record
      await adminDb.from("payments").insert({
        order_id: paidOrderId,
        user_id: userId,
        payment_id: rzpOrderIdPaid,
        provider_order_id: rzpOrderIdPaid,
        amount: 445,
        currency: "INR",
        provider: "Razorpay",
        status: "Pending",
      });

      // Settle
      await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderIdPaid,
        p_razorpay_payment_id: rzpPaymentIdPaid,
        p_raw_response: { amount: 44500, currency: "INR" },
      });

      // Verify order is Paid and stock is 19
      const { data: bMid } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bMid?.stock, 19);

      // Cancel the paid order
      const { data: cancelSuccess, error: cErr } = await adminDb.rpc("cancel_order_atomic", {
        p_order_id: paidOrderId,
        p_user_id: userId,
        p_cancel_reason: "Customer cancelled paid order",
      });
      assert(!cErr && cancelSuccess, `Cancel error: ${cErr?.message}`);

      // Verify order state
      const { data: oAfter } = await adminDb.from("orders").select("*").eq("id", paidOrderId).single();
      assert.strictEqual(oAfter?.order_status, "Cancelled", "Order status must be Cancelled");
      assert.strictEqual(oAfter?.payment_status, "Refund Pending", "Payment status must transition to Refund Pending");
      assert.strictEqual(oAfter?.refund_status, "pending", "Refund status must be pending");
      assert.strictEqual(Number(oAfter?.refund_amount), 445.00, "Refund amount must match order total");
      assert.strictEqual(oAfter?.coupon_status, "released", "Coupon must be released");

      // Verify inventory was restored back to 20
      const { data: bAfter } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bAfter?.stock, 20, "Stock must be restored to 20");

      // Verify coupon count decremented back to 0
      const { data: cAfter } = await adminDb.from("discounts").select("used_count").eq("id", coupon.id).single();
      assert.strictEqual(cAfter?.used_count, 0, "Coupon used_count must be 0");
    });

    // -------------------------------------------------------------------------
    // TEST 2: Repeated cancellation is rejected and does not double restore
    // -------------------------------------------------------------------------
    await runTest("Repeated cancellation attempt on already cancelled order is rejected", async () => {
      const { error: repeatErr } = await adminDb.rpc("cancel_order_atomic", {
        p_order_id: paidOrderId,
        p_user_id: userId,
        p_cancel_reason: "Trying to cancel again",
      });
      assert(repeatErr, "Must reject second cancellation attempt");
      assert.ok(repeatErr.message.includes("cannot be cancelled in Cancelled status"));

      // Stock must still be 20 (not 21)
      const { data: bCheck } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bCheck?.stock, 20, "Stock must remain 20");
    });

    // -------------------------------------------------------------------------
    // TEST 3: Unpaid order cancellation sets Failed without refund
    // -------------------------------------------------------------------------
    await runTest("Unpaid order cancellation sets payment_status='Failed' with no refund pending", async () => {
      const { data: unpaidId } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `unpaid_cancel_${timestamp}`,
      });
      assert(unpaidId);

      const { data: cancelRes } = await adminDb.rpc("cancel_order_atomic", {
        p_order_id: unpaidId as string,
        p_user_id: userId,
        p_cancel_reason: "Customer abandoned checkout",
      });
      assert(cancelRes);

      const { data: oUnpaid } = await adminDb.from("orders").select("order_status, payment_status, refund_status").eq("id", unpaidId).single();
      assert.strictEqual(oUnpaid?.order_status, "Cancelled");
      assert.strictEqual(oUnpaid?.payment_status, "Failed");
      assert.strictEqual(oUnpaid?.refund_status, null, "Unpaid order must have no refund status");
    });

    // -------------------------------------------------------------------------
    // TEST 4: Refund failure handling reverts payment_status to 'Paid' with refund_status='failed'
    // -------------------------------------------------------------------------
    await runTest("Refund failure via record_refund_atomic sets refund_status='failed' and payment_status='Paid'", async () => {
      const refundId1 = `rfnd_fail_${timestamp}`;
      const { data: rfFailRes, error: rfFailErr } = await adminDb.rpc("record_refund_atomic", {
        p_order_id: paidOrderId,
        p_refund_id: refundId1,
        p_refund_amount: 445.00,
        p_refund_status: "failed",
        p_raw_response: { error: "bank_declined_refund" },
      });
      assert(!rfFailErr && rfFailRes);
      assert.strictEqual((rfFailRes as any)?.status, "failed");
      assert.strictEqual((rfFailRes as any)?.payment_status, "Paid");

      const { data: oFailCheck } = await adminDb.from("orders").select("payment_status, refund_status").eq("id", paidOrderId).single();
      assert.strictEqual(oFailCheck?.payment_status, "Paid", "Order payment_status must revert to Paid on refund failure");
      assert.strictEqual(oFailCheck?.refund_status, "failed", "Refund status marked failed");
    });

    // -------------------------------------------------------------------------
    // TEST 5: Refund success transitions to 'Refunded' and 'processed'
    // -------------------------------------------------------------------------
    await runTest("Refund success via record_refund_atomic finalizes to payment_status='Refunded'", async () => {
      const refundId2 = `rfnd_succ_${timestamp}`;
      const { data: rfSuccRes, error: rfSuccErr } = await adminDb.rpc("record_refund_atomic", {
        p_order_id: paidOrderId,
        p_refund_id: refundId2,
        p_refund_amount: 445.00,
        p_refund_status: "processed",
        p_raw_response: { speed_processed: "instant" },
      });
      assert(!rfSuccErr && rfSuccRes);
      assert.strictEqual((rfSuccRes as any)?.status, "processed");
      assert.strictEqual((rfSuccRes as any)?.payment_status, "Refunded");

      const { data: oSuccCheck } = await adminDb.from("orders").select("payment_status, refund_status, razorpay_refund_id").eq("id", paidOrderId).single();
      assert.strictEqual(oSuccCheck?.payment_status, "Refunded");
      assert.strictEqual(oSuccCheck?.refund_status, "processed");
      assert.strictEqual(oSuccCheck?.razorpay_refund_id, refundId2);
    });

    // -------------------------------------------------------------------------
    // TEST 6: Repeated refund recording is idempotent
    // -------------------------------------------------------------------------
    await runTest("Repeated refund recording with same refund_id returns already_processed idempotently", async () => {
      const refundId2 = `rfnd_succ_${timestamp}`;
      const { data: repeatRf, error: repeatErr } = await adminDb.rpc("record_refund_atomic", {
        p_order_id: paidOrderId,
        p_refund_id: refundId2,
        p_refund_amount: 445.00,
        p_refund_status: "processed",
      });
      assert(!repeatErr && repeatRf);
      assert.strictEqual((repeatRf as any)?.status, "already_processed");

      const { data: oFinal } = await adminDb.from("orders").select("payment_status, refund_status").eq("id", paidOrderId).single();
      assert.strictEqual(oFinal?.payment_status, "Refunded");
      assert.strictEqual(oFinal?.refund_status, "processed");
    });

  } finally {
    await adminDb.from("payments").delete().eq("user_id", userId);
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
  console.log(` FINAL REMEDIATION 7 COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
