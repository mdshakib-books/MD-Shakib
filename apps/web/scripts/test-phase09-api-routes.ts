/**
 * ==============================================================================
 * PHASE 09: API ROUTES & SECURITY BOUNDARIES TEST SUITE
 * MD Shakib Islamic Books
 * ==============================================================================
 * Exhaustively tests all API routes against:
 * 1. Unauthenticated requests (401)
 * 2. Unauthorized roles / privilege escalation (403)
 * 3. Missing required parameters (400)
 * 4. Invalid data types & formats (400)
 * 5. Malformed JSON & tampered headers (400)
 * 6. Cryptographic signature verification
 * 7. Shipping pincode format validation
 * ==============================================================================
 */

import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import assert from "node:assert";
import crypto from "crypto";

const APP_BASE_URL = "http://localhost:3001";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

const adminDb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

async function test(name: string, fn: () => Promise<void>) {
  totalTests++;
  process.stdout.write(`  [API-${String(totalTests).padStart(2, "0")}] ${name}... `);
  try {
    await fn();
    console.log("✓ PASS");
    passedTests++;
  } catch (err: any) {
    console.log("✗ FAIL");
    console.error(`     Error: ${err?.message || err}`);
    failedTests++;
  }
}

async function runApiTests() {
  console.log("=".repeat(80));
  console.log("PHASE 09: API ROUTES & SECURITY BOUNDARIES VERIFICATION SUITE");
  console.log("=".repeat(80) + "\n");

  const runId = Date.now();
  const emailCust = `api_cust_${runId}@example.com`;
  const emailAdmin = `api_admin_${runId}@example.com`;
  const password = "SecretPassword123!";

  // 1. Provision Auth Users
  const { data: authCust } = await adminDb.auth.admin.createUser({
    email: emailCust,
    password,
    email_confirm: true,
    user_metadata: { full_name: "API Customer" },
  });
  const custId = authCust!.user!.id;

  const { data: authAdmin } = await adminDb.auth.admin.createUser({
    email: emailAdmin,
    password,
    email_confirm: true,
    user_metadata: { full_name: "API Admin" },
  });
  const adminId = authAdmin!.user!.id;
  await adminDb.from("profiles").update({ role: "admin" }).eq("id", adminId);

  // Helper to obtain authenticated SSR cookie header
  async function getAuthCookies(email: string, pass: string): Promise<string> {
    const jar: Record<string, string> = {};
    const sc = createServerClient(SUPABASE_URL, ANON_KEY, {
      cookies: {
        getAll() {
          return Object.entries(jar).map(([name, value]) => ({ name, value }));
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach((c) => {
            jar[c.name] = c.value;
          });
        },
      },
    });
    const res = await sc.auth.signInWithPassword({ email, password: pass });
    if (res.error) throw res.error;
    return Object.entries(jar)
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }

  const custCookie = await getAuthCookies(emailCust, password);
  const adminCookie = await getAuthCookies(emailAdmin, password);

  try {
    // -------------------------------------------------------------------------
    // 1. /api/payments/create-order
    // -------------------------------------------------------------------------
    console.log("--- 1. /api/payments/create-order ROUTE ---");

    await test("POST without authentication returns 401 Unauthorized", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: crypto.randomUUID() }),
      });
      assert.strictEqual(res.status, 401);
      const json = await res.json();
      assert.ok(json.error?.includes("Authentication required"));
    });

    await test("POST with authentication but missing orderId returns 400 Bad Request", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: custCookie,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("Missing required parameter: orderId"));
    });

    await test("POST with non-existent orderId returns 400 Bad Request", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/payments/create-order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: custCookie,
        },
        body: JSON.stringify({ orderId: crypto.randomUUID() }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("not found"));
    });

    // -------------------------------------------------------------------------
    // 2. /api/payments/verify
    // -------------------------------------------------------------------------
    console.log("\n--- 2. /api/payments/verify ROUTE ---");

    await test("POST without authentication returns 401 Unauthorized", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ razorpay_order_id: "order_123" }),
      });
      assert.strictEqual(res.status, 401);
    });

    await test("POST with missing signature parameters returns 400 Bad Request", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: custCookie,
        },
        body: JSON.stringify({ razorpay_order_id: "order_123" }), // Missing payment_id and signature
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("Missing required Razorpay payment signature parameters"));
    });

    await test("POST with forged signature returns 400 Signature Verification Failed", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/payments/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: custCookie,
        },
        body: JSON.stringify({
          razorpay_order_id: "order_123",
          razorpay_payment_id: "pay_123",
          razorpay_signature: "forged_invalid_signature_hex",
        }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("Invalid Razorpay payment signature") || json.error?.includes("failed"));
    });

    // -------------------------------------------------------------------------
    // 3. /api/webhooks/razorpay
    // -------------------------------------------------------------------------
    console.log("\n--- 3. /api/webhooks/razorpay ROUTE ---");

    await test("Webhook POST without x-razorpay-signature header returns 400", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "payment.captured" }),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("Missing x-razorpay-signature header"));
    });

    await test("Webhook POST with forged signature header returns 400", async () => {
      const body = JSON.stringify({ event: "payment.captured", payload: {} });
      const res = await fetch(`${APP_BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": "forged_signature_hex",
        },
        body,
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("Invalid Razorpay webhook signature"));
    });

    await test("Webhook POST with valid HMAC SHA-256 signature is processed successfully", async () => {
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_webhook_secret_test_67890";
      const payload = { event: "ping.test", payload: {} };
      const rawBody = JSON.stringify(payload);

      const authenticSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(rawBody)
        .digest("hex");

      const res = await fetch(`${APP_BASE_URL}/api/webhooks/razorpay`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-razorpay-signature": authenticSignature,
        },
        body: rawBody,
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.status, "unhandled_event");
    });

    // -------------------------------------------------------------------------
    // 4. /api/shipping/serviceability
    // -------------------------------------------------------------------------
    console.log("\n--- 4. /api/shipping/serviceability ROUTE ---");

    await test("Valid 6-digit Indian pincode returns 200 with serviceability data", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/shipping/serviceability?pincode=110025`);
      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.pincode, "110025");
      assert.strictEqual(typeof json.serviceable, "boolean");
      assert.strictEqual(typeof json.cod, "boolean");
      assert.strictEqual(typeof json.prepaid, "boolean");
    });

    await test("Malformed pincode (< 6 digits or non-numeric) returns 400 Bad Request", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/shipping/serviceability?pincode=1102`);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("6 digits"));

      const resAlpha = await fetch(`${APP_BASE_URL}/api/shipping/serviceability?pincode=ABC123`);
      assert.strictEqual(resAlpha.status, 400);
    });

    // -------------------------------------------------------------------------
    // 5. /api/shipping/track
    // -------------------------------------------------------------------------
    console.log("\n--- 5. /api/shipping/track ROUTE ---");

    await test("Missing AWB parameter returns 400 Bad Request", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/shipping/track`);
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("AWB") || json.error?.includes("required"));
    });

    // -------------------------------------------------------------------------
    // 6. /api/admin/orders/[id]/status
    // -------------------------------------------------------------------------
    console.log("\n--- 6. /api/admin/orders/[id]/status ROUTE ---");

    await test("PATCH without authentication returns 401 Unauthorized", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/admin/orders/${crypto.randomUUID()}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nextStatus: "Packed" }),
      });
      assert.strictEqual(res.status, 401);
    });

    await test("PATCH by non-admin customer account returns 403 Forbidden", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/admin/orders/${crypto.randomUUID()}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: custCookie,
        },
        body: JSON.stringify({ nextStatus: "Packed" }),
      });
      assert.strictEqual(res.status, 403);
    });

    await test("PATCH by admin with missing nextStatus returns 400 Bad Request", async () => {
      const res = await fetch(`${APP_BASE_URL}/api/admin/orders/${crypto.randomUUID()}/status`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Cookie: adminCookie,
        },
        body: JSON.stringify({}),
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("nextStatus is required"));
    });

    // -------------------------------------------------------------------------
    // 7. /api/admin/media/upload
    // -------------------------------------------------------------------------
    console.log("\n--- 7. /api/admin/media/upload ROUTE ---");

    await test("POST without admin authentication returns 401 or 403", async () => {
      const formData = new FormData();
      formData.append("folder", "mdshakib_books");

      const res = await fetch(`${APP_BASE_URL}/api/admin/media/upload`, {
        method: "POST",
        body: formData,
      });
      assert.ok(res.status === 401 || res.status === 403);
    });

    await test("POST with path traversal or disallowed folder returns 400 Bad Request", async () => {
      const formData = new FormData();
      formData.append("folder", "../secret_system_dir");

      const res = await fetch(`${APP_BASE_URL}/api/admin/media/upload`, {
        method: "POST",
        headers: {
          Cookie: adminCookie,
        },
        body: formData,
      });
      assert.strictEqual(res.status, 400);
      const json = await res.json();
      assert.ok(json.error?.includes("restricted strictly to 'mdshakib_books'"));
    });

  } finally {
    // Purge test accounts
    try {
      await adminDb.auth.admin.deleteUser(custId);
      await adminDb.auth.admin.deleteUser(adminId);
    } catch {}
  }

  console.log("\n" + "=".repeat(80));
  console.log(`API ROUTES SUMMARY: ${passedTests}/${totalTests} PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log("=".repeat(80));

  if (failedTests > 0) {
    process.exit(1);
  }
}

runApiTests().catch((err) => {
  console.error("Fatal API test suite error:", err);
  process.exit(1);
});
