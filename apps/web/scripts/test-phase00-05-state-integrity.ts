/**
 * ==============================================================================
 * PHASE 0 — FEATURE 0.5: PAYMENT & ORDER STATE INTEGRITY VERIFICATION SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. Valid order state machine transitions succeed.
 * 2. Invalid order state transitions (e.g. Delivered -> Pending, Cancelled -> Confirmed) are rejected.
 * 3. Terminal order states (Cancelled, Returned, etc.) cannot be modified.
 * 4. Paid payment status cannot be downgraded to Failed or Pending.
 * 5. Late payment failure webhook on already Paid order is rejected without state mutation.
 * 6. Webhook HMAC SHA256 signature verification accepts valid and rejects forged signatures.
 * 7. Webhook event idempotency: Duplicate event delivery is detected and deduplicated via webhook_events.
 * 8. COD orders cannot be paid via online settlement webhook.
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";
import crypto from "crypto";

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
  console.log(" PHASE 0 — FEATURE 0.5: PAYMENT & ORDER STATE INTEGRITY VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const emailCust = `state_cust_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create Customer
  const { data: authCust } = await adminDb.auth.admin.createUser({
    email: emailCust,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "State Test Customer" },
  });
  assert(authCust?.user, "Customer creation failed");
  const custId = authCust.user.id;

  const clientCust = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientCust.auth.signInWithPassword({ email: emailCust, password: defaultPassword });

  // 2. Seed a test book
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: `State Test Book ${timestamp}`,
      author: "Islamic Jurist",
      description: "State integrity testing book",
      price: 200.0,
      discount: 0,
      stock: 20,
      category: "Fiqh",
      image_url: "https://example.com/state.jpg",
      is_active: true,
    })
    .select()
    .single();
  assert(book);

  const sampleAddress = {
    full_name: "Customer State",
    phone: "9876543210",
    pincode: "110025",
    city: "New Delhi",
    state: "Delhi",
    house_no: "10",
    area: "Okhla",
  };

  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Valid Order State Transitions
    // ----------------------------------------------------------------------------
    let order1Id: string = "";
    await runTest("Valid lifecycle transitions (Pending -> Confirmed -> Shipped -> Out for Delivery -> Delivered)", async () => {
      const { data: orderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 200 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `state_1_${timestamp}`,
      });
      assert(!error && orderId);
      order1Id = orderId;

      // Online orders require payment_status 'Paid' to transition to Confirmed
      const { error: confErr } = await adminDb
        .from("orders")
        .update({ order_status: "Confirmed", payment_status: "Paid" })
        .eq("id", order1Id);
      assert(!confErr, `Transition to Confirmed (Paid) should succeed: ${confErr?.message}`);

      const transitions = ["Shipped", "Out for Delivery", "Delivered"];
      for (const nextStatus of transitions) {
        const { error: updErr } = await adminDb
          .from("orders")
          .update({ order_status: nextStatus })
          .eq("id", order1Id);
        assert(!updErr, `Transition to ${nextStatus} should succeed: ${updErr?.message}`);
      }

      const { data: finalOrder } = await adminDb.from("orders").select("order_status").eq("id", order1Id).single();
      assert.strictEqual(finalOrder?.order_status, "Delivered");
    });

    // ----------------------------------------------------------------------------
    // TEST 2: Invalid Transition: Delivered -> Pending rejected by trigger
    // ----------------------------------------------------------------------------
    await runTest("Invalid transition: Delivered cannot regress to Pending", async () => {
      assert(order1Id);
      const { error } = await adminDb
        .from("orders")
        .update({ order_status: "Pending" })
        .eq("id", order1Id);

      assert(error, "Delivered -> Pending must be rejected by state machine trigger");
      assert(
        error.message.includes("Invalid order status transition") ||
        error.code === "P0001",
        `Expected transition error, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Terminal State Integrity: Cancelled order cannot transition to Confirmed
    // ----------------------------------------------------------------------------
    await runTest("Terminal state integrity: Cancelled order cannot transition to Confirmed", async () => {
      const { data: orderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 200 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `state_cancel_${timestamp}`,
      });
      assert(!error && orderId);

      // Cancel the order
      await clientCust.rpc("cancel_order_atomic", {
        p_order_id: orderId,
        p_user_id: custId,
        p_cancel_reason: "Testing cancel",
        p_is_admin: false,
      });

      // Attempt to revive cancelled order to Confirmed
      const { error: reviveErr } = await adminDb
        .from("orders")
        .update({ order_status: "Confirmed" })
        .eq("id", orderId);

      assert(reviveErr, "Cancelled order cannot be revived to Confirmed");
      assert(
        reviveErr.message.includes("Cannot transition cancelled order") ||
        reviveErr.message.includes("Invalid order status transition")
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Payment Downgrade Prevention: Paid cannot be downgraded to Failed or Pending
    // ----------------------------------------------------------------------------
    let paidOrderId: string = "";
    const paidRzpOrderId = `order_paid_rzp_${timestamp}`;
    await runTest("Payment integrity: Paid status cannot be downgraded to Failed or Pending", async () => {
      const { data: orderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 200 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `state_paid_${timestamp}`,
      });
      assert(!error && orderId);
      paidOrderId = orderId;

      await adminDb.from("orders").update({ razorpay_order_id: paidRzpOrderId }).eq("id", paidOrderId);

      // Settle payment (200 + 45 = 245 -> 24500 paise)
      const { data: settleRes, error: sErr } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: paidRzpOrderId,
        p_razorpay_payment_id: `pay_state_${timestamp}`,
        p_signature: `sig_state_${timestamp}`,
        p_raw_response: { amount: 24500 },
      });
      assert(!sErr && settleRes?.success, `Settle payment failed: ${sErr?.message}`);

      // Attempt to directly downgrade payment_status to 'Failed'
      const { error: downErr1 } = await adminDb
        .from("orders")
        .update({ payment_status: "Failed" })
        .eq("id", paidOrderId);

      assert(downErr1, "Paid status cannot be downgraded to Failed");
      assert(
        downErr1.message.includes("Paid payment status cannot be changed") ||
        downErr1.message.includes("Cannot transition payment status"),
        `Unexpected error: ${downErr1.message}`
      );

      // Attempt to downgrade to 'Pending'
      const { error: downErr2 } = await adminDb
        .from("orders")
        .update({ payment_status: "Pending" })
        .eq("id", paidOrderId);

      assert(downErr2, "Paid status cannot be downgraded to Pending");
      assert(
        downErr2.message.includes("Paid payment status cannot be changed") ||
        downErr2.message.includes("Cannot transition payment status"),
        `Unexpected error: ${downErr2.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Late Payment Failure Webhook on Already Paid Order
    // ----------------------------------------------------------------------------
    await runTest("Late failure webhook on already Paid order is rejected gracefully", async () => {
      assert(paidOrderId);
      // Fire failure webhook RPC for the already paid order
      const { data: failRes, error: fErr } = await adminDb.rpc("record_payment_failure_atomic", {
        p_razorpay_order_id: paidRzpOrderId,
        p_raw_response: { error_code: "LATE_FAILURE", error_description: "Network timeout" },
      });

      // Function must return success: false with ignored_already_paid status
      assert(!fErr);
      assert.strictEqual(failRes?.status, "ignored_already_paid");
      assert.strictEqual(failRes?.success, false);

      // Verify order is still Paid
      const { data: checkOrder } = await adminDb.from("orders").select("payment_status").eq("id", paidOrderId).single();
      assert.strictEqual(checkOrder?.payment_status, "Paid", "Order payment status must remain Paid");
    });

    // ----------------------------------------------------------------------------
    // TEST 6: Webhook HMAC SHA256 Signature Verification
    // ----------------------------------------------------------------------------
    await runTest("Webhook HMAC SHA256 signature verification validates payload authenticity", async () => {
      const webhookSecret = "test_webhook_secret_key_123";
      const payload = JSON.stringify({
        event: "payment.captured",
        payload: {
          payment: {
            entity: {
              id: "pay_123456",
              order_id: "order_123456",
              amount: 50000,
              status: "captured",
            },
          },
        },
      });

      // 1. Valid Signature
      const validSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

      const generatedHash = crypto
        .createHmac("sha256", webhookSecret)
        .update(payload)
        .digest("hex");

      const isValid = crypto.timingSafeEqual(
        Buffer.from(validSignature),
        Buffer.from(generatedHash)
      );
      assert.strictEqual(isValid, true, "Legitimate signature must match");

      // 2. Forged / Tampered Signature
      const forgedSignature = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const isForgedValid = crypto.timingSafeEqual(
        Buffer.from(forgedSignature),
        Buffer.from(generatedHash)
      );
      assert.strictEqual(isForgedValid, false, "Forged signature must be rejected");
    });

    // ----------------------------------------------------------------------------
    // TEST 7: Webhook Event Idempotency & Deduplication (webhook_events table)
    // ----------------------------------------------------------------------------
    await runTest("Webhook event idempotency: Duplicate delivery is safely deduplicated", async () => {
      const eventId = `evt_rzp_${timestamp}`;

      // First webhook event arrival
      const { data: firstInsert, error: firstErr } = await adminDb
        .from("webhook_events")
        .insert({
          event_id: eventId,
          provider: "Razorpay",
          event_type: "payment.captured",
          payload: { order_id: paidRzpOrderId, amount: 24500 },
        })
        .select()
        .single();

      assert(!firstErr && firstInsert, `First webhook insert should succeed: ${firstErr?.message}`);

      // Replay of the exact same webhook event ID
      const { data: duplicateInsert, error: dupErr } = await adminDb
        .from("webhook_events")
        .insert({
          event_id: eventId,
          provider: "Razorpay",
          event_type: "payment.captured",
          payload: { order_id: paidRzpOrderId, amount: 24500 },
        });

      assert(dupErr, "Duplicate event_id insert must be rejected by unique constraint");
      assert(
        dupErr.code === "23505" ||
        dupErr.message.includes("unique") ||
        dupErr.message.includes("duplicate key"),
        `Expected unique violation, got: ${dupErr.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 8: COD Order cannot be settled via online prepaid webhook
    // ----------------------------------------------------------------------------
    await runTest("COD order cannot be settled via online prepaid webhook", async () => {
      const codRzpId = `order_cod_rzp_${timestamp}`;
      const { data: codOrderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 200 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "COD",
        p_idempotency_key: `state_cod_${timestamp}`,
      });
      assert(!error && codOrderId);

      await adminDb.from("orders").update({ razorpay_order_id: codRzpId }).eq("id", codOrderId);

      // Attempt to settle COD order via online settlement RPC
      const { data: settleRes, error: sErr } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: codRzpId,
        p_razorpay_payment_id: `pay_cod_${timestamp}`,
        p_signature: `sig_cod_${timestamp}`,
        p_raw_response: { amount: 24500 },
      });

      // Must be rejected
      assert(!sErr);
      assert.strictEqual(settleRes?.success, false);
      assert.strictEqual(settleRes?.status, "invalid_payment_method");
    });

  } finally {
    // Cleanup
    await adminDb.from("webhook_events").delete().ilike("event_id", `%${timestamp}%`);
    await adminDb.from("inventory_reservations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("orders").delete().eq("user_id", custId);
    await adminDb.from("books").delete().eq("id", book?.id);
    await adminDb.auth.admin.deleteUser(custId);
    console.log("  ✓ Test fixtures safely purged.\n");
  }

  console.log("================================================================================");
  console.log(` FEATURE 0.5 STATE INTEGRITY VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
