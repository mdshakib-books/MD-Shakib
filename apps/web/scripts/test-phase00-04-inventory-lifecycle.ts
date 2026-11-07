/**
 * ==============================================================================
 * PHASE 0 — FEATURE 0.4: INVENTORY RESERVATION LIFECYCLE VERIFICATION SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. Two concurrent checkouts race for the last remaining stock unit:
 *    Exactly one succeeds, one gets Insufficient Stock. Overselling impossible.
 * 2. ONLINE checkout places item in 'reserved' state with 15-minute TTL.
 * 3. Payment settlement transitions reservation to 'committed' (no double deduction).
 * 4. Payment failure releases reservation back to catalog ('released' state).
 * 5. Order cancellation restores inventory and marks reservation 'released'.
 * 6. Expired unpaid reservation cleanup (release_expired_reservations_atomic):
 *    Restores stock, marks reservation 'expired', cancels order.
 * 7. COD checkout places item immediately in 'committed' state (no 15-minute expiry).
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
  console.log(" PHASE 0 — FEATURE 0.4: INVENTORY RESERVATION LIFECYCLE VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const emailCustA = `inv_custA_${timestamp}@example.com`;
  const emailCustB = `inv_custB_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create Customers
  const { data: authA } = await adminDb.auth.admin.createUser({
    email: emailCustA,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Alpha" },
  });
  assert(authA?.user, "Cust A creation failed");
  const custAId = authA.user.id;

  const clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientA.auth.signInWithPassword({ email: emailCustA, password: defaultPassword });

  const { data: authB } = await adminDb.auth.admin.createUser({
    email: emailCustB,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Beta" },
  });
  assert(authB?.user, "Cust B creation failed");
  const custBId = authB.user.id;

  const clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientB.auth.signInWithPassword({ email: emailCustB, password: defaultPassword });

  const sampleAddress = {
    full_name: "Test Receiver",
    phone: "9876543210",
    pincode: "110025",
    city: "New Delhi",
    state: "Delhi",
    house_no: "Flat 202",
    area: "Okhla",
  };

  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Concurrency Race Condition Prevention (Strict Row-Level Locking)
    // ----------------------------------------------------------------------------
    await runTest("Concurrent race condition: Exactly 1 checkout succeeds for last stock unit", async () => {
      // Create a book with stock = 1
      const { data: raceBook, error: bErr } = await adminDb
        .from("books")
        .insert({
          title: `Race Book ${timestamp}`,
          author: "Scholar Race",
          description: "Book with stock = 1 for concurrency test",
          price: 250.0,
          discount: 0,
          stock: 1, // Only 1 in stock!
          category: "Other",
          image_url: "https://example.com/race.jpg",
          is_active: true,
        })
        .select()
        .single();
      assert(!bErr && raceBook, `Failed to seed race book: ${bErr?.message}`);

      // Customer A and Customer B both attempt to checkout 1 unit simultaneously
      const [resA, resB] = await Promise.all([
        clientA.rpc("create_order_atomic", {
          p_user_id: custAId,
          p_items: [{ book_id: raceBook.id, quantity: 1, price: 250 }],
          p_address_snapshot: sampleAddress,
          p_payment_method: "ONLINE",
          p_idempotency_key: `race_a_${timestamp}`,
        }),
        clientB.rpc("create_order_atomic", {
          p_user_id: custBId,
          p_items: [{ book_id: raceBook.id, quantity: 1, price: 250 }],
          p_address_snapshot: sampleAddress,
          p_payment_method: "ONLINE",
          p_idempotency_key: `race_b_${timestamp}`,
        }),
      ]);

      const successCount = [resA, resB].filter((r) => !r.error && r.data).length;
      const failureCount = [resA, resB].filter((r) => r.error).length;

      assert.strictEqual(successCount, 1, "Exactly one concurrent checkout must succeed");
      assert.strictEqual(failureCount, 1, "Exactly one concurrent checkout must fail");

      // Verify final stock is exactly 0 (no negative stock, no overselling)
      const { data: bookAfter } = await adminDb
        .from("books")
        .select("stock")
        .eq("id", raceBook.id)
        .single();

      assert.strictEqual(bookAfter?.stock, 0, "Stock must be exactly 0 after 1 purchase");
    });

    // ----------------------------------------------------------------------------
    // TEST 2: ONLINE Checkout creates 'reserved' reservation with 15-minute expiry
    // ----------------------------------------------------------------------------
    let onlineOrderId: string = "";
    let onlineBookId: string = "";
    const razorpayOrderId = `order_rzp_${timestamp}`;

    await runTest("ONLINE checkout creates 'reserved' inventory reservation with 15-minute TTL", async () => {
      const { data: book } = await adminDb
        .from("books")
        .insert({
          title: `Online TTL Book ${timestamp}`,
          author: "Scholar",
          description: "TTL test book",
          price: 400.0,
          discount: 0,
          stock: 5,
          category: "Fiqh",
          image_url: "https://example.com/ttl.jpg",
          is_active: true,
        })
        .select()
        .single();
      assert(book);
      onlineBookId = book.id;

      const { data: orderId, error } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 2, price: 400 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `ttl_${timestamp}`,
      });
      assert(!error && orderId, `Online order failed: ${error?.message}`);
      onlineOrderId = orderId;

      // Attach mock Razorpay order ID to order
      await adminDb.from("orders").update({ razorpay_order_id: razorpayOrderId }).eq("id", onlineOrderId);

      // Check stock decremented to 3
      const { data: bookAfter } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bookAfter?.stock, 3);

      // Check inventory_reservations row
      const { data: reservation } = await adminDb
        .from("inventory_reservations")
        .select("*")
        .eq("order_id", onlineOrderId)
        .single();

      assert(reservation, "Reservation must exist");
      assert.strictEqual(reservation.status, "reserved");
      assert.strictEqual(reservation.payment_method, "ONLINE");
      assert.strictEqual(reservation.quantity, 2);
      assert(reservation.expires_at, "Reservation must have an expires_at timestamp");

      // Verify expires_at is roughly 15 minutes into the future
      const expiresAt = new Date(reservation.expires_at).getTime();
      const now = Date.now();
      const diffMinutes = (expiresAt - now) / (1000 * 60);
      assert(diffMinutes > 14 && diffMinutes <= 16, `Expected ~15 minutes expiry, got ${diffMinutes}m`);
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Payment settlement transitions reservation to 'committed' (no double-decrement)
    // ----------------------------------------------------------------------------
    await runTest("Payment settlement transitions reservation to 'committed' without double-decrement", async () => {
      assert(onlineOrderId);
      const stockBefore = (await adminDb.from("books").select("stock").eq("id", onlineBookId).single()).data?.stock;

      const { data: settleResult, error } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: razorpayOrderId,
        p_razorpay_payment_id: `pay_test_${timestamp}`,
        p_signature: `sig_test_${timestamp}`,
        p_raw_response: { amount: 84500 }, // 845.00 INR in paise
      });
      assert(!error && settleResult?.success, `Settle payment failed: ${error?.message}`);

      // Reservation must be 'committed'
      const { data: reservation } = await adminDb
        .from("inventory_reservations")
        .select("status")
        .eq("order_id", onlineOrderId)
        .single();
      assert.strictEqual(reservation?.status, "committed");

      // Stock must NOT be decremented again
      const stockAfter = (await adminDb.from("books").select("stock").eq("id", onlineBookId).single()).data?.stock;
      assert.strictEqual(stockAfter, stockBefore, "Stock must remain unchanged upon settlement");
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Payment failure releases reservation and restores inventory
    // ----------------------------------------------------------------------------
    await runTest("Payment failure releases reservation and restores stock to catalog", async () => {
      const { data: book } = await adminDb
        .from("books")
        .insert({
          title: `Failure Test Book ${timestamp}`,
          author: "Scholar",
          description: "Book for payment failure test",
          price: 300.0,
          discount: 0,
          stock: 10,
          category: "History",
          image_url: "https://example.com/fail.jpg",
          is_active: true,
        })
        .select()
        .single();
      assert(book);

      const rzpFailOrderId = `order_fail_rzp_${timestamp}`;

      // Create order with 3 units -> stock becomes 7
      const { data: orderId, error } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 3, price: 300 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `fail_${timestamp}`,
      });
      assert(!error && orderId);

      await adminDb.from("orders").update({ razorpay_order_id: rzpFailOrderId }).eq("id", orderId);

      const stockMid = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockMid, 7);

      // Record payment failure
      const { data: failResult, error: fErr } = await adminDb.rpc("record_payment_failure_atomic", {
        p_razorpay_order_id: rzpFailOrderId,
        p_raw_response: {
          error_code: "BAD_REQUEST_ERROR",
          error_description: "Payment failed by customer bank",
        },
      });
      assert(!fErr && failResult?.success, `Record failure failed: ${fErr?.message}`);

      // Check reservation status = 'released'
      const { data: reservation } = await adminDb
        .from("inventory_reservations")
        .select("status")
        .eq("order_id", orderId)
        .single();
      assert.strictEqual(reservation?.status, "released");

      // Check stock restored to 10
      const stockAfter = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockAfter, 10, "Stock must be restored to 10 after payment failure");

      // Check order status
      const { data: order } = await adminDb.from("orders").select("payment_status").eq("id", orderId).single();
      assert.strictEqual(order?.payment_status, "Failed");
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Order cancellation releases reservation and restores inventory
    // ----------------------------------------------------------------------------
    await runTest("Order cancellation releases reservation and restores stock", async () => {
      const { data: book } = await adminDb
        .from("books")
        .insert({
          title: `Cancel Test Book ${timestamp}`,
          author: "Scholar",
          description: "Book for cancellation test",
          price: 200.0,
          discount: 0,
          stock: 6,
          category: "Biography",
          image_url: "https://example.com/canc.jpg",
          is_active: true,
        })
        .select()
        .single();
      assert(book);

      const { data: orderId, error } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 2, price: 200 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `canc_${timestamp}`,
      });
      assert(!error && orderId);

      // Stock is 4
      const stockMid = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockMid, 4);

      // Customer cancels order
      const { data: cancelSuccess, error: cErr } = await clientA.rpc("cancel_order_atomic", {
        p_order_id: orderId,
        p_user_id: custAId,
        p_cancel_reason: "Customer changed mind",
        p_is_admin: false,
      });
      assert(!cErr && cancelSuccess, `Cancel order failed: ${cErr?.message}`);

      // Check reservation is 'released'
      const { data: reservation } = await adminDb
        .from("inventory_reservations")
        .select("status")
        .eq("order_id", orderId)
        .single();
      assert.strictEqual(reservation?.status, "released");

      // Check stock restored to 6
      const stockAfter = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockAfter, 6, "Stock must be restored to 6 after cancellation");
    });

    // ----------------------------------------------------------------------------
    // TEST 6: Expired Unpaid Reservation Cleanup (release_expired_reservations_atomic)
    // ----------------------------------------------------------------------------
    await runTest("release_expired_reservations_atomic reclaims stock for expired reservations", async () => {
      const { data: book } = await adminDb
        .from("books")
        .insert({
          title: `Expiry Test Book ${timestamp}`,
          author: "Scholar",
          description: "Book for expiration test",
          price: 150.0,
          discount: 0,
          stock: 4,
          category: "Hadith",
          image_url: "https://example.com/exp.jpg",
          is_active: true,
        })
        .select()
        .single();
      assert(book);

      const { data: orderId, error } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 2, price: 150 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `exp_${timestamp}`,
      });
      assert(!error && orderId);

      // Stock is now 2
      const stockMid = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockMid, 2);

      // Manually backdate the reservation expiry into the past (e.g. 20 minutes ago)
      await adminDb
        .from("inventory_reservations")
        .update({ expires_at: new Date(Date.now() - 20 * 60 * 1000).toISOString() })
        .eq("order_id", orderId);

      // Trigger cleanup RPC
      const { data: cleanupResult, error: rErr } = await adminDb.rpc("release_expired_reservations_atomic", {
        p_limit: 100,
      });
      assert(!rErr && cleanupResult?.success, `Cleanup RPC failed: ${rErr?.message}`);
      assert(cleanupResult.released_orders_count >= 1, `Expected at least 1 released reservation, got ${cleanupResult.released_orders_count}`);

      // Reservation must be 'expired'
      const { data: reservation } = await adminDb
        .from("inventory_reservations")
        .select("status")
        .eq("order_id", orderId)
        .single();
      assert.strictEqual(reservation?.status, "expired");

      // Stock must be restored to 4
      const stockAfter = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockAfter, 4, "Stock must be restored to 4 after expiration cleanup");

      // Order status should be Cancelled
      const { data: order } = await adminDb.from("orders").select("order_status").eq("id", orderId).single();
      assert.strictEqual(order?.order_status, "Cancelled");
    });

    // ----------------------------------------------------------------------------
    // TEST 7: COD Checkout creates immediately 'committed' reservation
    // ----------------------------------------------------------------------------
    await runTest("COD checkout immediately commits reservation (no payment expiry)", async () => {
      const { data: book } = await adminDb
        .from("books")
        .insert({
          title: `COD Book ${timestamp}`,
          author: "Scholar",
          description: "Book for COD reservation test",
          price: 500.0,
          discount: 0,
          stock: 10,
          category: "Quran",
          image_url: "https://example.com/cod.jpg",
          is_active: true,
        })
        .select()
        .single();
      assert(book);

      const { data: orderId, error } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: book.id, quantity: 1, price: 500 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "COD",
        p_idempotency_key: `cod_${timestamp}`,
      });
      assert(!error && orderId);

      // Check reservation status is 'committed'
      const { data: reservation } = await adminDb
        .from("inventory_reservations")
        .select("*")
        .eq("order_id", orderId)
        .single();

      assert(reservation);
      assert.strictEqual(reservation.status, "committed");
      assert.strictEqual(reservation.payment_method, "COD");
      assert.strictEqual(reservation.expires_at, null, "COD reservation must not have an expiry timestamp");
    });

  } finally {
    // Cleanup
    await adminDb.from("inventory_reservations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("orders").delete().in("user_id", [custAId, custBId]);
    await adminDb.from("books").delete().ilike("title", `%${timestamp}%`);
    await adminDb.auth.admin.deleteUser(custAId);
    await adminDb.auth.admin.deleteUser(custBId);
    console.log("  ✓ Test fixtures safely purged.\n");
  }

  console.log("================================================================================");
  console.log(` FEATURE 0.4 INVENTORY VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
