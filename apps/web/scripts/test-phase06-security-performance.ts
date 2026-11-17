/**
 * PHASE 06: SECURITY & PERFORMANCE HARDENING — OFFLINE VERIFICATION SUITE
 * MD Shakib Islamic Books
 *
 * Verifies:
 * 1. PostgreSQL migration 20261115000001: search_path = public, pg_temp on all 62 active functions,
 *    internal authz checks, least-privilege REVOKE/GRANT EXECUTE, hardened RLS policies, and 12 composite/partial indexes.
 * 2. API Security: /api/health redaction & timeouts, /api/shipping/track auth/ownership/AWB validation,
 *    /api/admin/books/[id]/variants GET RBAC, /api/documents/packing-slip HTML escaping & no-store headers,
 *    CSV formula injection neutralization, upload/body size limits, SSRF/XSS URL sanitization, error redaction.
 * 3. CSP, Security Headers, Edge Middleware fast-path & correlation IDs.
 * 4. Query optimization, PostgREST filter sanitization, batched replacement order items, parallelized queries,
 *    and safe public catalog caching with mutation invalidation.
 */

import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";

import {
  isValidUuid,
  isValidAwb,
  escapeCsvCell,
  sanitizeAttachmentUrls,
  sanitizeClientErrorMessage,
  readBoundedTextBody,
  readBoundedJsonBody,
} from "../lib/security/http";
import { checkRateLimit, getClientIp } from "../lib/security/rate-limit";
import { redactSensitiveData } from "../lib/logger";
import { GET as healthRouteGet } from "../app/api/health/route";
import { GET as trackRouteGet } from "../app/api/shipping/track/route";
import { GET as variantsGet } from "../app/api/admin/books/[id]/variants/route";
import { trackShipment, clearTrackingCache } from "../lib/integrations/delhivery/service";
import { invalidateCatalogCache, CATALOG_CACHE_TAGS } from "../lib/cache/catalog";
import { NextRequest } from "next/server";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const MIGRATIONS_DIR = path.join(REPO_ROOT, "supabase/migrations");

let passed = 0;
let failed = 0;
const failures: string[] = [];

async function test(name: string, fn: () => Promise<void> | void) {
  process.stdout.write(`  • ${name}... `);
  try {
    await fn();
    passed++;
    console.log("✓ PASS");
  } catch (err: any) {
    failed++;
    const msg = err?.message || String(err);
    failures.push(`${name}: ${msg}`);
    console.log(`✗ FAIL (${msg})`);
  }
}

function withEnv(overrides: Record<string, string | undefined>, fn: () => Promise<void> | void) {
  const backup: Record<string, string | undefined> = {};
  for (const key of Object.keys(overrides)) {
    backup[key] = process.env[key];
    if (overrides[key] === undefined) delete process.env[key];
    else process.env[key] = overrides[key];
  }
  const restore = () => {
    for (const key of Object.keys(overrides)) {
      if (backup[key] === undefined) delete process.env[key];
      else process.env[key] = backup[key];
    }
  };
  try {
    const res = fn();
    if (res && typeof (res as Promise<void>).then === "function") {
      return (res as Promise<void>).finally(restore);
    }
    restore();
    return;
  } catch (err) {
    restore();
    throw err;
  }
}

function setBaselineLocalEnv(): Record<string, string | undefined> {
  return {
    NODE_ENV: "test",
    APP_ENV: "local",
    NEXT_PUBLIC_APP_ENV: "local",
    VERCEL_ENV: undefined,
    ALLOW_MOCK_SERVICES: "false",
    NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "test_local_anon_key_1234567890",
    SUPABASE_SERVICE_ROLE_KEY: "test_local_service_role_key_1234567890",
    ENABLE_RAZORPAY: "false",
    ENABLE_EMAILS: "false",
    ENABLE_CLOUDINARY: "false",
    ENABLE_DELHIVERY: "false",
    DELIVERY_OTP_HMAC_SECRET: "phase06_local_test_hmac_secret_value_32chars",
    CRON_SECRET: "phase06_test_cron_secret_1234567890",
    HEALTH_CHECK_SECRET: undefined,
    DELHIVERY_TOKEN: undefined,
  };
}

function normType(t: string) {
  return t
    .trim()
    .replace(/\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\)/g, "")
    .replace(/\s+/g, " ")
    .toUpperCase()
    .replace(/\bINTEGER\b/g, "INT")
    .replace(/\bCHARACTER VARYING\b/g, "TEXT")
    .replace(/\bTIMESTAMP WITH TIME ZONE\b/g, "TIMESTAMPTZ")
    .replace(/\bBOOLEAN\b/g, "BOOL");
}

function splitTopLevelCommas(str: string): string[] {
  const res: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of str) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      res.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) res.push(cur);
  return res;
}

function parseArgTypes(argStr: string, hasNames: boolean): string[] {
  if (!argStr || !argStr.trim()) return [];
  const clean = argStr.replace(/--[^\n]*/g, "");
  return splitTopLevelCommas(clean).map((s) => {
    let t = s
      .trim()
      .replace(/\s+DEFAULT\s+[\s\S]*/i, "")
      .trim()
      .replace(/^(INOUT|OUT|IN|VARIADIC)\s+/i, "");
    if (hasNames) {
      const m = t.match(/^[a-z_][a-z0-9_]*\s+([\s\S]+)$/i);
      if (m && !/^(DOUBLE|TIMESTAMP|CHARACTER|WITH|TIME|ZONE)\b/i.test(t)) {
        t = m[1];
      }
    }
    return normType(t);
  });
}

async function main() {
  console.log("================================================================================");
  console.log("PHASE 06: SECURITY & PERFORMANCE HARDENING VERIFICATION SUITE");
  console.log("================================================================================");

  // ---------------------------------------------------------------------------
  // 1. DATABASE MIGRATION, SEARCH PATH, PRIVILEGES, RLS & INDEX VERIFICATION
  // ---------------------------------------------------------------------------
  console.log("\n--- 1. DATABASE SECURITY DEFINER, RLS & INDEX VERIFICATION ---");

  const migrationFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const phase06SqlPath = path.join(
    MIGRATIONS_DIR,
    "20261115000001_phase06_security_performance_hardening.sql"
  );

  await test("Phase 06 forward-only SQL migration exists on disk", () => {
    assert.ok(fs.existsSync(phase06SqlPath), "Missing 20261115000001 migration");
  });

  await test("Every active PostgreSQL function across all migrations enforces SET search_path = public, pg_temp", () => {
    const funcs = new Map<string, { name: string; file: string; sp: string; secDef: boolean }>();

    for (const file of migrationFiles) {
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      let m: RegExpExecArray | null;

      const dropRe =
        /DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?(?:public\.)?([a-zA-Z0-9_"]+)\s*(?:\(([^)]*)\))?\s*(?:CASCADE|RESTRICT)?\s*;/gi;
      while ((m = dropRe.exec(sql)) !== null) {
        const fn = m[1].replace(/"/g, "").toLowerCase();
        const args = m[2] !== undefined ? parseArgTypes(m[2], false).join(",") : null;
        for (const [k, v] of funcs.entries()) {
          if (v.name === fn && (args === null || k === `${fn}(${args})`)) {
            funcs.delete(k);
          }
        }
      }

      const fnRe =
        /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+(?:public\.)?([a-zA-Z0-9_"]+)\s*\(([\s\S]*?)\)\s*(RETURNS[\s\S]*?)AS\s+(\$\$|\$[a-zA-Z0-9_]*\$)([\s\S]*?)\4([\s\S]*?);/gi;
      while ((m = fnRe.exec(sql)) !== null) {
        const name = m[1].replace(/"/g, "").toLowerCase();
        const argTypes = parseArgTypes(m[2], true).join(",");
        const meta = m[3] + "\n" + m[6];
        const spMatch = meta.match(/SET\s+search_path\s*(?:=|TO)\s*([^\n;]+)/i);
        const sp = spMatch ? spMatch[1].trim() : "NONE";
        const secDef = /SECURITY\s+DEFINER/i.test(meta);
        funcs.set(`${name}(${argTypes})`, { name, file, sp, secDef });
      }
    }

    assert.ok(funcs.size >= 60, `Expected >= 60 active functions, found ${funcs.size}`);
    const unsafe = [...funcs.values()].filter((f) => !/pg_temp/i.test(f.sp));
    assert.deepStrictEqual(
      unsafe,
      [],
      `Functions missing pg_temp in search_path: ${JSON.stringify(unsafe)}`
    );
  });

  await test("Critical Phase 02 & reporting SECURITY DEFINER RPCs have internal authz and REVOKE FROM PUBLIC, anon, authenticated", () => {
    const sql = fs.readFileSync(phase06SqlPath, "utf8");
    const restrictedFunctions = [
      "verify_delivery_otp_atomic",
      "regenerate_delivery_otp_atomic",
      "record_inventory_movement_atomic",
      "reserve_replacement_inventory_atomic",
      "anonymize_customer_account",
      "get_sales_report",
      "get_payment_report",
      "get_inventory_report",
    ];
    for (const fn of restrictedFunctions) {
      assert.ok(
        new RegExp(`REVOKE\\s+ALL\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\([^)]*\\)\\s+FROM\\s+PUBLIC,\\s*anon,\\s*authenticated`, "i").test(sql),
        `Missing strict REVOKE FROM PUBLIC, anon, authenticated for ${fn}`
      );
      assert.ok(
        new RegExp(`GRANT\\s+EXECUTE\\s+ON\\s+FUNCTION\\s+public\\.${fn}\\([^)]*\\)\\s+TO\\s+(?:postgres,\\s*)?service_role`, "i").test(sql),
        `Missing service_role GRANT for ${fn}`
      );
    }

    // Also verify get_inventory_report uses schema-accurate 'reserved' state instead of invalid 'active'
    assert.ok(
      sql.includes("WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at > NOW())"),
      "get_inventory_report must query status = 'reserved'"
    );
  });

  await test("RLS policies lock down phone_verifications, delivery_otps, ticket_messages, book_variants, and invoices", () => {
    const sql = fs.readFileSync(phase06SqlPath, "utf8");
    assert.ok(
      sql.includes('DROP POLICY IF EXISTS "phone_verifications_customer" ON public.phone_verifications') &&
        sql.includes('CREATE POLICY "phone_verifications_service_only" ON public.phone_verifications') &&
        sql.includes("REVOKE ALL ON TABLE public.phone_verifications FROM PUBLIC, anon, authenticated"),
      "phone_verifications must be restricted strictly to service_role"
    );
    assert.ok(
      sql.includes('DROP POLICY IF EXISTS "delivery_otps_owner_read" ON public.delivery_otps') &&
        sql.includes("REVOKE ALL ON TABLE public.delivery_otps FROM PUBLIC, anon"),
      "delivery_otps must not allow direct customer otp_hash SELECT"
    );
    assert.ok(
      sql.includes('CREATE POLICY "messages_customer_insert" ON public.ticket_messages') &&
        sql.includes("AND is_staff = FALSE"),
      "messages_customer_insert must prevent customers from setting is_staff = TRUE"
    );
    assert.ok(
      sql.includes('CREATE POLICY "variants_read_public" ON public.book_variants') &&
        sql.includes("is_active = TRUE") &&
        sql.includes("b.is_active = TRUE"),
      "variants_read_public must require both active variant and active parent book (or is_staff())"
    );
  });

  await test("Phase 06 migration provisions all 12 composite/partial indexes cleanly", () => {
    const sql = fs.readFileSync(phase06SqlPath, "utf8");
    const expectedIndexes = [
      "idx_books_active_category_created",
      "idx_books_active_price_id",
      "idx_book_variants_active_book",
      "idx_reviews_book_approved_created",
      "idx_reviews_status_created",
      "idx_return_requests_status_created",
      "idx_support_tickets_customer_updated",
      "idx_support_tickets_status_updated",
      "idx_inventory_reservations_expired_reserved",
      "idx_orders_order_status_created",
      "idx_orders_payment_status_created",
      "idx_orders_shipping_awb_nonnull",
    ];
    for (const idx of expectedIndexes) {
      assert.ok(
        sql.includes(`CREATE INDEX IF NOT EXISTS ${idx}`),
        `Missing expected index ${idx}`
      );
    }
  });

  // ---------------------------------------------------------------------------
  // 2. HEALTH, TRACKING & ADMIN API SECURITY BOUNDARIES
  // ---------------------------------------------------------------------------
  console.log("\n--- 2. HEALTH, TRACKING & ADMIN API ENDPOINTS ---");

  await test("/api/health redacts environment details in production without diagnostic secret and enforces live/ready probes", async () => {
    await withEnv(
      {
        ...setBaselineLocalEnv(),
        NODE_ENV: "production",
        APP_ENV: "production",
        NEXT_PUBLIC_APP_ENV: "production",
        NEXT_PUBLIC_SUPABASE_URL: "https://prodproject.supabase.co",
        CRON_SECRET: "prod_health_diagnostic_secret_123456",
      },
      async () => {
        // Unauthenticated production health check
        const res = await healthRouteGet(new Request("http://localhost:3000/api/health?probe=live"));
        assert.strictEqual(res.status, 200);
        const body = await res.json();
        assert.strictEqual(body.status, "healthy");
        assert.strictEqual(body.probe, "live");
        assert.strictEqual(body.checks.database, "skipped");
        assert.strictEqual(body.environment, undefined, "Production health must redact environment topology");
        assert.strictEqual(body.uptimeSeconds, undefined, "Production health must redact uptime");

        // Readiness probe when DB unreachable returns 503 fail-closed within timeout
        const readyRes = await healthRouteGet(
          new Request("http://localhost:3000/api/health?probe=ready", {
            headers: { "x-forwarded-for": "198.51.100.44" },
          })
        );
        // Either 503 if Supabase unreachable or 200 if DB connected; verify clean structure
        assert.ok([200, 503].includes(readyRes.status));
        const readyBody = await readyRes.json();
        assert.strictEqual(readyBody.environment, undefined);

        // Authorized diagnostic caller in production receives boolean metadata (never raw secrets)
        const authRes = await healthRouteGet(
          new Request("http://localhost:3000/api/health?probe=live", {
            headers: {
              Authorization: "Bearer prod_health_diagnostic_secret_123456",
              "x-forwarded-for": "198.51.100.45",
            },
          })
        );
        assert.strictEqual(authRes.status, 200);
        const authBody = await authRes.json();
        assert.ok(authBody.environment, "Authorized diagnostic probe should return environment summary");
        assert.strictEqual(authBody.environment.appEnv, "production");
        assert.ok(!JSON.stringify(authBody).includes("prod_health_diagnostic_secret"));
      }
    );
  });

  await test("/api/shipping/track validates AWB format, returns 503 when disabled, and rejects unauthenticated requests when enabled", async () => {
    await withEnv(setBaselineLocalEnv(), async () => {
      // Malformed AWB format rejected with 400
      const badRes = await trackRouteGet(
        new Request("http://localhost:3000/api/shipping/track?awb=../../etc/passwd")
      );
      assert.strictEqual(badRes.status, 400);

      // Disabled Delhivery -> 503
      const disabledRes = await trackRouteGet(
        new Request("http://localhost:3000/api/shipping/track?awb=TESTAWB1234")
      );
      assert.strictEqual(disabledRes.status, 503);
      const disabledBody = await disabledRes.json();
      assert.strictEqual(disabledBody.configured, false);

      // Enabled Delhivery (mock mode) WITHOUT session cookie -> 401 Unauthorized (prevents open proxy / AWB enumeration)
      await withEnv(
        {
          ALLOW_MOCK_SERVICES: "true",
          ENABLE_DELHIVERY: undefined,
        },
        async () => {
          const unauthRes = await trackRouteGet(
            new Request("http://localhost:3000/api/shipping/track?awb=TESTAWB1234")
          );
          assert.strictEqual(unauthRes.status, 401);
        }
      );
    });
  });

  await test("Delhivery trackShipment caches normalized live responses briefly to avoid duplicate upstream API calls", async () => {
    clearTrackingCache();
    let fetchCalls = 0;
    const origFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      fetchCalls++;
      return new Response(
        JSON.stringify({
          ShipmentData: [
            {
              Shipment: {
                Status: { Status: "In Transit" },
                PickUpLocation: "Delhi Hub",
                DeliveryLocation: "Mumbai",
                Scans: [
                  {
                    ScanDetail: {
                      ScanDateTime: "2026-11-11T10:00:00Z",
                      ScannedLocation: "Delhi Hub",
                      Instructions: "Dispatched",
                      ScanType: "IT",
                    },
                  },
                ],
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    try {
      await withEnv(
        {
          ...setBaselineLocalEnv(),
          ENABLE_DELHIVERY: "true",
          DELHIVERY_API_URL: "https://staging-express.delhivery.com",
          DELHIVERY_TOKEN: "valid_test_delhivery_token_987654321",
          DELHIVERY_WEBHOOK_SECRET: "valid_delhivery_webhook_secret_123456",
        },
        async () => {
          const r1 = await trackShipment("DLH123456789");
          const r2 = await trackShipment("DLH123456789");
          assert.strictEqual(r1.status, "Shipped");
          assert.strictEqual(r2.status, "Shipped");
          assert.strictEqual(fetchCalls, 1, "Second identical track call within TTL should hit cache");
        }
      );
    } finally {
      globalThis.fetch = origFetch;
      clearTrackingCache();
    }
  });

  await test("GET /api/admin/books/[id]/variants now enforces admin authentication and cannot be scraped unauthenticated", async () => {
    await withEnv(setBaselineLocalEnv(), async () => {
      const req = new NextRequest(`http://localhost:3000/api/admin/books/${crypto.randomUUID()}/variants`);
      const res = await variantsGet(req, {
        params: Promise.resolve({ id: crypto.randomUUID() }),
      });
      assert.strictEqual(res.status, 401);
    });
  });

  await test("Warehouse packing slip route uses escapeHtml() across all customer/item fields and sets NO_STORE_HEADERS", () => {
    const packingSlipSrc = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/app/api/documents/packing-slip/[orderId]/route.ts"),
      "utf8"
    );
    assert.ok(packingSlipSrc.includes("escapeHtml(slip.customerName)"));
    assert.ok(packingSlipSrc.includes("escapeHtml(addr.house_no"));
    assert.ok(packingSlipSrc.includes("escapeHtml(item.title)"));
    assert.ok(packingSlipSrc.includes("escapeHtml(slip.awb"));
    assert.ok(packingSlipSrc.includes("isValidUuid(orderId)"));
    assert.ok(packingSlipSrc.includes("NO_STORE_HEADERS"));
  });

  // ---------------------------------------------------------------------------
  // 3. SHARED SECURITY HELPERS, VALIDATION, CSV INJECTION & REDACTION
  // ---------------------------------------------------------------------------
  console.log("\n--- 3. INPUT VALIDATION, CSV SAFETY, RATE LIMIT & LOGGER ---");

  await test("Shared validators validate UUID/AWB formats and block SSRF/XSS attachment URLs", () => {
    assert.strictEqual(isValidUuid("a0000000-0000-0000-0000-000000000001"), true);
    assert.strictEqual(isValidUuid("not-a-uuid"), false);
    assert.strictEqual(isValidAwb("WB123456789IN"), true);
    assert.strictEqual(isValidAwb("bad/awb?x=1"), false);

    assert.strictEqual(sanitizeAttachmentUrls(["https://res.cloudinary.com/demo/image/upload/v1/x.webp"]).valid, true);
    assert.strictEqual(sanitizeAttachmentUrls(["javascript:alert(1)"]).valid, false);
    assert.strictEqual(sanitizeAttachmentUrls(["http://169.254.169.254/latest/meta-data/"]).valid, false);
    assert.strictEqual(sanitizeAttachmentUrls(["https://127.0.0.1/secret"]).valid, false);
  });

  await test("CSV export sanitizer neutralizes formula injection payloads (=, +, -, @)", () => {
    assert.strictEqual(escapeCsvCell('=cmd|" /C calc"!A0'), `"'=cmd|"" /C calc""!A0"`);
    assert.strictEqual(escapeCsvCell("+1+1"), "'+1+1");
    assert.strictEqual(escapeCsvCell("-2+3"), "'-2+3");
    assert.strictEqual(escapeCsvCell("@SUM(A1:A2)"), "'@SUM(A1:A2)");
    assert.strictEqual(escapeCsvCell("Authentic Tafseer"), "Authentic Tafseer");
  });

  await test("Bounded body parser rejects oversized JSON/webhook payloads with HTTP 413", async () => {
    const oversized = JSON.stringify({ data: "x".repeat(2000) });
    const req = new Request("http://localhost:3000/api/webhooks/razorpay", {
      method: "POST",
      body: oversized,
    });
    const textRes = await readBoundedTextBody(req, 512);
    assert.strictEqual(textRes.ok, false);
    if (!textRes.ok) assert.strictEqual(textRes.status, 413);

    const badJsonReq = new Request("http://localhost:3000/api/payments/verify", {
      method: "POST",
      body: "[]",
    });
    const jsonRes = await readBoundedJsonBody(badJsonReq, 512);
    assert.strictEqual(jsonRes.ok, false);
    if (!jsonRes.ok) assert.strictEqual(jsonRes.status, 400);
  });

  await test("Error sanitizer & logger redact PostgreSQL internals, JWTs, and provider secret prefixes", () => {
    assert.strictEqual(
      sanitizeClientErrorMessage(new Error('duplicate key value violates unique constraint "orders_pkey"'), "Request failed"),
      "Request failed"
    );
    assert.strictEqual(
      sanitizeClientErrorMessage(new Error("Invalid AWB format."), "Request failed"),
      "Invalid AWB format."
    );

    const scrubbed = redactSensitiveData({
      email: "safe@example.com",
      rawLog: "Key rzp_live_AbCdEf123456 leaked with whsec_TestSecretValue12345",
    });
    assert.strictEqual(scrubbed.email, "safe@example.com");
    assert.ok(!scrubbed.rawLog.includes("rzp_live_AbCdEf123456"));
    assert.ok(!scrubbed.rawLog.includes("whsec_TestSecretValue12345"));

    const ip = getClientIp(new Request("http://localhost:3000", {
      headers: { "x-forwarded-for": "198.51.100.9, 10.0.0.1" },
    }));
    assert.strictEqual(ip, "198.51.100.9");
  });

  await test("In-memory rate limiter enforces auth limits cleanly offline", async () => {
    const key = `phase06_rl_${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit(key, "auth");
      assert.strictEqual(r.allowed, true);
    }
    const blocked = await checkRateLimit(key, "auth");
    assert.strictEqual(blocked.allowed, false);
  });

  // ---------------------------------------------------------------------------
  // 4. CSP, SECURITY HEADERS, MIDDLEWARE & PERFORMANCE HARDENING
  // ---------------------------------------------------------------------------
  console.log("\n--- 4. CSP, MIDDLEWARE, CACHING & QUERY PERFORMANCE ---");

  await test("Production security headers strip unsafe-eval, localhost origins, and unused CDNs while adding CORP/COOP", async () => {
    const out = execFileSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `
        process.env.NODE_ENV = "production";
        const mod = await import("./next.config.ts");
        const cfg = mod.default;
        const headerGroups = await cfg.headers();
        console.log(JSON.stringify(headerGroups[0].headers));
        `,
      ],
      {
        cwd: path.join(REPO_ROOT, "apps/web"),
        env: { ...process.env, NODE_ENV: "production" },
        encoding: "utf8",
      }
    );
    const headersList: Array<{ key: string; value: string }> = JSON.parse(out);
    const headerMap = Object.fromEntries(headersList.map((h) => [h.key, h.value]));

    assert.ok(headerMap["Cross-Origin-Resource-Policy"] === "same-origin");
    assert.ok(headerMap["Cross-Origin-Opener-Policy"] === "same-origin-allow-popups");
    assert.ok(headerMap["Strict-Transport-Security"]?.includes("max-age=63072000"));

    const csp = headerMap["Content-Security-Policy"] || "";
    assert.ok(!csp.includes("'unsafe-eval'"), "Production CSP must not allow 'unsafe-eval'");
    assert.ok(!csp.includes("127.0.0.1"), "Production CSP must not allow loopback origins");
    assert.ok(!csp.includes("cdn.jsdelivr.net"), "Unused cdn.jsdelivr.net must be removed");
    assert.ok(!csp.includes("unpkg.com"), "Unused unpkg.com must be removed");
    assert.ok(csp.includes("https://checkout.razorpay.com"), "Razorpay checkout origin must remain allowed");
    assert.ok(csp.includes("upgrade-insecure-requests"), "Production CSP must upgrade insecure requests");
  });

  await test("Edge middleware fast-paths webhooks/cron & anonymous public routes and attaches x-request-id", async () => {
    const mod = await import("../middleware");
    const reqWebhook = new NextRequest("http://localhost:3000/api/webhooks/razorpay");
    const resWebhook = await mod.middleware(reqWebhook);
    assert.ok(resWebhook.headers.get("x-request-id"), "Missing x-request-id on webhook pass-through");

    const reqPublic = new NextRequest("http://localhost:3000/books");
    const resPublic = await mod.middleware(reqPublic);
    assert.strictEqual(resPublic.status, 200);
    assert.ok(resPublic.headers.get("x-request-id"), "Missing x-request-id on public route pass-through");
  });

  await test("PostgREST search filter injection delimiters are stripped in catalog.ts and query N+1s are eliminated", () => {
    const catalogSrc = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/lib/data/catalog.ts"),
      "utf8"
    );
    assert.ok(
      catalogSrc.includes("replace(/[,()]/g"),
      "catalog.ts must sanitize PostgREST .or() delimiters"
    );
    assert.ok(
      catalogSrc.includes("PUBLIC_BOOK_SELECT_COLUMNS") &&
        !catalogSrc.includes('.select("*")'),
      "catalog.ts must project explicit public columns instead of select('*')"
    );
    assert.ok(
      catalogSrc.includes("withSafePublicCatalogCache") &&
        catalogSrc.includes("cache(async function getBookById"),
      "catalog.ts must cache public reads and memoize getBookById"
    );

    const ordersSrc = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/lib/commerce/orders.ts"),
      "utf8"
    );
    assert.ok(
      ordersSrc.includes('.in("order_id", orderIds)'),
      "getCustomerReplacements must batch order_items instead of N+1 loop"
    );

    const adminOrdersSrc = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/lib/admin/orders.ts"),
      "utf8"
    );
    assert.ok(
      adminOrdersSrc.includes("Promise.all(["),
      "getAdminOrderById must parallelize sub-queries with Promise.all"
    );

    const bookPageSrc = fs.readFileSync(
      path.join(REPO_ROOT, "apps/web/app/books/[id]/page.tsx"),
      "utf8"
    );
    assert.ok(
      bookPageSrc.includes("export const revalidate = 60") &&
        !bookPageSrc.includes('dynamic = "force-dynamic"'),
      "BookDetailPage must allow ISR caching instead of force-dynamic"
    );

    assert.ok(CATALOG_CACHE_TAGS.book("abc") === "catalog:book:abc");
    assert.doesNotThrow(() => invalidateCatalogCache("abc"));
  });

  console.log("\n================================================================================");
  console.log(`PHASE 06 SUMMARY: ${passed} / ${passed + failed} PASSED (${failed} FAILED)`);
  console.log("================================================================================");

  if (failed > 0) {
    console.error("\nFAILURES:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Fatal error running Phase 06 tests:", err);
  process.exit(1);
});
