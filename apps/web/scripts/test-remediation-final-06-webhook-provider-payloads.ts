/**
 * ==============================================================================
 * FINAL REMEDIATION 6: PAYMENT PROVIDER PAYLOAD & WEBHOOK BOUNDARY VERIFICATION
 * MD Shakib Islamic Books
 * ==============================================================================
 * Tests:
 * 1. Webhook HMAC SHA-256 verification rejects forged, malformed, or missing signatures.
 * 2. Missing provider payment ID or provider order ID is rejected before settlement.
 * 3. Unsupported currency (e.g. USD) is rejected before settlement.
 * 4. Payment order ID mismatch between payment entity and order entity is rejected.
 * 5. Settlement RPC execution strictly requires service-role (anonymous & customer callers blocked).
 * 6. Webhook event durable state tracking (processing -> completed) and duplicate replay handling.
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import assert from "node:assert";
import { validateWebhookSignature, processRazorpayWebhook } from "../lib/integrations/razorpay/webhook";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_ROLE_KEY;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anonDb = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_test_webhook_secret_12345";
process.env.RAZORPAY_WEBHOOK_SECRET = WEBHOOK_SECRET;

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

function signPayload(body: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

async function main() {
  console.log("================================================================================");
  console.log(" FINAL REMEDIATION 6: PAYMENT PROVIDER PAYLOAD & WEBHOOK BOUNDARIES");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `final_hook_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create test user and customer client
  const { data: userAuth } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Webhook Test User" },
  });
  assert(userAuth?.user);
  const userId = userAuth.user.id;

  const custDb = createClient(SUPABASE_URL, ANON_KEY);
  await custDb.auth.signInWithPassword({ email: testEmail, password: defaultPassword });

  // 2. Create test book
  const { data: book } = await adminDb.from("books").insert({
    title: `Webhook Test Book ${timestamp}`,
    author: "Test Author",
    price: 250,
    stock: 20,
    discount: 0,
    category: "Quran",
    image_url: "https://example.com/quran.jpg",
    is_active: true,
  }).select().single();
  assert(book);

  const sampleAddress = {
    full_name: "Webhook User",
    phone: "9876543210",
    pincode: "110025",
    city: "Delhi",
    state: "Delhi",
    house_no: "606",
    area: "Okhla",
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: HMAC SHA-256 validation rejects invalid or forged signatures
    // -------------------------------------------------------------------------
    await runTest("HMAC SHA-256 signature validation strictly rejects forged or missing signatures", async () => {
      const rawPayload = JSON.stringify({ event: "order.paid", id: `evt_fake_${timestamp}` });
      const validSig = signPayload(rawPayload, WEBHOOK_SECRET);
      const forgedSig = signPayload(rawPayload, "wrong_secret");

      assert.strictEqual(validateWebhookSignature(rawPayload, validSig, WEBHOOK_SECRET), true, "Valid signature must pass");
      assert.strictEqual(validateWebhookSignature(rawPayload, forgedSig, WEBHOOK_SECRET), false, "Forged signature must fail");
      assert.strictEqual(validateWebhookSignature(rawPayload, "", WEBHOOK_SECRET), false, "Empty signature must fail");
      assert.strictEqual(validateWebhookSignature("", validSig, WEBHOOK_SECRET), false, "Empty body must fail");
    });

    // -------------------------------------------------------------------------
    // TEST 2: Missing provider payment ID or order ID rejected
    // -------------------------------------------------------------------------
    await runTest("Webhook processing rejects payloads with missing provider payment ID or order ID", async () => {
      const invalidPayload = JSON.stringify({
        id: `evt_missing_${timestamp}`,
        event: "order.paid",
        payload: {
          payment: { entity: { id: "", order_id: `rzp_ord_${timestamp}`, amount: 29500, currency: "INR" } },
        },
      });
      const sig = signPayload(invalidPayload, WEBHOOK_SECRET);

      const res = await processRazorpayWebhook(invalidPayload, sig);
      assert.strictEqual(res.status, "ignored");
      assert.ok(res.reason?.includes("Missing or invalid Razorpay payment ID"));
    });

    // -------------------------------------------------------------------------
    // TEST 3: Unsupported currency (e.g. USD) is rejected
    // -------------------------------------------------------------------------
    await runTest("Webhook processing strictly rejects unsupported currency (e.g. USD)", async () => {
      const usdPayload = JSON.stringify({
        id: `evt_usd_${timestamp}`,
        event: "order.paid",
        payload: {
          payment: { entity: { id: `pay_usd_${timestamp}`, order_id: `rzp_ord_${timestamp}`, amount: 29500, currency: "USD" } },
        },
      });
      const sig = signPayload(usdPayload, WEBHOOK_SECRET);

      const res = await processRazorpayWebhook(usdPayload, sig);
      assert.strictEqual(res.status, "rejected");
      assert.ok(res.reason?.includes("Unsupported payment currency"));
    });

    // -------------------------------------------------------------------------
    // TEST 4: Payment order ID mismatch rejected
    // -------------------------------------------------------------------------
    await runTest("Webhook rejects payment entity order_id that mismatches the webhook order ID", async () => {
      const mismatchPayload = JSON.stringify({
        id: `evt_mismatch_${timestamp}`,
        event: "order.paid",
        payload: {
          order: { entity: { id: "order_AAA_111" } },
          payment: { entity: { id: `pay_mismatch_${timestamp}`, order_id: "order_BBB_222", amount: 29500, currency: "INR" } },
        },
      });
      const sig = signPayload(mismatchPayload, WEBHOOK_SECRET);

      const res = await processRazorpayWebhook(mismatchPayload, sig);
      assert.strictEqual(res.status, "rejected");
      assert.ok(res.reason?.includes("Payment order ID mismatch"));
    });

    // -------------------------------------------------------------------------
    // TEST 5: Settlement RPC strictly restricted to service_role
    // -------------------------------------------------------------------------
    await runTest("Direct settlement RPC execution is forbidden for anonymous and customer callers", async () => {
      // Anonymous caller
      const { error: anonErr } = await anonDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "rzp_ord_fake",
        p_razorpay_payment_id: "pay_fake",
      });
      assert(anonErr, "Anonymous caller must be rejected by settle_payment_atomic");

      // Customer caller
      const { error: custErr } = await custDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: "rzp_ord_fake",
        p_razorpay_payment_id: "pay_fake",
      });
      assert(custErr, "Authenticated customer must be rejected by settle_payment_atomic");
    });

    // -------------------------------------------------------------------------
    // TEST 6: Durable webhook idempotency tracking and replay safety
    // -------------------------------------------------------------------------
    await runTest("Webhook events track durable processing status and deduplicate duplicate webhooks", async () => {
      const rzpOrderId = `rzp_order_hook_${timestamp}`;
      const rzpPaymentId = `pay_hook_${timestamp}`;
      const webhookEventId = `evt_durable_${timestamp}`;

      // Create order (250 + 45 = 29500 paise)
      const { data: oId } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `hook_ord_${timestamp}`,
      });
      assert(oId);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", oId);

      // Create matching pending payment record
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

      const webhookPayload = JSON.stringify({
        id: webhookEventId,
        event: "order.paid",
        payload: {
          payment: { entity: { id: rzpPaymentId, order_id: rzpOrderId, amount: 29500, currency: "INR" } },
        },
      });
      const sig = signPayload(webhookPayload, WEBHOOK_SECRET);

      // First webhook delivery
      const res1 = await processRazorpayWebhook(webhookPayload, sig);
      assert.strictEqual(res1.status, "settled", "First delivery must settle order");

      // Check durable status in webhook_events table
      const { data: evtRow } = await adminDb.from("webhook_events").select("status").eq("event_id", webhookEventId).single();
      assert.strictEqual(evtRow?.status, "completed", "Webhook event must be marked 'completed'");

      // Second (duplicate) webhook delivery with identical event_id
      const res2 = await processRazorpayWebhook(webhookPayload, sig);
      assert.strictEqual(res2.status, "idempotent_ok", "Duplicate delivery must return idempotent_ok");
    });

  } finally {
    await adminDb.from("webhook_events").delete().ilike("event_id", `%${timestamp}%`);
    await adminDb.from("payments").delete().eq("user_id", userId);
    await adminDb.from("inventory_reservations").delete().in("book_id", [book.id]);
    await adminDb.from("order_items").delete().in("book_id", [book.id]);
    await adminDb.from("orders").delete().eq("user_id", userId);
    await adminDb.from("books").delete().eq("id", book.id);
    await adminDb.auth.admin.deleteUser(userId);
    console.log("  ✓ Test fixtures safely purged.");
  }

  console.log("\n================================================================================");
  console.log(` FINAL REMEDIATION 6 COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
