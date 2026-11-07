/**
 * ==============================================================================
 * FINAL REMEDIATION 4: IDEMPOTENCY KEY BOUND TO REQUEST FINGERPRINT
 * MD Shakib Islamic Books
 * ==============================================================================
 * Tests:
 * 1. Identical request retry returns existing order without re-decrementing stock.
 * 2. Reusing same key with changed book quantities is explicitly rejected.
 * 3. Reusing same key with changed delivery address is explicitly rejected.
 * 4. Reusing same key with changed payment method (e.g. COD vs ONLINE) is rejected.
 * 5. Concurrent duplicate requests with identical key return the exact same order safely.
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
  console.log(" FINAL REMEDIATION 4: IDEMPOTENCY FINGERPRINT ENFORCEMENT");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const testEmail = `final_idemp_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create test user
  const { data: userAuth, error: uErr } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Idempotency User" },
  });
  assert(!uErr && userAuth.user);
  const userId = userAuth.user.id;

  // 2. Create test book
  const { data: book, error: bErr } = await adminDb.from("books").insert({
    title: `Fingerprint Test Book ${timestamp}`,
    author: "Test Author",
    price: 350,
    stock: 50,
    discount: 0,
    category: "Fiqh",
    image_url: "https://example.com/fiqh.jpg",
    is_active: true,
  }).select().single();
  assert(!bErr && book);

  const addressOriginal = {
    full_name: "Idempotency User",
    phone: "9876543210",
    pincode: "110025",
    city: "Delhi",
    state: "Delhi",
    house_no: "101",
    area: "Okhla",
  };

  const addressModified = {
    full_name: "Idempotency User",
    phone: "9876543210",
    pincode: "560001",
    city: "Bengaluru",
    state: "Karnataka",
    house_no: "999",
    area: "MG Road",
  };

  try {
    const testKey1 = `idemp_fingerprint_${timestamp}_1`;
    let originalOrderId: string;

    // -------------------------------------------------------------------------
    // TEST 1: Identical retry returns existing order
    // -------------------------------------------------------------------------
    await runTest("Identical request retry returns existing order ID without re-decrementing stock", async () => {
      const { data: oId1, error: oErr1 } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 2 }],
        p_address_snapshot: addressOriginal,
        p_payment_method: "ONLINE",
        p_idempotency_key: testKey1,
      });
      assert(!oErr1 && oId1);
      originalOrderId = oId1 as string;

      const { data: bAfter1 } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bAfter1?.stock, 48, "Stock must decrement from 50 to 48");

      // Retry with EXACT SAME parameters
      const { data: retryId, error: rErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 2 }],
        p_address_snapshot: addressOriginal,
        p_payment_method: "ONLINE",
        p_idempotency_key: testKey1,
      });
      assert(!rErr);
      assert.strictEqual(retryId, originalOrderId, "Must return existing order ID");

      const { data: bAfterRetry } = await adminDb.from("books").select("stock").eq("id", book.id).single();
      assert.strictEqual(bAfterRetry?.stock, 48, "Stock must remain 48 without double deduction");
    });

    // -------------------------------------------------------------------------
    // TEST 2: Reusing key with changed quantities is rejected
    // -------------------------------------------------------------------------
    await runTest("Reusing key with changed item quantity is rejected with idempotency conflict", async () => {
      const { data: conflictRes, error: conflictErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 5 }], // Changed from 2 to 5
        p_address_snapshot: addressOriginal,
        p_payment_method: "ONLINE",
        p_idempotency_key: testKey1,
      });
      assert(conflictErr, "Must reject request when quantities change under same key");
      assert.ok(conflictErr.message.includes("Idempotency conflict"), conflictErr.message);
    });

    // -------------------------------------------------------------------------
    // TEST 3: Reusing key with changed address is rejected
    // -------------------------------------------------------------------------
    await runTest("Reusing key with changed delivery address is rejected with idempotency conflict", async () => {
      const { data: conflictRes, error: conflictErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 2 }],
        p_address_snapshot: addressModified, // Changed address
        p_payment_method: "ONLINE",
        p_idempotency_key: testKey1,
      });
      assert(conflictErr, "Must reject request when address changes under same key");
      assert.ok(conflictErr.message.includes("Idempotency conflict"), conflictErr.message);
    });

    // -------------------------------------------------------------------------
    // TEST 4: Reusing key with changed payment method is rejected
    // -------------------------------------------------------------------------
    await runTest("Reusing key with changed payment method (COD vs ONLINE) is rejected", async () => {
      const { data: conflictRes, error: conflictErr } = await adminDb.rpc("create_order_atomic", {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 2 }],
        p_address_snapshot: addressOriginal,
        p_payment_method: "COD", // Changed from ONLINE to COD
        p_idempotency_key: testKey1,
      });
      assert(conflictErr, "Must reject request when payment method changes under same key");
      assert.ok(conflictErr.message.includes("Idempotency conflict"), conflictErr.message);
    });

    // -------------------------------------------------------------------------
    // TEST 5: Concurrent duplicate requests return exact same order
    // -------------------------------------------------------------------------
    await runTest("Concurrent duplicate requests with identical key return same order safely", async () => {
      const concKey = `idemp_conc_${timestamp}`;
      const payload = {
        p_user_id: userId,
        p_items: [{ book_id: book.id, quantity: 1 }],
        p_address_snapshot: addressOriginal,
        p_payment_method: "ONLINE",
        p_idempotency_key: concKey,
      };

      const stockBefore = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock || 0;

      const promises = Array.from({ length: 4 }).map(() =>
        adminDb.rpc("create_order_atomic", payload)
      );

      const responses = await Promise.all(promises);
      const orderIds = responses.map((r) => r.data).filter(Boolean);

      assert.strictEqual(orderIds.length, 4, "All 4 concurrent calls must return an order ID");
      const uniqueIds = new Set(orderIds);
      assert.strictEqual(uniqueIds.size, 1, "All 4 concurrent calls must return the EXACT same order ID");

      const stockAfter = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock || 0;
      assert.strictEqual(stockAfter, stockBefore - 1, "Stock must decrement by exactly 1 unit across all 4 requests");
    });

  } finally {
    await adminDb.from("order_idempotency_keys").delete().eq("user_id", userId);
    await adminDb.from("inventory_reservations").delete().in("book_id", [book.id]);
    await adminDb.from("order_items").delete().in("book_id", [book.id]);
    await adminDb.from("orders").delete().eq("user_id", userId);
    await adminDb.from("books").delete().eq("id", book.id);
    await adminDb.auth.admin.deleteUser(userId);
    console.log("  ✓ Test fixtures safely purged.");
  }

  console.log("\n================================================================================");
  console.log(` FINAL REMEDIATION 4 COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");
}

main().catch((err) => {
  console.error("Unhandled error:", err);
  process.exit(1);
});
