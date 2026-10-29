import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types";
import { initiateRazorpayRefund } from "../lib/integrations/razorpay/service";
import { processRazorpayWebhook, validateWebhookSignature } from "../lib/integrations/razorpay/webhook";
import { cancelAdminOrder } from "../lib/admin/orders";
import crypto from "crypto";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_webhook_secret_local_test";

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

async function runRemediationTests() {
  console.log("=== PHASE 6R: FINANCIAL REMEDIATION & SECURITY HARDENING TEST SUITE ===\n");

  const timestamp = Date.now();
  const customerEmail = `rem_cust_${timestamp}@mdshakib.local`;
  const adminEmail = `rem_admin_${timestamp}@mdshakib.local`;
  const password = "TestPassword123!";

  // --------------------------------------------------------------------------
  // Setup Test Accounts
  // --------------------------------------------------------------------------
  console.log("1. Setting up Test Users...");
  const { data: custAuth } = await adminClient.auth.admin.createUser({
    email: customerEmail,
    password,
    email_confirm: true,
    user_metadata: { name: "Remediation Customer" },
  });
  if (!custAuth?.user) throw new Error("Failed to create customer user.");

  const { data: adminAuth } = await adminClient.auth.admin.createUser({
    email: adminEmail,
    password,
    email_confirm: true,
    user_metadata: { name: "Remediation Admin" },
  });
  if (!adminAuth?.user) throw new Error("Failed to create admin user.");

  await adminClient.from("profiles").update({ role: "admin" }).eq("id", adminAuth.user.id);

  const customerSession = createClient<Database>(SUPABASE_URL, ANON_KEY);
  await customerSession.auth.signInWithPassword({ email: customerEmail, password });

  const adminSession = createClient<Database>(SUPABASE_URL, ANON_KEY);
  await adminSession.auth.signInWithPassword({ email: adminEmail, password });

  console.log("[PASS] Test accounts and sessions configured.\n");

  // --------------------------------------------------------------------------
  // TEST 2: Finding 2 — Restrict Payment Settlement RPC Permissions
  // --------------------------------------------------------------------------
  console.log("2. Testing Finding 2: RPC Execution Privilege Restriction...");

  // Customer attempting settle_payment_atomic MUST fail with permission denied
  let custSettleBlocked = false;
  try {
    const { error: custErr } = await customerSession.rpc("settle_payment_atomic", {
      p_razorpay_order_id: "order_fake",
      p_razorpay_payment_id: "pay_fake",
      p_signature: "sig_fake",
    });
    if (custErr && custErr.message.includes("permission denied")) {
      custSettleBlocked = true;
    }
  } catch {
    custSettleBlocked = true;
  }

  if (!custSettleBlocked) {
    throw new Error("SECURITY FAILURE: Authenticated customer could call settle_payment_atomic!");
  }

  // Customer attempting record_payment_failure_atomic MUST fail with permission denied
  let custFailureBlocked = false;
  try {
    const { error: custFailErr } = await customerSession.rpc("record_payment_failure_atomic", {
      p_razorpay_order_id: "order_fake",
    });
    if (custFailErr && custFailErr.message.includes("permission denied")) {
      custFailureBlocked = true;
    }
  } catch {
    custFailureBlocked = true;
  }

  if (!custFailureBlocked) {
    throw new Error("SECURITY FAILURE: Authenticated customer could call record_payment_failure_atomic!");
  }

  // Customer attempting record_refund_atomic MUST fail with permission denied
  let custRefundBlocked = false;
  try {
    const { error: custRefErr } = await customerSession.rpc("record_refund_atomic", {
      p_order_id: "00000000-0000-0000-0000-000000000000",
      p_refund_id: "rfnd_fake",
      p_refund_amount: 100,
      p_refund_status: "processed",
    });
    if (custRefErr && custRefErr.message.includes("permission denied")) {
      custRefundBlocked = true;
    }
  } catch {
    custRefundBlocked = true;
  }

  if (!custRefundBlocked) {
    throw new Error("SECURITY FAILURE: Authenticated customer could call record_refund_atomic!");
  }

  console.log("[PASS] Finding 2 Resolved: settle_payment_atomic, record_payment_failure_atomic, and record_refund_atomic reject unprivileged callers.\n");

  // --------------------------------------------------------------------------
  // TEST 3: Finding 1 — Prepaid Order Cancellation & Authoritative Refund
  // --------------------------------------------------------------------------
  console.log("3. Testing Finding 1: Prepaid Refund Handling & Ledger Consistency...");

  const { data: book } = await adminClient
    .from("books")
    .select("*")
    .eq("is_active", true)
    .gt("stock", 5)
    .limit(1)
    .single();

  if (!book) throw new Error("No active book for testing.");

  const initialStock = book.stock;

  // Create an Online prepaid order
  const addressSnapshot = {
    full_name: "Remediation Customer",
    phone: "9876543210",
    house_no: "456",
    area: "Remediation Road",
    city: "New Delhi",
    state: "Delhi",
    pincode: "110001",
    address_type: "Home",
  };

  const { data: orderId } = await adminClient.rpc("create_order_atomic", {
    p_user_id: custAuth.user.id,
    p_items: [{ book_id: book.id, quantity: 2, price: book.price }],
    p_address_snapshot: addressSnapshot,
    p_payment_method: "ONLINE",
    p_total_amount: book.price * 2,
  });

  if (!orderId) throw new Error("Failed to create test order.");

  const rzpOrderId = `order_test_${timestamp}`;
  const rzpPaymentId = `pay_test_${timestamp}`;

  // Settle order as Paid via service_role client
  await adminClient.from("orders").update({
    razorpay_order_id: rzpOrderId,
    razorpay_payment_id: rzpPaymentId,
  }).eq("id", orderId);

  await adminClient.from("payments").insert({
    order_id: orderId,
    user_id: custAuth.user.id,
    payment_id: rzpPaymentId,
    provider_order_id: rzpOrderId,
    provider_payment_id: rzpPaymentId,
    amount: book.price * 2,
    currency: "INR",
    provider: "Razorpay",
    status: "Pending",
  });

  // Call settle_payment_atomic with service_role
  const { data: settleRes, error: settleErr } = await adminClient.rpc("settle_payment_atomic", {
    p_razorpay_order_id: rzpOrderId,
    p_razorpay_payment_id: rzpPaymentId,
    p_signature: "mock_sig",
  });
  if (settleErr) throw new Error(`Settle failed: ${settleErr.message}`);

  // Verify order is Paid
  const { data: paidOrder } = await adminClient
    .from("orders")
    .select("payment_status, order_status, total_amount")
    .eq("id", orderId)
    .single();

  if (paidOrder?.payment_status !== "Paid" || paidOrder?.order_status !== "Confirmed") {
    throw new Error(`Order settlement invariant violation: ${JSON.stringify(paidOrder)}`);
  }

  // Cancel order atomically via cancel_order_atomic (simulating admin cancellation)
  await adminClient.rpc("cancel_order_atomic", {
    p_order_id: orderId,
    p_user_id: adminAuth.user.id,
    p_cancel_reason: "Customer requested cancellation before shipment",
    p_is_admin: true,
  });

  // Verify stock restored
  const { data: bookAfterCancel } = await adminClient
    .from("books")
    .select("stock")
    .eq("id", book.id)
    .single();

  if (bookAfterCancel?.stock !== initialStock) {
    throw new Error(`Inventory stock restoration mismatch: expected ${initialStock}, got ${bookAfterCancel?.stock}`);
  }

  // Execute authoritative initiateRazorpayRefund
  const refundResult = await initiateRazorpayRefund({
    orderId,
    reason: "Customer requested cancellation before shipment",
  });

  if (!refundResult.success || !refundResult.refundId) {
    throw new Error(`Refund initiation failed: ${refundResult.error}`);
  }

  // Verify both orders and payments tables are in 'Refunded' status and have matching refund_id
  const { data: verifiedOrder } = await adminClient
    .from("orders")
    .select("payment_status, order_status, razorpay_refund_id, refund_status")
    .eq("id", orderId)
    .single();

  const { data: verifiedPayment } = await adminClient
    .from("payments")
    .select("status, refund_id, refund_status")
    .eq("order_id", orderId)
    .single();

  if (verifiedOrder?.payment_status !== "Refunded" || verifiedOrder?.refund_status !== "processed") {
    throw new Error(`Order payment status not Refunded: ${JSON.stringify(verifiedOrder)}`);
  }

  if (verifiedPayment?.status !== "Refunded" || verifiedPayment?.refund_id !== refundResult.refundId) {
    throw new Error(`Payment table not updated to Refunded: ${JSON.stringify(verifiedPayment)}`);
  }

  console.log("[PASS] Finding 1 Resolved: Gateway refund initiated, confirmed, and ledger synchronized between orders and payments.\n");

  // --------------------------------------------------------------------------
  // TEST 4: Duplicate Refund Idempotency
  // --------------------------------------------------------------------------
  console.log("4. Testing Duplicate Refund Prevention & Idempotency...");

  const dupRefundResult = await initiateRazorpayRefund({
    orderId,
    reason: "Duplicate cancellation attempt",
  });

  if (dupRefundResult.status !== "already_processed") {
    throw new Error(`Duplicate refund was not rejected as already_processed: ${JSON.stringify(dupRefundResult)}`);
  }

  console.log("[PASS] Exact-once refund idempotency verified: Duplicate requests safely return already_processed.\n");

  // --------------------------------------------------------------------------
  // TEST 5: Razorpay Refund Webhook Processing (refund.processed & refund.failed)
  // --------------------------------------------------------------------------
  console.log("5. Testing Razorpay Refund Webhook Processing...");

  // Setup a second order in 'Refund Pending' status
  const { data: orderId2 } = await adminClient.rpc("create_order_atomic", {
    p_user_id: custAuth.user.id,
    p_items: [{ book_id: book.id, quantity: 1, price: book.price }],
    p_address_snapshot: addressSnapshot,
    p_payment_method: "ONLINE",
    p_total_amount: book.price,
  });

  if (!orderId2) throw new Error("Failed to create test order 2");

  const rzpOrder2 = `order_webhook_${timestamp}`;
  const rzpPay2 = `pay_webhook_${timestamp}`;
  const rfnd2 = `rfnd_webhook_${timestamp}`;

  await adminClient.from("orders").update({
    razorpay_order_id: rzpOrder2,
    razorpay_payment_id: rzpPay2,
  }).eq("id", orderId2);

  await adminClient.from("payments").insert({
    order_id: orderId2,
    user_id: custAuth.user.id,
    payment_id: rzpPay2,
    provider_order_id: rzpOrder2,
    provider_payment_id: rzpPay2,
    amount: book.price,
    currency: "INR",
    provider: "Razorpay",
    status: "Pending",
  });

  // Settle order 2
  await adminClient.rpc("settle_payment_atomic", {
    p_razorpay_order_id: rzpOrder2,
    p_razorpay_payment_id: rzpPay2,
    p_signature: "mock_sig",
  });

  // Record refund as 'pending'
  await adminClient.rpc("record_refund_atomic", {
    p_order_id: orderId2,
    p_refund_id: rfnd2,
    p_refund_amount: book.price,
    p_refund_status: "pending",
  });

  // Verify order is in 'Refund Pending'
  const { data: pendingOrder } = await adminClient
    .from("orders")
    .select("payment_status")
    .eq("id", orderId2)
    .single();

  if (pendingOrder?.payment_status !== "Refund Pending") {
    throw new Error(`Expected 'Refund Pending' status, got: ${pendingOrder?.payment_status}`);
  }

  // Construct refund.processed webhook payload
  const refundProcessedPayload = JSON.stringify({
    entity: "event",
    account_id: "acc_test",
    event: "refund.processed",
    contains: ["refund", "payment"],
    payload: {
      refund: {
        entity: {
          id: rfnd2,
          payment_id: rzpPay2,
          amount: Math.round(book.price * 100),
          currency: "INR",
          status: "processed",
        },
      },
      payment: {
        entity: {
          id: rzpPay2,
          order_id: rzpOrder2,
        },
      },
    },
  });

  const webhookSignature = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(refundProcessedPayload)
    .digest("hex");

  // Process refund.processed webhook
  const webhookResult = await processRazorpayWebhook(refundProcessedPayload, webhookSignature);
  if (webhookResult.status !== "refund_recorded") {
    throw new Error(`Refund webhook failed: ${JSON.stringify(webhookResult)}`);
  }

  // Verify order transitioned from 'Refund Pending' to 'Refunded'
  const { data: settledRefundOrder } = await adminClient
    .from("orders")
    .select("payment_status, refund_status")
    .eq("id", orderId2)
    .single();

  if (settledRefundOrder?.payment_status !== "Refunded" || settledRefundOrder?.refund_status !== "processed") {
    throw new Error(`Webhook failed to transition order to Refunded: ${JSON.stringify(settledRefundOrder)}`);
  }

  console.log("[PASS] Razorpay refund webhook processing verified: Transitions 'Refund Pending' -> 'Refunded'.\n");

  // --------------------------------------------------------------------------
  // TEST 6: COD Orders Non-Interference
  // --------------------------------------------------------------------------
  console.log("6. Testing COD Order Cancellation Non-Interference...");

  const { data: codOrderId } = await adminClient.rpc("create_order_atomic", {
    p_user_id: custAuth.user.id,
    p_items: [{ book_id: book.id, quantity: 1, price: book.price }],
    p_address_snapshot: addressSnapshot,
    p_payment_method: "COD",
    p_total_amount: book.price,
  });

  const codRefund = await initiateRazorpayRefund({ orderId: codOrderId! });
  if (codRefund.status !== "not_eligible") {
    throw new Error(`COD order should be not_eligible for Razorpay refund: ${JSON.stringify(codRefund)}`);
  }

  console.log("[PASS] COD orders are not subjected to gateway refunds.\n");

  // --------------------------------------------------------------------------
  // Cleanup Test Fixtures
  // --------------------------------------------------------------------------
  console.log("7. Cleaning up test accounts...");
  await adminClient.auth.admin.deleteUser(custAuth.user.id);
  await adminClient.auth.admin.deleteUser(adminAuth.user.id);

  console.log("[PASS] Test fixtures cleaned up.\n");
  console.log("==================================================================");
  console.log(">>> ALL PHASE 6R FINANCIAL REMEDIATION & SECURITY TESTS PASSED <<<");
  console.log("==================================================================");
}

runRemediationTests().catch((err) => {
  console.error("\n❌ PHASE 6R TEST SUITE FAILED:", err);
  process.exit(1);
});

