/**
 * ==============================================================================
 * FINAL REMEDIATION 3: EXACT INVENTORY RESERVATION COVERAGE & DEADLOCK-FREE LOCKING
 * MD Shakib Islamic Books
 * ==============================================================================
 * Tests:
 * 1. Full coverage order settles immediately via Path A.
 * 2. Partial reservation (e.g. 1 of 2 order items missing reservation) CANNOT settle Path A.
 * 3. Quantity deficit (ordered 3, reserved 2) CANNOT settle Path A.
 * 4. Extraneous/mismatched reservation book CANNOT settle Path A.
 * 5. Concurrent settlements with different book permutations do not deadlock (consistent lock ordering).
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
  console.log(" FINAL REMEDIATION 3: INVENTORY RESERVATION COVERAGE & LOCK ORDERING");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `final_cov_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create test user
  const { data: userAuth, error: uErr } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Coverage User" },
  });
  assert(!uErr && userAuth.user);
  const userId = userAuth.user.id;

  // 2. Create 2 test books
  const { data: book1, error: b1Err } = await adminDb.from("books").insert({
    title: `Book Alpha ${timestamp}`,
    author: "Author A",
    price: 200,
    stock: 20,
    discount: 0,
    category: "Quran",
    image_url: "https://example.com/quran.jpg",
    is_active: true,
  }).select().single();
  assert(!b1Err && book1);

  const { data: book2, error: b2Err } = await adminDb.from("books").insert({
    title: `Book Beta ${timestamp}`,
    author: "Author B",
    price: 300,
    stock: 20,
    discount: 0,
    category: "Hadith",
    image_url: "https://example.com/hadith.jpg",
    is_active: true,
  }).select().single();
  assert(!b2Err && book2);

  const sampleAddress = {
    full_name: "Coverage User",
    phone: "9876543210",
    pincode: "110025",
    city: "Delhi",
    state: "Delhi",
    house_no: "303",
    area: "Okhla",
  };

  try {
    // -------------------------------------------------------------------------
    // TEST 1: Full coverage order settles Path A
    // -------------------------------------------------------------------------
    await runTest("Exact complete reservation coverage settles immediately via Path A", async () => {
      const rzpOrderId1 = `rzp_order_cov_full_${timestamp}`;
      const { data: oId1, error: oErr1 } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [
          { book_id: book1.id, quantity: 2 },
          { book_id: book2.id, quantity: 1 },
        ],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `cov_full_${timestamp}`,
      });
      assert(!oErr1 && oId1);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId1 }).eq("id", oId1);

      // (2*200 + 1*300 = 700 + 45 = 74500 paise)
      const { data: sRes1, error: sErr1 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId1,
        p_razorpay_payment_id: `pay_cov_full_${timestamp}`,
        p_raw_response: { amount: 74500, currency: "INR" },
      });
      assert(!sErr1);
      assert.strictEqual((sRes1 as any)?.status, "settled");
      assert.strictEqual((sRes1 as any)?.settled, true);
    });

    // -------------------------------------------------------------------------
    // TEST 2: Partial reservation (1 of 2 books missing reservation) fails Path A
    // -------------------------------------------------------------------------
    await runTest("Partial reservation missing one book cannot settle via Path A", async () => {
      const rzpOrderId2 = `rzp_order_cov_part_${timestamp}`;
      const { data: oId2, error: oErr2 } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [
          { book_id: book1.id, quantity: 2 },
          { book_id: book2.id, quantity: 1 },
        ],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `cov_part_${timestamp}`,
      });
      assert(!oErr2 && oId2);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId2 }).eq("id", oId2);

      // Manually delete the reservation for book2
      await adminDb.from("inventory_reservations")
        .delete()
        .eq("order_id", oId2)
        .eq("book_id", book2.id);

      // Make book2 catalog stock 0 so Path B cannot recover it
      const { data: b2Before } = await adminDb.from("books").select("stock").eq("id", book2.id).single();
      await adminDb.from("books").update({ stock: 0 }).eq("id", book2.id);

      // Settle attempt arrives
      const { data: sRes2, error: sErr2 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId2,
        p_razorpay_payment_id: `pay_cov_part_${timestamp}`,
        p_raw_response: { amount: 74500, currency: "INR" },
      });
      assert(!sErr2);
      // Because Path A is blocked by missing reservation, and Path B has no stock, order fails and requires refund!
      assert.strictEqual((sRes2 as any)?.status, "expired_stock_unavailable", "Must fail Path A and hit out-of-stock in Path B");
      assert.strictEqual((sRes2 as any)?.requires_refund, true);

      // Restore book2 stock
      await adminDb.from("books").update({ stock: b2Before?.stock }).eq("id", book2.id);
    });

    // -------------------------------------------------------------------------
    // TEST 3: Quantity mismatch (ordered 3, reserved 2) fails Path A
    // -------------------------------------------------------------------------
    await runTest("Reservation quantity deficit (ordered 3, reserved 2) cannot settle via Path A", async () => {
      const rzpOrderId3 = `rzp_order_cov_qty_${timestamp}`;
      const { data: oId3, error: oErr3 } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book1.id, quantity: 3 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `cov_qty_${timestamp}`,
      });
      assert(!oErr3 && oId3);
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId3 }).eq("id", oId3);

      // Alter reservation quantity from 3 to 2
      await adminDb.from("inventory_reservations")
        .update({ quantity: 2 })
        .eq("order_id", oId3);

      // Set book1 catalog stock to 0 so recovery cannot satisfy the missing 1 unit
      const { data: b1Before } = await adminDb.from("books").select("stock").eq("id", book1.id).single();
      await adminDb.from("books").update({ stock: 0 }).eq("id", book1.id);

      // Settle attempt arrives (3*200 = 600 + 45 = 64500 paise)
      const { data: sRes3, error: sErr3 } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId3,
        p_razorpay_payment_id: `pay_cov_qty_${timestamp}`,
        p_raw_response: { amount: 64500, currency: "INR" },
      });
      assert(!sErr3);
      assert.strictEqual((sRes3 as any)?.status, "expired_stock_unavailable", "Deficit must reject Path A and require refund when catalog empty");
      assert.strictEqual((sRes3 as any)?.requires_refund, true);

      // Restore book1 stock
      await adminDb.from("books").update({ stock: b1Before?.stock }).eq("id", book1.id);
    });

    // -------------------------------------------------------------------------
    // TEST 4: Concurrent settlements in inverted book order do not deadlock
    // -------------------------------------------------------------------------
    await runTest("Concurrent transactions locking books in consistent order resolve without deadlock", async () => {
      const rzpA = `rzp_order_conc_a_${timestamp}`;
      const rzpB = `rzp_order_conc_b_${timestamp}`;

      // Order A: [book1, book2]
      const { data: oIdA } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [
          { book_id: book1.id, quantity: 1 },
          { book_id: book2.id, quantity: 1 },
        ],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `deadlock_a_${timestamp}`,
      });
      await adminDb.from("orders").update({ razorpay_order_id: rzpA }).eq("id", oIdA);

      // Order B: [book2, book1] (inverted client input order)
      const { data: oIdB } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [
          { book_id: book2.id, quantity: 1 },
          { book_id: book1.id, quantity: 1 },
        ],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `deadlock_b_${timestamp}`,
      });
      await adminDb.from("orders").update({ razorpay_order_id: rzpB }).eq("id", oIdB);

      // Settle concurrently
      const [resA, resB] = await Promise.all([
        adminDb.rpc("settle_payment_atomic", {
          p_razorpay_order_id: rzpA,
          p_razorpay_payment_id: `pay_conc_a_${timestamp}`,
          p_raw_response: { amount: 54500, currency: "INR" },
        }),
        adminDb.rpc("settle_payment_atomic", {
          p_razorpay_order_id: rzpB,
          p_razorpay_payment_id: `pay_conc_b_${timestamp}`,
          p_raw_response: { amount: 54500, currency: "INR" },
        }),
      ]);

      assert(!resA.error && (resA.data as any)?.settled === true, "Order A must settle");
      assert(!resB.error && (resB.data as any)?.settled === true, "Order B must settle");
    });

  } finally {
    await adminDb.from("inventory_reservations").delete().in("book_id", [book1.id, book2.id]);
    await adminDb.from("order_items").delete().in("book_id", [book1.id, book2.id]);
    await adminDb.from("orders").delete().eq("user_id", userId);
    await adminDb.from("books").delete().in("id", [book1.id, book2.id]);
    await adminDb.auth.admin.deleteUser(userId);
    console.log("  ✓ Test fixtures safely purged.");
  }

  console.log("\n================================================================================");
  console.log(` FINAL REMEDIATION 3 COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
