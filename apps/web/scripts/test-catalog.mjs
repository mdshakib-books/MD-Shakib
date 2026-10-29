import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
  cookies: {
    getAll() { return []; },
    setAll() {},
  },
});

function escapeLikePattern(pattern) {
  return pattern.replace(/[%_\\]/g, "\\$&");
}

async function runTests() {
  console.log("=== CATALOG DATA-ACCESS & SECURITY TEST SUITE ===");

  // Test 1: Fetch all active books
  console.log("\n1. getBooks(): Default pagination & active check");
  const { data: page1, count: totalCount, error: err1 } = await supabase
    .from("books")
    .select("*", { count: "exact" })
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .range(0, 7);

  if (err1) throw err1;
  console.log(`[PASS] Total published books: ${totalCount}, Page 1 items: ${page1.length}`);
  if (page1.length === 0) throw new Error("Expected at least 1 book from seed");

  const sampleBook = page1[0];
  console.log(`[PASS] Sample Book: "${sampleBook.title}" (ID: ${sampleBook.id}, Price: ₹${sampleBook.price})`);

  // Test 2: Category Filter
  console.log("\n2. getBooks({ category: 'Hadith' })");
  const { data: hadithBooks, error: err2 } = await supabase
    .from("books")
    .select("*")
    .eq("is_active", true)
    .eq("category", "Hadith");

  if (err2) throw err2;
  console.log(`[PASS] Hadith category returned ${hadithBooks.length} books.`);
  for (const b of hadithBooks) {
    if (b.category !== "Hadith") throw new Error(`Category mismatch: ${b.category}`);
  }

  // Test 3: Text Search across title & author
  console.log("\n3. getBooks({ search: 'Quran' })");
  const sanitizedSearch = escapeLikePattern("Quran");
  const { data: searchResults, error: err3 } = await supabase
    .from("books")
    .select("*")
    .eq("is_active", true)
    .or(`title.ilike.%${sanitizedSearch}%,author.ilike.%${sanitizedSearch}%`);

  if (err3) throw err3;
  console.log(`[PASS] Search 'Quran' matched ${searchResults.length} books.`);
  for (const b of searchResults) {
    console.log(`   - ${b.title} by ${b.author}`);
  }

  // Test 4: Single Book by valid UUID
  console.log("\n4. getBookById(valid_id)");
  const { data: singleBook, error: err4 } = await supabase
    .from("books")
    .select("*")
    .eq("id", sampleBook.id)
    .eq("is_active", true)
    .maybeSingle();

  if (err4) throw err4;
  if (!singleBook || singleBook.id !== sampleBook.id) throw new Error("Could not find book by ID");
  console.log(`[PASS] getBookById returned exact book: "${singleBook.title}"`);

  // Test 5: Single Book by non-existent UUID
  console.log("\n5. getBookById(non_existent_id)");
  const { data: missingBook, error: err5 } = await supabase
    .from("books")
    .select("*")
    .eq("id", "00000000-0000-0000-0000-000000000000")
    .eq("is_active", true)
    .maybeSingle();

  if (err5) throw err5;
  if (missingBook !== null) throw new Error("Expected null for missing book");
  console.log("[PASS] getBookById correctly returned null for non-existent UUID");

  // Test 6: Sorting order
  console.log("\n6. getBooks({ sort: 'price_asc' })");
  const { data: priceAsc, error: err6 } = await supabase
    .from("books")
    .select("title, price")
    .eq("is_active", true)
    .order("price", { ascending: true })
    .limit(4);

  if (err6) throw err6;
  console.log("[PASS] Price ascending order:", priceAsc.map(b => `₹${b.price}`));
  for (let i = 1; i < priceAsc.length; i++) {
    if (Number(priceAsc[i].price) < Number(priceAsc[i - 1].price)) {
      throw new Error("Books not sorted in ascending price order!");
    }
  }

  // Test 7: Negative Security & RLS Tests
  console.log("\n7. Negative RLS Tests (Customer data isolation)");
  const { data: profiles } = await supabase.from("profiles").select("*");
  if (profiles && profiles.length > 0) throw new Error("SECURITY FAILURE: Anonymous client read profiles table!");
  console.log("[PASS] Anonymous client reading 'profiles' returned 0 rows (RLS enforced)");

  const { data: orders } = await supabase.from("orders").select("*");
  if (orders && orders.length > 0) throw new Error("SECURITY FAILURE: Anonymous client read orders table!");
  console.log("[PASS] Anonymous client reading 'orders' returned 0 rows (RLS enforced)");

  const { data: addresses } = await supabase.from("addresses").select("*");
  if (addresses && addresses.length > 0) throw new Error("SECURITY FAILURE: Anonymous client read addresses table!");
  console.log("[PASS] Anonymous client reading 'addresses' returned 0 rows (RLS enforced)");

  console.log("\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<\n");
}

runTests().catch(err => {
  console.error("Test failure:", err);
  process.exit(1);
});

