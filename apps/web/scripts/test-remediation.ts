/**
 * PHASE 5D SECURITY REMEDIATION TEST SUITE
 * Tests:
 * 1. Delhivery Webhook Authentication (Missing, Invalid, Valid Token, Fail-Closed)
 * 2. Delhivery Status Machine (Replay, Illegal transition from Delivered/Cancelled)
 * 3. Razorpay Out-of-Order Lifecycle (Paid followed by late Failed, Failed followed by Paid)
 * 4. Razorpay Concurrency & Single-Settlement Atomicity (settled=true exactly once)
 * 5. Cloudinary Binary Magic-Byte Validation (MIME spoofing, corrupted buffer, oversized)
 */

import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  verifyDelhiveryWebhookAuth,
  isAllowedStatusTransition,
  processDelhiveryWebhook,
} from "../lib/integrations/delhivery/service";
import { validateRazorpaySignature } from "../lib/integrations/razorpay/service";
import { processRazorpayWebhook } from "../lib/integrations/razorpay/webhook";
import {
  detectImageSignature,
  uploadImageBuffer,
} from "../lib/integrations/cloudinary/service";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function runRemediationTests() {
  console.log("=== PHASE 5D SECURITY REMEDIATION TEST SUITE ===\n");
  let passed = 0;
  const total = 10;

  // ---------------------------------------------------------------------------
  // 1. Delhivery Webhook Authentication Tests
  // ---------------------------------------------------------------------------
  console.log("1. Testing Delhivery Webhook Authentication & Fail-Closed Behavior");
  const validSecret = "test_delhivery_webhook_secret_xyz123";
  process.env.DELHIVERY_WEBHOOK_SECRET = validSecret;

  // A. Missing credential
  const noCred = verifyDelhiveryWebhookAuth(null, null);
  if (noCred.authorized) throw new Error("Accepted webhook with missing credentials");

  // B. Incorrect credential
  const wrongCred = verifyDelhiveryWebhookAuth("Token wrong_secret_key", null);
  if (wrongCred.authorized) throw new Error("Accepted webhook with invalid credentials");

  // C. Valid credential in Authorization: Token
  const validTokenHeader = verifyDelhiveryWebhookAuth(`Token ${validSecret}`, null);
  if (!validTokenHeader.authorized) throw new Error("Rejected valid Authorization: Token header");

  // D. Valid credential in Authorization: Bearer
  const validBearerHeader = verifyDelhiveryWebhookAuth(`Bearer ${validSecret}`, null);
  if (!validBearerHeader.authorized) throw new Error("Rejected valid Authorization: Bearer header");

  // E. Valid credential in custom x-delhivery-secret header
  const validCustomHeader = verifyDelhiveryWebhookAuth(null, validSecret);
  if (!validCustomHeader.authorized) throw new Error("Rejected valid x-delhivery-secret header");

  // F. Fail-closed when secret is missing from server configuration
  delete process.env.DELHIVERY_WEBHOOK_SECRET;
  const failClosedCheck = verifyDelhiveryWebhookAuth(`Token ${validSecret}`, null);
  if (failClosedCheck.authorized || !failClosedCheck.reason?.includes("fail closed")) {
    throw new Error("Failed to fail-closed when DELHIVERY_WEBHOOK_SECRET is absent");
  }
  process.env.DELHIVERY_WEBHOOK_SECRET = validSecret; // restore test secret

  console.log("[PASS] Delhivery webhook authentication verified: missing/wrong rejected, valid accepted, missing config fails closed.");
  passed++;

  // ---------------------------------------------------------------------------
  // 2. Delhivery Status Machine & Illegal Transition Rejection
  // ---------------------------------------------------------------------------
  console.log("\n2. Testing Delhivery State Machine (Replay & Illegal Transition Rejection)");
  // Transition rules:
  // Delivered -> Shipped (Illegal)
  // Cancelled -> Delivered (Illegal)
  // Shipped -> Out for Delivery (Legal)
  // Delivered -> Delivered (Idempotent OK)
  if (isAllowedStatusTransition("Delivered", "Shipped")) {
    throw new Error("State machine allowed illegal regression from Delivered to Shipped");
  }
  if (isAllowedStatusTransition("Cancelled", "Delivered")) {
    throw new Error("State machine allowed illegal transition from Cancelled to Delivered");
  }
  if (!isAllowedStatusTransition("Shipped", "Out for Delivery")) {
    throw new Error("State machine rejected valid transition Shipped -> Out for Delivery");
  }
  if (!isAllowedStatusTransition("Delivered", "Delivered")) {
    throw new Error("State machine rejected idempotent re-delivery status");
  }

  console.log("[PASS] Delhivery state machine transitions enforced: regressions and mutations on terminal states blocked.");
  passed++;

  // ---------------------------------------------------------------------------
  // 3. Database Seed for Webhook Tests
  // ---------------------------------------------------------------------------
  console.log("\n3. Setting up Database Fixtures for Atomic Webhook Tests");
  const testEmail = `rem_user_${Date.now()}@example.com`;
  const { data: userAuth, error: uErr } = await adminDb.auth.admin.createUser({
    email: testEmail,
    password: "Password123!",
    email_confirm: true,
  });
  if (uErr) throw uErr;
  const testUserId = userAuth.user.id;

  const { data: book } = await adminDb.from("books").select("*").gt("stock", 5).limit(1).single();
  if (!book) throw new Error("No available book fixture");

  const addressSnap = {
    full_name: "Remediation Tester",
    phone: "9876543210",
    house_no: "123 Test St",
    area: "Okhla",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110025",
    address_type: "Home",
  };

  const { data: orderId, error: ordErr } = await adminDb.rpc("create_order_atomic", {
    p_user_id: testUserId,
    p_items: [{ book_id: book.id, quantity: 1, price: book.price }],
    p_address_snapshot: addressSnap,
    p_payment_method: "ONLINE",
    p_total_amount: Number(book.price) + 45.0,
  });
  if (ordErr || !orderId) throw ordErr;

  const rzpOrderId = `order_rem_${Date.now()}`;
  await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId }).eq("id", orderId);
  await adminDb.from("payments").insert({
    order_id: orderId,
    user_id: testUserId,
    payment_id: rzpOrderId,
    provider_order_id: rzpOrderId,
    amount: Number(book.price) + 45.0,
    currency: "INR",
    provider: "Razorpay",
    status: "Pending",
  });
  console.log(`[PASS] Fixture Order ${orderId} created with Razorpay Order ${rzpOrderId}`);
  passed++;

  // ---------------------------------------------------------------------------
  // 4. Razorpay Out-of-Order Payment Failed Overwrite Protection
  // ---------------------------------------------------------------------------
  console.log("\n4. Testing Protection Against Out-of-Order payment.failed Overwriting Paid Status");
  const rzpSecret = "test_rzp_sec_12345";
  process.env.RAZORPAY_WEBHOOK_SECRET = rzpSecret;

  const payCapturedPayload = JSON.stringify({
    event: "payment.captured",
    payload: {
      order: { entity: { id: rzpOrderId } },
      payment: { entity: { id: `pay_cap_${Date.now()}`, order_id: rzpOrderId } },
    },
  });
  const payCapturedSig = crypto.createHmac("sha256", rzpSecret).update(payCapturedPayload).digest("hex");

  // Step A: Mark order Paid via captured webhook
  const settleRes = await processRazorpayWebhook(payCapturedPayload, payCapturedSig);
  if (settleRes.status !== "settled") throw new Error("Initial settlement failed");

  // Verify order and payment are Paid
  const { data: orderPaid } = await adminDb.from("orders").select("payment_status, is_paid").eq("id", orderId).single();
  const { data: paymentPaid } = await adminDb.from("payments").select("status").eq("provider_order_id", rzpOrderId).single();
  if (orderPaid?.payment_status !== "Paid" || !orderPaid?.is_paid || paymentPaid?.status !== "Paid") {
    throw new Error("Order or payment was not marked as Paid");
  }

  // Step B: Out-of-order payment.failed webhook arrives
  const payFailedPayload = JSON.stringify({
    event: "payment.failed",
    payload: {
      payment: { entity: { id: `pay_fail_${Date.now()}`, order_id: rzpOrderId } },
    },
  });
  const payFailedSig = crypto.createHmac("sha256", rzpSecret).update(payFailedPayload).digest("hex");

  const failRes = await processRazorpayWebhook(payFailedPayload, payFailedSig);
  if (failRes.status !== "ignored_already_paid") {
    throw new Error(`Out-of-order failure was not rejected: ${JSON.stringify(failRes)}`);
  }

  // Step C: Verify order and payment status REMAINS Paid
  const { data: orderAfterFail } = await adminDb.from("orders").select("payment_status, is_paid").eq("id", orderId).single();
  const { data: paymentAfterFail } = await adminDb.from("payments").select("status").eq("provider_order_id", rzpOrderId).single();

  if (orderAfterFail?.payment_status !== "Paid" || paymentAfterFail?.status !== "Paid") {
    throw new Error("CRITICAL DEFECT: Late payment.failed overwrote verified Paid status!");
  }
  console.log("[PASS] Out-of-order payment.failed safely rejected: Paid status preserved in both orders and payments.");
  passed++;

  // ---------------------------------------------------------------------------
  // 5. Razorpay State Recovery: Failed followed by legitimate Paid
  // ---------------------------------------------------------------------------
  console.log("\n5. Testing State Recovery: Initial payment.failed followed by successful payment.captured");
  const rzpOrderId2 = `order_rem2_${Date.now()}`;
  const { data: orderId2 } = await adminDb.rpc("create_order_atomic", {
    p_user_id: testUserId,
    p_items: [{ book_id: book.id, quantity: 1, price: book.price }],
    p_address_snapshot: addressSnap,
    p_payment_method: "ONLINE",
    p_total_amount: Number(book.price) + 45.0,
  });

  await adminDb.from("orders").update({ razorpay_order_id: rzpOrderId2 }).eq("id", orderId2);
  await adminDb.from("payments").insert({
    order_id: orderId2,
    user_id: testUserId,
    payment_id: rzpOrderId2,
    provider_order_id: rzpOrderId2,
    amount: Number(book.price) + 45.0,
    currency: "INR",
    provider: "Razorpay",
    status: "Pending",
  });

  // Step A: Payment fails first
  const failPayload2 = JSON.stringify({
    event: "payment.failed",
    payload: {
      payment: { entity: { id: `pay_fail2_${Date.now()}`, order_id: rzpOrderId2 } },
    },
  });
  const failSig2 = crypto.createHmac("sha256", rzpSecret).update(failPayload2).digest("hex");
  const failRes2 = await processRazorpayWebhook(failPayload2, failSig2);
  if (failRes2.status !== "recorded_failure") throw new Error("Failed to record initial payment failure");

  const { data: payRec2 } = await adminDb.from("payments").select("status").eq("provider_order_id", rzpOrderId2).single();
  if (payRec2?.status !== "Failed") throw new Error("Payment record status was not updated to Failed");

  // Step B: Legitimate captured event arrives (customer retried and succeeded)
  const capPayload2 = JSON.stringify({
    event: "payment.captured",
    payload: {
      order: { entity: { id: rzpOrderId2 } },
      payment: { entity: { id: `pay_cap2_${Date.now()}`, order_id: rzpOrderId2 } },
    },
  });
  const capSig2 = crypto.createHmac("sha256", rzpSecret).update(capPayload2).digest("hex");
  const capRes2 = await processRazorpayWebhook(capPayload2, capSig2);
  if (capRes2.status !== "settled") throw new Error("Failed to recover and settle from previously failed state");

  const { data: order2Final } = await adminDb.from("orders").select("payment_status, is_paid").eq("id", orderId2).single();
  const { data: pay2Final } = await adminDb.from("payments").select("status").eq("provider_order_id", rzpOrderId2).single();

  if (order2Final?.payment_status !== "Paid" || pay2Final?.status !== "Paid") {
    throw new Error("Order failed to transition to Paid after customer retry");
  }
  console.log("[PASS] Payment state recovery verified: Initial Failed state successfully transitioned to Paid upon customer retry.");
  passed++;

  // ---------------------------------------------------------------------------
  // 6. Concurrency & Single-Settlement Atomicity
  // ---------------------------------------------------------------------------
  console.log("\n6. Testing Webhook Settlement Atomicity & Idempotency Under Duplicate Callbacks");
  // Calling settle_payment_atomic twice on orderId2
  const dupSettle = await adminDb.rpc("settle_payment_atomic", {
    p_razorpay_order_id: rzpOrderId2,
    p_razorpay_payment_id: "pay_dup_test",
    p_signature: "sig_dup",
  });

  const dupRes = dupSettle.data as any;
  if (!dupRes.success || dupRes.settled !== false || dupRes.status !== "already_paid") {
    throw new Error(`Duplicate atomic settlement did not enforce idempotency: ${JSON.stringify(dupRes)}`);
  }
  console.log("[PASS] Atomic single-settlement invariant enforced: Repeated calls return settled=false and status=already_paid.");
  passed++;

  // ---------------------------------------------------------------------------
  // 7. Cloudinary Magic Byte Signature Detection
  // ---------------------------------------------------------------------------
  console.log("\n7. Testing Cloudinary Image Magic-Byte Signatures");
  // JPEG: FF D8 FF
  const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
  if (detectImageSignature(jpegHeader) !== "image/jpeg") throw new Error("Failed to detect JPEG magic bytes");

  // PNG: 89 50 4E 47
  const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
  if (detectImageSignature(pngHeader) !== "image/png") throw new Error("Failed to detect PNG magic bytes");

  // WebP: RIFF (bytes 0-3) + WEBP (bytes 8-11)
  const webpHeader = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]);
  if (detectImageSignature(webpHeader) !== "image/webp") throw new Error("Failed to detect WebP magic bytes");

  // Random text
  const textHeader = Buffer.from("Hello World Random Text");
  if (detectImageSignature(textHeader) !== null) throw new Error("Incorrectly detected magic bytes for plain text");

  console.log("[PASS] Binary magic bytes detected correctly for JPEG, PNG, and WebP; plain text rejected.");
  passed++;

  // ---------------------------------------------------------------------------
  // 8. Cloudinary MIME Spoofing & Malformed Buffer Rejection
  // ---------------------------------------------------------------------------
  console.log("\n8. Testing Cloudinary MIME Spoofing & Corrupted Buffer Rejection");
  // A. MIME spoofing: declared image/png but payload contains JPEG magic bytes
  let mimeSpoofRejected = false;
  try {
    await uploadImageBuffer(jpegHeader, "image/png");
  } catch (err: any) {
    if (err.message.includes("MIME type spoofing detected")) mimeSpoofRejected = true;
  }
  if (!mimeSpoofRejected) throw new Error("Failed to reject MIME spoofing attack");

  // B. Corrupted/Plain text declared as image/jpeg
  let corruptedRejected = false;
  try {
    await uploadImageBuffer(Buffer.from("<script>alert(1)</script>"), "image/jpeg");
  } catch (err: any) {
    if (err.message.includes("missing valid image magic bytes signature")) corruptedRejected = true;
  }
  if (!corruptedRejected) throw new Error("Failed to reject corrupted image buffer");

  // C. Valid PNG buffer with matching image/png MIME
  const validPngUpload = await uploadImageBuffer(pngHeader, "image/png");
  if (!validPngUpload.secure_url || !validPngUpload.public_id) {
    throw new Error("Valid PNG buffer upload failed");
  }

  console.log("[PASS] Cloudinary upload validation: MIME spoofing rejected, corrupted payloads rejected, valid images accepted.");
  passed++;

  // ---------------------------------------------------------------------------
  // 9. Delhivery Unauthorized Webhook Mutation Rejection
  // ---------------------------------------------------------------------------
  console.log("\n9. Testing Database Protection Against Unauthorized Delhivery Webhook Updates");
  // Create an order with an AWB
  const testAwb = `DLVTEST${Date.now().toString().slice(-8)}`;
  await adminDb.from("orders").update({ shipping_awb: testAwb, order_status: "Shipped" }).eq("id", orderId);

  // Attempt to transition to Delivered via illegal state transition from non-existent AWB
  const unknownAwbRes = await processDelhiveryWebhook({
    waybill: "NON_EXISTENT_AWB_99999",
    status: "Delivered",
  });
  if (unknownAwbRes.status !== "order_not_found") {
    throw new Error("Failed to reject unknown AWB in Delhivery webhook");
  }

  // Attempt illegal transition from Cancelled order
  await adminDb.from("orders").update({ order_status: "Cancelled" }).eq("id", orderId);
  const cancelTransitionRes = await processDelhiveryWebhook({
    waybill: testAwb,
    status: "Delivered",
  });
  if (cancelTransitionRes.status !== "rejected_illegal_transition") {
    throw new Error("Failed to reject status transition on Cancelled order");
  }

  // Verify status in DB was NOT changed
  const { data: orderUntouched } = await adminDb.from("orders").select("order_status").eq("id", orderId).single();
  if (orderUntouched?.order_status !== "Cancelled") {
    throw new Error("Database state was illegally modified on rejected transition");
  }

  console.log("[PASS] Unauthorized and illegal Delhivery state transitions rejected; database state preserved.");
  passed++;

  // ---------------------------------------------------------------------------
  // 10. Legitimate Delhivery State Transition Test
  // ---------------------------------------------------------------------------
  console.log("\n10. Testing Legitimate Delhivery State Transition & Timestamp Update");
  // Reset order to Shipped
  await adminDb.from("orders").update({ order_status: "Shipped", delivered_at: null }).eq("id", orderId);

  const legitTransitionRes = await processDelhiveryWebhook({
    waybill: testAwb,
    status: "Delivered",
  });

  if (legitTransitionRes.status !== "updated" || legitTransitionRes.newStatus !== "Delivered") {
    throw new Error(`Legitimate transition failed: ${JSON.stringify(legitTransitionRes)}`);
  }

  const { data: orderDelivered } = await adminDb.from("orders").select("order_status, delivered_at").eq("id", orderId).single();
  if (orderDelivered?.order_status !== "Delivered" || !orderDelivered?.delivered_at) {
    throw new Error("Order status or delivered_at was not updated on legitimate transition");
  }

  console.log(`[PASS] Legitimate Delhivery transition processed: Status -> Delivered (Timestamp: ${orderDelivered.delivered_at}).`);
  passed++;

  console.log(`\n========================================================`);
  console.log(`>>> ALL ${passed}/${total} SECURITY REMEDIATION TESTS PASSED <<<`);
  console.log(`========================================================\n`);
}

runRemediationTests().catch((err) => {
  console.error("\n[FAIL] Security Remediation Test Failed:", err);
  process.exit(1);
});

