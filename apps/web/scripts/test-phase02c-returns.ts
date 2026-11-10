/**
 * ==============================================================================
 * PHASE 2C: RETURNS, REFUNDS & REPLACEMENTS TEST SUITE
 * MD Shakib Islamic Books Modernization Project
 * Verifies Requirements 2.15 through 2.21
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import {
  checkOrderReturnEligibility,
  createCustomerReturnRequest,
  adminReviewReturnRequest,
  scheduleReturnPickup,
  processReturnRefund,
} from "../lib/commerce/returns";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
}
process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_mock_123456";
process.env.RAZORPAY_KEY_ID = "rzp_test_mock_123456";
process.env.RAZORPAY_KEY_SECRET = "mock_secret_123456";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let testUserId: string;
let testAdminId: string;
let testBookId: string;
let testDeliveredOrderId: string;
let testOrderItemId: string;
let testOldOrderId: string;

let testsPassed = 0;
let testsFailed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    testsPassed++;
    console.log(`  ✓ [PASS ${String(testsPassed).padStart(2, "0")}] ${testName}`);
  } else {
    testsFailed++;
    console.error(`  ✗ [FAIL] ${testName}${detail ? ` — ${detail}` : ""}`);
  }
}

async function setupFixtures() {
  console.log("\n--- SETTING UP PHASE 2C TEST FIXTURES ---");

  const custEmail = `ret_cust_${Date.now()}@test.local`;
  const { data: custAuth } = await adminDb.auth.admin.createUser({
    email: custEmail,
    password: "Password123!",
    email_confirm: true,
  });
  testUserId = custAuth!.user!.id;
  await adminDb.from("profiles").upsert({
    id: testUserId,
    email: custEmail,
    name: "Returns Customer",
    role: "user",
  });

  const adminEmail = `ret_admin_${Date.now()}@test.local`;
  const { data: admAuth } = await adminDb.auth.admin.createUser({
    email: adminEmail,
    password: "Password123!",
    email_confirm: true,
  });
  testAdminId = admAuth!.user!.id;
  await adminDb.from("profiles").upsert({
    id: testAdminId,
    email: adminEmail,
    name: "Returns Operations Staff",
    role: "admin",
  });

  // Book with stock
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: "Tafsir Ibn Kathir (4 Volumes)",
      author: "Ibn Kathir",
      price: 2400,
      stock: 15,
      category: "Quran",
      sku: `SKU-TAFSIR-${Date.now().toString(36).toUpperCase()}`,
      image_url: "https://example.com/tafsir.jpg",
    })
    .select("id")
    .single();
  testBookId = book!.id;

  // Order 1: Delivered 2 days ago (Eligible for return)
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
  const { data: ord1 } = await adminDb
    .from("orders")
    .insert({
      order_number: `MDS-RET-${Date.now()}`,
      user_id: testUserId,
      total_amount: 2400,
      subtotal: 2400,
      order_status: "Delivered",
      payment_method: "ONLINE",
      payment_status: "Paid",
      razorpay_payment_id: `pay_test_ret_${Date.now()}`,
      is_paid: true,
      delivered_at: twoDaysAgo,
      shipping_awb: "DLVRET001",
      address_snapshot: {
        full_name: "Returns Customer",
        city: "Delhi",
        state: "Delhi",
        pincode: "110025",
      },
    })
    .select("id")
    .single();
  testDeliveredOrderId = ord1!.id;

  const { data: item1 } = await adminDb
    .from("order_items")
    .insert({
      order_id: testDeliveredOrderId,
      book_id: testBookId,
      title: "Tafsir Ibn Kathir (4 Volumes)",
      quantity: 2,
      price: 1200,
      image_url: "https://example.com/tafsir.jpg",
    })
    .select("id")
    .single();
  testOrderItemId = item1!.id;

  // Order 2: Delivered 15 days ago (Expired return window)
  const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString();
  const { data: ord2 } = await adminDb
    .from("orders")
    .insert({
      order_number: `MDS-OLD-${Date.now()}`,
      user_id: testUserId,
      total_amount: 1200,
      subtotal: 1200,
      order_status: "Delivered",
      payment_method: "ONLINE",
      payment_status: "Paid",
      is_paid: true,
      delivered_at: fifteenDaysAgo,
      shipping_awb: "DLVRET002",
      address_snapshot: { full_name: "Returns Customer" },
    })
    .select("id")
    .single();
  testOldOrderId = ord2!.id;

  await adminDb.from("order_items").insert({
    order_id: testOldOrderId,
    book_id: testBookId,
    title: "Tafsir Ibn Kathir (Single Vol)",
    quantity: 1,
    price: 1200,
    image_url: "https://example.com/tafsir.jpg",
  });

  console.log("✓ Fixtures successfully provisioned.");
}

async function cleanupFixtures() {
  console.log("\n--- CLEANING UP PHASE 2C TEST FIXTURES ---");
  await adminDb.from("refund_records").delete().in("order_id", [testDeliveredOrderId, testOldOrderId]);
  await adminDb.from("return_requests").delete().in("order_id", [testDeliveredOrderId, testOldOrderId]);
  await adminDb.from("order_items").delete().in("order_id", [testDeliveredOrderId, testOldOrderId]);
  await adminDb.from("orders").delete().in("id", [testDeliveredOrderId, testOldOrderId]);
  await adminDb.from("books").delete().eq("id", testBookId);
  await adminDb.from("profiles").delete().in("id", [testUserId, testAdminId]);
  await adminDb.auth.admin.deleteUser(testUserId);
  await adminDb.auth.admin.deleteUser(testAdminId);
  console.log("✓ Test fixtures purged.");
}

async function runTests() {
  try {
    await setupFixtures();

    console.log("\n================================================================================");
    console.log(" PHASE 2C: RETURNS, REFUNDS & REPLACEMENTS VERIFICATION");
    console.log("================================================================================\n");

    // [2.16] Policy-Driven Return Eligibility
    console.log("[2.16] Policy-Driven Return Eligibility Validation");
    const elig1 = await checkOrderReturnEligibility(testDeliveredOrderId, testUserId);
    assert(elig1.isEligible, "Recent delivered order (2 days) is eligible for return");
    assert(elig1.items[0].returnableQuantity === 2, "Full quantity (2) is returnable");

    const eligExpired = await checkOrderReturnEligibility(testOldOrderId, testUserId);
    assert(!eligExpired.isEligible, "Order delivered 15 days ago is rejected (window expired)");
    assert(eligExpired.reasons.some((r) => r.includes("Return window expired")), "Return window expiration reason provided");

    // [2.15] Customer Return Request Creation
    console.log("\n[2.15] Customer Return Request Creation");
    const createRes = await createCustomerReturnRequest({
      orderId: testDeliveredOrderId,
      userId: testUserId,
      requestType: "return_refund",
      reason: "Pages missing in Volume 2",
      description: "Binding error on page 140-160",
      items: [
        {
          orderItemId: testOrderItemId,
          bookId: testBookId,
          quantity: 1, // Return 1 out of 2
        },
      ],
      evidenceUrls: ["https://cloudinary.com/evidence_photo_1.jpg"],
    });

    assert(createRes.success, "Customer return request created successfully");
    assert(!!createRes.returnRequestId, "Return request ID generated");
    assert(Boolean(createRes.returnNumber?.startsWith("RET-")), "Return number follows 'RET-YYYYMM-XXXXX' format");

    // Check partial quantity remaining
    const eligAfterPartial = await checkOrderReturnEligibility(testDeliveredOrderId, testUserId);
    assert(eligAfterPartial.items[0].returnedQuantity === 1, "Returned quantity tracked accurately (1)");
    assert(eligAfterPartial.items[0].returnableQuantity === 1, "Remaining returnable quantity is 1");

    // Reject exceeding quantity
    const exceedRes = await createCustomerReturnRequest({
      orderId: testDeliveredOrderId,
      userId: testUserId,
      requestType: "return_refund",
      reason: "Greedy claim",
      items: [{ orderItemId: testOrderItemId, bookId: testBookId, quantity: 2 }],
    });
    assert(!exceedRes.success, "Return request exceeding available returnable quantity is rejected");

    // [2.17] Admin Return Management Workflow
    console.log("\n[2.17] Admin Return Management Workflow");
    const returnId = createRes.returnRequestId!;

    // Rejection validation: requires reason
    const failReject = await adminReviewReturnRequest({
      returnId,
      adminId: testAdminId,
      action: "reject",
      rejectionReason: "",
    });
    assert(!failReject.success, "Admin rejection without reason is rejected");

    // Valid Approval
    const approveRes = await adminReviewReturnRequest({
      returnId,
      adminId: testAdminId,
      action: "approve",
      adminNotes: "Approved upon verifying binding defect",
    });
    assert(approveRes.success, "Admin successfully approved return request");
    assert(approveRes.status === "approved", "Status transitioned to 'approved'");

    // [2.18] Return Pickup Scheduling
    console.log("\n[2.18] Return Pickup Logistics (Delhivery Reverse)");
    const pickupRes = await scheduleReturnPickup(returnId);
    assert(pickupRes.success, "Return pickup scheduled successfully");
    assert(Boolean(pickupRes.pickupAwb?.startsWith("REV-")), "Reverse pickup AWB generated");
    assert(pickupRes.status === "pickup_scheduled", "Status updated to 'pickup_scheduled'");

    // [2.19, 2.21] Refund Workflow & Razorpay Reconciliation
    console.log("\n[2.19 & 2.21] Refund Workflow & Over-Refund Defense");
    // Attempt refund exceeding order total
    const { data: overRefundRpc } = await adminDb.rpc("initiate_return_refund_atomic", {
      p_order_id: testDeliveredOrderId,
      p_return_id: returnId,
      p_amount: 5000, // Total was 2400
      p_reason: "Illegal over-refund",
      p_admin_id: testAdminId,
    });
    assert(!(overRefundRpc as any)?.success, "Over-refund exceeding refundable balance is strictly rejected by atomic RPC");

    // Process valid refund for 1 item (₹1200)
    const refundRes = await processReturnRefund({
      returnId,
      adminId: testAdminId,
      amount: 1200,
      reason: "Defective volume return refund",
    });
    if (!refundRes.success) console.error("Refund error detail:", refundRes.error);

    assert(refundRes.success, "Valid partial refund processed successfully");
    assert(refundRes.amount === 1200, "Refund amount recorded accurately: ₹1200");
    assert(refundRes.status === "processed", "Refund record marked as 'processed'");

    // Check refund record in DB
    const { data: dbRefund } = await adminDb
      .from("refund_records")
      .select("*")
      .eq("return_request_id", returnId)
      .single();
    assert(dbRefund?.status === "processed", "Database refund record status is 'processed'");
    assert(!!dbRefund?.gateway_refund_id, "Gateway refund identifier persisted");

    // [2.20] Replacement Workflow & Inventory Reservation
    console.log("\n[2.20] Replacement Workflow & Atomic Inventory Reservation");
    const { data: preBook } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
    const initialStock = preBook!.stock;

    // Create replacement request: Under D-1, normalized to return_refund to eliminate dead-end
    const replReq = await createCustomerReturnRequest({
      orderId: testDeliveredOrderId,
      userId: testUserId,
      requestType: "replacement",
      reason: "Defective cover replacement",
      items: [{ orderItemId: testOrderItemId, bookId: testBookId, quantity: 1 }],
    });
    assert(replReq.success, "Replacement request accepted and normalized under D-1");

    // Fetch from database to verify request_type is return_refund
    const { data: dbReplReq } = await adminDb
      .from("return_requests")
      .select("request_type")
      .eq("id", replReq.returnRequestId!)
      .single();
    assert(dbReplReq?.request_type === "return_refund", "Request type strictly enforced to 'return_refund'");

    // Approve return request: Verifies inventory is NOT decremented into a dead end (D-1 invariant)
    const replApprove = await adminReviewReturnRequest({
      returnId: replReq.returnRequestId!,
      adminId: testAdminId,
      action: "approve",
    });
    assert(replApprove.success, "Return for refund approved successfully");

    const { data: postBook } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
    assert(postBook!.stock === initialStock, "Inventory preserved: No dead-end replacement stock decrement (D-1 invariant)");

    console.log("\n================================================================================");
    console.log(` PHASE 2C SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("================================================================================\n");
  } finally {
    await cleanupFixtures();
  }

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests();
