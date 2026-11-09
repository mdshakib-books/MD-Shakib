/**
 * ==============================================================================
 * FINAL REMEDIATION 2: RESTRICT LATE-PAYMENT RECOVERY
 * MD Shakib Islamic Books
 * ==============================================================================
 * Tests:
 * 1. Permit recovery only when order was cancelled specifically because its online
 *    inventory reservation expired (cancel_reason = 'Payment reservation expired').
 * 2. Reject recovery for customer cancellation: captured payment recorded, order remains
 *    Cancelled, durable refund pending created (requires_refund = true).
 * 3. Reject recovery for admin fraud cancellation: captured payment recorded, order remains
 *    Cancelled, durable refund pending created (requires_refund = true).
 * 4. Database state trigger rejects any direct or RPC transition from Cancelled to Confirmed
 *    unless cancel_reason was 'Payment reservation expired' and payment is 'Paid'.
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
  console.log(" FINAL REMEDIATION 2: RESTRICT LATE-PAYMENT RECOVERY");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `final_recov_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create test customer
  const { data: userAuth, error: uErr } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Recovery Test User" },
  });
  assert(!uErr && userAuth.user, "User creation failed");
  const userId = userAuth.user.id;

  // 2. Create test book
  const { data: book, error: bErr } = await adminDb.from("books").insert({
    title: `Recovery Test Book ${timestamp}`,
    author: "Test Author",
    price: 400,
    stock: 10,
    discount: 0,
    category: "History",
    image_url: "https://example.com/history.jpg",
    is_active: true,
  }).select().single();
  assert(!bErr && book, `Book creation failed: ${bErr?.message}`);

  const sampleAddress = {
    full_name: "Recovery Test User",
    phone: "9876543210",
    pincode: "110025",
    city: "Delhi",
    state: "Delhi",
    house_no: "202",
    area: "Okhla",
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Permitted recovery: Cancelled due to 'Payment reservation expired' recovers cleanly
    // -------------------------------------------------------------------------
    await runTest("Permits recovery when order was cancelled specifically due to expired reservation", async () => {
      const rzpOrderId1 = `rzp_order_recov_exp_${timestamp}`;
      const { data: oId, error: oErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `recov_exp_${timestamp}`,
      });
      assert(!oErr && oId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId1 }).eq("id", oId);
      await adminDb.from("payments").insert({
        order_id: oId,
        user_id: userId,
        payment_id: rzpOrderId1,
        provider_order_id: rzpOrderId1,
        amount: 445,
        currency: "INR",
        provider: "Razorpay",
        status: "Pending",
      });

      // Force reservation expired
      await adminDb.from("inventory_reservations")
        .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
        .eq("order_id", oId);

      // Run cleanup -> order becomes Cancelled with cancel_reason = 'Payment reservation expired'
      await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 10 });

      const { data: oCheck } = await adminDb.from("orders").select("order_status, cancel_reason").eq("id", oId).single();
      assert.strictEqual(oCheck?.order_status, "Cancelled");
      assert.strictEqual(oCheck?.cancel_reason, "Payment reservation expired");

      // Payment webhook arrives: (400 + 45 = 44500 paise)
      const { data: sRes, error: sErr } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId1,
        p_razorpay_payment_id: `pay_recov_exp_${timestamp}`,
        p_raw_response: { amount: 44500, currency: "INR" },
      });
      assert(!sErr, `Settlement error: ${sErr?.message}`);
      assert.strictEqual((sRes as any)?.status, "settled_recovered");
      assert.strictEqual((sRes as any)?.settled, true);

      // Order must now be Confirmed & Paid
      const { data: oAfter } = await adminDb.from("orders").select("order_status, payment_status").eq("id", oId).single();
      assert.strictEqual(oAfter?.order_status, "Confirmed");
      assert.strictEqual(oAfter?.payment_status, "Paid");
    });

    // -------------------------------------------------------------------------
    // TEST 2: Reject recovery for customer cancellation
    // -------------------------------------------------------------------------
    await runTest("Rejects recovery when order was cancelled by customer; records payment and requires refund", async () => {
      const rzpOrderId2 = `rzp_order_recov_cust_${timestamp}`;
      const { data: oId2, error: oErr2 } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `recov_cust_${timestamp}`,
      });
      assert(!oErr2 && oId2);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId2 }).eq("id", oId2);
      await adminDb.from("payments").insert({
        order_id: oId2,
        user_id: userId,
        payment_id: rzpOrderId2,
        provider_order_id: rzpOrderId2,
        amount: 445,
        currency: "INR",
        provider: "Razorpay",
        status: "Pending",
      });

      // Customer cancels order explicitly
      const { data: cancelSuccess, error: cErr } = await adminDb.rpc("cancel_order_atomic", {
        p_order_id: oId2 as string,
        p_user_id: userId,
        p_cancel_reason: "Customer changed mind before payment completed",
      });
      assert(!cErr && cancelSuccess);

      // Stock is restored
      const { data: bMid } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      const stockBeforeLatePayment = bMid?.stock;

      // Late payment webhook arrives: (400 + 45 = 44500 paise)
      const { data: sRes2, error: sErr2 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId2,
        p_razorpay_payment_id: `pay_recov_cust_${timestamp}`,
        p_raw_response: { amount: 44500, currency: "INR" },
      });
      assert(!sErr2);
      assert.strictEqual((sRes2 as any)?.success, false);
      assert.strictEqual((sRes2 as any)?.status, "cancelled_non_recoverable");
      assert.strictEqual((sRes2 as any)?.requires_refund, true);

      // Verify order remains Cancelled, payment marked Paid, refund_status pending
      const { data: oAfter2 } = await adminDb.from("orders")
        .select("order_status, payment_status, refund_status, refund_amount")
        .eq("id", oId2)
        .single();
      assert.strictEqual(oAfter2?.order_status, "Cancelled", "Order MUST NOT be revived");
      assert.strictEqual(oAfter2?.payment_status, "Paid", "Captured payment recorded");
      assert.strictEqual(oAfter2?.refund_status, "pending", "Durable refund pending created");
      assert.strictEqual(Number(oAfter2?.refund_amount), 445.00, "Refund amount matches order total");

      // Verify catalog stock was NOT decremented
      const { data: bPost } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bPost?.stock, stockBeforeLatePayment, "Stock must remain unchanged");
    });

    // -------------------------------------------------------------------------
    // TEST 3: Reject recovery for admin cancellation (e.g. fraud)
    // -------------------------------------------------------------------------
    await runTest("Rejects recovery when order was cancelled by administrator (e.g. fraud prevention)", async () => {
      const rzpOrderId3 = `rzp_order_recov_admin_${timestamp}`;
      const { data: oId3, error: oErr3 } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `recov_admin_${timestamp}`,
      });
      assert(!oErr3 && oId3);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId3 }).eq("id", oId3);
      await adminDb.from("payments").insert({
        order_id: oId3,
        user_id: userId,
        payment_id: rzpOrderId3,
        provider_order_id: rzpOrderId3,
        amount: 445,
        currency: "INR",
        provider: "Razorpay",
        status: "Pending",
      });

      // Admin cancels order explicitly due to suspected fraud
      await adminDb.from("orders").update({
        order_status: "Cancelled",
        cancel_reason: "Cancelled by administrator: Suspected fraud",
      }).eq("id", oId3);

      // Late payment arrives
      const { data: sRes3, error: sErr3 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId3,
        p_razorpay_payment_id: `pay_recov_admin_${timestamp}`,
        p_raw_response: { amount: 44500, currency: "INR" },
      });
      assert(!sErr3);
      assert.strictEqual((sRes3 as any)?.status, "cancelled_non_recoverable");
      assert.strictEqual((sRes3 as any)?.requires_refund, true);

      const { data: oAfter3 } = await adminDb.from("orders").select("order_status, refund_status").eq("id", oId3).single();
      assert.strictEqual(oAfter3?.order_status, "Cancelled");
      assert.strictEqual(oAfter3?.refund_status, "pending");
    });

    // -------------------------------------------------------------------------
    // TEST 4: Database trigger rejects transition from Cancelled to Confirmed
    // -------------------------------------------------------------------------
    await runTest("State transition trigger strictly rejects reviving cancelled order unless cancel_reason was expired", async () => {
      const { data: rogueOrder } = await adminDb.from("orders").insert({
        user_id: userId,
        total_amount: 445,
        payment_method: "ONLINE",
        order_status: "Cancelled",
        payment_status: "Failed",
        cancel_reason: "Customer cancelled",
        address_snapshot: sampleAddress,
        is_paid: false,
      }).select().single();
      assert(rogueOrder);

      // Attempt manual transition to Confirmed
      const { error: rogueErr } = await adminDb.from("orders").update({
        order_status: "Confirmed",
        payment_status: "Paid",
      }).eq("id", rogueOrder.id);

      assert(rogueErr, "Database trigger must block transition from Cancelled to Confirmed for user cancellation");
      assert.ok(rogueErr.message.includes("Cannot transition cancelled order to"), rogueErr.message);
    });

  } finally {
    await adminDb.from("inventory_reservations").delete().in("book_id", [book.id]);
    await adminDb.from("order_items").delete().in("book_id", [book.id]);
    await adminDb.from("orders").delete().eq("user_id", userId);
    await adminDb.from("books").delete().eq("id", book.id);
    await adminDb.auth.admin.deleteUser(userId);
    console.log("  ✓ Test fixtures safely purged.");
  }

  console.log("\n================================================================================");
  console.log(` FINAL REMEDIATION 2 COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
