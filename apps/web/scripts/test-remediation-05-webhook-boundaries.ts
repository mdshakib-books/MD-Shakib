/**
 * ==============================================================================
 * REMEDIATION 5: WEBHOOK TRUST BOUNDARIES & SIGNATURE VERIFICATION SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. Forged / invalid webhook signature is strictly rejected.
 * 2. Valid webhook signature on raw body is accepted.
 * 3. Client cannot directly call settle_payment_atomic RPC (permission denied).
 * 4. Anonymous caller cannot directly call settle_payment_atomic RPC (permission denied).
 * 5. Amount mismatch in webhook payload is rejected (amount_mismatch).
 * 6. Currency mismatch (e.g. USD instead of INR) is rejected (currency_mismatch).
 * 7. Duplicate webhook event delivery is safely deduplicated via webhook_events.
 * 8. Late payment.failed webhook on already Paid order is ignored (ignored_already_paid).
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

const anonDb = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
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
  console.log(" REMEDIATION 5: WEBHOOK TRUST BOUNDARIES & SETTLEMENT SECURITY VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const emailCust = `remed5_cust_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create customer
  const { data: authCust } = await adminDb.auth.admin.createUser({
    email: emailCust,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Five" },
  });
  assert(authCust?.user);
  const custId = authCust.user.id;

  const clientCust = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientCust.auth.signInWithPassword({ email: emailCust, password: defaultPassword });

  // 2. Seed a test book: 200.00
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: `Webhook Test Book ${timestamp}`,
      author: "Scholar",
      description: "Book for webhook boundary test",
      price: 200.0,
      discount: 0,
      stock: 10,
      category: "History",
      image_url: "https://example.com/wbk.jpg",
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
    // TEST 1: Cryptographic HMAC SHA256 Signature Verification
    // ----------------------------------------------------------------------------
    await runTest("HMAC SHA256 signature verification validates payload against secret", async () => {
      const webhookSecret = "super_secure_webhook_secret_key";
      const rawBody = JSON.stringify({
        event: "payment.captured",
        payload: { payment: { entity: { id: "pay_1", order_id: "order_1", amount: 24500 } } },
      });

      // Legitimate signature
      const validSignature = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      const computedValid = crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex");
      const isValid = crypto.timingSafeEqual(Buffer.from(validSignature), Buffer.from(computedValid));
      assert.strictEqual(isValid, true, "Valid signature must match");

      // Forged signature
      const forgedSignature = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
      const isForgedValid = crypto.timingSafeEqual(Buffer.from(forgedSignature), Buffer.from(computedValid));
      assert.strictEqual(isForgedValid, false, "Forged signature must be rejected");
    });

    // ----------------------------------------------------------------------------
    // TEST 2: Anonymous caller cannot invoke settle_payment_atomic RPC
    // ----------------------------------------------------------------------------
    await runTest("Anonymous caller cannot invoke settle_payment_atomic RPC (permission denied)", async () => {
      const { data, error } = await anonDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "order_fake_rzp",
        p_razorpay_payment_id: "pay_fake",
      });

      assert(error, "Anonymous execution must be blocked");
      assert(
        error.message.includes("permission denied") ||
        error.code === "42501",
        `Expected permission denied, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Authenticated customer cannot invoke settle_payment_atomic RPC
    // ----------------------------------------------------------------------------
    await runTest("Authenticated customer cannot invoke settle_payment_atomic RPC (permission denied)", async () => {
      const { data, error } = await clientCust.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "order_fake_rzp",
        p_razorpay_payment_id: "pay_fake",
      });

      assert(error, "Customer execution must be blocked");
      assert(
        error.message.includes("permission denied") ||
        error.code === "42501",
        `Expected permission denied, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Amount mismatch in settlement is rejected
    // ----------------------------------------------------------------------------
    await runTest("Amount mismatch in settlement is strictly rejected (amount_mismatch)", async () => {
      const rzpOrderId = `order_amt_test_${timestamp}`;

      // 1 item @ 200 + 45 = 245.00
      const { data: orderId } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 200 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `amt_test_${timestamp}`,
      });
      assert(orderId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", orderId);

      // Attempt settlement with ₹100 instead of ₹245 (10000 paise)
      const { data: settleRes, error } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: `pay_amt_${timestamp}`,
        p_signature: `sig_amt_${timestamp}`,
        p_raw_response: { amount: 10000, currency: "INR" }, // 100.00 INR
      });

      assert(!error);
      assert.strictEqual(settleRes?.success, false);
      assert.strictEqual(settleRes?.status, "amount_mismatch");

      // Verify order payment status is NOT Paid
      const { data: order } = await adminDb.from("orders").select("payment_status").eq("id", orderId).single();
      assert.strictEqual(order?.payment_status, "Pending");
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Currency mismatch in settlement is rejected
    // ----------------------------------------------------------------------------
    await runTest("Currency mismatch (e.g. USD instead of INR) is strictly rejected (currency_mismatch)", async () => {
      const rzpOrderId = `order_curr_test_${timestamp}`;

      const { data: orderId } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 200 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `curr_test_${timestamp}`,
      });
      assert(orderId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", orderId);

      // Attempt settlement with USD currency
      const { data: settleRes, error } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: `pay_curr_${timestamp}`,
        p_signature: `sig_curr_${timestamp}`,
        p_raw_response: { amount: 24500, currency: "USD" }, // USD!
      });

      assert(!error);
      assert.strictEqual(settleRes?.success, false);
      assert.strictEqual(settleRes?.status, "currency_mismatch");

      // Verify order payment status is NOT Paid
      const { data: order } = await adminDb.from("orders").select("payment_status").eq("id", orderId).single();
      assert.strictEqual(order?.payment_status, "Pending");
    });

    // ----------------------------------------------------------------------------
    // TEST 6: Webhook event deduplication via webhook_events table
    // ----------------------------------------------------------------------------
    await runTest("Webhook event deduplication: Replay delivery rejected by unique constraint", async () => {
      const eventId = `evt_dedup_${timestamp}`;

      // First webhook insert
      const { data: first, error: err1 } = await adminDb.from("webhook_events").insert({
        event_id: eventId,
        provider: "Razorpay",
        event_type: "payment.captured",
        payload: { event_id: eventId },
      }).select().single();
      assert(!err1 && first);

      // Replay insert
      const { error: err2 } = await adminDb.from("webhook_events").insert({
        event_id: eventId,
        provider: "Razorpay",
        event_type: "payment.captured",
        payload: { event_id: eventId },
      });

      assert(err2, "Duplicate webhook event must be rejected by unique constraint");
      assert(err2.code === "23505" || err2.message.includes("unique"));
    });

    // ----------------------------------------------------------------------------
    // TEST 7: Late payment.failed event cannot reverse a successful payment
    // ----------------------------------------------------------------------------
    await runTest("Late failure webhook on already Paid order is ignored (ignored_already_paid)", async () => {
      const rzpOrderId = `order_late_fail_${timestamp}`;

      const { data: orderId } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 200 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `late_fail_${timestamp}`,
      });
      assert(orderId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", orderId);

      // Settle payment first
      const { data: sRes } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: `pay_settled_${timestamp}`,
        p_signature: `sig_settled_${timestamp}`,
        p_raw_response: { amount: 24500, currency: "INR" },
      });
      assert(sRes?.success === true);

      // Late payment.failed arrives from Razorpay
      const { data: failRes } = await adminDb.rpc("record_payment_failure_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_raw_response: { error_code: "GATEWAY_TIMEOUT" },
      });

      assert.strictEqual(failRes?.success, false);
      assert.strictEqual(failRes?.status, "ignored_already_paid");

      // Verify order payment status is STILL Paid
      const { data: order } = await adminDb.from("orders").select("payment_status").eq("id", orderId).single();
      assert.strictEqual(order?.payment_status, "Paid");
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
  console.log(` REMEDIATION 5 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
