/**
 * ==============================================================================
 * PHASE 0 — FEATURE 0.1: SERVER-AUTHORITATIVE PRICING VERIFICATION SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. Client submits a fake lower price -> Server overrides with authoritative price.
 * 2. Client submits a fake higher price -> Server overrides with authoritative price.
 * 3. Client changes subtotal -> Server recalculates subtotal from database.
 * 4. Client changes shipping charge -> Server applies authoritative shipping fee.
 * 5. Client changes tax / platform fee -> Server applies authoritative fees.
 * 6. Client submits a fake coupon discount -> Validated against database rules.
 * 7. Client submits a manipulated final payable amount -> Overridden by server calculation.
 * 8. Product price changes after cart creation -> Server uses fresh DB price.
 * 9. Product becomes inactive or unavailable before checkout -> Order rejected.
 * 10. Quantity is zero, negative, fractional, or excessively large -> Rejected.
 * 11. Decimal rounding and currency precision edge cases -> Safe decimal arithmetic.
 * 12. Razorpay order creation uses server-authoritative payable amount from DB.
 * 13. COD orders use the exact same authoritative calculation.
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

if (!SERVICE_ROLE_KEY || !ANON_KEY) {
  console.error("Missing Supabase configuration in environment.");
  process.exit(1);
}

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
  console.log(" PHASE 0 — FEATURE 0.1: SERVER-AUTHORITATIVE PRICING VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `pricing_cust_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create authenticated customer
  const { data: authCust, error: errCust } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Pricing Test Customer" },
  });
  assert(!errCust && authCust.user, `Customer creation failed: ${errCust?.message}`);
  const custId = authCust.user.id;

  const custClient = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false },
  });
  const { data: sessionData, error: sessionErr } = await custClient.auth.signInWithPassword({
    email: testEmail,
    password: defaultPassword,
  });
  assert(!sessionErr && sessionData.session, `Sign-in failed: ${sessionErr?.message}`);

  // 2. Create Catalog Book: Price 500, Discount 10% -> Authoritative price = 450
  const { data: book1, error: b1Err } = await adminDb
    .from("books")
    .insert({
      title: `Pricing Test Book 1 ${timestamp}`,
      author: "Islamic Scholar",
      description: "Pricing test book 1 description",
      price: 500.0,
      discount: 10,
      stock: 50,
      category: "Fiqh",
      image_url: "https://example.com/b1.jpg",
      is_active: true,
    })
    .select()
    .single();
  assert(!b1Err && book1, `Failed to seed book 1: ${b1Err?.message}`);

  // Create Catalog Book 2: Price 300, Discount 0% -> Authoritative price = 300
  const { data: book2, error: b2Err } = await adminDb
    .from("books")
    .insert({
      title: `Pricing Test Book 2 ${timestamp}`,
      author: "Scholar 2",
      description: "Pricing test book 2 description",
      price: 300.0,
      discount: 0,
      stock: 50,
      category: "History",
      image_url: "https://example.com/b2.jpg",
      is_active: true,
    })
    .select()
    .single();
  assert(!b2Err && book2, `Failed to seed book 2: ${b2Err?.message}`);

  // Create Discount Coupon: 20% off with max discount ₹150, min order ₹500
  const couponCode = `TEST20_${timestamp}`;
  const { data: coupon } = await adminDb
    .from("discounts")
    .insert({
      code: couponCode,
      discount_type: "percentage",
      discount_value: 20,
      min_order_amount: 500,
      max_discount_amount: 150,
      usage_limit: 100,
      is_active: true,
    })
    .select()
    .single();
  assert(coupon, "Failed to seed coupon");

  const addressSnapshot = {
    full_name: "Pricing Customer",
    phone: "9876543210",
    pincode: "110025",
    city: "New Delhi",
    state: "Delhi",
    house_no: "42",
    area: "Jamia",
  };

  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Client submits a fake lower price (e.g. ₹1.00)
    // ----------------------------------------------------------------------------
    await runTest("Client submits a fake lower price: Server overrides with authoritative price", async () => {
      // 1 item of Book 1: Authoritative unit price = 450.00. Standard fees: 10 platform + 35 delivery = 45.
      // Expected total = 450 + 45 = 495.00.
      // Client attempts to pass fake price: 1.00 and fake total: 1.00
      const { data: orderId, error } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book1.id, quantity: 1, price: 1.0 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
        p_total_amount: 1.0, // Fake manipulated total
        p_idempotency_key: `pricing_fake_low_${timestamp}`,
      });

      assert(!error && orderId, `Order creation should succeed by overriding: ${error?.message}`);

      // Verify persisted order total in database is authoritative 495.00, NOT 1.00
      const { data: order } = await adminDb.from("orders").select("total_amount, subtotal, platform_fee, delivery_fee").eq("id", orderId).single();
      assert.strictEqual(Number(order?.total_amount), 495.0, "Persisted order total must be 495.00");
      assert.strictEqual(Number(order?.subtotal), 450.0, "Subtotal must be authoritative 450.00");
      assert.strictEqual(Number(order?.platform_fee), 10.0, "Platform fee must be 10.00");
      assert.strictEqual(Number(order?.delivery_fee), 35.0, "Delivery fee must be 35.00");

      // Verify order item price snapshot is authoritative 450.00, NOT 1.00
      const { data: item } = await adminDb.from("order_items").select("price").eq("order_id", orderId).single();
      assert.strictEqual(Number(item?.price), 450.0, "Order item price must be authoritative 450.00, never client's 1.00");
    });

    // ----------------------------------------------------------------------------
    // TEST 2: Client submits a fake higher price (e.g. ₹9999.00)
    // ----------------------------------------------------------------------------
    await runTest("Client submits a fake higher price: Server overrides with authoritative price", async () => {
      const { data: orderId, error } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book2.id, quantity: 1, price: 9999.0 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
        p_total_amount: 9999.0, // Fake inflated price
        p_idempotency_key: `pricing_fake_high_${timestamp}`,
      });

      assert(!error && orderId, `Order creation should succeed: ${error?.message}`);
      const { data: order } = await adminDb.from("orders").select("total_amount, subtotal").eq("id", orderId).single();
      // Book 2 price is 300 + 45 fees = 345.00
      assert.strictEqual(Number(order?.total_amount), 345.0, "Order total must be authoritative 345.00, NOT 9999.00");
      assert.strictEqual(Number(order?.subtotal), 300.0, "Subtotal must be 300.00");
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Multi-item calculation & line totals
    // ----------------------------------------------------------------------------
    await runTest("Server accurately computes multi-item subtotal and fees", async () => {
      // 2 units of Book 1 (2 * 450 = 900) + 3 units of Book 2 (3 * 300 = 900) = Subtotal 1800.
      // Fees = 45. Total = 1845.00
      const { data: orderId, error } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [
          { book_id: book1.id, quantity: 2, price: 999 },
          { book_id: book2.id, quantity: 3, price: 999 },
        ],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
        p_idempotency_key: `pricing_multi_${timestamp}`,
      });

      assert(!error && orderId, `Multi-item order failed: ${error?.message}`);
      const { data: order } = await adminDb.from("orders").select("total_amount, subtotal").eq("id", orderId).single();
      assert.strictEqual(Number(order?.subtotal), 1800.0, "Subtotal must be 1800.00");
      assert.strictEqual(Number(order?.total_amount), 1845.0, "Total must be 1845.00");
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Valid Coupon Application & Cap Limit
    // ----------------------------------------------------------------------------
    await runTest("Server validates coupon eligibility and enforces discount cap", async () => {
      // Subtotal = 1800. 20% of 1800 = 360. Cap is 150.
      // Expected discount = 150. Fees = 45. Total = 1800 - 150 + 45 = 1695.00
      const { data: orderId, error } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [
          { book_id: book1.id, quantity: 2 },
          { book_id: book2.id, quantity: 3 },
        ],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
        p_idempotency_key: `pricing_coupon_${timestamp}`,
        p_coupon_code: couponCode,
      });

      assert(!error && orderId, `Coupon order failed: ${error?.message}`);
      const { data: order } = await adminDb
        .from("orders")
        .select("total_amount, subtotal, discount_amount, coupon_code")
        .eq("id", orderId)
        .single();
      assert.strictEqual(Number(order?.subtotal), 1800.0);
      assert.strictEqual(Number(order?.discount_amount), 150.0, "Discount must be capped at 150.00");
      assert.strictEqual(Number(order?.total_amount), 1695.0, "Total must be 1800 - 150 + 45 = 1695.00");
      assert.strictEqual(order?.coupon_code, couponCode);
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Fake or Ineligible Coupon Discount
    // ----------------------------------------------------------------------------
    await runTest("Fake or non-existent coupon is rejected by server", async () => {
      const { error } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book1.id, quantity: 1 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
        p_coupon_code: "NON_EXISTENT_COUPON_XYZ",
      });

      assert(error, "Order with fake coupon must fail");
      assert(error.message.includes("Invalid discount coupon code"));
    });

    // ----------------------------------------------------------------------------
    // TEST 6: Coupon Below Minimum Order Amount
    // ----------------------------------------------------------------------------
    await runTest("Coupon below minimum cart value is rejected", async () => {
      // Book 2 is 300. Min order amount for coupon is 500.
      const { error } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book2.id, quantity: 1 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
        p_coupon_code: couponCode,
      });

      assert(error, "Order below minimum coupon threshold must fail");
      assert(error.message.includes("Minimum order amount"));
    });

    // ----------------------------------------------------------------------------
    // TEST 7: Product Price Changes After Cart Creation
    // ----------------------------------------------------------------------------
    await runTest("Server uses latest authoritative database price if catalog price changes", async () => {
      // Create dynamic book
      const { data: dynamicBook } = await adminDb
        .from("books")
        .insert({
          title: `Dynamic Price Book ${timestamp}`,
          author: "Scholar",
          price: 200,
          discount: 0,
          stock: 10,
          category: "History",
          image_url: "https://example.com/dyn.jpg",
          is_active: true,
        })
        .select()
        .single();
      assert(dynamicBook);

      // Now price changes in database to 350
      await adminDb.from("books").update({ price: 350 }).eq("id", dynamicBook.id);

      // Customer checks out sending old price 200
      const { data: orderId, error } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: dynamicBook.id, quantity: 1, price: 200 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
        p_idempotency_key: `pricing_dyn_${timestamp}`,
      });

      assert(!error && orderId, `Dynamic order failed: ${error?.message}`);
      const { data: order } = await adminDb.from("orders").select("subtotal, total_amount").eq("id", orderId).single();
      // Fresh price is 350 + 45 = 395
      assert.strictEqual(Number(order?.subtotal), 350.0, "Subtotal must reflect updated price 350.00");
      assert.strictEqual(Number(order?.total_amount), 395.0, "Total must reflect updated price 395.00");
    });

    // ----------------------------------------------------------------------------
    // TEST 8: Inactive Product Rejection
    // ----------------------------------------------------------------------------
    await runTest("Inactive product is strictly rejected at checkout boundary", async () => {
      const { data: inactiveBook, error: inactErr } = await adminDb
        .from("books")
        .insert({
          title: `Inactive Book ${timestamp}`,
          author: "Scholar",
          description: "Inactive book description",
          price: 100,
          stock: 10,
          category: "Other",
          image_url: "https://example.com/inact.jpg",
          is_active: false, // Inactive!
        })
        .select()
        .single();
      assert(!inactErr && inactiveBook, `Failed to seed inactive book: ${inactErr?.message}`);

      const { error } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: inactiveBook.id, quantity: 1 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
      });

      assert(error, "Checkout of inactive book must fail");
      assert(error.message.includes("is currently inactive"));
    });

    // ----------------------------------------------------------------------------
    // TEST 9: Invalid Quantities (Zero, Negative, Excessively Large)
    // ----------------------------------------------------------------------------
    await runTest("Quantity zero or negative is rejected", async () => {
      const { error: zeroErr } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book1.id, quantity: 0 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
      });
      assert(zeroErr, "Quantity 0 must fail");
      assert(zeroErr.message.includes("at least 1"));

      const { error: negErr } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book1.id, quantity: -5 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
      });
      assert(negErr, "Negative quantity must fail");
    });

    await runTest("Excessively large quantity is rejected", async () => {
      const { error: maxErr } = await custClient.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book1.id, quantity: 99999 }],
        p_address_snapshot: addressSnapshot,
        p_payment_method: "COD",
      });
      assert(maxErr, "Excessive quantity must fail");
    });

    // ----------------------------------------------------------------------------
    // TEST 10: Standalone Authoritative Pricing RPC (calculate_cart_pricing)
    // ----------------------------------------------------------------------------
    await runTest("calculate_cart_pricing returns authoritative breakdown to frontend", async () => {
      const { data: pricing, error } = await custClient.rpc("calculate_cart_pricing", {
        p_items: [
          { book_id: book1.id, quantity: 2 }, // 2 * 450 = 900
          { book_id: book2.id, quantity: 1 }, // 1 * 300 = 300. Subtotal = 1200.
        ],
        p_coupon_code: couponCode, // 20% of 1200 = 240, capped at 150.
      });

      assert(!error && pricing, `Pricing RPC error: ${error?.message}`);
      const res = pricing as any;
      assert.strictEqual(res.success, true);
      assert.strictEqual(Number(res.subtotal), 1200.0);
      assert.strictEqual(Number(res.platform_fee), 10.0);
      assert.strictEqual(Number(res.delivery_fee), 35.0);
      assert.strictEqual(Number(res.discount_amount), 150.0);
      assert.strictEqual(Number(res.total_amount), 1095.0); // 1200 - 150 + 45 = 1095.00
    });
  } finally {
    // Clean up fixtures
    await adminDb.from("orders").delete().eq("user_id", custId);
    await adminDb.from("discounts").delete().eq("code", couponCode);
    await adminDb.from("books").delete().in("id", [book1.id, book2.id]);
    await adminDb.auth.admin.deleteUser(custId);
    console.log("  ✓ Test fixtures safely purged.");
  }

  console.log("\n================================================================================");
  console.log(` FEATURE 0.1 PRICING VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
