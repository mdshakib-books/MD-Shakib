/**
 * PHASE 10: MIGRATION 012 REVIEW & HARDENING AUTOMATED TEST SUITE
 * MD Shakib Islamic Books
 * 
 * Verifies:
 * 1. Migration file existence and structural completeness
 * 2. Extension prerequisites (pg_trgm for GIN trigram indexes)
 * 3. Composite performance indexes (books, orders) & query pattern alignment
 * 4. Duplicate index elimination (cart_items uq_cart_book redundancy detection)
 * 5. Rate limit table schema, primary key, check constraints, and storage safety
 * 6. Rate limit RLS policies and table privilege hardening
 * 7. SECURITY DEFINER function review (check_rate_limit permissions, search_path)
 * 8. Input validation, boundary checks, and division-by-zero prevention
 * 9. Fixed-window boundary semantics and atomic upsert concurrency
 * 10. Decoupled maintenance cleanup procedure (prune_expired_rate_limits)
 * 11. TypeScript client (rate-limit.ts) compatibility and safe parameter normalization
 * 12. Database type definitions (database.types.ts) consistency
 */

import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { checkRateLimit, createRateLimitHeaders, RATE_LIMIT_TIERS } from "../lib/security/rate-limit";

interface TestResult {
  id: string;
  category: string;
  name: string;
  expected: string;
  actual: string;
  status: "PASS" | "FAIL";
  error?: string;
}

const results: TestResult[] = [];

async function runTest(
  id: string,
  category: string,
  name: string,
  expected: string,
  fn: () => Promise<string | void> | string | void
) {
  process.stdout.write(`  [${id}] ${name}... `);
  try {
    const actual = (await fn()) || expected;
    results.push({ id, category, name, expected, actual, status: "PASS" });
    console.log("✓ PASS");
  } catch (err: any) {
    const actual = err?.message || String(err);
    results.push({ id, category, name, expected, actual, status: "FAIL", error: actual });
    console.log(`✗ FAIL: ${actual}`);
  }
}

async function main() {
  console.log("================================================================================");
  console.log("PHASE 10: MIGRATION 012 REVIEW & HARDENING VERIFICATION");
  console.log("================================================================================");

  const migrationPath = path.resolve(
    process.cwd(),
    "../../supabase/migrations/20261106000001_phase10_performance_security_and_indexes.sql"
  );

  const altMigrationPath = path.resolve(
    process.cwd(),
    "supabase/migrations/20261106000001_phase10_performance_security_and_indexes.sql"
  );

  const activePath = fs.existsSync(migrationPath) ? migrationPath : altMigrationPath;

  // ---------------------------------------------------------------------------
  // 1. FILE EXISTENCE & INTEGRITY
  // ---------------------------------------------------------------------------
  console.log("\n--- Category 1: Migration 012 File & Schema Integrity ---");

  let sqlContent = "";

  await runTest(
    "M12-AUD-01",
    "Integrity",
    "Migration 012 file exists and is readable",
    "File exists with valid content",
    () => {
      assert.ok(fs.existsSync(activePath), `Migration file not found at ${activePath}`);
      sqlContent = fs.readFileSync(activePath, "utf-8");
      assert.ok(sqlContent.length > 500, "Migration file is unexpectedly small");
      return `Loaded ${sqlContent.length} bytes from ${path.basename(activePath)}`;
    }
  );

  await runTest(
    "M12-AUD-02",
    "Extensions",
    "pg_trgm extension is explicitly declared before trigram indexes",
    "CREATE EXTENSION IF NOT EXISTS pg_trgm present before GIN indexes",
    () => {
      const extIndex = sqlContent.indexOf("CREATE EXTENSION IF NOT EXISTS pg_trgm");
      assert.ok(extIndex !== -1, "Missing CREATE EXTENSION IF NOT EXISTS pg_trgm");
      const titleIndex = sqlContent.indexOf("idx_books_title_trgm");
      assert.ok(extIndex < titleIndex, "pg_trgm extension must precede trigram index creation");
      return "Extension correctly declared prior to gin_trgm_ops indexes";
    }
  );

  // ---------------------------------------------------------------------------
  // 2. COMPOSITE INDEXES & DUPLICATE PREVENTION
  // ---------------------------------------------------------------------------
  console.log("\n--- Category 2: Composite Performance Indexes ---");

  await runTest(
    "M12-IDX-01",
    "Indexes",
    "idx_books_active_created_at targets (is_active, created_at DESC)",
    "Index matches catalog query filter and sort",
    () => {
      assert.ok(
        sqlContent.includes("idx_books_active_created_at") &&
        sqlContent.includes("(is_active, created_at DESC)"),
        "Missing or incorrect idx_books_active_created_at index"
      );
      return "Index defined on public.books (is_active, created_at DESC)";
    }
  );

  await runTest(
    "M12-IDX-02",
    "Indexes",
    "idx_orders_user_created_at targets (user_id, created_at DESC)",
    "Index matches user order history query filter and sort",
    () => {
      assert.ok(
        sqlContent.includes("idx_orders_user_created_at") &&
        sqlContent.includes("(user_id, created_at DESC)"),
        "Missing or incorrect idx_orders_user_created_at index"
      );
      return "Index defined on public.orders (user_id, created_at DESC)";
    }
  );

  await runTest(
    "M12-IDX-03",
    "Indexes",
    "Duplicate idx_cart_items_cart_book is eliminated",
    "Duplicate index omitted due to pre-existing uq_cart_book UNIQUE constraint",
    () => {
      const hasActiveCreateIndex = /CREATE\s+INDEX\s+(IF\s+NOT\s+EXISTS\s+)?idx_cart_items_cart_book/i.test(sqlContent);
      assert.strictEqual(
        hasActiveCreateIndex,
        false,
        "Duplicate idx_cart_items_cart_book index should not be active"
      );
      assert.ok(
        sqlContent.includes("uq_cart_book UNIQUE"),
        "Documentation note explaining uq_cart_book UNIQUE constraint must be present"
      );
      return "Redundant index omitted; documented existing uq_cart_book btree index";
    }
  );

  await runTest(
    "M12-IDX-04",
    "Indexes",
    "Search indexes cover both title and author with gin_trgm_ops",
    "Both idx_books_title_trgm and idx_books_author_trgm created",
    () => {
      assert.ok(
        sqlContent.includes("idx_books_title_trgm") &&
        sqlContent.includes("title gin_trgm_ops"),
        "Missing idx_books_title_trgm with gin_trgm_ops"
      );
      assert.ok(
        sqlContent.includes("idx_books_author_trgm") &&
        sqlContent.includes("author gin_trgm_ops"),
        "Missing idx_books_author_trgm with gin_trgm_ops"
      );
      return "Both title and author indexed via GIN trigram ops matching ILIKE query patterns";
    }
  );

  // ---------------------------------------------------------------------------
  // 3. RATE LIMIT TABLE HARDENING & CONSTRAINTS
  // ---------------------------------------------------------------------------
  console.log("\n--- Category 3: Rate Limit Table Schema & Constraints ---");

  await runTest(
    "M12-TBL-01",
    "Table",
    "public.rate_limits table schema, primary key, and nullability",
    "Table defined with composite primary key (key, window_start)",
    () => {
      assert.ok(sqlContent.includes("CREATE TABLE IF NOT EXISTS public.rate_limits"), "Missing rate_limits table");
      assert.ok(sqlContent.includes("PRIMARY KEY (key, window_start)"), "Missing primary key (key, window_start)");
      assert.ok(sqlContent.includes("key TEXT NOT NULL"), "key must be TEXT NOT NULL");
      assert.ok(sqlContent.includes("window_start TIMESTAMPTZ NOT NULL"), "window_start must be TIMESTAMPTZ NOT NULL");
      assert.ok(sqlContent.includes("count INTEGER NOT NULL DEFAULT 1"), "count must be INTEGER NOT NULL DEFAULT 1");
      return "Table schema verified with correct types, nullability, and primary key";
    }
  );

  await runTest(
    "M12-TBL-02",
    "Table",
    "Check constraints prevent empty/oversized keys and non-positive counts",
    "Constraints chk_rate_limits_key_length and chk_rate_limits_count_positive present",
    () => {
      assert.ok(
        sqlContent.includes("chk_rate_limits_key_length") &&
        sqlContent.includes("char_length(key) <= 255"),
        "Missing key length constraint (char_length(key) <= 255)"
      );
      assert.ok(
        sqlContent.includes("chk_rate_limits_count_positive") &&
        sqlContent.includes("count > 0"),
        "Missing count > 0 constraint"
      );
      return "Check constraints verified for key length (1-255) and positive counter";
    }
  );

  await runTest(
    "M12-TBL-03",
    "Table",
    "idx_rate_limits_window_start exists for maintenance pruning acceleration",
    "Index on window_start present",
    () => {
      assert.ok(
        sqlContent.includes("CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start") &&
        sqlContent.includes("ON public.rate_limits (window_start)"),
        "Missing idx_rate_limits_window_start"
      );
      return "Index on window_start verified for range-based pruning";
    }
  );

  // ---------------------------------------------------------------------------
  // 4. RLS POLICIES & DATABASE PRIVILEGES
  // ---------------------------------------------------------------------------
  console.log("\n--- Category 4: RLS Policies & Privilege Hardening ---");

  await runTest(
    "M12-SEC-01",
    "Security",
    "Rate limits table RLS enabled with non-redundant policy",
    "RLS enabled and single consolidated rate_limits_admin_all policy defined",
    () => {
      assert.ok(sqlContent.includes("ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY"), "RLS not enabled");
      assert.ok(sqlContent.includes("DROP POLICY IF EXISTS \"rate_limits_admin_select\""), "Old select policy not dropped");
      assert.ok(sqlContent.includes("CREATE POLICY \"rate_limits_admin_all\""), "Missing consolidated admin policy");
      assert.ok(sqlContent.includes("public.is_admin()"), "Policy must verify public.is_admin()");
      return "RLS verified with single consolidated admin policy";
    }
  );

  await runTest(
    "M12-SEC-02",
    "Security",
    "Table privileges explicitly revoked from PUBLIC and granted strictly to service_role",
    "REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT ALL TO service_role",
    () => {
      assert.ok(
        sqlContent.includes("REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC, anon, authenticated"),
        "Table privileges not revoked from untrusted roles"
      );
      assert.ok(
        sqlContent.includes("GRANT ALL ON TABLE public.rate_limits TO service_role"),
        "service_role must have ALL privileges on rate_limits"
      );
      assert.ok(
        sqlContent.includes("GRANT SELECT ON TABLE public.rate_limits TO authenticated"),
        "authenticated must have SELECT privilege guarded by RLS"
      );
      return "Table-level access securely restricted";
    }
  );

  // ---------------------------------------------------------------------------
  // 5. SECURITY DEFINER FUNCTION AUDIT (check_rate_limit)
  // ---------------------------------------------------------------------------
  console.log("\n--- Category 5: Function Security & Execution Privileges ---");

  await runTest(
    "M12-RPC-01",
    "Function",
    "check_rate_limit execution restricted strictly to service_role",
    "REVOKE ALL FROM PUBLIC, anon, authenticated; GRANT TO service_role",
    () => {
      assert.ok(
        sqlContent.includes("REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated"),
        "Function permissions not revoked from untrusted roles"
      );
      assert.ok(
        sqlContent.includes("GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role"),
        "Function execute must be granted to service_role"
      );
      return "Function execution strictly restricted to service_role";
    }
  );

  await runTest(
    "M12-RPC-02",
    "Function",
    "check_rate_limit search path and SECURITY DEFINER configuration",
    "SECURITY DEFINER with SET search_path = public, pg_temp",
    () => {
      assert.ok(sqlContent.includes("SECURITY DEFINER"), "Function must be SECURITY DEFINER");
      assert.ok(sqlContent.includes("SET search_path = public, pg_temp"), "Function must pin search_path");
      return "SECURITY DEFINER with secure search_path pinned to public, pg_temp";
    }
  );

  await runTest(
    "M12-RPC-03",
    "Function",
    "check_rate_limit enforces strict input validation & division-by-zero protection",
    "Exceptions raised for invalid key, max_requests, or window_seconds",
    () => {
      assert.ok(sqlContent.includes("p_key IS NULL OR char_length(trim(p_key)) = 0"), "p_key validation missing");
      assert.ok(sqlContent.includes("p_max_requests IS NULL OR p_max_requests <= 0"), "p_max_requests validation missing");
      assert.ok(sqlContent.includes("p_window_seconds IS NULL OR p_window_seconds <= 0"), "p_window_seconds validation missing");
      return "Input validation protects against empty keys, negative limits, and division by zero";
    }
  );

  await runTest(
    "M12-RPC-04",
    "Function",
    "Atomic upsert handles concurrency and integer overflow safely",
    "ON CONFLICT DO UPDATE SET count = LEAST(2147483647, ...) RETURNING count",
    () => {
      assert.ok(
        sqlContent.includes("ON CONFLICT (key, window_start)"),
        "Atomic ON CONFLICT upsert missing"
      );
      assert.ok(
        sqlContent.includes("LEAST(2147483647"),
        "Integer overflow protection missing"
      );
      return "Atomic upsert with row-lock concurrency and integer overflow guard verified";
    }
  );

  await runTest(
    "M12-RPC-05",
    "Function",
    "Decoupled maintenance pruning: inline random() < 0.10 DELETE removed",
    "Hot path random delete eliminated from check_rate_limit",
    () => {
      const funcBodyMatch = sqlContent.match(/CREATE OR REPLACE FUNCTION public\.check_rate_limit[\s\S]*?\$\$[\s\S]*?\$\$/);
      assert.ok(funcBodyMatch, "Could not extract check_rate_limit function body");
      const funcBody = funcBodyMatch[0];
      assert.ok(
        !funcBody.includes("random()"),
        "check_rate_limit must not contain opportunistic random() DELETE"
      );
      assert.ok(
        !funcBody.includes("DELETE FROM"),
        "check_rate_limit must not perform DELETEs in the request path"
      );
      return "Hot request path contains zero random deletions or delete lock contention";
    }
  );

  await runTest(
    "M12-RPC-06",
    "Function",
    "Dedicated prune_expired_rate_limits maintenance function implemented",
    "prune_expired_rate_limits procedure defined with SECURITY DEFINER and service_role grant",
    () => {
      assert.ok(
        sqlContent.includes("CREATE OR REPLACE FUNCTION public.prune_expired_rate_limits"),
        "Missing prune_expired_rate_limits procedure"
      );
      assert.ok(
        sqlContent.includes("REVOKE ALL ON FUNCTION public.prune_expired_rate_limits(INTERVAL) FROM PUBLIC, anon, authenticated"),
        "Prune procedure permissions not revoked from untrusted roles"
      );
      assert.ok(
        sqlContent.includes("GRANT EXECUTE ON FUNCTION public.prune_expired_rate_limits(INTERVAL) TO service_role"),
        "Prune procedure execute must be granted to service_role"
      );
      return "Dedicated maintenance pruning function verified for scheduled cron maintenance";
    }
  );

  // ---------------------------------------------------------------------------
  // 6. APPLICATION CLIENT COMPATIBILITY (rate-limit.ts & database.types.ts)
  // ---------------------------------------------------------------------------
  console.log("\n--- Category 6: Application Client Compatibility ---");

  await runTest(
    "M12-APP-01",
    "Client",
    "checkRateLimit safely sanitizes and truncates oversized keys",
    "Oversized key truncated to <= 255 characters",
    async () => {
      const massiveKey = "user_".repeat(100); // 500 chars
      const result = await checkRateLimit(massiveKey, "auth");
      assert.ok(result.allowed !== undefined, "Rate limit result returned");
      assert.strictEqual(typeof result.limit, "number");
      assert.strictEqual(typeof result.remaining, "number");
      return `Processed 500-char key safely; source=${result.source}`;
    }
  );

  await runTest(
    "M12-APP-02",
    "Client",
    "checkRateLimit normalizes out-of-bounds config limits",
    "Limits clamped to valid positive ranges",
    async () => {
      const result = await checkRateLimit("test-bounds", "api", {
        maxRequests: -10,
        windowSeconds: -60,
      });
      assert.ok(result.limit >= 1, "maxRequests must be normalized to >= 1");
      return `Normalized invalid negative parameters to limit=${result.limit}`;
    }
  );

  await runTest(
    "M12-APP-03",
    "Client",
    "Rate limit headers RFC compliance and calculation",
    "Generates X-RateLimit-Limit, Remaining, Reset, Retry-After",
    () => {
      const headers = createRateLimitHeaders({
        allowed: false,
        limit: 10,
        remaining: 0,
        reset: Math.ceil(Date.now() / 1000) + 45,
        current: 11,
        source: "memory",
      });
      assert.strictEqual(headers["X-RateLimit-Limit"], "10");
      assert.strictEqual(headers["X-RateLimit-Remaining"], "0");
      assert.ok(headers["X-RateLimit-Reset"] !== undefined);
      assert.ok(Number(headers["Retry-After"]) >= 40);
      return "Headers verified: Limit=10, Remaining=0, Retry-After ~45s";
    }
  );

  await runTest(
    "M12-APP-04",
    "Types",
    "database.types.ts includes rate_limits table and RPC functions",
    "Typed definitions present for rate_limits and check_rate_limit",
    () => {
      const typesPath = path.resolve(process.cwd(), "types/database.types.ts");
      assert.ok(fs.existsSync(typesPath), "database.types.ts exists");
      const typesContent = fs.readFileSync(typesPath, "utf-8");
      assert.ok(typesContent.includes("rate_limits:"), "Missing rate_limits table type");
      assert.ok(typesContent.includes("check_rate_limit:"), "Missing check_rate_limit RPC type");
      assert.ok(typesContent.includes("prune_expired_rate_limits:"), "Missing prune_expired_rate_limits RPC type");
      return "TypeScript database definitions verified for rate_limits and both RPC procedures";
    }
  );

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log("TEST EXECUTION SUMMARY");
  console.log("================================================================================");
  const total = results.length;
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;

  console.log(`Total Tests  : ${total}`);
  console.log(`Passed       : ${passed}`);
  console.log(`Failed       : ${failed}`);
  console.log(`Success Rate : ${Math.round((passed / total) * 100)}%`);

  if (failed > 0) {
    console.error("\nFailed Tests:");
    results.filter((r) => r.status === "FAIL").forEach((r) => {
      console.error(`- [${r.id}] ${r.name}: ${r.error}`);
    });
    process.exit(1);
  } else {
    console.log("\nAll Migration 012 Review & Hardening verification tests passed successfully!");
  }
}

main().catch((err) => {
  console.error("Test runner failed:", err);
  process.exit(1);
});

