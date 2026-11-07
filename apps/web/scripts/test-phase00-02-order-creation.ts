/**
 * ==============================================================================
 * PHASE 0 — FEATURE 0.2: ORDER CREATION SECURITY VERIFICATION SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests:
 * 1. Anonymous user attempts direct order insertion -> Rejected by RLS.
 * 2. Authenticated customer attempts direct order insertion -> Rejected by RLS.
 * 3. Authenticated customer attempts direct order_items insertion -> Rejected by RLS.
 * 4. User attempts to create order for another user via create_order_atomic -> Rejected.
 * 5. User attempts direct UPDATE on order (status, payment_status, total_amount) -> Rejected by RLS.
 * 6. User attempts direct UPDATE on order_items -> Rejected by RLS.
 * 7. Transaction atomicity: Invalid stock or book failure rolls back entire order.
 * 8. Legitimate customer checkout via create_order_atomic succeeds.
 * 9. Customer cannot read other customers' orders -> Enforced by SELECT RLS.
 * 10. Admin can read and manage all orders -> Admin workflow preserved.
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
  console.log(" PHASE 0 — FEATURE 0.2: ORDER CREATION SECURITY VERIFICATION");
  console.log("================================================================================\n");

  const timestamp = Date.now();
  const emailCustA = `ordsec_a_${timestamp}@example.com`;
  const emailCustB = `ordsec_b_${timestamp}@example.com`;
  const emailAdmin = `ordsec_admin_${timestamp}@example.com`;
  const defaultPassword = "SecurePassword123!";

  // 1. Create Customer A
  const { data: authA, error: errA } = await adminDb.auth.admin.createUser({
    email: emailCustA,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Alpha" },
  });
  assert(!errA && authA.user, `Customer A creation failed: ${errA?.message}`);
  const custAId = authA.user.id;

  const clientA = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionA } = await clientA.auth.signInWithPassword({
    email: emailCustA,
    password: defaultPassword,
  });
  assert(sessionA.session, "Customer A login failed");

  // 2. Create Customer B
  const { data: authB, error: errB } = await adminDb.auth.admin.createUser({
    email: emailCustB,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Customer Beta" },
  });
  assert(!errB && authB.user, `Customer B creation failed: ${errB?.message}`);
  const custBId = authB.user.id;

  const clientB = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionB } = await clientB.auth.signInWithPassword({
    email: emailCustB,
    password: defaultPassword,
  });
  assert(sessionB.session, "Customer B login failed");

  // 3. Create Admin
  const { data: authAdmin, error: errAdmin } = await adminDb.auth.admin.createUser({
    email: emailAdmin,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Security Admin" },
  });
  assert(!errAdmin && authAdmin.user, `Admin creation failed: ${errAdmin?.message}`);
  const adminId = authAdmin.user.id;

  await adminDb.from("profiles").update({ role: "admin" }).eq("id", adminId);

  const clientAdmin = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const { data: sessionAdmin } = await clientAdmin.auth.signInWithPassword({
    email: emailAdmin,
    password: defaultPassword,
  });
  assert(sessionAdmin.session, "Admin login failed");

  // 4. Seed a test book
  const { data: testBook, error: bErr } = await adminDb
    .from("books")
    .insert({
      title: `Order Security Book ${timestamp}`,
      author: "Imam Bukhari",
      description: "Book for order security testing",
      price: 350.0,
      discount: 0,
      stock: 10,
      category: "Hadith",
      image_url: "https://example.com/bukhari.jpg",
      is_active: true,
    })
    .select()
    .single();
  assert(!bErr && testBook, `Failed to seed test book: ${bErr?.message}`);

  const sampleAddress = {
    full_name: "Test User",
    phone: "9876543210",
    pincode: "110025",
    city: "New Delhi",
    state: "Delhi",
    house_no: "Flat 101",
    area: "Jamia Nagar",
  };

  try {
    // ----------------------------------------------------------------------------
    // TEST 1: Anonymous direct order INSERT
    // ----------------------------------------------------------------------------
    await runTest("Anonymous user cannot directly INSERT into orders table (RLS blocked)", async () => {
      const { data, error } = await anonDb.from("orders").insert({
        user_id: custAId,
        order_status: "Confirmed",
        payment_status: "Paid",
        payment_method: "ONLINE",
        total_amount: 1.0,
        address_snapshot: sampleAddress,
      });

      assert(error, "Anonymous direct INSERT should have failed RLS policy");
      assert(
        error.message.includes("violates row-level security") ||
        error.code === "42501",
        `Expected RLS error, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 2: Authenticated customer direct order INSERT
    // ----------------------------------------------------------------------------
    await runTest("Authenticated customer cannot directly INSERT into orders table (RLS blocked)", async () => {
      const { data, error } = await clientA.from("orders").insert({
        user_id: custAId,
        order_status: "Confirmed",
        payment_status: "Paid",
        payment_method: "ONLINE",
        total_amount: 5.0,
        address_snapshot: sampleAddress,
      });

      assert(error, "Customer direct INSERT should have failed RLS policy");
      assert(
        error.message.includes("violates row-level security") ||
        error.code === "42501",
        `Expected RLS error, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 3: Authenticated customer direct order_items INSERT
    // ----------------------------------------------------------------------------
    await runTest("Authenticated customer cannot directly INSERT into order_items table (RLS blocked)", async () => {
      const dummyOrderId = "00000000-0000-0000-0000-000000000001";
      const { data, error } = await clientA.from("order_items").insert({
        order_id: dummyOrderId,
        book_id: testBook.id,
        quantity: 1,
        price: 1.0,
      });

      assert(error, "Customer direct INSERT to order_items should have failed RLS");
      assert(
        error.message.includes("violates row-level security") ||
        error.code === "42501",
        `Expected RLS error, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 4: Identity Spoofing: Customer A tries to create order for Customer B
    // ----------------------------------------------------------------------------
    await runTest("Customer cannot create order for another user via create_order_atomic", async () => {
      const { data, error } = await clientA.rpc("create_order_atomic", {
        p_user_id: custBId, // Spoofing Customer B
        p_items: [{ book_id: testBook.id, quantity: 1, price: 350 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "COD",
        p_idempotency_key: `spoof_${timestamp}`,
      });

      assert(error, "Identity spoofing should have been rejected by RPC");
      assert(
        error.message.includes("Unauthorized order placement") ||
        error.message.includes("Unauthorized") ||
        error.code === "P0001",
        `Expected authorization error, got: ${error.message}`
      );
    });

    // ----------------------------------------------------------------------------
    // TEST 5: Legitimate Order Placement via create_order_atomic
    // ----------------------------------------------------------------------------
    let legitimateOrderId: string = "";
    await runTest("Legitimate customer creates order via trusted create_order_atomic", async () => {
      const { data, error } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: testBook.id, quantity: 2, price: 350 }],
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `legit_${timestamp}`,
      });

      assert(!error && data, `Legitimate order failed: ${error?.message}`);
      legitimateOrderId = data;

      // Verify created order exists and has correct authoritative amounts
      const { data: order } = await adminDb
        .from("orders")
        .select("id, user_id, total_amount, subtotal, order_status, payment_status")
        .eq("id", legitimateOrderId)
        .single();

      assert.strictEqual(order?.user_id, custAId);
      assert.strictEqual(order?.order_status, "Pending");
      assert.strictEqual(order?.payment_status, "Pending");
      // 2 * 350 = 700 + 45 fees = 745
      assert.strictEqual(Number(order?.subtotal), 700.0);
      assert.strictEqual(Number(order?.total_amount), 745.0);

      // Verify order items were created atomically
      const { data: items } = await adminDb
        .from("order_items")
        .select("*")
        .eq("order_id", legitimateOrderId);

      assert.strictEqual(items?.length, 1);
      assert.strictEqual(items[0].book_id, testBook.id);
      assert.strictEqual(items[0].quantity, 2);
      assert.strictEqual(Number(items[0].price), 350.0);
    });

    // ----------------------------------------------------------------------------
    // TEST 6: Customer attempts direct UPDATE on order (manipulate status or totals)
    // ----------------------------------------------------------------------------
    await runTest("Customer cannot directly UPDATE order status, payment status, or totals", async () => {
      assert(legitimateOrderId, "Legitimate order required");
      const { data, error } = await clientA
        .from("orders")
        .update({
          order_status: "Delivered",
          payment_status: "Paid",
          total_amount: 1.0,
        })
        .eq("id", legitimateOrderId);

      // Either error or 0 rows modified due to RLS
      const { data: orderAfter } = await adminDb
        .from("orders")
        .select("order_status, payment_status, total_amount")
        .eq("id", legitimateOrderId)
        .single();

      assert.strictEqual(orderAfter?.order_status, "Pending", "Order status must remain Pending");
      assert.strictEqual(orderAfter?.payment_status, "Pending", "Payment status must remain Pending");
      assert.strictEqual(Number(orderAfter?.total_amount), 745.0, "Total amount must remain 745.00");
    });

    // ----------------------------------------------------------------------------
    // TEST 7: Customer attempts direct UPDATE on order_items
    // ----------------------------------------------------------------------------
    await runTest("Customer cannot directly UPDATE order_items (RLS blocked)", async () => {
      assert(legitimateOrderId, "Legitimate order required");
      const { data, error } = await clientA
        .from("order_items")
        .update({ price: 0.01, quantity: 100 })
        .eq("order_id", legitimateOrderId);

      const { data: itemsAfter } = await adminDb
        .from("order_items")
        .select("price, quantity")
        .eq("order_id", legitimateOrderId);

      assert.strictEqual(Number(itemsAfter?.[0]?.price), 350.0);
      assert.strictEqual(itemsAfter?.[0]?.quantity, 2);
    });

    // ----------------------------------------------------------------------------
    // TEST 8: Customer B cannot SELECT Customer A's order
    // ----------------------------------------------------------------------------
    await runTest("Customer B cannot view Customer A's order (RLS SELECT isolation)", async () => {
      assert(legitimateOrderId, "Legitimate order required");
      const { data, error } = await clientB
        .from("orders")
        .select("id, total_amount")
        .eq("id", legitimateOrderId);

      // Customer B should see 0 rows
      assert(!error, `Unexpected error: ${error?.message}`);
      assert.strictEqual(data?.length, 0, "Customer B should not be able to read Customer A's order");
    });

    // ----------------------------------------------------------------------------
    // TEST 9: Admin can view and manage Customer A's order
    // ----------------------------------------------------------------------------
    await runTest("Admin can view Customer A's order (Admin SELECT preserved)", async () => {
      assert(legitimateOrderId, "Legitimate order required");
      const { data, error } = await clientAdmin
        .from("orders")
        .select("id, total_amount")
        .eq("id", legitimateOrderId)
        .single();

      assert(!error && data, `Admin should be able to view order: ${error?.message}`);
      assert.strictEqual(data?.id, legitimateOrderId);
    });

    // ----------------------------------------------------------------------------
    // TEST 10: Atomic rollback when order item validation fails (exceeds stock)
    // ----------------------------------------------------------------------------
    await runTest("Atomic rollback: Order creation rolls back cleanly when stock is insufficient", async () => {
      const ordersCountBefore = (await adminDb.from("orders").select("id", { count: "exact", head: true })).count || 0;
      const orderItemsCountBefore = (await adminDb.from("order_items").select("id", { count: "exact", head: true })).count || 0;

      const { data, error } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: testBook.id, quantity: 50, price: 350 }], // Exceeds available stock (8)
        p_address_snapshot: sampleAddress,
        p_payment_method: "ONLINE",
        p_idempotency_key: `rollback_${timestamp}`,
      });

      assert(error, "Order placement with excessive quantity must fail");
      assert(
        error.message.includes("Insufficient stock") ||
        error.message.includes("exceeds available stock"),
        `Expected insufficient stock error, got: ${error.message}`
      );

      // Verify no orphan records in orders or order_items
      const ordersCountAfter = (await adminDb.from("orders").select("id", { count: "exact", head: true })).count || 0;
      const orderItemsCountAfter = (await adminDb.from("order_items").select("id", { count: "exact", head: true })).count || 0;

      assert.strictEqual(ordersCountAfter, ordersCountBefore, "No partial orders should be inserted");
      assert.strictEqual(orderItemsCountAfter, orderItemsCountBefore, "No partial order items should be inserted");
    });

  } finally {
    // Cleanup
    await adminDb.from("order_items").delete().eq("book_id", testBook?.id);
    await adminDb.from("inventory_reservations").delete().eq("book_id", testBook?.id);
    await adminDb.from("orders").delete().eq("user_id", custAId);
    await adminDb.from("orders").delete().eq("user_id", custBId);
    await adminDb.from("books").delete().eq("id", testBook?.id);
    await adminDb.auth.admin.deleteUser(custAId);
    await adminDb.auth.admin.deleteUser(custBId);
    await adminDb.auth.admin.deleteUser(adminId);
    console.log("  ✓ Test fixtures safely purged.\n");
  }

  console.log("================================================================================");
  console.log(` FEATURE 0.2 ORDER CREATION VERIFICATION COMPLETE: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
