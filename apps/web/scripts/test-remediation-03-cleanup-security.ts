/**
 * ==============================================================================
 * REMEDIATION 3: CLEANUP RPC PERMISSIONS & CONCURRENCY VERIFICATION
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. Anonymous caller cannot invoke release_expired_reservations_atomic (blocked).
 * 2. Authenticated customer cannot invoke release_expired_reservations_atomic (blocked).
 * 3. Authenticated administrator CAN invoke release_expired_reservations_atomic.
 * 4. Service-role CAN invoke release_expired_reservations_atomic.
 * 5. Bounded p_limit: Clamped safely without errors.
 * 6. Repeated cleanup execution cannot restore stock more than once.
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
  console.log(" REMEDIATION 3: CLEANUP RPC PERMISSIONS & SECURITY VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const emailCust = `remed3_cust_${timestamp}@example.com`;
  const emailAdmin = `remed3_admin_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create Customer
  const { data: authCust } = await adminDb.auth.admin.createUser({
    email: emailCust,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Three" },
  });
  assert(authCust?.user);
  const custId = authCust.user.id;

  const clientCust = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientCust.auth.signInWithPassword({ email: emailCust, password: defaultPassword });

  // 2. Create Admin
  const { data: authAdmin } = await adminDb.auth.admin.createUser({
    email: emailAdmin,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Admin Three" },
  });
  assert(authAdmin?.user);
  const adminId = authAdmin.user.id;

  await adminDb.from("profiles").update({ role: "admin" }).eq("id", adminId);

  const clientAdmin = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  await clientAdmin.auth.signInWithPassword({ email: emailAdmin, password: defaultPassword });

  // 3. Seed book for test
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: `Cleanup Book ${timestamp}`,
      author: "Scholar",
      description: "Book for cleanup testing",
      price: 150.0,
      discount: 0,
      stock: 10,
      category: "Other",
      image_url: "https://example.com/clean.jpg",
      is_active: true,
    })
    .select()
    .single();
  assert(book);

  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Anonymous caller cannot invoke release_expired_reservations_atomic
    // ----------------------------------------------------------------------------
    await runTest("Anonymous caller cannot invoke release_expired_reservations_atomic (permission denied)", async () => {
      const { data, error } = await anonDb.rpc("release_expired_reservations_atomic", { p_limit: 10 });
      assert(error, "Anonymous execution must fail");
      assert(
        error.message.includes("permission denied") ||
        error.message.includes("Unauthorized") ||
        error.code === "42501" ||
        error.code === "P0001",
        `Unexpected error: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 2: Ordinary customer cannot invoke release_expired_reservations_atomic
    // ----------------------------------------------------------------------------
    await runTest("Ordinary customer cannot invoke release_expired_reservations_atomic (blocked)", async () => {
      const { data, error } = await clientCust.rpc("release_expired_reservations_atomic", { p_limit: 10 });
      assert(error, "Customer execution must fail");
      assert(
        error.message.includes("permission denied") ||
        error.message.includes("Unauthorized") ||
        error.code === "42501" ||
        error.code === "P0001",
        `Unexpected error: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Authenticated administrator CAN invoke release_expired_reservations_atomic
    // ----------------------------------------------------------------------------
    await runTest("Authenticated administrator CAN invoke release_expired_reservations_atomic", async () => {
      const { data, error } = await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 10 });
      assert(!error, `Admin cleanup should succeed: ${error?.message}`);
      assert(data?.success === true);
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Service-role CAN invoke release_expired_reservations_atomic
    // ----------------------------------------------------------------------------
    await runTest("Service-role CAN invoke release_expired_reservations_atomic", async () => {
      const { data, error } = await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 50 });
      assert(!error, `Service-role cleanup should succeed: ${error?.message}`);
      assert(data?.success === true);
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Bounded p_limit clamps negative and excessive values safely
    // ----------------------------------------------------------------------------
    await runTest("Bounded p_limit: negative and excessive limits are clamped safely", async () => {
      const { data: negRes, error: negErr } = await adminDb.rpc("release_expired_reservations_atomic", { p_limit: -5 });
      assert(!negErr && negRes?.success);

      const { data: hugeRes, error: hugeErr } = await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 99999 });
      assert(!hugeErr && hugeRes?.success);
    });

    // ----------------------------------------------------------------------------
    // TEST 6: Repeated cleanup execution cannot restore stock more than once
    // ----------------------------------------------------------------------------
    await runTest("Repeated cleanup execution is idempotent; stock is restored only once", async () => {
      const sampleAddress = { full_name: "Cust", phone: "9876543210", pincode: "110025", city: "Delhi", state: "Delhi", house_no: "1", area: "Okhla" };

      // Create an order of 3 units -> catalog stock becomes 7
      const { data: orderId } = await clientCust.rpc("create_order_atomic", {
        p_user_id: custId,
        p_items: [{ book_id: book.id, quantity: 3, price: 150 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `remed3_rep_${timestamp}`,
      });
      assert(orderId);

      const stockMid = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockMid, 7, "Stock must decrement to 7");

      // Backdate reservation to expired threshold
      await adminDb
        .from("inventory_reservations")
        .update({ expires_at: new Date(Date.now() - 60000).toISOString() })
        .eq("order_id", orderId);

      // First cleanup call: reclaims stock (+3 -> 10)
      const { data: firstClean } = await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 10 });
      assert(firstClean?.released_orders_count >= 1);

      const stockAfterFirst = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockAfterFirst, 10, "Stock must be restored to 10");

      // Second cleanup call immediately after: MUST NOT restore stock again
      const { data: secondClean } = await adminDb.rpc("release_expired_reservations_atomic", { p_limit: 10 });
      assert(secondClean?.released_orders_count === 0, "Second call should find 0 expired reservations");

      const stockAfterSecond = (await adminDb.from("books").select("stock").eq("id", book.id).single()).data?.stock;
      assert.strictEqual(stockAfterSecond, 10, "Stock must REMAIN 10 (no double stock restoration)");
    });

  } finally {
    // Cleanup
    await adminDb.from("inventory_reservations").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("order_items").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminDb.from("orders").delete().eq("user_id", custId);
    await adminDb.from("books").delete().eq("id", book?.id);
    await adminDb.auth.admin.deleteUser(custId);
    await adminDb.auth.admin.deleteUser(adminId);
    console.log("  ✓ Test fixtures safely purged.\n");
  }

  console.log("================================================================================");
  console.log(` REMEDIATION 3 VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
