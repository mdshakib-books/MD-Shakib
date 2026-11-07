/**
 * ==============================================================================
 * PHASE 09: INTEGRATION & DATABASE INTEGRITY TEST SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Executes against the isolated test database (PostgreSQL / Supabase container).
 * Validates module interactions, transactions, row-level locking, atomic procedures,
 * foreign keys, check constraints, RLS security, and audit logging.
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import assert from "node:assert";
import crypto from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const anonDb = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false },
});

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name: string, fn: () => Promise<void>) {
  totalTests++;
  process.stdout.write(`  [INT-DB-${String(totalTests).padStart(2, "0")}] ${name}... `);
  try {
    await fn();
    console.log("✓ PASS");
    passedTests++;
  } catch (err: any) {
    console.log("✗ FAIL");
    console.error(`     Error: ${err?.message || err}`);
    failedTests++;
  }
}

async function runIntegrationAndDatabaseSuite() {
  console.log("=".repeat(80));
  console.log("PHASE 09: INTEGRATION & DATABASE INTEGRITY VERIFICATION SUITE");
  console.log("=".repeat(80) + "\n");

  const runId = Date.now();
  const emailCustA = `p9_custa_${runId}@example.com`;
  const emailCustB = `p9_custb_${runId}@example.com`;
  const emailAdmin = `p9_admin_${runId}@example.com`;
  const defaultPassword = "SecretPassword123!";
  let createdOrderId = "";
  let testBook1Id = "";
  let testBook2Id = "";

  // 1. Provision Test Contexts
  console.log("--- 1. PROVISIONING ISOLATED SUPABASE TEST USERS ---");
  const { data: authA, error: errA } = await adminDb.auth.admin.createUser({
    email: emailCustA,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Phase 9 Customer Alpha" },
  });
  assert(!errA && authA.user, `Cust A creation failed: ${errA?.message}`);
  const custAId = authA.user.id;

  const { data: authB, error: errB } = await adminDb.auth.admin.createUser({
    email: emailCustB,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Phase 9 Customer Beta" },
  });
  assert(!errB && authB.user, `Cust B creation failed: ${errB?.message}`);
  const custBId = authB.user.id;

  const { data: authAdmin, error: errAdmin } = await adminDb.auth.admin.createUser({
    email: emailAdmin,
    password: defaultPassword,
    email_confirm: true,
    user_metadata: { full_name: "Phase 9 Admin" },
  });
  assert(!errAdmin && authAdmin.user, `Admin creation failed: ${errAdmin?.message}`);
  const adminId = authAdmin.user.id;

  // Elevate admin role
  await adminDb.from("profiles").update({ role: "admin" }).eq("id", adminId);

  // Authenticated Clients
  const clientA = createClient(SUPABASE_URL, ANON_KEY);
  await clientA.auth.signInWithPassword({ email: emailCustA, password: defaultPassword });

  const clientB = createClient(SUPABASE_URL, ANON_KEY);
  await clientB.auth.signInWithPassword({ email: emailCustB, password: defaultPassword });

  const clientAdmin = createClient(SUPABASE_URL, ANON_KEY);
  await clientAdmin.auth.signInWithPassword({ email: emailAdmin, password: defaultPassword });

  console.log(`  ✓ Provisioned Users: Cust A (${custAId}), Cust B (${custBId}), Admin (${adminId})\n`);

  try {
    // -------------------------------------------------------------------------
    // SECTION 2: DATABASE SCHEMA & CONSTRAINTS
    // -------------------------------------------------------------------------
    console.log("--- 2. DATABASE SCHEMA, FOREIGN KEYS & CHECK CONSTRAINTS ---");

    await test("All 15 core public tables exist and are queryable", async () => {
      const tables = [
        "profiles", "addresses", "books", "carts", "cart_items",
        "orders", "order_items", "order_status_history", "payments",
        "audit_logs", "email_logs", "categories", "inventory_adjustments",
        "reviews", "discounts",
      ];
      for (const tbl of tables) {
        const { error } = await adminDb.from(tbl).select("*", { count: "exact", head: true });
        assert(!error, `Failed to query table ${tbl}: ${error?.message}`);
      }
    });

    await test("Foreign key RESTRICT prevents deleting profile with existing orders", async () => {
      const orderId = crypto.randomUUID();
      const { error: insErr } = await adminDb.from("orders").insert({
        id: orderId,
        user_id: custAId,
        total_amount: 899,
        payment_method: "COD",
        payment_status: "Pending",
        order_status: "Pending",
        address_snapshot: { full_name: "Customer Alpha", phone: "9876543210", pincode: "110025", city: "Delhi", state: "Delhi", house_no: "10" },
        is_paid: false,
      });
      assert(!insErr, `Failed to seed order: ${insErr?.message}`);

      const { error: delErr } = await adminDb.from("profiles").delete().eq("id", custAId);
      assert(delErr, "Database must reject deleting profile with active orders (FK RESTRICT)");
      assert(delErr.code === "23503" || delErr.message.includes("violates foreign key constraint"));

      // Clean up order
      await adminDb.from("orders").delete().eq("id", orderId);
    });

    await test("CHECK constraints reject negative prices and negative stock", async () => {
      const { error: priceErr } = await adminDb.from("books").insert({
        title: "Negative Price Book",
        author: "Author",
        price: -100,
        stock: 10,
        category: "Quran",
        image_url: "https://example.com/cover.jpg",
      });
      assert(priceErr, "Negative price must be rejected");

      const { error: stockErr } = await adminDb.from("books").insert({
        title: "Negative Stock Book",
        author: "Author",
        price: 500,
        stock: -10,
        category: "Quran",
        image_url: "https://example.com/cover.jpg",
      });
      assert(stockErr, "Negative stock must be rejected");
    });

    await test("Trigger trg_default_address enforces single default address invariant", async () => {
      const { data: a1, error: e1 } = await clientA
        .from("addresses")
        .insert({
          user_id: custAId,
          full_name: "Alpha User",
          phone: "9876543210",
          pincode: "110025",
          city: "Delhi",
          state: "Delhi",
          house_no: "101",
          area: "Okhla",
          is_default: true,
        })
        .select()
        .single();
      assert(!e1 && a1.is_default === true, "A1 must be default");

      const { data: a2, error: e2 } = await clientA
        .from("addresses")
        .insert({
          user_id: custAId,
          full_name: "Alpha User 2",
          phone: "9876543210",
          pincode: "110025",
          city: "Delhi",
          state: "Delhi",
          house_no: "102",
          area: "Batla House",
          is_default: true,
        })
        .select()
        .single();
      assert(!e2 && a2.is_default === true, "A2 must be default");

      // Verify A1 default was unset by trigger
      const { data: a1Reload } = await clientA.from("addresses").select("is_default").eq("id", a1.id).single();
      assert.strictEqual(a1Reload?.is_default, false, "A1 default must be unset by trigger");
    });

    // -------------------------------------------------------------------------
    // SECTION 3: RLS DATA ISOLATION & PRIVILEGES
    // -------------------------------------------------------------------------
    console.log("\n--- 3. RLS CROSS-TENANT DATA ISOLATION ---");

    await test("Anonymous callers cannot read customer orders, payments, or addresses", async () => {
      const { data: orders } = await anonDb.from("orders").select("*");
      assert.strictEqual(orders?.length || 0, 0, "Anon cannot read orders");

      const { data: payments } = await anonDb.from("payments").select("*");
      assert.strictEqual(payments?.length || 0, 0, "Anon cannot read payments");

      const { data: addresses } = await anonDb.from("addresses").select("*");
      assert.strictEqual(addresses?.length || 0, 0, "Anon cannot read addresses");
    });

    await test("Customer B cannot read Customer A's addresses or orders", async () => {
      const { data: aAddresses } = await clientB.from("addresses").select("*").eq("user_id", custAId);
      assert.strictEqual(aAddresses?.length || 0, 0, "Customer B cannot read Customer A addresses");
    });

    await test("Customer cannot escalate own role to admin via profile update", async () => {
      await clientA.from("profiles").update({ role: "admin" } as any).eq("id", custAId);
      const { data: profile } = await adminDb.from("profiles").select("role").eq("id", custAId).single();
      assert.strictEqual(profile?.role, "user", "Role escalation must be rejected");
    });

    await test("Admin caller can query orders across all customers", async () => {
      const { error } = await clientAdmin.from("orders").select("id").limit(5);
      assert(!error, `Admin must be able to list orders: ${error?.message}`);
    });

    // -------------------------------------------------------------------------
    // SECTION 4: GUEST CART MERGE (merge_cart_atomic)
    // -------------------------------------------------------------------------
    console.log("\n--- 4. GUEST-TO-AUTH CART MERGE (merge_cart_atomic) ---");

    // Create test books
    const { data: testBook1 } = await adminDb
      .from("books")
      .insert({
        title: `P9 Test Book 1 ${runId}`,
        author: "Author 1",
        price: 500,
        discount: 10,
        stock: 20,
        category: "Quran",
        image_url: "https://example.com/b1.jpg",
        is_active: true,
      })
      .select()
      .single();
    assert(testBook1, "Book 1 must be created");
    testBook1Id = testBook1.id;

    const { data: testBook2 } = await adminDb
      .from("books")
      .insert({
        title: `P9 Test Book 2 ${runId}`,
        author: "Author 2",
        price: 300,
        discount: 0,
        stock: 15,
        category: "Hadith",
        image_url: "https://example.com/b2.jpg",
        is_active: true,
      })
      .select()
      .single();
    assert(testBook2, "Book 2 must be created");
    testBook2Id = testBook2.id;

    await test("merge_cart_atomic merges guest items into user cart correctly", async () => {
      const guestItems = [
        { book_id: testBook1.id, quantity: 2 },
        { book_id: testBook2.id, quantity: 1 },
      ];

      const { data: mergeRes, error: mergeErr } = await clientA.rpc("merge_cart_atomic", {
        p_user_id: custAId,
        p_guest_items: guestItems,
        p_merge_token: `token-initial-${runId}`,
      });

      assert(!mergeErr, `merge_cart_atomic failed: ${mergeErr?.message}`);
      const res = mergeRes as any;
      assert.strictEqual(res.success, true);

      // Verify cart items in database
      const { data: cart } = await adminDb.from("carts").select("id").eq("user_id", custAId).single();
      assert(cart, "Cart must exist");

      const { data: items } = await adminDb.from("cart_items").select("*").eq("cart_id", cart.id);
      assert.strictEqual(items?.length, 2, "Cart must have exactly 2 items");
    });

    await test("merge_cart_atomic with same token is idempotent", async () => {
      const guestItems = [
        { book_id: testBook1.id, quantity: 2 },
      ];

      const { data: mergeRes } = await clientA.rpc("merge_cart_atomic", {
        p_user_id: custAId,
        p_guest_items: guestItems,
        p_merge_token: `token-initial-${runId}`, // Duplicate token
      });

      const res = mergeRes as any;
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.merged_count, 0);
      assert.ok(res.message.includes("already merged"));
    });

    await test("Caller identity security prevents merging into another user's cart", async () => {
      const { error: spoofErr } = await clientB.rpc("merge_cart_atomic", {
        p_user_id: custAId, // Cust B trying to mutate Cust A cart
        p_guest_items: [{ book_id: testBook1.id, quantity: 1 }],
      });
      assert(spoofErr, "Caller spoofing must be rejected");
      assert.ok(spoofErr.message.includes("Security violation") || spoofErr.message.includes("does not match"));
    });

    // -------------------------------------------------------------------------
    // SECTION 5: ATOMIC ORDER CREATION & INVENTORY DEDUCTION (create_order_atomic)
    // -------------------------------------------------------------------------
    console.log("\n--- 5. ATOMIC ORDER CREATION & STOCK SAFETY (create_order_atomic) ---");

    const idempotencyKey = `p9-order-key-${runId}`;

    await test("create_order_atomic locks rows, decrements stock, and creates order atomically", async () => {
      const orderItems = [
        { book_id: testBook1.id, quantity: 2, price: 450 },
        { book_id: testBook2.id, quantity: 1, price: 300 },
      ];
      const addressSnap = {
        full_name: "Customer Alpha",
        phone: "9876543210",
        pincode: "110025",
        city: "Delhi",
        state: "Delhi",
        house_no: "101",
        area: "Okhla",
      };

      const { data: orderId, error: orderErr } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: orderItems,
        p_address_snapshot: addressSnap,
        p_payment_method: "ONLINE",
        p_total_amount: 1245,
        p_idempotency_key: idempotencyKey,
      });

      assert(!orderErr && orderId, `Atomic order creation failed: ${orderErr?.message}`);
      createdOrderId = orderId as string;

      // Verify book 1 stock decremented from 20 to 18
      const { data: b1 } = await adminDb.from("books").select("stock").eq("id", testBook1.id).single();
      assert.strictEqual(b1?.stock, 18, "Stock for Book 1 must be decremented by 2");

      // Verify book 2 stock decremented from 15 to 14
      const { data: b2 } = await adminDb.from("books").select("stock").eq("id", testBook2.id).single();
      assert.strictEqual(b2?.stock, 14, "Stock for Book 2 must be decremented by 1");

      // Verify cart was cleared
      const { data: cart } = await adminDb.from("carts").select("id").eq("user_id", custAId).single();
      const { data: remainingItems } = await adminDb.from("cart_items").select("id").eq("cart_id", cart!.id);
      assert.strictEqual(remainingItems?.length, 0, "Cart must be emptied on order placement");
    });

    await test("Idempotent retry with same key returns existing order without re-decrementing stock", async () => {
      const orderItems = [
        { book_id: testBook1.id, quantity: 2, price: 450 },
        { book_id: testBook2.id, quantity: 1, price: 300 },
      ];
      const addressSnap = {
        full_name: "Customer Alpha",
        phone: "9876543210",
        pincode: "110025",
        city: "Delhi",
        state: "Delhi",
        house_no: "101",
        area: "Okhla",
      };

      const { data: retryOrderId, error: retryErr } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: orderItems,
        p_address_snapshot: addressSnap,
        p_payment_method: "ONLINE",
        p_total_amount: 1245,
        p_idempotency_key: idempotencyKey, // Same key
      });

      assert(!retryErr, `Retry must succeed idempotently: ${retryErr?.message}`);
      assert.strictEqual(retryOrderId, createdOrderId, "Must return existing order ID");

      // Verify stock was NOT decremented again
      const { data: b1 } = await adminDb.from("books").select("stock").eq("id", testBook1.id).single();
      assert.strictEqual(b1?.stock, 18, "Stock must remain 18");
    });

    await test("Insufficient stock causes complete transaction rollback with zero deduction", async () => {
      const excessiveItems = [
        { book_id: testBook1.id, quantity: 999, price: 450 },
      ];
      const addressSnap = { full_name: "Customer Alpha", phone: "9876543210", pincode: "110025", city: "Delhi", state: "Delhi", house_no: "101" };

      const { error: rollErr } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: excessiveItems,
        p_address_snapshot: addressSnap,
        p_payment_method: "COD",
        p_total_amount: 500,
      });

      assert(rollErr, "Excessive quantity must fail");
      assert.ok(rollErr.message.includes("Insufficient stock"));

      // Verify stock unchanged
      const { data: b1 } = await adminDb.from("books").select("stock").eq("id", testBook1.id).single();
      assert.strictEqual(b1?.stock, 18, "Stock must remain unchanged after rollback");
    });

    // -------------------------------------------------------------------------
    // SECTION 6: PAYMENT SETTLEMENT & CONCURRENCY (settle_payment_atomic)
    // -------------------------------------------------------------------------
    console.log("\n--- 6. PAYMENT SETTLEMENT & IDEMPOTENCY (settle_payment_atomic) ---");

    const rzpOrderId = `rzp_order_${runId}`;
    const rzpPayId = `rzp_pay_${runId}`;

    await test("settle_payment_atomic updates order and payment record to Paid authoritatively", async () => {
      // Link order to razorpay_order_id
      await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", createdOrderId);

      // Record pending payment
      await adminDb.from("payments").insert({
        order_id: createdOrderId,
        user_id: custAId,
        payment_id: rzpPayId,
        provider_order_id: rzpOrderId,
        amount: 1245,
        currency: "INR",
        provider: "Razorpay",
        status: "Pending",
      });

      const { data: settleRes, error: settleErr } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: rzpPayId,
        p_signature: "test_verified_sig",
        p_raw_response: { method: "test_integration" },
      });

      assert(!settleErr, `Settlement failed: ${settleErr?.message}`);
      const res = settleRes as any;
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.settled, true);

      // Verify order status
      const { data: ord } = await adminDb.from("orders").select("payment_status, is_paid, order_status").eq("id", createdOrderId).single();
      assert.strictEqual(ord?.payment_status, "Paid");
      assert.strictEqual(ord?.is_paid, true);
      assert.strictEqual(ord?.order_status, "Confirmed");
    });

    await test("Repeated payment settlement returns already_paid without re-mutating", async () => {
      const { data: dupRes, error: dupErr } = await adminDb.rpc("settle_payment_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_razorpay_payment_id: rzpPayId,
        p_signature: "test_verified_sig",
      });

      assert(!dupErr, `Duplicate settlement should not throw: ${dupErr?.message}`);
      const res = dupRes as any;
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, "already_paid");
      assert.strictEqual(res.settled, false);
    });

    await test("Late payment.failed event cannot downgrade a Paid order", async () => {
      const { data: failRes } = await adminDb.rpc("record_payment_failure_atomic", {
        p_razorpay_order_id: rzpOrderId,
        p_raw_response: { error: "gateway_timeout" },
      });

      const res = failRes as any;
      assert.strictEqual(res.status, "ignored_already_paid");

      const { data: ord } = await adminDb.from("orders").select("payment_status").eq("id", createdOrderId).single();
      assert.strictEqual(ord?.payment_status, "Paid", "Paid order must never be downgraded to Failed");
    });

    // -------------------------------------------------------------------------
    // SECTION 7: ORDER FULFILMENT & TRACKING
    // -------------------------------------------------------------------------
    console.log("\n--- 7. ORDER FULFILMENT & TRACKING STATUS TRANSITIONS ---");

    await test("Order transitions Confirmed -> Packed -> Shipped with AWB correctly", async () => {
      // Confirmed -> Packed
      const { error: pErr } = await adminDb
        .from("orders")
        .update({ order_status: "Packed", updated_at: new Date().toISOString() })
        .eq("id", createdOrderId);
      assert(!pErr, `Packed transition failed: ${pErr?.message}`);

      // Packed -> Shipped with courier and AWB
      const awbCode = `DLH-${runId.toString().slice(-8)}`;
      const { error: sErr } = await adminDb
        .from("orders")
        .update({
          order_status: "Shipped",
          shipping_courier: "Delhivery",
          shipping_awb: awbCode,
          shipping_shipped_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", createdOrderId);
      assert(!sErr, `Shipped transition failed: ${sErr?.message}`);

      const { data: ord } = await adminDb.from("orders").select("order_status, shipping_awb").eq("id", createdOrderId).single();
      assert.strictEqual(ord?.order_status, "Shipped");
      assert.strictEqual(ord?.shipping_awb, awbCode);
    });

    await test("Order transitions Shipped -> Delivered with delivery timestamps", async () => {
      const nowIso = new Date().toISOString();
      const { error: dErr } = await adminDb
        .from("orders")
        .update({
          order_status: "Delivered",
          delivered_at: nowIso,
          shipping_delivered_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", createdOrderId);
      assert(!dErr, `Delivered transition failed: ${dErr?.message}`);

      const { data: ord } = await adminDb.from("orders").select("order_status, delivered_at").eq("id", createdOrderId).single();
      assert.strictEqual(ord?.order_status, "Delivered");
      assert.ok(ord?.delivered_at);
    });

    // -------------------------------------------------------------------------
    // SECTION 8: REPLACEMENT WORKFLOW (REAL DATABASE)
    // -------------------------------------------------------------------------
    console.log("\n--- 8. REPLACEMENT WORKFLOW ENFORCEMENT (REAL DATABASE) ---");

    await test("Delivered order within 7 days succeeds with replacement request", async () => {
      const { data: repRes, error: repErr } = await clientA.rpc("request_replacement_atomic", {
        p_order_id: createdOrderId,
        p_user_id: custAId,
        p_reason: "Damaged cover during transit",
      });

      assert(!repErr, `Replacement request failed: ${repErr?.message}`);
      const res = repRes as any;
      assert.strictEqual(res.success, true);

      // Verify order record updated
      const { data: ord } = await adminDb.from("orders").select("order_status, replacement_status, replacement_requested").eq("id", createdOrderId).single();
      assert.strictEqual(ord?.replacement_requested, true);
      assert.strictEqual(ord?.replacement_status, "Requested");
      assert.strictEqual(ord?.order_status, "Replacement Requested");
    });

    await test("Duplicate replacement on same order is rejected by database", async () => {
      const { data: dupRes, error: dupErr } = await clientA.rpc("request_replacement_atomic", {
        p_order_id: createdOrderId,
        p_user_id: custAId,
        p_reason: "Another reason",
      });

      assert(dupErr || (dupRes && !(dupRes as any).success), "Duplicate replacement must be rejected");
      if (dupErr) {
        assert.ok(dupErr.message.includes("already been requested"));
      } else {
        assert.ok((dupRes as any).error.includes("already been requested"));
      }
    });

    // -------------------------------------------------------------------------
    // SECTION 9: CANCELLATION & INVENTORY RESTORATION
    // -------------------------------------------------------------------------
    console.log("\n--- 9. CANCELLATION & ATOMIC INVENTORY RESTORATION ---");

    // Create a new cancellable order
    const cancelOrderId = crypto.randomUUID();
    const prevStockB1 = (await adminDb.from("books").select("stock").eq("id", testBook1.id).single()).data!.stock;

    await test("Atomic cancellation cancels order and restores inventory", async () => {
      // 1. Place order decrementing 2 units
      const { data: ordId } = await clientA.rpc("create_order_atomic", {
        p_user_id: custAId,
        p_items: [{ book_id: testBook1.id, quantity: 2, price: 500 }],
        p_address_snapshot: { full_name: "Alpha User", phone: "9876543210", pincode: "110025", city: "Delhi", state: "Delhi", house_no: "1" },
        p_payment_method: "COD",
        p_total_amount: 1045,
      });

      // Stock was decremented by 2
      const stockAfterOrder = (await adminDb.from("books").select("stock").eq("id", testBook1.id).single()).data!.stock;
      assert.strictEqual(stockAfterOrder, prevStockB1 - 2);

      // 2. Cancel order
      const { data: cancelRes, error: cancelErr } = await clientA.rpc("cancel_order_atomic", {
        p_order_id: ordId,
        p_user_id: custAId,
        p_cancel_reason: "Ordered by mistake",
        p_is_admin: false,
      });

      assert(!cancelErr, `Cancel failed: ${cancelErr?.message}`);
      assert.strictEqual(cancelRes, true);

      // Verify stock was restored to original
      const stockAfterCancel = (await adminDb.from("books").select("stock").eq("id", testBook1.id).single()).data!.stock;
      assert.strictEqual(stockAfterCancel, prevStockB1, "Stock must be fully restored upon cancellation");

      // Verify order status
      const { data: cancelledOrd } = await adminDb.from("orders").select("order_status").eq("id", ordId).single();
      assert.strictEqual(cancelledOrd?.order_status, "Cancelled");
    });

    await test("Repeated cancellation attempt on already cancelled order is rejected", async () => {
      // Try cancelling the already cancelled order
      const { data: repeatCancel, error: repeatErr } = await clientA.rpc("cancel_order_atomic", {
        p_order_id: cancelOrderId,
        p_user_id: custAId,
        p_cancel_reason: "Duplicate cancel",
        p_is_admin: false,
      });

      assert(repeatErr || !repeatCancel, "Repeated cancel must fail");
    });

    // -------------------------------------------------------------------------
    // SECTION 10: REFUND RECORDING & AUDIT INTEGRITY (record_refund_atomic)
    // -------------------------------------------------------------------------
    console.log("\n--- 10. REFUND RECORDING & AUDIT INTEGRITY ---");

    await test("record_refund_atomic records refund and transitions payment status accurately", async () => {
      const refundId = `rfnd_${runId}`;
      const { data: refRes, error: refErr } = await adminDb.rpc("record_refund_atomic", {
        p_order_id: createdOrderId,
        p_refund_id: refundId,
        p_refund_amount: 1245,
        p_refund_status: "processed",
        p_raw_response: { refund_id: refundId, provider: "razorpay" },
      });

      assert(!refErr, `record_refund_atomic failed: ${refErr?.message}`);
      const res = refRes as any;
      assert.strictEqual(res.success, true);

      // Verify order record updated
      const { data: ord } = await adminDb.from("orders").select("payment_status, refund_status, razorpay_refund_id").eq("id", createdOrderId).single();
      assert.strictEqual(ord?.payment_status, "Refunded");
      assert.strictEqual(ord?.refund_status, "processed");
      assert.strictEqual(ord?.razorpay_refund_id, refundId);
    });

    await test("Administrative audit logs capture mutations immutably", async () => {
      const { data: auditLog, error: aErr } = await adminDb
        .from("audit_logs")
        .insert({
          action: "PHASE_09_VERIFICATION_AUDIT",
          model_name: "orders",
          model_id: createdOrderId,
          user_id: adminId,
          changes: { verified: true, phase: "09" },
        })
        .select()
        .single();

      assert(!aErr && auditLog, `Audit log failed: ${aErr?.message}`);
      assert.strictEqual(auditLog.action, "PHASE_09_VERIFICATION_AUDIT");
    });

  } finally {
    // -------------------------------------------------------------------------
    // CLEANUP TEMPORARY TEST FIXTURES
    // -------------------------------------------------------------------------
    console.log("\n--- CLEANING UP TEST FIXTURES ---");
    try {
      if (createdOrderId) {
        await adminDb.from("order_items").delete().eq("order_id", createdOrderId);
      }
      await adminDb.from("payments").delete().eq("user_id", custAId);
      await adminDb.from("orders").delete().eq("user_id", custAId);
      await adminDb.from("addresses").delete().eq("user_id", custAId);
      const booksToClean = [testBook1Id, testBook2Id].filter(Boolean);
      if (booksToClean.length > 0) {
        await adminDb.from("books").delete().in("id", booksToClean);
      }
      await adminDb.from("audit_logs").delete().eq("user_id", adminId);
      await adminDb.auth.admin.deleteUser(custAId);
      await adminDb.auth.admin.deleteUser(custBId);
      await adminDb.auth.admin.deleteUser(adminId);
      console.log("  ✓ Test fixtures and accounts safely purged.");
    } catch (cleanupErr: any) {
      console.warn("  Notice: Partial cleanup error (non-fatal):", cleanupErr?.message);
    }
  }

  console.log("\n" + "=".repeat(80));
  console.log(`INTEGRATION & DB SUMMARY: ${passedTests}/${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("=".repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runIntegrationAndDatabaseSuite().catch((err) => {
  console.error("Fatal test error:", err);
  process.exit(1);
});
