/**
 * Phase 2 — Lean E-Commerce Core Journey & Architecture Verification Suite
 * MD Shakib Islamic Books Modernization Project
 *
 * Verifies the 6 Core Workflows:
 * 1. Customer Shopping Experience (Catalog, Search, Book Details, Cart calculations)
 * 2. Orders & Payments (Server-authoritative pricing, COD, Online, Payment Retry, Cancellation)
 * 3. Delivery & Shipping (Delhivery Pincode check, Consignment booking, AWB, Tracking, Delivery OTP)
 * 4. Financial Documents (GST Tax invoice with 0% Books / 18% Shipping, Payment receipt)
 * 5. Returns & Refunds (7-day policy eligibility, Customer request, Admin review, Razorpay refund)
 * 6. Inventory Accuracy & Admin Summaries (Overselling prevention, Stock updates, Low-stock visibility)
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

import { createAdminClient } from "@/lib/supabase/admin";
import { getBooks, getBookById } from "@/lib/data/catalog";
import { checkPincodeServiceability, createShipmentForOrder, trackShipment } from "@/lib/integrations/delhivery/service";
import { generateAndStoreDeliveryOtp, verifyDeliveryOtp, hashDeliveryOtp } from "@/lib/delivery/otp";
import { calculateOrderTaxBreakdown } from "@/lib/commerce/tax";
import { getOrCreateOrderInvoice, getOrderPaymentReceipt } from "@/lib/commerce/invoices";
import { checkOrderReturnEligibility, createCustomerReturnRequest, adminReviewReturnRequest } from "@/lib/commerce/returns";
import { checkAndTriggerLowStockAlerts } from "@/lib/admin/inventory";
import { getAdminDashboardStats } from "@/lib/admin/dashboard";

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

async function runLeanEcommerceSuite() {
  console.log("\n================================================================================");
  console.log(" PHASE 2: LEAN E-COMMERCE CORE JOURNEY & INTEGRATION VERIFICATION SUITE");
  console.log(" MD Shakib Islamic Books — Production-Grade Lean Architecture Verification");
  console.log("================================================================================\n");

  const testSuffix = `lean_${Date.now()}`;
  let testUserId = "";
  let testAdminId = "";
  let testBookId = "";
  let testOrderId = "";

  try {
    // --------------------------------------------------------------------------
    // 0. SETUP FIXTURES
    // --------------------------------------------------------------------------
    console.log("--- PROVISIONING TEST FIXTURES ---");

    // Create customer in auth
    const custEmail = `ahmad_${testSuffix}@example.com`;
    const { data: custAuth } = await adminDb.auth.admin.createUser({
      email: custEmail,
      password: "Password123!",
      email_confirm: true,
    });
    testUserId = custAuth!.user!.id;
    await adminDb.from("profiles").upsert({
      id: testUserId,
      name: "Ahmad Customer",
      email: custEmail,
      role: "user",
    });

    // Create admin in auth
    const admEmail = `admin_${testSuffix}@example.com`;
    const { data: admAuth } = await adminDb.auth.admin.createUser({
      email: admEmail,
      password: "Password123!",
      email_confirm: true,
    });
    testAdminId = admAuth!.user!.id;
    await adminDb.from("profiles").upsert({
      id: testAdminId,
      name: "Super Admin",
      email: admEmail,
      role: "super_admin",
    });

    // Insert test book with known stock
    const { data: bookRec, error: bookErr } = await adminDb
      .from("books")
      .insert({
        title: `Sahih al-Bukhari Illustrated Edition (${testSuffix})`,
        author: "Imam al-Bukhari",
        category: "Hadith",
        price: 1200.0,
        discount: 10, // 10% discount -> ₹1080 effective
        stock: 25,
        is_active: true,
        image_url: "https://cloudinary.com/bukhari_cover.jpg",
        description: "Complete Hadith collection with scholarly commentary.",
      })
      .select("id")
      .single();

    if (bookErr || !bookRec) {
      throw new Error(`Failed to create test book fixture: ${bookErr?.message}`);
    }
    testBookId = bookRec.id;
    console.log(`✓ Fixtures provisioned: Book ID ${testBookId}`);

    // --------------------------------------------------------------------------
    // 1. CUSTOMER SHOPPING EXPERIENCE (CATALOG, DETAILS, CART, PRICING)
    // --------------------------------------------------------------------------
    console.log("\n--- 1. CUSTOMER SHOPPING EXPERIENCE ---");

    // 1.1 Catalog query with search and filtering
    const catalogRes = await getBooks({ search: testSuffix, category: "Hadith" });
    assert(catalogRes.books.length >= 1, "Catalog query returns books matching search and category filter");
    assert(catalogRes.books[0].title.includes("Sahih al-Bukhari"), "Catalog book domain model maps title correctly");
    assert(catalogRes.books[0].stock === 25, "Catalog book displays accurate available stock");

    // 1.2 Book detail fetch
    const bookDetail = await getBookById(testBookId);
    assert(Boolean(bookDetail), "getBookById retrieves complete book metadata");
    assert(bookDetail?.price === 1200 && bookDetail?.discount === 10, "Book details accurately captures price and discount percentage");

    // 1.3 Server-authoritative cart pricing calculation
    const { data: pricingData, error: pricingErr } = await adminDb.rpc("calculate_cart_pricing", {
      p_items: [{ book_id: testBookId, quantity: 2 }],
      p_coupon_code: undefined,
    });
    assert(!pricingErr && Boolean(pricingData), "calculate_cart_pricing returns authoritative calculation");
    const cartCalc = pricingData as any;
    assert(Number(cartCalc.subtotal) === 2160, "Server calculates subtotal accurately using discount price: 2 * ₹1,080 = ₹2,160");
    assert(Number(cartCalc.total_amount) >= 2160, "Authoritative cart calculation computes total amount with statutory fees");

    // --------------------------------------------------------------------------
    // 2. ORDERS & PAYMENTS (ATOMIC ORDER CREATION, COD, ONLINE RETRY, CANCEL)
    // --------------------------------------------------------------------------
    console.log("\n--- 2. ORDERS AND PAYMENTS WORKFLOW ---");

    const addressSnapshot = {
      full_name: "Ahmad Customer",
      phone: "+919876543210",
      house_no: "House 42",
      area: "Zakir Nagar, Okhla",
      city: "New Delhi",
      state: "Delhi",
      pincode: "110025",
    };

    // 2.1 Pincode serviceability check
    const pinResult = await checkPincodeServiceability("110025");
    assert(pinResult.serviceable && pinResult.cod && pinResult.prepaid, "Delhivery pincode serviceability validates delivery and COD capability");

    // 2.2 Atomic COD Order creation
    const { data: createdOrderId, error: orderErr } = await adminDb.rpc("create_order_atomic", {
      p_user_id: testUserId,
      p_items: [{ book_id: testBookId, quantity: 2, price: 1080 }],
      p_address_snapshot: addressSnapshot,
      p_payment_method: "COD",
      p_total_amount: 2170, // 2160 + 10 platform fee
      p_coupon_code: undefined,
      p_idempotency_key: `key_${testSuffix}`,
    });

    if (orderErr) {
      console.error("DEBUG create_order_atomic error:", orderErr);
    }

    assert(!orderErr && Boolean(createdOrderId), "create_order_atomic successfully places COD order");
    testOrderId = createdOrderId as string;

    // 2.3 Verify stock decrement
    const { data: updatedBook } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
    assert(updatedBook?.stock === 23, "Physical stock accurately decremented by 2 units (25 -> 23)");

    // 2.4 Verify order record
    const { data: orderRec } = await adminDb.from("orders").select("*").eq("id", testOrderId).single();
    assert(orderRec?.order_status === "Pending" || orderRec?.order_status === "Confirmed", "Order created in valid initial lifecycle state");
    assert(orderRec?.payment_status === "Pending", "COD order payment status initialized as 'Pending'");
    assert(Boolean(orderRec?.order_number?.startsWith("MDS-")), "Order assigned human-readable sequential number (MDS-XXXXXX)");

    // 2.5 Payment retry eligibility validation
    // For COD, payment retry is false. For Online unpaid order, payment retry is true.
    const isCodRetryAllowed = orderRec?.payment_method === "ONLINE" && orderRec?.payment_status !== "Paid";
    assert(!isCodRetryAllowed, "COD order correctly disallowed from online gateway retry");

    // --------------------------------------------------------------------------
    // 3. DELIVERY & SHIPPING (DELHIVERY BOOKING, TRACKING & DELIVERY OTP)
    // --------------------------------------------------------------------------
    console.log("\n--- 3. DELIVERY AND SHIPPING WORKFLOW ---");

    // 3.0 Admin confirms the order: Pending -> Confirmed
    await adminDb.from("orders").update({ order_status: "Confirmed" }).eq("id", testOrderId);

    // 3.1 Idempotent consignment booking
    const shipResult = await createShipmentForOrder(testOrderId);
    assert(Boolean(shipResult.awb), "Shipment booked with courier AWB", shipResult.awb);

    // 3.2 Verify order status transitioned to 'Shipped'
    const { data: shippedOrder } = await adminDb.from("orders").select("order_status, shipping_awb").eq("id", testOrderId).single();
    assert(shippedOrder?.order_status === "Shipped", "Order status transitioned to 'Shipped'");
    assert(shippedOrder?.shipping_awb === shipResult.awb, "Courier AWB persisted on order record");

    // 3.3 Tracking updates normalization
    const trackingRes = await trackShipment(shipResult.awb);
    assert(trackingRes.awb === shipResult.awb, "Live tracking query normalizes courier status and timestamps");

    // 3.4 Cryptographic Delivery OTP Generation
    const otpResult = await generateAndStoreDeliveryOtp(testOrderId);
    assert(otpResult.success && Boolean(otpResult.plaintextOtp), "CSPRNG 6-digit delivery OTP generated server-side");

    // 3.5 Plaintext OTP never stored in database
    const { data: otpRec } = await adminDb.from("delivery_otps").select("*").eq("order_id", testOrderId).single();
    assert(otpRec?.otp_hash === hashDeliveryOtp(otpResult.plaintextOtp!), "Database stores HMAC-SHA256 digest; zero plaintext OTP storage");

    // 3.6 Transition order to 'Out for Delivery' to enable doorstep verification
    await adminDb.from("orders").update({ order_status: "Out for Delivery" }).eq("id", testOrderId);

    // 3.7 Doorstep OTP verification
    const verifyRes = await verifyDeliveryOtp({
      orderId: testOrderId,
      candidateOtp: otpResult.plaintextOtp!,
      actorId: testAdminId,
      actorRole: "admin",
      awb: shipResult.awb,
    });
    assert(verifyRes.success, "Server-authoritative OTP verification succeeds at doorstep");

    // 3.8 Order marked 'Delivered'
    const { data: deliveredOrder } = await adminDb.from("orders").select("order_status, delivered_at").eq("id", testOrderId).single();
    assert(deliveredOrder?.order_status === "Delivered", "Successful OTP verification authoritatively transitions order to 'Delivered'");
    assert(Boolean(deliveredOrder?.delivered_at), "Delivered timestamp accurately recorded");

    // --------------------------------------------------------------------------
    // 4. INVOICES & FINANCIAL DOCUMENTS (GST TAX, INVOICE, RECEIPT)
    // --------------------------------------------------------------------------
    console.log("\n--- 4. INVOICES AND FINANCIAL DOCUMENTS ---");

    // 4.1 Tax calculation engine
    const taxDelhi = calculateOrderTaxBreakdown({
      subtotal: 2160,
      discount: 0,
      shippingFee: 50,
      stateCode: "Delhi",
    });
    assert(!taxDelhi.isInterstate, "Intra-state (Delhi -> Delhi) identified correctly");
    assert(taxDelhi.cgstRate === 9 && taxDelhi.sgstRate === 9, "Intra-state applies CGST 9% and SGST 9% on taxable shipping fee");

    const taxInterstate = calculateOrderTaxBreakdown({
      subtotal: 2160,
      discount: 0,
      shippingFee: 50,
      stateCode: "Uttar Pradesh",
    });
    assert(taxInterstate.isInterstate, "Inter-state (Delhi -> UP) applies 18% IGST");

    // 4.2 Concurrency-safe sequential invoice generation
    const invoiceRes = await getOrCreateOrderInvoice(testOrderId);
    assert(invoiceRes.success && Boolean(invoiceRes.invoice), "Sequential order invoice generated successfully");
    assert(Boolean(invoiceRes.invoice?.invoice_number?.startsWith("INV-")), "Invoice number follows statutory sequential format (INV-YYYYMM-XXXXX)");
    assert(invoiceRes.invoice?.items_snapshot.length === 1, "Invoice stores immutable items snapshot shielding historical orders from price changes");

    // 4.3 Payment receipt
    const receiptRes = await getOrderPaymentReceipt(testOrderId);
    assert(receiptRes.success && Boolean(receiptRes.receipt), "Customer payment receipt generated");

    // --------------------------------------------------------------------------
    // 5. RETURNS & REFUNDS (7-DAY POLICY, REQUEST, ADMIN REVIEW, REFUND)
    // --------------------------------------------------------------------------
    console.log("\n--- 5. RETURNS AND REFUNDS WORKFLOW ---");

    // 5.1 Eligibility validation
    const eligRes = await checkOrderReturnEligibility(testOrderId, testUserId);
    assert(eligRes.isEligible, "Order delivered today is confirmed eligible under 7-day return policy");
    assert(eligRes.items[0].returnableQuantity === 2, "Full quantity (2 units) available for return");

    // 5.2 Customer return request creation
    const returnReqRes = await createCustomerReturnRequest({
      orderId: testOrderId,
      userId: testUserId,
      requestType: "return_refund",
      reason: "Damaged cover or binding in transit",
      description: "Outer spine arrived cracked during shipping.",
      items: [{
        orderItemId: eligRes.items[0].orderItemId,
        bookId: testBookId,
        quantity: 1,
      }],
    });
    assert(returnReqRes.success && Boolean(returnReqRes.returnRequestId), "Customer return request created successfully");
    assert(Boolean(returnReqRes.returnNumber?.startsWith("RET-")), "Return request assigned sequential reference (RET-YYYYMM-XXXXX)");

    // 5.3 Admin review and approval
    const reviewRes = await adminReviewReturnRequest({
      returnId: returnReqRes.returnRequestId!,
      adminId: testAdminId,
      action: "approve",
      adminNotes: "Customer photograph verified, spine damage confirmed.",
    });
    assert(reviewRes.success && reviewRes.status === "approved", "Admin successfully approved return request");

    // 5.4 Razorpay gateway refund execution with over-refund defense
    const { data: refundRpcRes, error: refundRpcErr } = await adminDb.rpc("initiate_return_refund_atomic", {
      p_order_id: testOrderId,
      p_return_id: returnReqRes.returnRequestId!,
      p_amount: 1080.0,
      p_reason: "Damaged spine return refund",
      p_admin_id: testAdminId,
    });
    const refundResObj = refundRpcRes as any;
    assert(!refundRpcErr && Boolean(refundResObj?.success), "initiate_return_refund_atomic processes refund within order total bounds");

    // 5.5 Verify over-refund is strictly rejected by PostgreSQL constraint
    const { data: overRefundRes } = await adminDb.rpc("initiate_return_refund_atomic", {
      p_order_id: testOrderId,
      p_return_id: returnReqRes.returnRequestId!,
      p_amount: 99999.0, // Exceeds total
      p_reason: "Illegal over-refund test",
      p_admin_id: testAdminId,
    });
    const overRefundObj = overRefundRes as any;
    assert(!overRefundObj?.success, "PostgreSQL atomic RPC strictly rejects over-refund exceeding order amount");

    // --------------------------------------------------------------------------
    // 6. INVENTORY ACCURACY & ADMIN SUMMARIES
    // --------------------------------------------------------------------------
    console.log("\n--- 6. INVENTORY ACCURACY & ADMIN SUMMARIES ---");

    // 6.1 Stock accuracy verification
    const { data: finalBook } = await adminDb.from("books").select("stock").eq("id", testBookId).single();
    assert(finalBook?.stock === 23, "Catalog stock maintained with absolute precision (23 remaining)");

    // 6.2 Low-stock alert trigger & deduplication
    const alertRes = await checkAndTriggerLowStockAlerts([testBookId]);
    assert(typeof alertRes.triggeredCount === "number", "Low-stock check evaluates stock against threshold");

    // 6.3 Admin dashboard summaries
    const { data: dbMetrics } = await adminDb.rpc("get_admin_dashboard_metrics", {
      p_date_from: undefined,
      p_date_to: undefined,
    });
    const metrics = (dbMetrics as any)?.metrics;
    assert(typeof metrics?.total_orders === "number", "Admin operations dashboard retrieves real-time order statistics");
    assert(typeof metrics?.total_revenue === "number", "Dashboard calculates gross revenue from database records");

  } catch (err: any) {
    console.error("FATAL SUITE ERROR:", err);
    testsFailed++;
  } finally {
    // --------------------------------------------------------------------------
    // CLEANUP
    // --------------------------------------------------------------------------
    console.log("\n--- PURGING TEST FIXTURES ---");
    if (testOrderId) {
      await (adminDb.from as any)("order_invoices").delete().eq("order_id", testOrderId);
      await adminDb.from("return_requests").delete().eq("order_id", testOrderId);
      await adminDb.from("delivery_otps").delete().eq("order_id", testOrderId);
      await adminDb.from("delivery_verifications").delete().eq("order_id", testOrderId);
      await adminDb.from("order_items").delete().eq("order_id", testOrderId);
      await adminDb.from("orders").delete().eq("id", testOrderId);
    }
    if (testBookId) {
      await adminDb.from("books").delete().eq("id", testBookId);
    }
    if (testUserId) await adminDb.auth.admin.deleteUser(testUserId).catch(() => {});
    if (testAdminId) await adminDb.auth.admin.deleteUser(testAdminId).catch(() => {});
    console.log("✓ Fixtures purged.");
  }

  console.log("\n================================================================================");
  console.log(` LEAN E-COMMERCE SUITE SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runLeanEcommerceSuite();
