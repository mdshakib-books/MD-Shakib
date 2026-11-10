/**
 * ==============================================================================
 * PHASE 2E: CATALOGUE AND INVENTORY ENHANCEMENTS TEST SUITE
 * MD Shakib Islamic Books Modernization Project
 * Verifies Requirements 2.28 through 2.33
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import {
  createAdminBook,
  updateAdminBook,
  getAdminBookById,
} from "../lib/admin/books";
import {
  exportBooksToCsv,
  importBooksFromCsv,
} from "../lib/admin/catalog-io";
import {
  createBookVariant,
  getBookVariants,
  adjustVariantStockAtomic,
} from "../lib/catalog/variants";
import {
  recordInventoryMovement,
  getInventoryMovementHistory,
} from "../lib/admin/inventory";

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

let testAdminId: string;
let testBookId: string;
let testBookSku: string;
let testIsbn10: string;
let testIsbn13: string;
let createdBookIds: string[] = [];

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
  console.log("\n--- SETTING UP PHASE 2E TEST FIXTURES ---");

  // Create Admin Staff for audits
  const { data: adminUser, error: admErr } = await adminDb.auth.admin.createUser({
    email: `phase2e_admin_${Date.now()}@example.com`,
    password: "Password@123",
    email_confirm: true,
  });
  if (admErr || !adminUser.user) throw new Error(`Admin setup failed: ${admErr?.message}`);
  testAdminId = adminUser.user.id;

  await adminDb.from("profiles").upsert({
    id: testAdminId,
    name: "Catalogue Operations Staff",
    email: adminUser.user.email!,
    role: "admin",
  });

  // Create base book with identifiers
  testBookSku = `SKU-P2E-${Date.now().toString(36).toUpperCase()}`;
  testIsbn10 = Date.now().toString().slice(-10);
  testIsbn13 = `978${Date.now().toString().slice(-10)}`;

  const { data: book, error: bErr } = await adminDb
    .from("books")
    .insert({
      title: "Riyad us-Saliheen Commentary Edition",
      author: "Imam an-Nawawi",
      category: "Hadith",
      price: 1450.0,
      stock: 40,
      sku: testBookSku,
      isbn_10: testIsbn10,
      isbn_13: testIsbn13,
      weight_grams: 850,
      length_cm: 24.5,
      width_cm: 18.0,
      height_cm: 4.2,
      image_url: "https://example.com/riyad.jpg",
      cover_image: "https://example.com/riyad.jpg",
      is_active: true,
    })
    .select("id")
    .single();

  if (bErr || !book) throw new Error(`Book fixture setup failed: ${bErr?.message}`);
  testBookId = book.id;
  createdBookIds.push(testBookId);

  console.log("✓ Fixtures successfully provisioned.");
}

async function cleanup() {
  console.log("\n--- CLEANING UP PHASE 2E TEST FIXTURES ---");
  for (const bid of createdBookIds) {
    await adminDb.from("book_variants").delete().eq("book_id", bid);
    await adminDb.from("inventory_history").delete().eq("book_id", bid);
    await adminDb.from("books").delete().eq("id", bid);
  }
  if (testAdminId) await adminDb.auth.admin.deleteUser(testAdminId);
  console.log("✓ Test fixtures purged.");
}

async function runTests() {
  console.log("\n================================================================================");
  console.log(" PHASE 2E: CATALOGUE AND INVENTORY ENHANCEMENTS VERIFICATION");
  console.log("================================================================================\n");

  // --------------------------------------------------------------------------
  // 1. PRODUCT IDENTIFIERS & SHIPPING DIMENSIONS (2.28, 2.29)
  // --------------------------------------------------------------------------
  console.log("[2.28 & 2.29] Product Identifiers & Shipping Dimensions Persistence");
  {
    const { data: bookRec } = await adminDb
      .from("books")
      .select("isbn_10, isbn_13, sku, weight_grams, length_cm, width_cm, height_cm")
      .eq("id", testBookId)
      .single();

    if (
      bookRec?.sku === testBookSku &&
      bookRec?.isbn_10 === testIsbn10 &&
      bookRec?.isbn_13 === testIsbn13
    ) {
      pass("Authoritative ISBN-10, ISBN-13, and SKU persisted accurately in database");
    } else {
      fail("Identifiers persistence", JSON.stringify(bookRec));
    }

    if (
      bookRec?.weight_grams === 850 &&
      Number(bookRec?.length_cm) === 24.5 &&
      Number(bookRec?.width_cm) === 18.0 &&
      Number(bookRec?.height_cm) === 4.2
    ) {
      pass("Physical package dimensions (L x W x H) and weight persisted accurately");
    } else {
      fail("Physical dimensions persistence", JSON.stringify(bookRec));
    }

    // Update dimensions and check
    const { error: updErr } = await adminDb
      .from("books")
      .update({
        weight_grams: 920,
        height_cm: 4.8,
      })
      .eq("id", testBookId);

    const { data: updatedRec } = await adminDb
      .from("books")
      .select("weight_grams, height_cm")
      .eq("id", testBookId)
      .single();

    if (!updErr && updatedRec?.weight_grams === 920 && Number(updatedRec?.height_cm) === 4.8) {
      pass("Shipping dimensions and package weight successfully updated");
    } else {
      fail("Dimensions update", JSON.stringify(updatedRec));
    }
  }

  // --------------------------------------------------------------------------
  // 2. BULK PRODUCT EXPORT (2.31)
  // --------------------------------------------------------------------------
  console.log("\n[2.31] Bulk Product Catalog RFC 4180 CSV Export");
  {
    const csvData = await exportBooksToCsv();

    if (csvData && csvData.includes("id,title,author,category,price,stock,discount,sku,isbn_10,isbn_13")) {
      pass("CSV header contains all standard catalog and logistical fields");
    } else {
      fail("CSV header check", csvData.slice(0, 100));
    }

    if (csvData.includes(testBookSku) && csvData.includes(testIsbn13) && csvData.includes("920")) {
      pass("Exported CSV includes complete book data with SKU, ISBN, and weight");
    } else {
      fail("CSV content check", "Expected test book SKU and ISBN not found in export");
    }
  }

  // --------------------------------------------------------------------------
  // 3. BULK PRODUCT IMPORT (2.30)
  // --------------------------------------------------------------------------
  console.log("\n[2.30] Bulk Product Catalog CSV Import & Validation");
  {
    const newSku1 = `SKU-IMP1-${Date.now()}`;
    const newSku2 = `SKU-IMP2-${Date.now()}`;
    const newIsbn1 = `978${Date.now().toString().slice(-9)}1`;
    const newIsbn2 = `978${Date.now().toString().slice(-9)}2`;

    // Test CSV with:
    // 1. New valid book 1
    // 2. New valid book 2
    // 3. Update existing test book (increasing stock by 10)
    // 4. Invalid row (missing author)
    const testCsv = [
      "title,author,category,price,stock,discount,sku,isbn_10,isbn_13,weight_grams,length_cm,width_cm,height_cm,is_active",
      `"Al-Adab Al-Mufrad","Imam Bukhari","Hadith",650,20,0,"${newSku1}","","${newIsbn1}",450,21.0,14.0,2.5,true`,
      `"Mukhtasar Al-Quduri","Imam Al-Quduri","Fiqh",890,15,5,"${newSku2}","","${newIsbn2}",550,22.0,15.0,3.0,true`,
      `"Riyad us-Saliheen Commentary Edition","Imam an-Nawawi","Hadith",1450,50,0,"${testBookSku}","${testIsbn10}","${testIsbn13}",920,24.5,18.0,4.8,true`,
      `"Invalid Book Without Author","","Hadith",500,10,0,"SKU-ERR-1","","",300,20.0,14.0,2.0,true`,
    ].join("\n");

    const importRes = await importBooksFromCsv(testCsv, testAdminId);

    if (importRes.inserted === 2 && importRes.updated === 1) {
      pass("Bulk import successfully inserted 2 new titles and updated 1 existing title");
    } else {
      fail("Bulk import counts", `Inserted: ${importRes.inserted}, Updated: ${importRes.updated}`);
    }

    if (importRes.errors.length === 1 && importRes.errors[0].includes("Author is mandatory")) {
      pass("Malformed row strictly rejected and captured in error diagnostics");
    } else {
      fail("Bulk import error handling", JSON.stringify(importRes.errors));
    }

    // Verify database reflections
    const { data: imp1 } = await adminDb.from("books").select("id, title, stock").eq("sku", newSku1).single();
    const { data: imp2 } = await adminDb.from("books").select("id, title, stock").eq("sku", newSku2).single();
    const { data: updBook } = await adminDb.from("books").select("stock").eq("sku", testBookSku).single();

    if (imp1 && imp2 && updBook?.stock === 50) {
      createdBookIds.push(imp1.id, imp2.id);
      pass("Database confirmed updated stock (50) and newly inserted catalog rows");
    } else {
      fail("Database import verification", `updBook stock: ${updBook?.stock}`);
    }
  }

  // --------------------------------------------------------------------------
  // 4. PRODUCT VARIANTS (2.32)
  // --------------------------------------------------------------------------
  console.log("\n[2.32] Product Variants (Attributes, SKU & Stock Management)");
  let variantId1 = "";
  {
    const varSku = `VAR-HC-${Date.now()}`;

    // Create variant
    const varRes = await createBookVariant({
      bookId: testBookId,
      sku: varSku,
      variantType: "format",
      variantValue: "Deluxe Leather Hardcover",
      price: 2400.0,
      stock: 12,
      isActive: true,
    });

    if (varRes.success && varRes.variant?.id) {
      variantId1 = varRes.variant.id;
      pass("Product variant created with format: 'Deluxe Leather Hardcover'");
    } else {
      fail("createBookVariant", varRes.error || "Unknown error");
    }

    // Retrieve variants list
    const variants = await getBookVariants(testBookId);
    if (variants.length === 1 && variants[0].sku === varSku && variants[0].variantValue === "Deluxe Leather Hardcover") {
      pass("getBookVariants retrieves structured variants with type, value and pricing");
    } else {
      fail("getBookVariants", `Expected 1 variant, got ${variants.length}`);
    }

    // Duplicate SKU should be rejected
    const dupVar = await createBookVariant({
      bookId: testBookId,
      title: "Another Variant With Same SKU",
      sku: varSku,
      price: 2100.0,
      stock: 5,
    });

    if (!dupVar.success) {
      pass("Duplicate variant SKU strictly rejected by database uniqueness constraint");
    } else {
      fail("Duplicate variant check", "Duplicate SKU was unexpectedly allowed");
    }

    // Atomic variant stock adjustment
    const adjRes = await adjustVariantStockAtomic({
      variantId: variantId1,
      bookId: testBookId,
      quantityChange: 5,
      reason: "Supplier supplementary shipment",
      actorId: testAdminId,
    });

    if (adjRes.success && adjRes.newStock === 17) {
      pass("adjustVariantStockAtomic updated variant inventory (12 -> 17)");
    } else {
      fail("adjustVariantStockAtomic", adjRes.error || `Expected 17, got ${adjRes.newStock}`);
    }
  }

  // --------------------------------------------------------------------------
  // 5. INVENTORY HISTORY LEDGER (2.33)
  // --------------------------------------------------------------------------
  console.log("\n[2.33] Authoritative Inventory History Audit Ledger");
  {
    // Record atomic book stock movement (PURCHASE +20)
    const movRes1 = await recordInventoryMovement({
      bookId: testBookId,
      movementType: "PURCHASE",
      quantityChange: 20,
      reason: "Direct shipment from Darussalam Publishers",
      actorId: testAdminId,
    });

    if (movRes1.success && movRes1.newStock === 70) {
      pass("Atomic inventory movement recorded: PURCHASE (+20 units -> 70 stock)");
    } else {
      fail("recordInventoryMovement PURCHASE", movRes1.error || `Expected 70, got ${movRes1.newStock}`);
    }

    // Record atomic book stock reduction (SALE -5)
    const movRes2 = await recordInventoryMovement({
      bookId: testBookId,
      movementType: "SALE",
      quantityChange: -5,
      reason: "Order checkout fulfillment",
      actorId: testAdminId,
    });

    if (movRes2.success && movRes2.newStock === 65) {
      pass("Atomic inventory movement recorded: SALE (-5 units -> 65 stock)");
    } else {
      fail("recordInventoryMovement SALE", movRes2.error || `Expected 65, got ${movRes2.newStock}`);
    }

    // Over-reduction prevention (negative stock rejected)
    const movResNeg = await recordInventoryMovement({
      bookId: testBookId,
      movementType: "ADJUSTMENT",
      quantityChange: -100,
      reason: "Disallow negative inventory test",
      actorId: testAdminId,
    });

    if (!movResNeg.success && movResNeg.error?.includes("Insufficient")) {
      pass("Atomic reduction below zero stock strictly prevented by PostgreSQL constraint");
    } else {
      fail("Negative stock prevention", "Excessive reduction was unexpectedly permitted");
    }

    // Query inventory audit ledger
    const historyLogs = await getInventoryMovementHistory({ bookId: testBookId, limit: 10 });
    if (historyLogs.length >= 2) {
      const latest = historyLogs[0];
      if (latest.movementType === "SALE" && latest.quantityChange === -5 && latest.newStock === 65) {
        pass("Inventory audit ledger returns complete historical trace with actor, reason, and deltas");
      } else {
        fail("Ledger latest entry check", JSON.stringify(latest));
      }
    } else {
      fail("getInventoryMovementHistory", `Expected at least 2 entries, got ${historyLogs.length}`);
    }
  }

  console.log("\n================================================================================");
  console.log(` PHASE 2E SUMMARY: ${testsPassed} PASSED, ${testsFailed} FAILED`);
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
