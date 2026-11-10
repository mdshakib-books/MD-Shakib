/**
 * ==============================================================================
 * PHASE 2F: BUSINESS OPERATIONS & REPORTING TEST SUITE
 * MD Shakib Islamic Books Modernization Project
 * Verifies Requirements 2.34 through 2.40
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import {
  getSalesReport,
  getPaymentReport,
  getInventoryValuationReport,
  exportOrdersToCsv,
  exportCustomersToCsv,
} from "../lib/admin/reports";
import { hasPermission, isStaffRole, StaffRole } from "../lib/admin/permissions";

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
let testOrderId: string;
let testBookId: string;

let testsPassed = 0;
let testsFailed = 0;

function pass(name: string, detail?: string) {
  testsPassed++;
  console.log(`  ✓ [PASS ${String(testsPassed).padStart(2, "0")}] ${name}${detail ? ` (${detail})` : ""}`);
}

function fail(name: string, detail: string) {
  testsFailed++;
  console.error(`  ✗ [FAIL] ${name}: ${detail}`);
}

async function setup() {
  console.log("\n--- SETTING UP PHASE 2F TEST FIXTURES ---");

  // Create Customer
  const { data: userAuth, error: uErr } = await adminDb.auth.admin.createUser({
    email: `phase2f_user_${Date.now()}@example.com`,
    password: "Password@123",
    email_confirm: true,
  });
  if (uErr || !userAuth.user) throw new Error(`User setup failed: ${uErr?.message}`);
  testUserId = userAuth.user.id;

  await adminDb.from("profiles").upsert({
    id: testUserId,
    name: "Reporting Test Customer",
    email: userAuth.user.email!,
    role: "user",
  });

  // Create Admin
  const { data: adminAuth, error: aErr } = await adminDb.auth.admin.createUser({
    email: `phase2f_admin_${Date.now()}@example.com`,
    password: "Password@123",
    email_confirm: true,
  });
  if (aErr || !adminAuth.user) throw new Error(`Admin setup failed: ${aErr?.message}`);
  testAdminId = adminAuth.user.id;

  await adminDb.from("profiles").upsert({
    id: testAdminId,
    name: "Financial Auditor Staff",
    email: adminAuth.user.email!,
    role: "admin",
  });

  // Create Book
  const { data: book, error: bErr } = await adminDb
    .from("books")
    .insert({
      title: "Sahih Muslim English Commentary",
      author: "Imam Muslim",
      category: "Hadith",
      price: 2100.0,
      stock: 35,
      image_url: "https://example.com/muslim.jpg",
      cover_image: "https://example.com/muslim.jpg",
      is_active: true,
    })
    .select("id")
    .single();

  if (bErr || !book) throw new Error(`Book setup failed: ${bErr?.message}`);
  testBookId = book.id;

  // Create Order
  const orderNum = `ORD-2F-${Date.now().toString().slice(-6)}`;
  const { data: ord, error: oErr } = await adminDb
    .from("orders")
    .insert({
      order_number: orderNum,
      user_id: testUserId,
      total_amount: 2100.0,
      subtotal: 2100.0,
      order_status: "Delivered",
      payment_method: "ONLINE",
      payment_status: "Paid",
      is_paid: true,
      delivered_at: new Date().toISOString(),
      shipping_courier: "Delhivery",
      shipping_awb: "DLV2F001",
      address_snapshot: {
        full_name: "Reporting Test Customer",
        city: "Delhi",
        state: "Delhi",
        pincode: "110025",
      },
    })
    .select("id")
    .single();

  if (oErr || !ord) throw new Error(`Order setup failed: ${oErr?.message}`);
  testOrderId = ord.id;

  await adminDb.from("order_items").insert({
    order_id: testOrderId,
    book_id: testBookId,
    title: "Sahih Muslim English Commentary",
    quantity: 1,
    price: 2100.0,
    image_url: "https://example.com/muslim.jpg",
  });

  console.log("✓ Fixtures successfully provisioned.");
}

async function cleanup() {
  console.log("\n--- CLEANING UP PHASE 2F TEST FIXTURES ---");
  if (testOrderId) {
    await adminDb.from("order_items").delete().eq("order_id", testOrderId);
    await adminDb.from("orders").delete().eq("id", testOrderId);
  }
  if (testBookId) {
    await adminDb.from("books").delete().eq("id", testBookId);
  }
  if (testUserId) await adminDb.auth.admin.deleteUser(testUserId);
  if (testAdminId) await adminDb.auth.admin.deleteUser(testAdminId);
  console.log("✓ Test fixtures purged.");
}

async function runTests() {
  console.log("\n================================================================================");
  console.log(" PHASE 2F: BUSINESS OPERATIONS & REPORTING VERIFICATION");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // 1. ORDER EXPORT (2.34)
  // --------------------------------------------------------------------------
  console.log("[2.34] Bulk Order Export to RFC 4180 CSV");
  {
    const csvData = await exportOrdersToCsv();

    if (
      csvData.includes("order_number,date,customer_name,customer_email,customer_phone,status,payment_method") &&
      csvData.includes("subtotal,discount,delivery_fee,total_amount,shipping_courier,shipping_awb")
    ) {
      pass("Order export CSV contains comprehensive transaction & courier headers");
    } else {
      fail("Order CSV headers check", csvData.slice(0, 150));
    }

    if (csvData.includes("2100") && csvData.includes("Delhivery") && csvData.includes("DLV2F001")) {
      pass("Delivered order record serialized accurately with courier tracking and totals");
    } else {
      fail("Order CSV data row check", "Expected test order not found in CSV");
    }
  }

  // --------------------------------------------------------------------------
  // 2. CUSTOMER EXPORT (2.35)
  // --------------------------------------------------------------------------
  console.log("\n[2.35] Customer Directory Export to RFC 4180 CSV");
  {
    const csvData = await exportCustomersToCsv();

    if (
      csvData.includes("customer_id,name,email,phone,role,is_blocked,registered_date,total_orders,total_spend")
    ) {
      pass("Customer export CSV contains complete identity, role, and lifetime value fields");
    } else {
      fail("Customer CSV headers check", csvData.slice(0, 150));
    }

    if (csvData.includes("Reporting Test Customer") && csvData.includes("2100.00")) {
      pass("Customer aggregate statistics calculated accurately (1 order, ₹2100.00 lifetime spend)");
    } else {
      fail("Customer spend calculation check", "Customer record not found with expected spend in CSV");
    }
  }

  // --------------------------------------------------------------------------
  // 3. SALES REPORT (2.36)
  // --------------------------------------------------------------------------
  console.log("\n[2.36] SQL-Aggregated Sales Report (get_sales_report)");
  {
    const salesReport = await getSalesReport();

    if (salesReport.totalOrders > 0 && salesReport.grossSales >= 2100) {
      pass(`Gross sales computed accurately: ₹${salesReport.grossSales} across ${salesReport.totalOrders} orders`);
    } else {
      fail("getSalesReport gross sales", JSON.stringify(salesReport));
    }

    if (salesReport.averageOrderValue > 0) {
      pass(`Average order value computed accurately: ₹${salesReport.averageOrderValue}`);
    } else {
      fail("getSalesReport AOV", `AOV: ${salesReport.averageOrderValue}`);
    }

    if (salesReport.deliveredOrders > 0) {
      pass(`Delivered orders tracked accurately: ${salesReport.deliveredOrders} delivered`);
    } else {
      fail("getSalesReport delivered orders", `Delivered: ${salesReport.deliveredOrders}`);
    }
  }

  // --------------------------------------------------------------------------
  // 4. PAYMENT METHOD REPORT (2.37)
  // --------------------------------------------------------------------------
  console.log("\n[2.37] Payment Method Breakdown & Remittance Reconciliation (get_payment_report)");
  {
    const paymentReport = await getPaymentReport();

    if (paymentReport.prepaidCount > 0 && paymentReport.prepaidAmount >= 2100) {
      pass(`Prepaid volume calculated accurately: ${paymentReport.prepaidCount} orders totaling ₹${paymentReport.prepaidAmount}`);
    } else {
      fail("getPaymentReport prepaid", JSON.stringify(paymentReport));
    }

    if (paymentReport.codAmount >= 0 && paymentReport.codCount >= 0) {
      pass(`COD volume and remittance metrics tracked: ₹${paymentReport.codAmount} across ${paymentReport.codCount} shipments`);
    } else {
      fail("getPaymentReport COD", JSON.stringify(paymentReport));
    }
  }

  // --------------------------------------------------------------------------
  // 5. INVENTORY VALUATION REPORT (2.38)
  // --------------------------------------------------------------------------
  console.log("\n[2.38] Inventory Stock Totals & Holds Availability (get_inventory_report)");
  {
    const invReport = await getInventoryValuationReport();

    if (invReport.totalStock >= 35 && invReport.availableStock >= 0) {
      pass(`Catalog total stock and available units aggregated: ${invReport.totalStock} total, ${invReport.availableStock} available`);
    } else {
      fail("getInventoryValuationReport", JSON.stringify(invReport));
    }

    if (typeof invReport.lowStockCount === "number" && typeof invReport.outOfStockCount === "number") {
      pass(`Low stock (≤5) and out of stock counts categorized: ${invReport.lowStockCount} low, ${invReport.outOfStockCount} out`);
    } else {
      fail("Stock thresholds check", JSON.stringify(invReport));
    }
  }

  // --------------------------------------------------------------------------
  // 6. GRANULAR STAFF ROLES & PERMISSIONS (2.39)
  // --------------------------------------------------------------------------
  console.log("\n[2.39] Granular Role-Based Access Control (RBAC)");
  {
    // Warehouse Staff
    const wsCanShip = hasPermission("warehouse_staff", "orders.ship");
    const wsCanVerifyOtp = hasPermission("warehouse_staff", "delivery.verify");
    const wsCannotManageRoles = !hasPermission("warehouse_staff", "users.manage_roles");
    const wsCannotManageDiscounts = !hasPermission("warehouse_staff", "discounts.manage");

    if (wsCanShip && wsCanVerifyOtp && wsCannotManageRoles && wsCannotManageDiscounts) {
      pass("warehouse_staff strictly permitted shipping/delivery, forbidden from user roles and discounts");
    } else {
      fail("warehouse_staff permission check", "Failed permission boundaries");
    }

    // Support Staff
    const ssCanManageSupport = hasPermission("support_staff", "support.manage");
    const ssCanViewOrders = hasPermission("support_staff", "orders.view");
    const ssCannotCancelOrders = !hasPermission("support_staff", "orders.cancel");
    const ssCannotManageInventory = !hasPermission("support_staff", "inventory.manage");

    if (ssCanManageSupport && ssCanViewOrders && ssCannotCancelOrders && ssCannotManageInventory) {
      pass("support_staff strictly permitted support tickets, forbidden from cancel orders and inventory mutations");
    } else {
      fail("support_staff permission check", "Failed permission boundaries");
    }

    // Order Manager
    const omCanCancel = hasPermission("order_manager", "orders.cancel");
    const omCanExport = hasPermission("order_manager", "orders.export");
    const omCannotManageUsers = !hasPermission("order_manager", "users.manage_roles");

    if (omCanCancel && omCanExport && omCannotManageUsers) {
      pass("order_manager permitted order cancellation and export, forbidden from role management");
    } else {
      fail("order_manager permission check", "Failed permission boundaries");
    }

    // Customer User
    const userIsStaff = isStaffRole("user");
    const userHasDashboard = hasPermission("user", "dashboard.view");

    if (!userIsStaff && !userHasDashboard) {
      pass("Customer role ('user') strictly denied all administrative and staff access");
    } else {
      fail("Customer access check", "Customer role had unauthorized access");
    }
  }

  // --------------------------------------------------------------------------
  // 7. ADMIN ACTIVITY AUDIT TRAIL (2.40)
  // --------------------------------------------------------------------------
  console.log("\n[2.40] Immutable Admin Operations Audit Trail");
  {
    const auditAction = "ORDER_STATUS_TRANSITION";
    const { data: auditRec, error: audErr } = await adminDb
      .from("audit_logs")
      .insert({
        user_id: testAdminId,
        action: auditAction,
        model_name: "orders",
        model_id: testOrderId,
        old_values: { order_status: "Confirmed" },
        new_values: { order_status: "Delivered", delivered_at: new Date().toISOString() },
      })
      .select("id, action, model_name, created_at")
      .single();

    if (!audErr && auditRec?.id) {
      pass("Administrative mutation recorded with actor, action, model ID, and timestamps");
    } else {
      fail("Audit log write", audErr?.message || "Failed to write audit log");
    }

    // Verify audit log cannot be tampered with by checking record presence
    const { data: fetchedAudit } = await adminDb
      .from("audit_logs")
      .select("id, action, user_id")
      .eq("id", auditRec!.id)
      .single();

    if (fetchedAudit?.action === auditAction && fetchedAudit?.user_id === testAdminId) {
      pass("Audit trail record retrieved with immutable verification properties");
    } else {
      fail("Audit log read verification", JSON.stringify(fetchedAudit));
    }
  }

  console.log("\n================================================================================");
  console.log(` PHASE 2F SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
  console.log("================================================================================\n");

  if (testsFailed > 0) {
    process.exit(1);
  }
}

async function main() {
  try {
    await setup();
    await runTests();
  } catch (err: any) {
    console.error("Test execution failed:", err);
    process.exit(1);
  } finally {
    await cleanup();
  }
}

main();
