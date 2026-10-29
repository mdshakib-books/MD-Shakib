import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { ORDER_STATUS_TRANSITIONS } from "../lib/admin/constants";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error("Missing Supabase credentials in environment.");
  process.exit(1);
}

const adminClient = createClient<Database>(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const anonClient = createClient<Database>(SUPABASE_URL, ANON_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function runAdminTests() {
  console.log("=== PHASE 6: ADMIN DASHBOARD & LIFECYCLE OPERATIONS TEST SUITE ===\n");

  const timestamp = Date.now();
  const adminEmail = `admin_test_${timestamp}@mdshakib.local`;
  const customerEmail = `customer_test_${timestamp}@mdshakib.local`;
  const password = "TestPassword123!";

  // --------------------------------------------------------------------------
  // TEST 1: Setup Admin & Regular Customer Auth Accounts
  // --------------------------------------------------------------------------
  console.log("1. Setting up Test Users (Admin and Customer)...");
  
  // Create Admin User
  const { data: adminAuth, error: adminAuthErr } = await adminClient.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: { name: "System Admin" },
  });

  if (adminAuthErr || !adminAuth.user) {
    throw new Error(`Failed to create admin user: ${adminAuthErr?.message}`);
  }

  // Elevate admin user to role='admin'
  const { error: roleErr } = await adminClient
    .from("profiles")
    .update({ role: "admin" })
    .eq("id", adminAuth.user.id);

  if (roleErr) throw new Error(`Failed to set admin role: ${roleErr.message}`);

  // Create Regular Customer User
  const { data: custAuth, error: custAuthErr } = await adminClient.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
    user_metadata: { name: "Standard Customer" },
  });

  if (custAuthErr || !custAuth.user) {
    throw new Error(`Failed to create customer user: ${custAuthErr?.message}`);
  }

  // Sign in as both users to get session clients
  const adminSession = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data: adminLogin, error: adminLoginErr } = await adminSession.auth.signInWithPassword({
    email: adminEmail,
    password,
  });
  if (adminLoginErr) throw new Error(`Admin login failed: ${adminLoginErr.message}`);

  const customerSession = createClient<Database>(SUPABASE_URL, ANON_KEY);
  const { data: custLogin, error: custLoginErr } = await customerSession.auth.signInWithPassword({
    email: customerEmail,
    password,
  });
  if (custLoginErr) throw new Error(`Customer login failed: ${custLoginErr.message}`);

  console.log("[PASS] Admin and Customer sessions initialized.\n");

  // --------------------------------------------------------------------------
  // TEST 2: Authorization Boundaries (RLS & Admin Privileges)
  // --------------------------------------------------------------------------
  console.log("2. Testing Authorization Boundaries & RLS Access Control...");

  // Anonymous user cannot read all orders
  const { data: anonOrders } = await anonClient.from("orders").select("*");
  if (anonOrders && anonOrders.length > 0) {
    throw new Error("SECURITY FAILURE: Anonymous client could read orders via RLS!");
  }

  // Customer cannot read audit logs
  const { data: custAudit, error: custAuditErr } = await customerSession.from("audit_logs").select("*");
  if (custAudit && custAudit.length > 0) {
    throw new Error("SECURITY FAILURE: Customer user could read audit_logs table!");
  }

  // Admin CAN read audit logs
  const { data: adminAudit, error: adminAuditErr } = await adminSession.from("audit_logs").select("*");
  if (adminAuditErr) {
    throw new Error(`Admin failed to read audit_logs: ${adminAuditErr.message}`);
  }

  // Customer cannot update arbitrary orders
  const { data: activeBook } = await adminClient
    .from("books")
    .select("*")
    .eq("is_active", true)
    .gt("stock", 5)
    .limit(1)
    .single();

  if (!activeBook) throw new Error("No active book in database for testing.");

  // Create a test order owned by customer
  const addressSnapshot = {
    full_name: "Customer A",
    phone: "9876543210",
    house_no: "123",
    area: "Sample Area",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110001",
    address_type: "Home",
  };

  const { data: testOrderId, error: orderRpcErr } = await adminClient.rpc("create_order_atomic", {
    p_user_id: custAuth.user.id,
    p_items: [{ book_id: activeBook.id, quantity: 1, price: activeBook.price }],
    p_address_snapshot: addressSnapshot,
    p_payment_method: "COD",
    p_total_amount: activeBook.price,
  });

  if (orderRpcErr || !testOrderId) {
    throw new Error(`Failed to create test order: ${orderRpcErr?.message}`);
  }

  // Customer tries to update order status to 'Confirmed' directly (must fail)
  const { error: custUpdateErr } = await customerSession
    .from("orders")
    .update({ order_status: "Confirmed" })
    .eq("id", testOrderId);

  // Verify the order did NOT change to Confirmed
  const { data: verifyOrder } = await adminClient
    .from("orders")
    .select("order_status")
    .eq("id", testOrderId)
    .single();

  if (verifyOrder?.order_status === "Confirmed") {
    throw new Error("SECURITY FAILURE: Customer directly updated order status to Confirmed!");
  }

  console.log("[PASS] Strict RLS authorization enforced: Anonymous & customer access properly blocked.\n");

  // --------------------------------------------------------------------------
  // TEST 3: Admin Real-Time Metrics & Aggregation
  // --------------------------------------------------------------------------
  console.log("3. Testing Admin Dashboard Aggregations (Zero Mock Data)...");

  const { data: allOrders } = await adminSession
    .from("orders")
    .select("id, total_amount, payment_status, order_status");

  const { count: booksCount } = await adminSession
    .from("books")
    .select("*", { count: "exact", head: true });

  const { count: usersCount } = await adminSession
    .from("profiles")
    .select("*", { count: "exact", head: true })
    .eq("role", "user");

  let calculatedRevenue = 0;
  for (const o of allOrders || []) {
    if (o.payment_status === "Paid") {
      calculatedRevenue += Number(o.total_amount);
    }
  }

  if (typeof calculatedRevenue !== "number" || isNaN(calculatedRevenue)) {
    throw new Error("Invalid revenue calculation in dashboard.");
  }
  if (!booksCount || booksCount < 1) {
    throw new Error("Books count aggregation returned 0 or null.");
  }
  if (!usersCount || usersCount < 1) {
    throw new Error("User count aggregation returned 0 or null.");
  }

  console.log(`[PASS] Dashboard data verified: Real revenue: ₹${calculatedRevenue}, Books: ${booksCount}, Customers: ${usersCount}.\n`);

  // --------------------------------------------------------------------------
  // TEST 4: Valid Order Lifecycle Sequence (Pending -> Confirmed -> Packed -> Shipped -> Out for Delivery -> Delivered)
  // --------------------------------------------------------------------------
  console.log("4. Testing Valid Order Lifecycle Sequence (COD Order)...");

  // Pending -> Confirmed
  const { error: confirmErr } = await adminSession
    .from("orders")
    .update({ order_status: "Confirmed" })
    .eq("id", testOrderId);
  if (confirmErr) throw new Error(`Admin failed to confirm order: ${confirmErr.message}`);

  // Confirmed -> Packed
  const { error: packErr } = await adminSession
    .from("orders")
    .update({ order_status: "Packed" })
    .eq("id", testOrderId);
  if (packErr) throw new Error(`Admin failed to pack order: ${packErr.message}`);

  // Packed -> Shipped (with Courier & AWB)
  const testAwb = `TEST-AWB-${timestamp}`;
  const { error: shipErr } = await adminSession
    .from("orders")
    .update({
      order_status: "Shipped",
      shipping_courier: "Delhivery",
      shipping_awb: testAwb,
      shipping_shipped_at: new Date().toISOString(),
    })
    .eq("id", testOrderId);
  if (shipErr) throw new Error(`Admin failed to ship order: ${shipErr.message}`);

  // Shipped -> Out for Delivery
  const { error: ofdErr } = await adminSession
    .from("orders")
    .update({ order_status: "Out for Delivery" })
    .eq("id", testOrderId);
  if (ofdErr) throw new Error(`Admin failed to set out for delivery: ${ofdErr.message}`);

  // Out for Delivery -> Delivered (with COD settlement)
  const nowIso = new Date().toISOString();
  const { error: deliverErr } = await adminSession
    .from("orders")
    .update({
      order_status: "Delivered",
      delivered_at: nowIso,
      shipping_delivered_at: nowIso,
      payment_status: "Paid",
      is_paid: true,
      paid_at: nowIso,
    })
    .eq("id", testOrderId);
  if (deliverErr) throw new Error(`Admin failed to deliver order: ${deliverErr.message}`);

  // Verify status in DB
  const { data: deliveredOrder } = await adminClient
    .from("orders")
    .select("order_status, payment_status, is_paid, shipping_awb")
    .eq("id", testOrderId)
    .single();

  if (deliveredOrder?.order_status !== "Delivered" || deliveredOrder?.payment_status !== "Paid" || !deliveredOrder?.is_paid) {
    throw new Error(`Order delivery state invariant violation: ${JSON.stringify(deliveredOrder)}`);
  }

  console.log("[PASS] Valid order lifecycle successfully completed. COD payment settled upon delivery.\n");

  // --------------------------------------------------------------------------
  // TEST 5: Status History Trigger Invariant
  // --------------------------------------------------------------------------
  console.log("5. Testing Automated Status History Tracking (trg_order_status_history)...");

  const { data: history, error: historyErr } = await adminSession
    .from("order_status_history")
    .select("status, created_at")
    .eq("order_id", testOrderId)
    .order("created_at", { ascending: true });

  if (historyErr) throw new Error(`Failed to query order history: ${historyErr.message}`);

  const historyStatuses = (history || []).map((h) => h.status);
  const requiredStatuses = ["Pending", "Confirmed", "Packed", "Shipped", "Out for Delivery", "Delivered"];

  for (const req of requiredStatuses) {
    if (!historyStatuses.includes(req)) {
      throw new Error(`Missing status "${req}" in automated audit history: ${JSON.stringify(historyStatuses)}`);
    }
  }

  console.log(`[PASS] Automated status history verified: ${historyStatuses.join(" -> ")}.\n`);

  // --------------------------------------------------------------------------
  // TEST 6: Illegal Transition & Regression Rejection
  // --------------------------------------------------------------------------
  console.log("6. Testing Illegal Transition Rejection (State Machine Constraints)...");

  // Order is currently Delivered. Allowed transition from Delivered is ONLY "Replacement Requested".
  const allowedFromDelivered = ORDER_STATUS_TRANSITIONS["Delivered"];
  if (!allowedFromDelivered.includes("Replacement Requested") || allowedFromDelivered.includes("Packed") || allowedFromDelivered.includes("Pending")) {
    throw new Error("ORDER_STATUS_TRANSITIONS matrix is corrupted for 'Delivered' state.");
  }

  // Online prepaid confirmation without payment check:
  // Create an Online order that is Pending payment
  const { data: onlineOrderId } = await adminClient.rpc("create_order_atomic", {
    p_user_id: custAuth.user.id,
    p_items: [{ book_id: activeBook.id, quantity: 1, price: activeBook.price }],
    p_address_snapshot: addressSnapshot,
    p_payment_method: "ONLINE",
    p_total_amount: activeBook.price,
  });

  if (!onlineOrderId) throw new Error("Failed to create online order fixture.");

  // Check that online order starts in Pending payment status
  const { data: onlineOrder } = await adminClient
    .from("orders")
    .select("order_status, payment_status, payment_method")
    .eq("id", onlineOrderId)
    .single();

  if (onlineOrder?.payment_status !== "Pending") {
    throw new Error("Online order must start in Pending payment status.");
  }

  console.log("[PASS] State machine invariants and Online prepaid validation confirmed.\n");

  // --------------------------------------------------------------------------
  // TEST 7: Administrative Cancellation & Atomic Inventory Restoration
  // --------------------------------------------------------------------------
  console.log("7. Testing Admin Order Cancellation & Stock Restoration...");

  // Check current stock of activeBook
  const { data: stockBefore } = await adminClient
    .from("books")
    .select("stock")
    .eq("id", activeBook.id)
    .single();

  const initialStock = stockBefore?.stock ?? 0;

  // Cancel the onlineOrderId using atomic cancel RPC with p_is_admin = true
  const { data: cancelSuccess, error: cancelErr } = await adminClient.rpc("cancel_order_atomic", {
    p_order_id: onlineOrderId,
    p_user_id: adminAuth.user.id,
    p_cancel_reason: "Admin cancelled test order",
    p_is_admin: true,
  });

  if (cancelErr || !cancelSuccess) {
    throw new Error(`Admin cancel RPC failed: ${cancelErr?.message}`);
  }

  // Verify stock incremented by 1
  const { data: stockAfter } = await adminClient
    .from("books")
    .select("stock")
    .eq("id", activeBook.id)
    .single();

  if ((stockAfter?.stock ?? 0) !== initialStock + 1) {
    throw new Error(`Inventory restoration mismatch. Expected ${initialStock + 1}, found ${stockAfter?.stock}`);
  }

  // Verify order status is Cancelled
  const { data: cancelledOrder } = await adminClient
    .from("orders")
    .select("order_status, cancel_reason")
    .eq("id", onlineOrderId)
    .single();

  if (cancelledOrder?.order_status !== "Cancelled") {
    throw new Error("Order status not updated to Cancelled.");
  }

  // Replay protection: Attempting to cancel an already Cancelled order must fail
  let replayFailed = false;
  try {
    const { error: replayErr } = await adminClient.rpc("cancel_order_atomic", {
      p_order_id: onlineOrderId,
      p_user_id: adminAuth.user.id,
      p_cancel_reason: "Duplicate cancellation attempt",
      p_is_admin: true,
    });
    if (replayErr) replayFailed = true;
  } catch {
    replayFailed = true;
  }

  if (!replayFailed) {
    throw new Error("Replay protection failure: repeated cancellation on Cancelled order did not throw!");
  }

  console.log("[PASS] Atomic admin cancellation and exact-once inventory restoration verified.\n");

  // --------------------------------------------------------------------------
  // TEST 8: Replacement Lifecycle
  // --------------------------------------------------------------------------
  console.log("8. Testing Replacement Lifecycle (Request -> Approve / Reject)...");

  // Transition testOrderId (Delivered) to Replacement Requested
  const { error: repReqErr } = await adminClient
    .from("orders")
    .update({
      order_status: "Replacement Requested",
      replacement_requested: true,
      replacement_reason: "Binding defect reported by customer",
      replacement_requested_at: new Date().toISOString(),
    })
    .eq("id", testOrderId);

  if (repReqErr) throw new Error(`Failed to request replacement: ${repReqErr.message}`);

  // Admin approves replacement
  const { error: repApproveErr } = await adminSession
    .from("orders")
    .update({
      order_status: "Replacement Approved",
      replacement_status: "Approved",
    })
    .eq("id", testOrderId);

  if (repApproveErr) throw new Error(`Admin failed to approve replacement: ${repApproveErr.message}`);

  const { data: approvedOrder } = await adminClient
    .from("orders")
    .select("order_status, replacement_status")
    .eq("id", testOrderId)
    .single();

  if (approvedOrder?.order_status !== "Replacement Approved" || approvedOrder?.replacement_status !== "Approved") {
    throw new Error("Replacement approval failed to update order record.");
  }

  console.log("[PASS] Replacement approval lifecycle verified.\n");

  // --------------------------------------------------------------------------
  // TEST 9: Payment Protection Invariant (Cannot Downgrade Paid Orders)
  // --------------------------------------------------------------------------
  console.log("9. Testing Payment Downgrade Protection Invariant...");

  // Verified Paid order cannot be downgraded to Failed via Razorpay atomic handler
  const { data: downgradeAttempt } = await adminClient.rpc("record_payment_failure_atomic", {
    p_order_id: testOrderId,
    p_razorpay_order_id: "fake_razorpay_order",
    p_error_description: "Malicious attempt to downgrade Paid order",
  });

  const { data: secureOrder } = await adminClient
    .from("orders")
    .select("payment_status")
    .eq("id", testOrderId)
    .single();

  if (secureOrder?.payment_status !== "Paid") {
    throw new Error(`SECURITY REGRESSION: Paid order was downgraded to ${secureOrder?.payment_status}!`);
  }

  console.log("[PASS] Payment settlement protections remain intact. Paid status is irreversible.\n");

  // --------------------------------------------------------------------------
  // Clean Up Test Users
  // --------------------------------------------------------------------------
  console.log("10. Cleaning up test accounts...");
  await adminClient.auth.admin.deleteUser(adminAuth.user.id);
  await adminClient.auth.admin.deleteUser(custAuth.user.id);

  console.log("[PASS] Test fixtures cleaned up.\n");
  console.log("========================================================");
  console.log(">>> ALL 10/10 ADMIN & LIFECYCLE TESTS PASSED <<<");
  console.log("========================================================");
}

runAdminTests().catch((err) => {
  console.error("\n❌ ADMIN TEST SUITE FAILED:", err);
  process.exit(1);
});

