/**
 * Phase 2 Remediation Defect Verification Suite
 * MD Shakib Islamic Books Modernization Project
 *
 * Verifies the 8 Remediation Items:
 * D-1: Remove Unsupported Replacement Workflow (pure Return for Refund)
 * D-2: Prevent Delhivery Webhook from Bypassing Delivery OTP
 * D-3: Secure initiate_return_refund_atomic Authorization & Input Validation
 * D-4: Make Refund Processing Idempotent & Prevent Duplicate Gateways/Rows
 * D-5: Correct Partial Refund Amount Handling (Paise passing & status updates)
 * D-6: Protect Invoice Immutability (BEFORE UPDATE/DELETE trigger)
 * D-7: Preserve Delivery Verification Audit History (ON DELETE RESTRICT)
 * D-8: Correct Seller GST Configuration (Normalized states, reject placeholder GSTIN)
 */

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:54321";
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  process.env.SUPABASE_SERVICE_ROLE_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
}
if (!process.env.DELIVERY_OTP_SECRET) {
  process.env.DELIVERY_OTP_SECRET = "dev-secret-pepper-delhivery-otp";
}
if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID) {
  process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID = "rzp_test_mock_123456";
}
if (!process.env.RAZORPAY_KEY_SECRET) {
  process.env.RAZORPAY_KEY_SECRET = "mock_secret_123456";
}

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@supabase/supabase-js";
import { processDelhiveryWebhook } from "@/lib/integrations/delhivery/service";
import { calculateOrderTaxBreakdown, normalizeStateToGstCode } from "@/lib/commerce/tax";
import { getOrCreateOrderInvoice } from "@/lib/commerce/invoices";
import {
  createCustomerReturnRequest,
  adminReviewReturnRequest,
  processReturnRefund,
} from "@/lib/commerce/returns";
import { requestOrderReplacement } from "@/lib/commerce/orders";

const adminDb = createAdminClient();

let testsPassed = 0;
let testsFailed = 0;

function pass(name: string, detail?: string) {
  testsPassed++;
  const count = String(testsPassed).padStart(2, "0");
  console.log(`  ✓ [PASS ${count}] ${name}${detail ? ` (${detail})` : ""}`);
}

function fail(name: string, error: string) {
  testsFailed++;
  console.error(`  ✗ [FAIL] ${name}: ${error}`);
}

function assert(condition: boolean, name: string, detail?: string) {
  if (condition) {
    pass(name, detail);
  } else {
    fail(name, detail || "Assertion failed");
  }
}

async function runRemediationVerificationSuite() {
  console.log("================================================================================");
  console.log("PHASE 2 REMEDIATION DEFECT VERIFICATION SUITE");
  console.log("Defects: D-1 through D-8");
  console.log("================================================================================\n");

  const createdOrderIds: string[] = [];
  const createdBookIds: string[] = [];
  let testUserId = "";

  try {
    // --------------------------------------------------------------------------
    // 0. SETUP COMMON FIXTURES
    // --------------------------------------------------------------------------
    console.log("--- 0. SETUP FIXTURES ---");
    const testEmail = `remediation-tester-${Date.now()}@example.com`;
    const { data: authUser, error: authErr } = await adminDb.auth.admin.createUser({
      email: testEmail,
      password: "TestPassword123!",
      email_confirm: true,
      user_metadata: { full_name: "Remediation Tester" },
    });
    if (authErr || !authUser?.user) throw new Error(`Auth user creation failed: ${authErr?.message}`);
    testUserId = authUser.user.id;

    // Ensure profile has admin role for admin RPC tests
    await adminDb.from("profiles").upsert({
      id: testUserId,
      email: testEmail,
      name: "Remediation Tester",
      role: "admin",
    });
    pass("Created test user and profile with admin role");

    // Insert test book
    const { data: book, error: bookErr } = await adminDb
      .from("books")
      .insert({
        title: "Remediation Verification Book",
        author: "Al-Imam",
        category: "Hadith",
        price: 500,
        stock: 50,
        image_url: "https://cloudinary.com/test.jpg",
        sku: `SKU-REM-${Date.now().toString().slice(-6)}`,
      })
      .select()
      .single();
    if (bookErr || !book) throw new Error(`Book fixture creation failed: ${bookErr?.message}`);
    createdBookIds.push(book.id);
    pass("Created test book fixture");

    // Helper to create test orders
    async function createTestOrder(overrides: Record<string, any> = {}) {
      const orderNum = `ORD-REM-${Date.now().toString().slice(-6)}-${Math.floor(Math.random() * 1000)}`;
      const { data: order, error: ordErr } = await adminDb
        .from("orders")
        .insert({
          user_id: testUserId,
          order_number: orderNum,
          order_status: "Delivered",
          payment_status: "Paid",
          payment_method: "ONLINE",
          total_amount: 1050,
          subtotal: 1000,
          delivery_fee: 50,
          delivered_at: new Date().toISOString(),
          shipping_delivered_at: new Date().toISOString(),
          address_snapshot: {
            full_name: "Remediation Tester",
            address_line1: "123 Faith Road",
            city: "New Delhi",
            state: "Delhi",
            postal_code: "110001",
            phone: "9876543210",
          },
          ...overrides,
        })
        .select()
        .single();
      if (ordErr || !order) throw new Error(`Order creation failed: ${ordErr?.message}`);
      createdOrderIds.push(order.id);

      // Create order item
      const { data: orderItem, error: itemErr } = await adminDb
        .from("order_items")
        .insert({
          order_id: order.id,
          book_id: book!.id,
          title: book!.title,
          price: 500,
          quantity: 2,
          image_url: book!.image_url,
        })
        .select()
        .single();
      if (itemErr || !orderItem) throw new Error(`Order item creation failed: ${itemErr?.message}`);

      return { order, orderItem };
    }

    // --------------------------------------------------------------------------
    // D-1: REMOVE UNSUPPORTED REPLACEMENT WORKFLOW
    // --------------------------------------------------------------------------
    console.log("\n--- D-1: REMOVE UNSUPPORTED REPLACEMENT WORKFLOW ---");
    const { order: orderD1, orderItem: orderItemD1 } = await createTestOrder();

    // Customer requests return with type="replacement" (simulating legacy or rogue payload)
    const retRes = await createCustomerReturnRequest({
      userId: testUserId,
      orderId: orderD1.id,
      reason: "Damaged during transit",
      description: "Cover torn",
      requestType: "replacement" as any,
      items: [
        {
          orderItemId: orderItemD1.id,
          bookId: book.id,
          quantity: 1,
        },
      ],
    });

    assert(retRes.success, "Return request created successfully");
    // Verify in DB that request_type is forced to "return_refund"
    const { data: retRow } = await adminDb
      .from("return_requests")
      .select("id, request_type, status")
      .eq("order_id", orderD1.id)
      .single();
    assert(
      retRow?.request_type === "return_refund",
      "Request type strictly enforced to 'return_refund' (replacement disabled)"
    );

    // Admin approves return request
    const reviewRes = await adminReviewReturnRequest({
      returnId: retRow!.id,
      adminId: testUserId,
      action: "approve",
      adminNotes: "Customer photograph verified, spine damage confirmed.",
    });
    assert(reviewRes.success, "Admin approves return for refund without replacement reservation dead-end");

    // Legacy application action fails closed
    const appReplRes = await requestOrderReplacement(orderD1.id, "Want replacement");
    assert(!appReplRes.success && Boolean(appReplRes.error?.includes("unsupported")), "requestOrderReplacement explicitly rejected as unsupported");

    // --------------------------------------------------------------------------
    // D-2: PREVENT DELHIVERY WEBHOOK FROM BYPASSING DELIVERY OTP
    // --------------------------------------------------------------------------
    console.log("\n--- D-2: PREVENT DELHIVERY WEBHOOK FROM BYPASSING DELIVERY OTP ---");
    const awbD2 = `AWB-D2-${Date.now().toString().slice(-6)}`;
    const { order: orderD2 } = await createTestOrder({
      order_status: "Out for Delivery",
      shipping_awb: awbD2,
      shipping_courier: "Delhivery",
      delivered_at: null,
      shipping_delivered_at: null,
    });

    // Insert an active unverified OTP for this order
    const { error: otpInsErr } = await adminDb.from("delivery_otps").insert({
      order_id: orderD2.id,
      otp_hash: "mock-otp-hash-d2",
      status: "active",
      expires_at: new Date(Date.now() + 86400000).toISOString(),
    });
    if (otpInsErr) throw new Error(`OTP insert failed: ${otpInsErr.message}`);

    // Simulate Delhivery webhook sending "DL" (Delivered)
    const webhookRes = await processDelhiveryWebhook({
      Shipment: {
        Status: {
          Status: "Delivered",
          StatusType: "DL",
          StatusDateTime: new Date().toISOString(),
          Instructions: "Package delivered to security gate",
        },
        AWB: awbD2,
      },
    });

    assert(
      webhookRes.status === "otp_verification_required",
      "Delhivery webhook paused transition: requires mandatory merchant OTP verification"
    );

    // Check DB state of order: order_status MUST NOT be "Delivered"
    const { data: orderD2After } = await adminDb
      .from("orders")
      .select("order_status, shipping_delivered_at")
      .eq("id", orderD2.id)
      .single();

    assert(
      orderD2After?.order_status === "Out for Delivery",
      "Order status remains 'Out for Delivery' (cannot be bypassed by courier webhook)"
    );
    assert(
      Boolean(orderD2After?.shipping_delivered_at),
      "Courier milestone recorded shipping_delivered_at without prematurely marking order Delivered"
    );

    // --------------------------------------------------------------------------
    // D-3: SECURE initiate_return_refund_atomic AUTHORIZATION
    // --------------------------------------------------------------------------
    console.log("\n--- D-3: SECURE initiate_return_refund_atomic AUTHORIZATION ---");
    const { order: orderD3, orderItem: orderItemD3 } = await createTestOrder();
    const retD3 = await createCustomerReturnRequest({
      userId: testUserId,
      orderId: orderD3.id,
      requestType: "return_refund",
      reason: "Defective item",
      items: [
        {
          orderItemId: orderItemD3.id,
          bookId: book.id,
          quantity: 1,
        },
      ],
    });

    const { data: retD3Row } = await adminDb
      .from("return_requests")
      .select("id")
      .eq("order_id", orderD3.id)
      .single();

    // 1. Calling with non-positive amount should fail validation
    const { data: negRes } = await adminDb.rpc("initiate_return_refund_atomic", {
      p_order_id: orderD3.id,
      p_return_id: retD3Row!.id,
      p_admin_id: testUserId,
      p_amount: -100,
      p_reason: "Negative amount test",
    });
    assert(
      (negRes as any)?.success === false && (negRes as any)?.error?.includes("positive"),
      "RPC rejects non-positive refund amount"
    );

    // 2. Calling with authorized service_role / admin credentials succeeds
    const { data: authRpcRes } = await adminDb.rpc("initiate_return_refund_atomic", {
      p_order_id: orderD3.id,
      p_return_id: retD3Row!.id,
      p_admin_id: testUserId,
      p_amount: 500,
      p_reason: "Valid refund test",
    });
    assert(
      (authRpcRes as any)?.success === true,
      "RPC executes successfully under authorized service_role / admin credentials"
    );

    // 3. Calling with unauthorized non-admin profile identity fails closed
    const { data: nonAdminAuth } = await adminDb.auth.admin.createUser({
      email: `nonadmin-${Date.now()}@example.com`,
      password: "TestPassword123!",
      email_confirm: true,
    });
    const { data: nonAdminRes, error: nonAdminErr } = await adminDb.rpc("initiate_return_refund_atomic", {
      p_order_id: orderD3.id,
      p_return_id: retD3Row!.id,
      p_admin_id: nonAdminAuth!.user!.id,
      p_amount: 500,
      p_reason: "Non-admin identity spoof test",
    });
    assert(
      Boolean(nonAdminErr) || (nonAdminRes as any)?.success === false,
      "initiate_return_refund_atomic rejects unauthorized non-admin profile identity"
    );

    // --------------------------------------------------------------------------
    // D-4: MAKE REFUND PROCESSING IDEMPOTENT
    // --------------------------------------------------------------------------
    console.log("\n--- D-4: MAKE REFUND PROCESSING IDEMPOTENT ---");
    // Call initiate_return_refund_atomic a SECOND time for the same return request
    const { data: secondRpcRes } = await adminDb.rpc("initiate_return_refund_atomic", {
      p_order_id: orderD3.id,
      p_return_id: retD3Row!.id,
      p_admin_id: testUserId,
      p_amount: 500,
      p_reason: "Duplicate call test",
    });

    assert(
      (secondRpcRes as any)?.success === true,
      "Second invocation succeeds idempotently"
    );
    assert(
      (secondRpcRes as any)?.already_initiated === true,
      "RPC signals already_initiated: true on duplicate call"
    );
    assert(
      (secondRpcRes as any)?.refund_record_id === (authRpcRes as any)?.refund_record_id,
      "Returns identical existing refund record ID"
    );

    // Verify refund_records table has strictly 1 active record for this return request
    const { data: refundRows } = await adminDb
      .from("refund_records")
      .select("id")
      .eq("return_request_id", retD3Row!.id);
    assert(
      refundRows?.length === 1,
      "Partial unique index idx_refund_records_return_active prevents duplicate active refunds"
    );

    // --------------------------------------------------------------------------
    // D-5: CORRECT PARTIAL REFUND AMOUNT HANDLING
    // --------------------------------------------------------------------------
    console.log("\n--- D-5: CORRECT PARTIAL REFUND AMOUNT HANDLING ---");
    const { order: orderD5, orderItem: orderItemD5 } = await createTestOrder({
      total_amount: 1050,
      subtotal: 1000,
      delivery_fee: 50,
      razorpay_payment_id: "pay_test_partial_123",
    });
    const retD5 = await createCustomerReturnRequest({
      userId: testUserId,
      orderId: orderD5.id,
      requestType: "return_refund",
      reason: "Only returning 1 volume",
      items: [
        {
          orderItemId: orderItemD5.id,
          bookId: book.id,
          quantity: 1,
        },
      ],
    });
    const { data: retD5Row } = await adminDb
      .from("return_requests")
      .select("id")
      .eq("order_id", orderD5.id)
      .single();

    // Process partial refund of ₹500 on an order of ₹1050
    const partialRefundRes = await processReturnRefund({
      returnId: retD5Row!.id,
      adminId: testUserId,
      amount: 500,
      reason: "Partial return of 1 item",
    });
    assert(partialRefundRes.success, "Partial return refund processed successfully");
    assert(
      partialRefundRes.amount === 500,
      "Refund record explicitly records approved partial amount of ₹500 (not full order total)"
    );

    // Order status should record processed refund
    const { data: orderD5After } = await adminDb
      .from("orders")
      .select("order_status, refund_status, refund_amount")
      .eq("id", orderD5.id)
      .single();
    assert(
      orderD5After?.refund_status === "processed",
      "Order refund_status set to 'processed'"
    );
    assert(
      Number(orderD5After?.refund_amount) === 500,
      "Order refund_amount accurately tracks ₹500 partial refund"
    );

    // --------------------------------------------------------------------------
    // D-6: PROTECT INVOICE IMMUTABILITY
    // --------------------------------------------------------------------------
    console.log("\n--- D-6: PROTECT INVOICE IMMUTABILITY ---");
    const { order: orderD6 } = await createTestOrder();
    const invRes = await getOrCreateOrderInvoice(orderD6.id);
    assert(invRes.success && Boolean(invRes.invoice), "Statutory invoice created");
    const invoiceId = invRes.invoice!.id;

    // 1. Attempt to UPDATE financial values
    const { error: updateErr } = await adminDb
      .from("invoices")
      .update({ grand_total: 99999 })
      .eq("id", invoiceId);
    assert(
      Boolean(updateErr) && updateErr!.message.includes("immutable"),
      "BEFORE UPDATE trigger rejects tampering with invoice financial data"
    );

    // 2. Attempt to UPDATE non-financial metadata (NULL-safe IS DISTINCT FROM check)
    const { error: updateNameErr } = await adminDb
      .from("invoices")
      .update({ billing_name: "Tampered Customer Name" })
      .eq("id", invoiceId);
    assert(
      Boolean(updateNameErr) && updateNameErr!.message.includes("immutable"),
      "BEFORE UPDATE trigger rejects modifying billing_name or any invoice column (NULL-safe)"
    );

    // 3. Attempt to DELETE invoice
    const { error: deleteErr } = await adminDb
      .from("invoices")
      .delete()
      .eq("id", invoiceId);
    assert(
      Boolean(deleteErr) && deleteErr!.message.includes("cannot be deleted"),
      "BEFORE DELETE trigger rejects deletion of statutory invoices"
    );

    // --------------------------------------------------------------------------
    // D-7: PRESERVE DELIVERY VERIFICATION AUDIT HISTORY
    // --------------------------------------------------------------------------
    console.log("\n--- D-7: PRESERVE DELIVERY VERIFICATION AUDIT HISTORY ---");
    const { order: orderD7 } = await createTestOrder();

    // Insert delivery verification record
    const { error: dvErr } = await adminDb.from("delivery_verifications").insert({
      order_id: orderD7.id,
      actor_id: testUserId,
      actor_role: "admin",
      outcome: "SUCCESS",
      metadata: { notes: "Handed to customer in person" },
    });
    assert(!dvErr, "Delivery verification audit log inserted");

    // Attempt to delete parent order
    const { error: ordDeleteErr } = await adminDb
      .from("orders")
      .delete()
      .eq("id", orderD7.id);

    assert(
      Boolean(ordDeleteErr) &&
        (ordDeleteErr!.message.includes("violates foreign key constraint") ||
          ordDeleteErr!.message.includes("delivery_verifications")),
      "Foreign key ON DELETE RESTRICT blocks order deletion, preserving audit trail"
    );

    // --------------------------------------------------------------------------
    // D-8: CORRECT SELLER GST CONFIGURATION & STATE NORMALIZATION
    // --------------------------------------------------------------------------
    console.log("\n--- D-8: CORRECT SELLER GST CONFIGURATION & STATE NORMALIZATION ---");

    // 1. Normalization tests
    assert(normalizeStateToGstCode("Delhi") === "07", "Normalizes 'Delhi' to '07'");
    assert(normalizeStateToGstCode("NCT of Delhi") === "07", "Normalizes 'NCT of Delhi' to '07'");
    assert(normalizeStateToGstCode("delhi ncr") === "07", "Normalizes 'delhi ncr' to '07'");
    assert(normalizeStateToGstCode("UP") === "09", "Normalizes 'UP' to '09'");
    assert(normalizeStateToGstCode("Uttar Pradesh") === "09", "Normalizes 'Uttar Pradesh' to '09'");
    assert(normalizeStateToGstCode("Maharashtra") === "27", "Normalizes 'Maharashtra' to '27'");

    // 2. Tax breakdown calculation with normalized states
    const delhiTax = calculateOrderTaxBreakdown({
      subtotal: 1000,
      discount: 0,
      shippingFee: 50,
      stateCode: "NCT of Delhi",
    });
    assert(!delhiTax.isInterstate, "NCT of Delhi correctly resolves to Intra-state");
    assert(delhiTax.cgstRate === 9 && delhiTax.sgstRate === 9, "Intra-state applies CGST 9% + SGST 9%");

    const upTax = calculateOrderTaxBreakdown({
      subtotal: 1000,
      discount: 0,
      shippingFee: 50,
      stateCode: "UP",
    });
    assert(upTax.isInterstate, "UP correctly resolves to Inter-state");
    assert(upTax.igstRate === 18, "Inter-state applies IGST 18%");

    // Configurable seller state (e.g. Maharashtra seller shipping to Maharashtra customer)
    const mhSellerTax = calculateOrderTaxBreakdown({
      subtotal: 1000,
      discount: 0,
      shippingFee: 50,
      stateCode: "Maharashtra",
      sellerStateCode: "27",
    });
    assert(!mhSellerTax.isInterstate, "Configurable seller state: MH to MH is Intra-state");

    // 3. Database RPC rejects placeholder GSTIN
    const { order: orderD8 } = await createTestOrder();
    const { data: placeholderRes } = await adminDb.rpc("generate_order_invoice_atomic", {
      p_order_id: orderD8.id,
      p_seller_gstin: "07AAAAA0000A1Z5", // Placeholder
    });
    assert(
      (placeholderRes as any)?.success === false &&
        (placeholderRes as any)?.error?.toLowerCase().includes("placeholder"),
      "generate_order_invoice_atomic strictly rejects placeholder '07AAAAA0000A1Z5'"
    );

    // Database RPC accepts valid test GSTIN
    const { data: validGstinRes } = await adminDb.rpc("generate_order_invoice_atomic", {
      p_order_id: orderD8.id,
      p_seller_gstin: "07AABCM1234F1Z5", // Valid 15-char format
    });
    assert(
      (validGstinRes as any)?.success === true,
      "generate_order_invoice_atomic succeeds with valid 15-character GSTIN"
    );

    // 4. Calling generate_order_invoice_atomic via anon/unauthorized client fails
    const anonClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { error: anonInvoiceErr } = await anonClient.rpc("generate_order_invoice_atomic", {
      p_order_id: orderD8.id,
      p_seller_gstin: "07AABCM1234F1Z5",
    });
    assert(
      Boolean(anonInvoiceErr) &&
        (anonInvoiceErr!.message.includes("permission denied") ||
          anonInvoiceErr!.message.includes("Unauthorized") ||
          anonInvoiceErr!.message.includes("does not exist")),
      "generate_order_invoice_atomic rejects execution from anonymous / unauthenticated clients"
    );

  } catch (err: any) {
    console.error("FATAL SUITE ERROR:", err);
    testsFailed++;
  } finally {
    // --------------------------------------------------------------------------
    // PURGE TEST FIXTURES
    // --------------------------------------------------------------------------
    console.log("\n--- PURGING REMEDIATION TEST FIXTURES ---");
    for (const ordId of createdOrderIds) {
      await adminDb.from("delivery_otps").delete().eq("order_id", ordId);
      await adminDb.from("refund_records").delete().eq("order_id", ordId);
      await adminDb.from("return_requests").delete().eq("order_id", ordId);
      await adminDb.from("delivery_verifications").delete().eq("order_id", ordId);
      await adminDb.from("order_items").delete().eq("order_id", ordId);
    }
    for (const bId of createdBookIds) {
      await adminDb.from("books").delete().eq("id", bId);
    }
    if (testUserId) {
      await adminDb.auth.admin.deleteUser(testUserId).catch(() => {});
    }
  }

  console.log("\n================================================================================");
  console.log(`REMEDIATION VERIFICATION RESULTS: ${testsPassed} PASSED | ${testsFailed} FAILED`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runRemediationVerificationSuite();
