/**
 * ==============================================================================
 * PHASE 2A: DELIVERY OTP SYSTEM & COD RECONCILIATION TEST SUITE
 * MD Shakib Islamic Books Modernization Project
 * Verifies Requirements 2.1 through 2.9
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import {
  generateAndStoreDeliveryOtp,
  verifyDeliveryOtp,
  getCustomerOrderDeliveryOtp,
  hashDeliveryOtp,
} from "../lib/delivery/otp";
import {
  recordDoorstepCodCollection,
  reconcileCourierRemittance,
} from "../lib/delivery/cod";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminDb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let testUserId: string;
let testAdminId: string;
let testBookId: string;
let testOrderId: string;
let testCodOrderId: string;

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
  console.log("\n--- SETTING UP PHASE 2A TEST FIXTURES ---");

  // Create customer
  const custEmail = `otp_cust_${Date.now()}@test.local`;
  const { data: custAuth } = await adminDb.auth.admin.createUser({
    email: custEmail,
    password: "Password123!",
    email_confirm: true,
  });
  testUserId = custAuth!.user!.id;
  await adminDb.from("profiles").upsert({
    id: testUserId,
    email: custEmail,
    full_name: "OTP Test Customer",
    role: "user",
  });

  // Create admin/delivery agent
  const adminEmail = `otp_admin_${Date.now()}@test.local`;
  const { data: admAuth } = await adminDb.auth.admin.createUser({
    email: adminEmail,
    password: "Password123!",
    email_confirm: true,
  });
  testAdminId = admAuth!.user!.id;
  await adminDb.from("profiles").upsert({
    id: testAdminId,
    email: adminEmail,
    full_name: "OTP Staff Officer",
    role: "admin",
  });

  // Create book
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: "Sahih Al-Bukhari Delivery Edition",
      author: "Imam Bukhari",
      price: 1500,
      stock: 25,
      category: "Hadith",
      image_url: "https://example.com/cover.jpg",
    })
    .select("id")
    .single();
  testBookId = book!.id;

  // Create Prepaid Order (in 'Out for Delivery' status)
  const { data: order1 } = await adminDb
    .from("orders")
    .insert({
      user_id: testUserId,
      total_amount: 1500,
      subtotal: 1500,
      order_status: "Out for Delivery",
      payment_method: "ONLINE",
      payment_status: "Paid",
      shipping_awb: "DLVOTPTEST101",
      address_snapshot: {
        full_name: "OTP Customer",
        house_no: "123",
        area: "Nizamuddin",
        city: "New Delhi",
        state: "Delhi",
        pincode: "110013",
        phone: "9876543210",
      },
    })
    .select("id")
    .single();
  testOrderId = order1!.id;

  // Create COD Order (in 'Out for Delivery' status)
  const { data: order2 } = await adminDb
    .from("orders")
    .insert({
      user_id: testUserId,
      total_amount: 1500,
      subtotal: 1500,
      order_status: "Out for Delivery",
      payment_method: "COD",
      payment_status: "Pending",
      shipping_awb: "DLVCODTEST202",
      address_snapshot: {
        full_name: "COD Customer",
        house_no: "456",
        area: "Daryaganj",
        city: "New Delhi",
        state: "Delhi",
        pincode: "110002",
        phone: "9876543211",
      },
    })
    .select("id")
    .single();
  testCodOrderId = order2!.id;

  console.log("✓ Fixtures successfully provisioned.");
}

async function cleanupFixtures() {
  console.log("\n--- CLEANING UP PHASE 2A TEST FIXTURES ---");
  await adminDb.from("delivery_verifications").delete().in("order_id", [testOrderId, testCodOrderId]);
  await adminDb.from("delivery_otps").delete().in("order_id", [testOrderId, testCodOrderId]);
  await adminDb.from("cod_collections").delete().eq("order_id", testCodOrderId);
  await adminDb.from("cod_remittances").delete().eq("order_id", testCodOrderId);
  await adminDb.from("orders").delete().in("id", [testOrderId, testCodOrderId]);
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
    console.log(" PHASE 2A: DELIVERY OTP SYSTEM & COD RECONCILIATION VERIFICATION");
    console.log("================================================================================\n");

    // [2.1 & 2.2] OTP Generation & Zero Plaintext Storage
    console.log("[2.1 & 2.2] OTP Generation & Zero Plaintext Storage");
    const genResult = await generateAndStoreDeliveryOtp(testOrderId);
    assert(genResult.success, "generateAndStoreDeliveryOtp succeeds");
    assert(!!genResult.plaintextOtp && /^\d{6}$/.test(genResult.plaintextOtp), "Generated OTP is exactly 6 digits");

    // Query DB directly: verify plaintext OTP is NOT in database
    const { data: dbOtp } = await adminDb
      .from("delivery_otps")
      .select("*")
      .eq("order_id", testOrderId)
      .eq("status", "active")
      .single();

    assert(!!dbOtp, "OTP record exists in database");
    assert(dbOtp.otp_hash !== genResult.plaintextOtp, "Plaintext OTP is NEVER stored in database");
    assert(dbOtp.otp_hash === hashDeliveryOtp(genResult.plaintextOtp!), "Database stores correct HMAC-SHA256 hash");

    // [2.3] OTP Lifecycle & Invalidation on Regeneration
    console.log("\n[2.3] OTP Lifecycle & Regeneration");
    const regenResult = await generateAndStoreDeliveryOtp(testOrderId);
    assert(regenResult.success, "Regeneration succeeds");

    const { data: allOtps } = await adminDb
      .from("delivery_otps")
      .select("id, status, otp_hash")
      .eq("order_id", testOrderId);

    const oldOtpRecord = allOtps?.find((o) => o.id === dbOtp.id);
    assert(oldOtpRecord?.status === "invalidated", "Prior active OTP was atomically invalidated upon regeneration");

    // Old OTP must fail verification
    const oldVerify = await verifyDeliveryOtp({
      orderId: testOrderId,
      candidateOtp: genResult.plaintextOtp!,
      actorId: testAdminId,
      actorRole: "admin",
    });
    assert(!oldVerify.success, "Old invalidated OTP is rejected by verification RPC");

    // [2.4] Customer Tracking OTP Access Control
    console.log("\n[2.4] Customer Tracking OTP Visibility");
    const custOtpResult = await getCustomerOrderDeliveryOtp(testOrderId, testUserId);
    assert(custOtpResult.eligible, "Authenticated order owner can view their delivery OTP");
    assert(!!custOtpResult.otp && custOtpResult.otp.length === 6, "Retrieved valid 6-digit OTP for owner");

    // Cross-customer unauthorized access
    const crossAccess = await getCustomerOrderDeliveryOtp(testOrderId, "00000000-0000-0000-0000-000000000000");
    assert(!crossAccess.eligible, "Non-owner customer cannot access another user's delivery OTP");

    // Ineligible order status check: Create separate order in 'Confirmed' status
    const { data: confirmedOrder } = await adminDb
      .from("orders")
      .insert({
        user_id: testUserId,
        total_amount: 1000,
        subtotal: 1000,
        order_status: "Confirmed",
        payment_method: "ONLINE",
        payment_status: "Paid",
        address_snapshot: {},
      })
      .select("id")
      .single();

    const prematureAccess = await getCustomerOrderDeliveryOtp(confirmedOrder!.id, testUserId);
    assert(!prematureAccess.eligible, "OTP is NOT visible before shipment reaches 'Out for Delivery'");
    await adminDb.from("orders").delete().eq("id", confirmedOrder!.id);

    // [2.5 & 2.6] Server-Side Verification & Attempt Limit Defense
    console.log("\n[2.5 & 2.6] Server-Side Verification & Brute-Force Defense");
    // Generate fresh OTP
    const freshGen = await generateAndStoreDeliveryOtp(testOrderId);
    const validOtp = freshGen.plaintextOtp!;

    // Attempt with incorrect OTP
    const wrongVerify = await verifyDeliveryOtp({
      orderId: testOrderId,
      candidateOtp: "000000",
      actorId: testAdminId,
      actorRole: "admin",
    });
    assert(!wrongVerify.success, "Incorrect OTP is rejected");
    assert(wrongVerify.outcome === "FAILED_INVALID_OTP", "Correct failure outcome recorded");

    // Check attempt counter
    const { data: attemptOtp } = await adminDb
      .from("delivery_otps")
      .select("attempts, max_attempts, status")
      .eq("order_id", testOrderId)
      .eq("status", "active")
      .single();
    assert(attemptOtp?.attempts === 1, "Failed attempt incremented attempts counter to 1");

    // Successful Verification
    const successVerify = await verifyDeliveryOtp({
      orderId: testOrderId,
      candidateOtp: validOtp,
      actorId: testAdminId,
      actorRole: "admin",
      awb: "DLVOTPTEST101",
    });
    assert(successVerify.success, "Genuine OTP successfully verified");
    assert(successVerify.status === "Delivered", "Verification transitioned order status to 'Delivered'");

    // Check order state in DB
    const { data: deliveredOrder } = await adminDb
      .from("orders")
      .select("order_status, delivered_at")
      .eq("id", testOrderId)
      .single();
    assert(deliveredOrder?.order_status === "Delivered", "Order status is authoritatively 'Delivered' in DB");
    assert(!!deliveredOrder?.delivered_at, "delivered_at timestamp recorded");

    // Replay attack: Reusing verified OTP must fail
    const replayVerify = await verifyDeliveryOtp({
      orderId: testOrderId,
      candidateOtp: validOtp,
      actorId: testAdminId,
      actorRole: "admin",
    });
    assert(!replayVerify.success, "Reused OTP on already delivered order is rejected (no active OTP)");

    // [2.7] Delivery Audit Trail
    console.log("\n[2.7] Delivery Audit Trail");
    const { data: audits } = await adminDb
      .from("delivery_verifications")
      .select("*")
      .eq("order_id", testOrderId)
      .order("attempted_at", { ascending: true });

    assert(!!audits && audits.length >= 2, "Audit trail contains records of all verification events");
    const successAudit = audits?.find((a) => a.outcome === "SUCCESS");
    assert(!!successAudit, "Successful verification event recorded in audit trail");
    assert(successAudit?.actor_id === testAdminId, "Audit record accurately attributes actor ID");
    assert(successAudit?.shipment_awb === "DLVOTPTEST101", "Audit record captures shipment AWB");

    // [2.8] Independent COD Collection
    console.log("\n[2.8] Independent COD Collection");
    const codCollectResult = await recordDoorstepCodCollection({
      orderId: testCodOrderId,
      expectedAmount: 1500,
      collectedAmount: 1500,
      collectorId: testAdminId,
      collectionStatus: "collected",
      collectionReference: "POUCH-9901",
      notes: "Cash received in full at doorstep",
    });
    assert(codCollectResult.success, "Doorstep cash collection recorded successfully");

    const { data: codRecord } = await adminDb
      .from("cod_collections")
      .select("*")
      .eq("order_id", testCodOrderId)
      .single();
    assert(codRecord?.collected_amount === 1500, "Cash collection recorded exact amount: ₹1500");
    assert(codRecord?.collection_status === "collected", "Collection status recorded as 'collected'");

    // [2.9] Courier Remittance Reconciliation
    console.log("\n[2.9] Courier Remittance Reconciliation");
    const remitRef = `REMIT-${Date.now()}`;
    const remitResult = await reconcileCourierRemittance({
      remittanceRef: remitRef,
      orderId: testCodOrderId,
      expectedAmount: 1500,
      remittedAmount: 1500,
      adminId: testAdminId,
      notes: "Weekly Delhivery remittance settlement",
    });

    assert(remitResult.success, "Courier remittance successfully processed");
    assert(remitResult.status === "matched", "Remittance exact match confirmed");
    assert(remitResult.difference === 0, "Zero difference for matched remittance");

    // Verify duplicate remittance protection
    const dupRemitResult = await reconcileCourierRemittance({
      remittanceRef: remitRef,
      orderId: testCodOrderId,
      expectedAmount: 1500,
      remittedAmount: 1500,
      adminId: testAdminId,
    });
    assert(!dupRemitResult.success, "Duplicate remittance reference is rejected");
    assert(dupRemitResult.status === "duplicate", "Status flagged as duplicate");

    // Test remittance with discrepancy/shortfall
    const mismatchRef = `REMIT-SHORT-${Date.now()}`;
    const mismatchResult = await reconcileCourierRemittance({
      remittanceRef: mismatchRef,
      orderId: testCodOrderId,
      expectedAmount: 1500,
      remittedAmount: 1400, // Shortfall of ₹100
      adminId: testAdminId,
      notes: "Shortfall remittance test",
    });
    assert(mismatchResult.success, "Discrepancy remittance recorded");
    assert(mismatchResult.status === "disputed", "Remittance with variance flagged as 'disputed'");
    assert(mismatchResult.difference === 100, "Difference calculated accurately: ₹100");

    console.log("\n================================================================================");
    console.log(` PHASE 2A SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("================================================================================\n");
  } finally {
    await cleanupFixtures();
  }

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests();
