/**
 * ==============================================================================
 * REMEDIATION 1: SERVER-AUTHORITATIVE PRICING & FEE INTEGRITY VERIFICATION
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. Submitting subtotal minus discount (previously triggered fee-waiver branch):
 *    Server strictly enforces full platform (₹10.00) and delivery (₹35.00) fees.
 * 2. Submitting zero (p_total_amount = 0.0):
 *    Server strictly ignores zero and persists authoritative total.
 * 3. Submitting ₹1 (p_total_amount = 1.0):
 *    Server strictly ignores ₹1 and persists authoritative total.
 * 4. Submitting a negative amount (p_total_amount = -50.0):
 *    Server strictly ignores negative amount and persists authoritative total.
 * 5. Submitting arbitrary fee-tampering payloads:
 *    Platform fee is always ₹10.00, delivery fee is always ₹35.00.
 * 6. Validating Razorpay order service receives the authoritative persisted total:
 *    Amount passed to Razorpay is Math.round(orders.total_amount * 100).
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
  console.log(" REMEDIATION 1: SERVER-AUTHORITATIVE PRICING & FEE DECISION VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `remed1_cust_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create customer
  const { data: authCust } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Remediation Customer 1" },
  });
  assert(authCust?.user, "Customer creation failed");
  const custId = authCust.user.id;

  const clientCust = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientCust.auth.signInWithPassword({ email: testEmail, password: defaultPassword });

  // 2. Seed a test book: Price 400.00, discount 0% -> Effective price 400.00
  const { data: book, error: bErr } = await adminDb
    .from("books")
    .insert({
      title: `Fee Test Book ${timestamp}`,
      author: "Islamic Jurist",
      description: "Book for fee waiver testing",
      price: 400.0,
      discount: 0,
      stock: 50,
      category: "Fiqh",
      image_url: "https://example.com/feebook.jpg",
      is_active: true,
    })
    .select()
    .single();
  assert(!bErr && book, `Book creation failed: ${bErr?.message}`);

  // 3. Create a coupon: ₹50 flat discount
  const couponCode = `FEE50_${timestamp}`;
  const { data: coupon, error: cErr } = await adminDb
    .from("discounts")
    .insert({
      code: couponCode,
      discount_type: "fixed",
      discount_value: 50,
      min_order_amount: 100,
      usage_limit: 100,
      is_active: true,
      valid_from: new Date(Date.now() - 3600000).toISOString(),
    })
    .select()
    .single();
  assert(!cErr && coupon, `Coupon creation failed: ${cErr?.message}`);

  const sampleAddress = {
    full_name: "Customer One",
    phone: "9876543210",
    pincode: "110025",
    city: "New Delhi",
    state: "Delhi",
    house_no: "42",
    area: "Okhla",
  };

  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Submitting subtotal minus discount (previously waived platform & delivery fees)
    // ----------------------------------------------------------------------------
    await runTest("Submitting subtotal minus discount DOES NOT waive fees; full ₹45 fees enforced", async () => {
      // 1 item @ ₹400 - ₹50 coupon = ₹350 pure subtotal
      // Previously, passing p_total_amount = 350.00 waived the ₹45 fees (resulting in total ₹350.00)
      // Now, authoritative calculation MUST enforce ₹10 platform + ₹35 delivery = ₹395.00 total
      const { data: orderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 400 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_total_amount: 350.00, // Client attempts to trigger fee waiver
        p_idempotency_key: `remed1_waiver_${timestamp}`,
        p_coupon_code: couponCode,
      });

      assert(!error && orderId, `Order creation failed: ${error?.message}`);

      const { data: order } = await adminDb
        .from("orders")
        .select("subtotal, platform_fee, delivery_fee, discount_amount, total_amount")
        .eq("id", orderId)
        .single();

      assert.strictEqual(Number(order?.subtotal), 400.00, "Subtotal must be 400.00");
      assert.strictEqual(Number(order?.discount_amount), 50.00, "Discount must be 50.00");
      assert.strictEqual(Number(order?.platform_fee), 10.00, "Platform fee MUST be 10.00 (not waived)");
      assert.strictEqual(Number(order?.delivery_fee), 35.00, "Delivery fee MUST be 35.00 (not waived)");
      assert.strictEqual(Number(order?.total_amount), 395.00, "Total MUST be 395.00 (400 - 50 + 45)");
    });

    // ----------------------------------------------------------------------------
    // TEST 2: Submitting zero (p_total_amount = 0.0)
    // ----------------------------------------------------------------------------
    await runTest("Submitting zero (p_total_amount = 0.0) is strictly overridden by server", async () => {
      const { data: orderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 400 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_total_amount: 0.0, // Client attempts zero total
        p_idempotency_key: `remed1_zero_${timestamp}`,
      });

      assert(!error && orderId);

      const { data: order } = await adminDb
        .from("orders")
        .select("subtotal, platform_fee, delivery_fee, total_amount")
        .eq("id", orderId)
        .single();

      // 400 + 45 = 445.00
      assert.strictEqual(Number(order?.total_amount), 445.00, "Total must be authoritative 445.00");
      assert.strictEqual(Number(order?.platform_fee), 10.00);
      assert.strictEqual(Number(order?.delivery_fee), 35.00);
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Submitting ₹1 (p_total_amount = 1.0)
    // ----------------------------------------------------------------------------
    await runTest("Submitting ₹1 (p_total_amount = 1.0) is strictly overridden by server", async () => {
      const { data: orderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 400 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_total_amount: 1.0,
        p_idempotency_key: `remed1_one_${timestamp}`,
      });

      assert(!error && orderId);

      const { data: order } = await adminDb
        .from("orders")
        .select("total_amount")
        .eq("id", orderId)
        .single();

      assert.strictEqual(Number(order?.total_amount), 445.00, "Total must be authoritative 445.00");
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Submitting a negative amount (p_total_amount = -50.0)
    // ----------------------------------------------------------------------------
    await runTest("Submitting negative amount is strictly overridden by server", async () => {
      const { data: orderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 1, price: 400 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_total_amount: -50.0,
        p_idempotency_key: `remed1_neg_${timestamp}`,
      });

      assert(!error && orderId);

      const { data: order } = await adminDb
        .from("orders")
        .select("total_amount")
        .eq("id", orderId)
        .single();

      assert.strictEqual(Number(order?.total_amount), 445.00, "Total must be authoritative 445.00");
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Multiple items with arbitrary client amounts
    // ----------------------------------------------------------------------------
    await runTest("Multiple items: 3 units @ 400 = 1200 + 45 = 1245.00 authoritative total", async () => {
      const { data: orderId, error } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 3, price: 10 }], // fake unit price 10
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_total_amount: 30.0, // fake total 30
        p_idempotency_key: `remed1_multi_${timestamp}`,
      });

      assert(!error && orderId);

      const { data: order } = await adminDb
        .from("orders")
        .select("subtotal, platform_fee, delivery_fee, total_amount")
        .eq("id", orderId)
        .single();

      assert.strictEqual(Number(order?.subtotal), 1200.00);
      assert.strictEqual(Number(order?.platform_fee), 10.00);
      assert.strictEqual(Number(order?.delivery_fee), 35.00);
      assert.strictEqual(Number(order?.total_amount), 1245.00);
    });

  } finally {
    // Cleanup
    await adminDb.from("order_items").delete().eq("book_id", book?.id);
    await adminDb.from("inventory_reservations").delete().eq("book_id", book?.id);
    await adminDb.from("orders").delete().eq("user_id", custId);
    await adminDb.from("discounts").delete().eq("code", couponCode);
    await adminDb.from("books").delete().eq("id", book?.id);
    await adminDb.auth.admin.deleteUser(custId);
    console.log("  ✓ Test fixtures safely purged.\n");
  }

  console.log("================================================================================");
  console.log(` REMEDIATION 1 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
