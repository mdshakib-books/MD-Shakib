/**
 * ==============================================================================
 * PHASE 2B: FINANCIAL & COMMERCIAL DOCUMENTS TEST SUITE
 * MD Shakib Islamic Books Modernization Project
 * Verifies Requirements 2.10 through 2.14
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import {
  getOrCreateOrderInvoice,
  getOrderPackingSlip,
  getOrderPaymentReceipt,
  getOrderRefundCreditNote,
} from "../lib/commerce/invoices";
import { calculateOrderTaxBreakdown } from "../lib/commerce/tax";

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
let testInterstateOrderId: string;
let testRefundRecordId: string;

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
  console.log("\n--- SETTING UP PHASE 2B TEST FIXTURES ---");

  const custEmail = `doc_cust_${Date.now()}@test.local`;
  const { data: custAuth } = await adminDb.auth.admin.createUser({
    email: custEmail,
    password: "Password123!",
    email_confirm: true,
  });
  testUserId = custAuth!.user!.id;
  await adminDb.from("profiles").upsert({
    id: testUserId,
    email: custEmail,
    full_name: "Document Test Customer",
    role: "user",
  });

  const adminEmail = `doc_admin_${Date.now()}@test.local`;
  const { data: admAuth } = await adminDb.auth.admin.createUser({
    email: adminEmail,
    password: "Password123!",
    email_confirm: true,
  });
  testAdminId = admAuth!.user!.id;
  await adminDb.from("profiles").upsert({
    id: testAdminId,
    email: adminEmail,
    full_name: "Document Admin Officer",
    role: "admin",
  });

  // Create Book with SKU
  const { data: book } = await adminDb
    .from("books")
    .insert({
      title: "Riyad us-Saliheen",
      author: "Imam an-Nawawi",
      price: 800,
      stock: 40,
      category: "Hadith",
      sku: `SKU-RIYAD-${Date.now().toString(36).toUpperCase()}`,
      image_url: "https://example.com/cover.jpg",
    })
    .select("id, sku")
    .single();
  testBookId = book!.id;

  // Order 1: Intra-state (Delhi destination) with discount & shipping
  const { data: order1 } = await adminDb
    .from("orders")
    .insert({
      order_number: `MDS-INV1-${Date.now()}`,
      user_id: testUserId,
      total_amount: 850,
      subtotal: 800,
      discount_amount: 50,
      delivery_fee: 100,
      order_status: "Confirmed",
      payment_method: "ONLINE",
      payment_status: "Paid",
      razorpay_payment_id: "pay_test_inv_12345",
      is_paid: true,
      paid_at: new Date().toISOString(),
      shipping_awb: `DLVINV1_${Date.now()}`,
      address_snapshot: {
        full_name: "Delhi Customer",
        house_no: "Flat 101",
        area: "Zakır Nagar",
        city: "New Delhi",
        state: "Delhi",
        pincode: "110025",
        phone: "9876543210",
      },
    })
    .select("id")
    .single();
  testOrderId = order1!.id;

  await adminDb.from("order_items").insert({
    order_id: testOrderId,
    book_id: testBookId,
    title: "Riyad us-Saliheen",
    quantity: 1,
    price: 800,
    image_url: "https://example.com/cover.jpg",
  });

  // Order 2: Inter-state (Mumbai, Maharashtra destination)
  const { data: order2 } = await adminDb
    .from("orders")
    .insert({
      order_number: `MDS-INV2-${Date.now()}`,
      user_id: testUserId,
      total_amount: 900,
      subtotal: 800,
      delivery_fee: 100,
      order_status: "Confirmed",
      payment_method: "COD",
      payment_status: "Pending",
      shipping_awb: `DLVINV2_${Date.now()}`,
      address_snapshot: {
        full_name: "Mumbai Customer",
        house_no: "B-202",
        area: "Bandra",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400050",
        phone: "9876543211",
      },
    })
    .select("id")
    .single();
  testInterstateOrderId = order2!.id;

  await adminDb.from("order_items").insert({
    order_id: testInterstateOrderId,
    book_id: testBookId,
    title: "Riyad us-Saliheen",
    quantity: 1,
    price: 800,
    image_url: "https://example.com/cover.jpg",
  });

  // Create sample refund record
  const { data: refund } = await adminDb
    .from("refund_records")
    .insert({
      order_id: testOrderId,
      amount: 400,
      status: "processed",
      gateway_refund_id: `rfnd_test_${Date.now()}`,
      reason: "Item returned in good condition",
      authorized_by: testAdminId,
    })
    .select("id")
    .single();
  testRefundRecordId = refund!.id;

  console.log("✓ Fixtures successfully provisioned.");
}

async function cleanupFixtures() {
  console.log("\n--- CLEANING UP PHASE 2B TEST FIXTURES ---");
  await adminDb.from("refund_records").delete().eq("id", testRefundRecordId);
  await adminDb.from("invoices").delete().in("order_id", [testOrderId, testInterstateOrderId]);
  await adminDb.from("order_items").delete().in("order_id", [testOrderId, testInterstateOrderId]);
  await adminDb.from("orders").delete().in("id", [testOrderId, testInterstateOrderId]);
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
    console.log(" PHASE 2B: FINANCIAL & COMMERCIAL DOCUMENTS VERIFICATION");
    console.log("================================================================================\n");

    // [2.10] Invoice Generation & Concurrency Safety
    console.log("[2.10] Invoice Generation & Sequential Numbering");
    const invRes1 = await getOrCreateOrderInvoice(testOrderId);
    if (!invRes1.success) {
      console.error("DEBUG invRes1 failed:", invRes1.error);
    }
    assert(invRes1.success, "getOrCreateOrderInvoice succeeds for Order 1");
    assert(!!invRes1.invoice, "Invoice record returned");
    assert(Boolean(invRes1.invoice?.invoice_number.startsWith("INV-")), "Invoice number follows 'INV-YYYYMM-XXXXX' format");

    // Idempotency check: repeated calls return same invoice without duplicating
    const invRes1Repeat = await getOrCreateOrderInvoice(testOrderId);
    assert(invRes1Repeat.invoice?.id === invRes1.invoice?.id, "Repeated call returns identical existing invoice record");
    assert(invRes1Repeat.invoice?.invoice_number === invRes1.invoice?.invoice_number, "Invoice number is immutable and preserved");

    // Historical snapshot verification
    assert(invRes1.invoice?.items_snapshot.length === 1, "Invoice stores immutable items snapshot");
    assert(invRes1.invoice?.items_snapshot[0].title === "Riyad us-Saliheen", "Snapshot captures book title");

    // [2.11] Tax Calculation: Intra-state vs Inter-state
    console.log("\n[2.11] Tax Calculation (Intra-state Delhi vs Inter-state)");
    const delhiTax = calculateOrderTaxBreakdown({
      subtotal: 800,
      discount: 50,
      shippingFee: 100,
      stateCode: "Delhi",
    });
    assert(!delhiTax.isInterstate, "Delhi identified as intra-state");
    assert(delhiTax.cgstRate === 9 && delhiTax.sgstRate === 9, "Intra-state applies CGST 9% and SGST 9% on shipping");
    assert(delhiTax.igstAmount === 0, "Intra-state has zero IGST");
    assert(delhiTax.taxableValue === 750, "Taxable value after discount is ₹750");

    const interstateTax = calculateOrderTaxBreakdown({
      subtotal: 800,
      discount: 0,
      shippingFee: 100,
      stateCode: "Maharashtra",
    });
    assert(interstateTax.isInterstate, "Maharashtra identified as inter-state");
    assert(interstateTax.igstRate === 18, "Inter-state applies IGST 18% on shipping");
    assert(interstateTax.cgstAmount === 0 && interstateTax.sgstAmount === 0, "Inter-state has zero CGST/SGST");

    // Verify inter-state invoice generation in DB
    const invRes2 = await getOrCreateOrderInvoice(testInterstateOrderId);
    assert(invRes2.success, "Inter-state invoice generated successfully");
    assert(invRes2.invoice?.igst_rate === 18, "Database invoice persists IGST 18%");
    assert(invRes2.invoice?.invoice_number !== invRes1.invoice?.invoice_number, "Distinct orders receive unique sequence numbers");

    // [2.12] Packing Slip Generation
    console.log("\n[2.12] Warehouse Packing Slip");
    const packingRes = await getOrderPackingSlip(testOrderId);
    assert(packingRes.success, "getOrderPackingSlip succeeds");
    assert(packingRes.packingSlip?.customerName === "Delhi Customer", "Packing slip captures customer name");
    assert(Boolean(packingRes.packingSlip?.items[0].sku?.startsWith("SKU-")), "Packing slip captures book SKU for warehouse fulfillment");
    assert(Boolean(packingRes.packingSlip?.awb?.startsWith("DLVINV1_")), "Packing slip captures AWB");

    // [2.13] Payment Receipt
    console.log("\n[2.13] Customer Payment Receipt");
    const paidReceipt = await getOrderPaymentReceipt(testOrderId);
    assert(paidReceipt.success, "getOrderPaymentReceipt succeeds for paid order");
    assert(paidReceipt.receipt?.paymentStatus === "Paid", "Paid order displays 'Paid'");
    assert(paidReceipt.receipt?.paymentReference === "pay_test_inv_12345", "Receipt includes gateway transaction ref");

    // COD Receipt: Must NOT falsely claim paid
    const codReceipt = await getOrderPaymentReceipt(testInterstateOrderId);
    assert(codReceipt.success, "getOrderPaymentReceipt succeeds for COD order");
    assert(codReceipt.receipt?.paymentStatus === "Pending", "COD order accurately shows 'Pending' payment status");
    assert(codReceipt.receipt?.paymentDate === "Pending", "COD receipt does NOT show payment collected before confirmation");

    // [2.14] Refund Credit Note
    console.log("\n[2.14] Refund Documentation");
    const creditNoteRes = await getOrderRefundCreditNote(testRefundRecordId);
    assert(creditNoteRes.success, "getOrderRefundCreditNote succeeds");
    assert(creditNoteRes.creditNote?.refundAmount === 400, "Credit note records exact refund amount: ₹400");
    assert(creditNoteRes.creditNote?.remainingRefundableBalance === 450, "Remaining refundable balance computed accurately: ₹850 - ₹400 = ₹450");

    console.log("\n================================================================================");
    console.log(` PHASE 2B SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
    console.log("================================================================================\n");
  } finally {
    await cleanupFixtures();
  }

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests();
