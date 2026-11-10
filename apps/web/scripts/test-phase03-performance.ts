/**
 * Phase 3 — Performance & Latency Benchmark Suite
 * 
 * Measures response times (min, max, avg, p50, p95), query latencies,
 * and concurrent behavior for critical commerce and database operations.
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

import { createAdminClient } from "@/lib/supabase/admin";

interface LatencyStats {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  totalRuns: number;
  errorRate: number;
}

function calculateStats(latencies: number[]): LatencyStats {
  if (latencies.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, totalRuns: 0, errorRate: 1 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Number((sorted.reduce((sum, v) => sum + v, 0) / sorted.length).toFixed(2));
  const p50 = sorted[Math.floor(sorted.length * 0.5)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  return { min, max, avg, p50, p95, totalRuns: latencies.length, errorRate: 0 };
}

export async function runPerformanceBenchmarks() {
  console.log("================================================================================");
  console.log(" PHASE 3: PERFORMANCE & LATENCY BENCHMARK SUITE");
  console.log(" MD Shakib Islamic Books — Performance Verification");
  console.log("================================================================================\n");

  const supabase = createAdminClient();
  const results: Record<string, LatencyStats> = {};

  // 1. Catalog Listing & Category Filtering (25 runs)
  console.log("--- 1. BENCHMARKING CATALOG LISTING & CATEGORY FILTERING ---");
  const catalogLatencies: number[] = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, price, stock, category, is_active, cover_image")
      .eq("is_active", true)
      .eq("category", "Quran")
      .limit(12);

    if (error || !data) throw new Error("Catalog fetch error: " + error?.message);
    catalogLatencies.push(performance.now() - start);
  }
  results["Catalog Listing (limit 12)"] = calculateStats(catalogLatencies);
  console.log(`  ✓ Catalog Listing: p50=${results["Catalog Listing (limit 12)"].p50.toFixed(2)}ms, p95=${results["Catalog Listing (limit 12)"].p95.toFixed(2)}ms, avg=${results["Catalog Listing (limit 12)"].avg.toFixed(2)}ms`);

  // 2. Keyword Search Query (25 runs)
  console.log("\n--- 2. BENCHMARKING KEYWORD SEARCH ---");
  const searchLatencies: number[] = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    const { data, error } = await supabase
      .from("books")
      .select("id, title, author, price, stock")
      .or("title.ilike.%Islam%,author.ilike.%Imam%")
      .limit(10);

    if (error || !data) throw new Error("Search error: " + error?.message);
    searchLatencies.push(performance.now() - start);
  }
  results["Search Query (ilike title/author)"] = calculateStats(searchLatencies);
  console.log(`  ✓ Search Query: p50=${results["Search Query (ilike title/author)"].p50.toFixed(2)}ms, p95=${results["Search Query (ilike title/author)"].p95.toFixed(2)}ms, avg=${results["Search Query (ilike title/author)"].avg.toFixed(2)}ms`);

  // 3. Single Book Detail Retrieval by ID (25 runs)
  console.log("\n--- 3. BENCHMARKING BOOK DETAIL FETCH ---");
  const { data: sampleBook } = await supabase.from("books").select("id").limit(1).single();
  const bookId = sampleBook?.id || "";
  if (!bookId) throw new Error("No book found for performance benchmark");
  const detailLatencies: number[] = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (error || !data) throw new Error("Book detail error: " + error?.message);
    detailLatencies.push(performance.now() - start);
  }
  results["Book Detail Fetch by PK"] = calculateStats(detailLatencies);
  console.log(`  ✓ Book Detail Fetch: p50=${results["Book Detail Fetch by PK"].p50.toFixed(2)}ms, p95=${results["Book Detail Fetch by PK"].p95.toFixed(2)}ms, avg=${results["Book Detail Fetch by PK"].avg.toFixed(2)}ms`);

  // 4. Cart Server-Authoritative Pricing Calculation RPC (25 runs)
  console.log("\n--- 4. BENCHMARKING CART PRICING RPC ---");
  const pricingLatencies: number[] = [];
  const testCartPayload = [{ book_id: bookId, quantity: 2 }];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    const { data, error } = await supabase.rpc("calculate_cart_pricing", {
      p_items: testCartPayload,
      p_coupon_code: "WELCOME10",
    });

    if (error || !data) throw new Error("Pricing RPC error: " + error?.message);
    pricingLatencies.push(performance.now() - start);
  }
  results["Server Cart Pricing RPC"] = calculateStats(pricingLatencies);
  console.log(`  ✓ Cart Pricing RPC: p50=${results["Server Cart Pricing RPC"].p50.toFixed(2)}ms, p95=${results["Server Cart Pricing RPC"].p95.toFixed(2)}ms, avg=${results["Server Cart Pricing RPC"].avg.toFixed(2)}ms`);

  // 5. Admin Dashboard Aggregated Metrics RPC (25 runs)
  console.log("\n--- 5. BENCHMARKING ADMIN DASHBOARD SQL AGGREGATION ---");
  const adminLatencies: number[] = [];
  for (let i = 0; i < 25; i++) {
    const start = performance.now();
    const { data, error } = await supabase.rpc("get_admin_dashboard_metrics");

    if (error || !data) throw new Error("Admin metrics error: " + error?.message);
    adminLatencies.push(performance.now() - start);
  }
  results["Admin Dashboard Metrics RPC"] = calculateStats(adminLatencies);
  console.log(`  ✓ Admin Metrics RPC: p50=${results["Admin Dashboard Metrics RPC"].p50.toFixed(2)}ms, p95=${results["Admin Dashboard Metrics RPC"].p95.toFixed(2)}ms, avg=${results["Admin Dashboard Metrics RPC"].avg.toFixed(2)}ms`);

  // 6. Concurrency Stress Test (10 concurrent catalog requests)
  console.log("\n--- 6. BENCHMARKING CONCURRENT ACCESS (10 SIMULTANEOUS REQUESTS) ---");
  const concurrentStart = performance.now();
  const concurrentPromises = Array.from({ length: 10 }).map(async () => {
    const t0 = performance.now();
    const res = await supabase.from("books").select("id, title, price").limit(8);
    return performance.now() - t0;
  });
  const concurrentTimes = await Promise.all(concurrentPromises);
  const totalConcurrentTime = performance.now() - concurrentStart;
  results["Concurrent Catalog Queries (10 req)"] = calculateStats(concurrentTimes);
  console.log(`  ✓ 10 Concurrent Queries resolved in ${totalConcurrentTime.toFixed(2)}ms (avg=${results["Concurrent Catalog Queries (10 req)"].avg.toFixed(2)}ms)`);

  console.log("\n================================================================================");
  console.log(" BENCHMARK SUMMARY TABLE");
  console.log("================================================================================");
  console.log("OPERATION                          |   MIN    |   P50    |   P95    |   MAX    |   AVG");
  console.log("-----------------------------------|----------|----------|----------|----------|----------");
  for (const [op, stats] of Object.entries(results)) {
    console.log(
      `${op.padEnd(35)}| ${stats.min.toFixed(1).padStart(7)}ms | ${stats.p50.toFixed(1).padStart(7)}ms | ${stats.p95.toFixed(1).padStart(7)}ms | ${stats.max.toFixed(1).padStart(7)}ms | ${stats.avg.toFixed(1).padStart(7)}ms`
    );
  }
  console.log("================================================================================\n");

  return results;
}

if (require.main === module) {
  runPerformanceBenchmarks()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
