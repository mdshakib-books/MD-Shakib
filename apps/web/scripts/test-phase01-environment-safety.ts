/**
 * Phase 01: Environment & Development Safety Verification Suite
 *
 * Offline automated tests covering:
 * 1. Environment validation (missing vars, invalid URLs, missing creds, public secret leaks, prod/dev mismatches)
 * 2. Supabase isolation (local vs dev vs preview vs production project refs)
 * 3. Service kill switches (Razorpay, Resend, Cloudinary, Delhivery disabled vs enabled behavior)
 * 4. Mock service isolation (explicit opt-in in dev/test only; strictly rejected in preview/staging/prod)
 * 5. Client-side secret & server-module boundary checks
 *
 * Strictly offline: blocks all outbound HTTP and Supabase network requests.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  assertValidPublicSupabaseEnv,
  getPublicEnv,
} from "../lib/env/public";
import {
  assertValidServerEnv,
  assertValidServerEnvOnStartup,
  EnvironmentValidationError,
  getOtpHmacSecret,
  isMockCatalogAllowed,
  isMockOtpExposureAllowed,
  validateServerEnv,
} from "../lib/env/server";
import { checkIntegrationStatus } from "../lib/integrations/config";
import {
  createRazorpayOrder,
  initiateRazorpayRefund,
  RazorpayConfigurationError,
  RazorpayDisabledError,
  verifyAndSettlePayment,
} from "../lib/integrations/razorpay/service";
import { getRazorpayClient } from "../lib/integrations/razorpay/client";
import { processRazorpayWebhook } from "../lib/integrations/razorpay/webhook";
import {
  sendAdminNewOrderNotification,
  sendContactFormAcknowledgement,
  sendLowStockAlertEmail,
  sendOrderEmails,
  sendShipmentNotification,
} from "../lib/integrations/resend/service";
import {
  CloudinaryDisabledError,
  deleteImageByPublicId,
  generateSignedUploadParams,
  uploadImageBuffer,
} from "../lib/integrations/cloudinary/service";
import {
  checkPincodeServiceability,
  createShipmentForOrder,
  DelhiveryConfigurationError,
  DelhiveryDisabledError,
  getShippingLabel,
  scheduleDelhiveryPickup,
  trackShipment,
  verifyDelhiveryWebhookAuth,
} from "../lib/integrations/delhivery/service";
import { scheduleReturnPickup } from "../lib/commerce/returns";
import { getBooks, getBookById, getFeaturedBooks } from "../lib/data/catalog";
import { getGuestCartDetails } from "../lib/commerce/cart";
import { createAdminClient } from "../lib/supabase/admin";
import { createPublicClient } from "../lib/supabase/server";
import { GET as healthRouteGet } from "../app/api/health/route";
import { POST as createOrderRoutePost } from "../app/api/payments/create-order/route";
import { POST as razorpayWebhookPost } from "../app/api/webhooks/razorpay/route";
import { GET as serviceabilityRouteGet } from "../app/api/shipping/serviceability/route";
import { GET as trackRouteGet } from "../app/api/shipping/track/route";
import { POST as delhiveryWebhookPost } from "../app/api/webhooks/delhivery/route";

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    Reflect.set(process.env, key, value);
  }
}

function makeFakeJwt(role: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ iss: "supabase", role, iat: 1700000000, exp: 2000000000 })
  ).toString("base64url");
  return `${header}.${payload}.fake_signature_for_unit_test`;
}

function setValidLocalEnv() {
  for (const key of Object.keys(process.env)) {
    if (
      key.startsWith("NEXT_PUBLIC_") ||
      key.startsWith("SUPABASE_") ||
      key.startsWith("ENABLE_") ||
      key.startsWith("RAZORPAY_") ||
      key.startsWith("RESEND_") ||
      key.startsWith("CLOUDINARY_") ||
      key.startsWith("DELHIVERY_") ||
      key.startsWith("BUSINESS_") ||
      key.startsWith("EMAIL_") ||
      key.startsWith("ADMIN_") ||
      key.startsWith("VERCEL") ||
      key === "APP_ENV" ||
      key === "ALLOW_MOCK_SERVICES" ||
      key === "DELIVERY_OTP_HMAC_SECRET" ||
      key === "NEXT_PHASE"
    ) {
      Reflect.deleteProperty(process.env, key);
    }
  }
  setEnv("NODE_ENV", "development");
  setEnv("APP_ENV", "local");
  setEnv("NEXT_PUBLIC_APP_ENV", "local");
  setEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
  setEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
  setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", makeFakeJwt("anon"));
  setEnv("SUPABASE_SERVICE_ROLE_KEY", makeFakeJwt("service_role"));
  setEnv("ENABLE_RAZORPAY", "false");
  setEnv("ENABLE_EMAILS", "false");
  setEnv("ENABLE_CLOUDINARY", "false");
  setEnv("ENABLE_DELHIVERY", "false");
  setEnv("ALLOW_MOCK_SERVICES", "false");
  setEnv("DELHIVERY_API_URL", "https://staging-express.delhivery.com");
}

function setValidProductionEnv() {
  setValidLocalEnv();
  setEnv("NODE_ENV", "production");
  setEnv("APP_ENV", "production");
  setEnv("NEXT_PUBLIC_APP_ENV", "production");
  setEnv("NEXT_PUBLIC_SITE_URL", "https://mdshakibbooks.com");
  setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://prodrefexample123456.supabase.co");
  setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", makeFakeJwt("anon"));
  setEnv("SUPABASE_SERVICE_ROLE_KEY", makeFakeJwt("service_role"));
  setEnv("ENABLE_RAZORPAY", "true");
  setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_live_1234567890abcdef");
  setEnv("RAZORPAY_KEY_SECRET", "live_secret_value_1234567890");
  setEnv("RAZORPAY_WEBHOOK_SECRET", "live_webhook_secret_1234567890");
  setEnv("ENABLE_EMAILS", "true");
  setEnv("RESEND_API_KEY", "re_live_example_1234567890abcdef");
  setEnv("EMAIL_FROM", "MD Shakib Books <orders@mdshakibbooks.com>");
  setEnv("ENABLE_CLOUDINARY", "true");
  setEnv("NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME", "mdshakib-prod");
  setEnv("CLOUDINARY_API_KEY", "123456789012345");
  setEnv("CLOUDINARY_API_SECRET", "prod_cloudinary_secret_abcdef");
  setEnv("ENABLE_DELHIVERY", "true");
  setEnv("DELHIVERY_API_URL", "https://track.delhivery.com");
  setEnv("DELHIVERY_TOKEN", "prod_delhivery_token_abcdef1234");
  setEnv("DELHIVERY_WEBHOOK_SECRET", "prod_delhivery_webhook_secret_123");
  setEnv("ALLOW_MOCK_SERVICES", "false");
  setEnv("DELIVERY_OTP_HMAC_SECRET", "unique_prod_otp_hmac_secret_64_chars_long_sample_1234567890");
  setEnv("BUSINESS_GSTIN", "07AABCU9603R1ZP");
}

function createValidPng(): Buffer {
  // Minimal valid 24x24 PNG header + chunk structure for validation tests
  const zlib = require("node:zlib") as typeof import("node:zlib");
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(24, 0);
  ihdr.writeUInt32BE(24, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const crc = (buf: Buffer) => {
    let c = 0xffffffff;
    for (const b of buf) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (t: string, d: Buffer) => {
    const l = Buffer.alloc(4);
    l.writeUInt32BE(d.length, 0);
    const td = Buffer.concat([Buffer.from(t, "ascii"), d]);
    const cb = Buffer.alloc(4);
    cb.writeUInt32BE(crc(td), 0);
    return Buffer.concat([l, td, cb]);
  };
  const row = Buffer.alloc(1 + 24 * 3);
  const raw = Buffer.concat(Array(24).fill(row));
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...collectTsFiles(full));
    else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) results.push(full);
  }
  return results;
}

async function runTests() {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;
  let outboundFetchCalls = 0;
  let externalServiceFetchCalls = 0;

  // Hard network guard: never allow real calls to Supabase, Razorpay, Resend, Cloudinary, or Delhivery
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    outboundFetchCalls++;
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("/rest/v1/") && (url.startsWith("http://127.0.0.1:54321") || url.startsWith("http://localhost:54321") || url.includes("prodrefexample123456.supabase.co"))) {
      return new Response(JSON.stringify({ message: "Offline test stub: DB unavailable" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (!url.startsWith("http://127.0.0.1:54321") && !url.startsWith("http://localhost:54321")) {
      externalServiceFetchCalls++;
    }
    throw new Error(`Blocked outbound network call in offline Phase 01 test suite: ${url}`);
  }) as typeof fetch;

  let passed = 0;
  async function testCase(name: string, fn: () => Promise<void> | void) {
    try {
      outboundFetchCalls = 0;
      externalServiceFetchCalls = 0;
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      throw err;
    }
  }

  try {
    console.log("=== PHASE 01: ENVIRONMENT & DEVELOPMENT SAFETY VERIFICATION ===\n");

    // -------------------------------------------------------------------------
    // 1. Environment Validation
    // -------------------------------------------------------------------------
    await testCase("Valid local development configuration passes without requiring optional services", () => {
      setValidLocalEnv();
      const result = validateServerEnv();
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(result.appEnv, "local");
      assert.doesNotThrow(() => assertValidServerEnvOnStartup());
    });

    await testCase("Valid production configuration passes strict startup validation", () => {
      setValidProductionEnv();
      const result = validateServerEnv({ requireExplicitFlagsInProd: true });
      assert.equal(result.valid, true, JSON.stringify(result.errors));
      assert.equal(result.appEnv, "production");
      assert.doesNotThrow(() => assertValidServerEnvOnStartup());
    });

    await testCase("Missing required Supabase variables fail validation", () => {
      setValidLocalEnv();
      setEnv("NEXT_PUBLIC_SUPABASE_URL", undefined);
      setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", undefined);
      const res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "MISSING_SUPABASE_URL"));
      assert.ok(res.errors.some((e) => e.code === "MISSING_SUPABASE_ANON_KEY"));
      assert.throws(() => assertValidServerEnv(), EnvironmentValidationError);
    });

    await testCase("Invalid Supabase URL formats and placeholders are rejected", () => {
      for (const badUrl of ["not-a-url", "ftp://bad.supabase.co", "https://your-project.supabase.co", "   "]) {
        setValidLocalEnv();
        setEnv("NEXT_PUBLIC_SUPABASE_URL", badUrl);
        const res = validateServerEnv();
        assert.equal(res.valid, false, `Expected failure for Supabase URL: ${badUrl}`);
      }
      assert.throws(() => createPublicClient(), EnvironmentValidationError);
      assert.throws(() => assertValidPublicSupabaseEnv(), /NEXT_PUBLIC_SUPABASE_URL/);
    });

    await testCase("Local and preview environments cannot connect to production Supabase project", () => {
      // Local pointing to remote *.supabase.co without explicit dev opt-in
      setValidLocalEnv();
      setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://someprodref12345678.supabase.co");
      let res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "UNAPPROVED_REMOTE_SUPABASE_IN_LOCAL"));
      assert.throws(() => createPublicClient(), EnvironmentValidationError);

      // Local matching SUPABASE_PRODUCTION_PROJECT_REF even with SUPABASE_ALLOW_REMOTE_DEV=true
      setEnv("SUPABASE_ALLOW_REMOTE_DEV", "true");
      setEnv("SUPABASE_DEV_PROJECT_REF", "someprodref12345678");
      setEnv("SUPABASE_PRODUCTION_PROJECT_REF", "someprodref12345678");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "PRODUCTION_SUPABASE_IN_NON_PROD"));

      // Local with dedicated separate dev ref passes
      setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://devonlyref1234567890.supabase.co");
      setEnv("SUPABASE_DEV_PROJECT_REF", "devonlyref1234567890");
      res = validateServerEnv();
      assert.equal(res.valid, true, JSON.stringify(res.errors));

      // Vercel Preview cannot use prod Supabase or APP_ENV=production or localhost
      setValidLocalEnv();
      setEnv("NODE_ENV", "production");
      setEnv("APP_ENV", "preview");
      setEnv("NEXT_PUBLIC_APP_ENV", "preview");
      setEnv("VERCEL_ENV", "preview");
      setEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "LOCAL_SUPABASE_IN_PREVIEW"));

      setEnv("NEXT_PUBLIC_SUPABASE_URL", "https://someprodref12345678.supabase.co");
      setEnv("SUPABASE_PRODUCTION_PROJECT_REF", "someprodref12345678");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "PRODUCTION_SUPABASE_IN_NON_PROD"));

      setEnv("APP_ENV", "production");
      setEnv("NEXT_PUBLIC_APP_ENV", "production");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "PREVIEW_AS_PRODUCTION"));
    });

    await testCase("Public exposure of privileged keys or secrets fails fast without revealing values", () => {
      setValidLocalEnv();
      const secretSample = "super_secret_service_role_value_999";
      setEnv("SUPABASE_SERVICE_ROLE_KEY", makeFakeJwt("service_role"));
      setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", makeFakeJwt("service_role"));
      let res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "ANON_KEY_IS_SERVICE_ROLE"));
      assert.throws(() => getPublicEnv(), /Security violation/);

      setValidLocalEnv();
      setEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "sb_secret_not_allowed_in_public_key");
      assert.throws(() => getPublicEnv(), /Security violation/);

      // Secret value leaked into NEXT_PUBLIC_* variable
      setValidLocalEnv();
      setEnv("RESEND_API_KEY", secretSample);
      setEnv("NEXT_PUBLIC_APP_URL", secretSample);
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "PUBLIC_SECRET_VALUE_LEAK"));
      assert.ok(!JSON.stringify(res.errors).includes(secretSample), "Error message must never leak secret values");

      // Prohibited NEXT_PUBLIC_* secret variable name
      setValidLocalEnv();
      setEnv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "secret_leaked_var");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "PUBLIC_SECRET_VARIABLE"));
      assert.ok(!JSON.stringify(res.errors).includes("secret_leaked_var"));
    });

    await testCase("Production rejects development/test/placeholder configurations", () => {
      // Test Razorpay key in prod
      setValidProductionEnv();
      setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_1234567890abcdef");
      let res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "TEST_RAZORPAY_KEY_IN_PROD"));

      // Live Razorpay key in local dev
      setValidLocalEnv();
      setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_live_1234567890abcdef");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "LIVE_RAZORPAY_KEY_IN_NON_PROD"));
      assert.throws(() => getPublicEnv(), /Security violation/);

      // Staging Delhivery URL in prod
      setValidProductionEnv();
      setEnv("DELHIVERY_API_URL", "https://staging-express.delhivery.com");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "STAGING_DELHIVERY_URL_IN_PROD"));

      // Prod Delhivery URL enabled in local dev
      setValidLocalEnv();
      setEnv("ENABLE_DELHIVERY", "true");
      setEnv("DELHIVERY_API_URL", "https://track.delhivery.com");
      setEnv("DELHIVERY_TOKEN", "valid_token_sample_12345");
      setEnv("DELHIVERY_WEBHOOK_SECRET", "valid_webhook_12345");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "PROD_DELHIVERY_URL_IN_NON_PROD"));

      // Dev GSTIN fallback rejected in production
      setValidProductionEnv();
      setEnv("BUSINESS_GSTIN", "07AABCM1234F1Z5");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "INVALID_BUSINESS_GSTIN"));

      // Dev OTP secret rejected in production
      setValidProductionEnv();
      setEnv("DELIVERY_OTP_HMAC_SECRET", "md_shakib_delivery_otp_secure_hmac_secret_2026");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "INVALID_OTP_HMAC_SECRET"));
      assert.throws(() => getOtpHmacSecret(), /prohibited/);

      // Dev Supabase ref rejected in production
      setValidProductionEnv();
      setEnv("SUPABASE_DEV_PROJECT_REF", "prodrefexample123456");
      res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "DEV_SUPABASE_IN_PRODUCTION"));
    });

    await testCase("Enabled services require valid credentials", () => {
      setValidLocalEnv();
      setEnv("ENABLE_RAZORPAY", "true");
      setEnv("ENABLE_EMAILS", "true");
      setEnv("ENABLE_CLOUDINARY", "true");
      setEnv("ENABLE_DELHIVERY", "true");

      const res = validateServerEnv();
      assert.equal(res.valid, false);
      assert.ok(res.errors.some((e) => e.code === "RAZORPAY_CREDENTIALS_INVALID"));
      assert.ok(res.errors.some((e) => e.code === "RAZORPAY_WEBHOOK_SECRET_MISSING"));
      assert.ok(res.errors.some((e) => e.code === "RESEND_CREDENTIALS_INVALID"));
      assert.ok(res.errors.some((e) => e.code === "CLOUDINARY_CREDENTIALS_INVALID"));
      assert.ok(res.errors.some((e) => e.code === "DELHIVERY_TOKEN_INVALID"));
      assert.ok(res.errors.some((e) => e.code === "DELHIVERY_WEBHOOK_SECRET_MISSING"));
    });

    // -------------------------------------------------------------------------
    // 2. Service Kill Switches
    // -------------------------------------------------------------------------
    await testCase("Disabled services make zero external calls and return safe disabled errors", async () => {
      setValidLocalEnv();

      // Status reports all disabled
      const status = checkIntegrationStatus();
      assert.equal(status.razorpay.mode, "disabled");
      assert.equal(status.resend.mode, "disabled");
      assert.equal(status.cloudinary.mode, "disabled");
      assert.equal(status.delhivery.mode, "disabled");

      // Disabled Razorpay
      assert.throws(() => getRazorpayClient(), RazorpayDisabledError);
      await assert.rejects(() => createRazorpayOrder("ord-1", "usr-1"), RazorpayDisabledError);
      await assert.rejects(
        () =>
          verifyAndSettlePayment({
            razorpay_order_id: "o1",
            razorpay_payment_id: "p1",
            razorpay_signature: "s1",
          }),
        RazorpayDisabledError
      );
      const refundRes = await initiateRazorpayRefund({ orderId: "ord-1" });
      assert.equal(refundRes.success, false);
      assert.equal(refundRes.mode, "disabled");
      await assert.rejects(() => processRazorpayWebhook("{}", "sig"), RazorpayDisabledError);

      // Disabled Emails
      const e1 = await sendOrderEmails({ orderId: "o1", userId: "u1", eventType: "order_confirmation" });
      const e2 = await sendAdminNewOrderNotification("o1");
      const e3 = await sendShipmentNotification("o1", "shipped");
      const e4 = await sendContactFormAcknowledgement({
        name: "Test User",
        email: "user@example.com",
        subject: "Inquiry",
        message: "Testing disabled emails",
      });
      const e5 = await sendLowStockAlertEmail([{ bookId: "b1", title: "Book", stock: 2 }]);
      for (const r of [e1, e2, e3, e4, e5]) {
        assert.equal(r.success, false);
        assert.equal(r.disabled, true);
        assert.equal(r.mode, "disabled");
      }

      // Disabled Delhivery
      await assert.rejects(() => checkPincodeServiceability("110025"), DelhiveryDisabledError);
      await assert.rejects(() => createShipmentForOrder("ord-1"), DelhiveryDisabledError);
      await assert.rejects(() => trackShipment("AWB123"), DelhiveryDisabledError);
      const pkpRes = await scheduleDelhiveryPickup("ord-1");
      assert.equal(pkpRes.success, false);
      const retRes = await scheduleReturnPickup("ret-1");
      assert.equal(retRes.success, false);
      const lblRes = await getShippingLabel("AWB123");
      assert.equal(lblRes.success, false);
      const hookAuth = verifyDelhiveryWebhookAuth("Token abc", null);
      assert.equal(hookAuth.authorized, false);

      // Disabled Cloudinary
      assert.throws(() => generateSignedUploadParams("mdshakib_books"), CloudinaryDisabledError);
      await assert.rejects(
        () => uploadImageBuffer(createValidPng(), "image/png", "mdshakib_books"),
        CloudinaryDisabledError
      );
      await assert.rejects(
        () => deleteImageByPublicId("mdshakib_books/test_1"),
        CloudinaryDisabledError
      );

      // Service-layer calls when disabled must make ZERO network or DB calls
      assert.equal(outboundFetchCalls, 0, "Disabled service-layer calls must perform zero network/DB calls");

      // API Routes return 503 when disabled
      const svcRes = await serviceabilityRouteGet(
        new Request("http://localhost:3000/api/shipping/serviceability?pincode=110025")
      );
      assert.equal(svcRes.status, 503);
      const trkRes = await trackRouteGet(
        new Request("http://localhost:3000/api/shipping/track?awb=AWB123")
      );
      assert.equal(trkRes.status, 503);
      const dlvHook = await delhiveryWebhookPost(
        new Request("http://localhost:3000/api/webhooks/delhivery", {
          method: "POST",
          headers: { Authorization: "Token abc" },
          body: "{}",
        })
      );
      assert.equal(dlvHook.status, 503);
      const rzpHook = await razorpayWebhookPost(
        new Request("http://localhost:3000/api/webhooks/razorpay", {
          method: "POST",
          headers: { "x-razorpay-signature": "sig" },
          body: "{}",
        })
      );
      assert.equal(rzpHook.status, 503);
      assert.ok(createOrderRoutePost);

      assert.equal(
        externalServiceFetchCalls,
        0,
        "Disabled API routes must perform zero external provider HTTP calls"
      );
    });

    await testCase("Health endpoint reports accurate kill-switch & credential status without secrets", async () => {
      setValidLocalEnv();
      let res = await healthRouteGet();
      let body = await res.json();
      assert.equal(body.environment.appEnv, "local");
      assert.equal(body.environment.mockServicesAllowed, false);
      assert.equal(body.environment.configuredServices.razorpay, false);
      assert.equal(body.environment.configuredServices.resend, false);
      assert.equal(body.environment.configuredServices.cloudinary, false);
      assert.equal(body.environment.configuredServices.delhivery, false);
      assert.equal(body.environment.serviceModes.razorpay, "disabled");

      // Enabling with valid test creds reflects sandbox mode
      setEnv("ENABLE_RAZORPAY", "true");
      setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_1234567890abcdef");
      setEnv("RAZORPAY_KEY_SECRET", "test_secret_1234567890");
      setEnv("RAZORPAY_WEBHOOK_SECRET", "test_webhook_secret_123");
      res = await healthRouteGet();
      body = await res.json();
      assert.equal(body.environment.configuredServices.razorpay, true);
      assert.equal(body.environment.serviceModes.razorpay, "sandbox");
    });

    // -------------------------------------------------------------------------
    // 3. Mock Isolation
    // -------------------------------------------------------------------------
    await testCase("Mock services run ONLY when explicitly enabled in development/test and kill switches allow", async () => {
      setValidLocalEnv();
      // Leave ENABLE_* unset so ALLOW_MOCK_SERVICES=true activates mock mode
      setEnv("ENABLE_RAZORPAY", undefined);
      setEnv("ENABLE_EMAILS", undefined);
      setEnv("ENABLE_CLOUDINARY", undefined);
      setEnv("ENABLE_DELHIVERY", undefined);
      setEnv("ALLOW_MOCK_SERVICES", "true");

      const status = checkIntegrationStatus();
      assert.equal(status.allowMockServices, true);
      assert.equal(status.razorpay.mode, "mock");
      assert.equal(status.resend.mode, "mock");
      assert.equal(status.cloudinary.mode, "mock");
      assert.equal(status.delhivery.mode, "mock");
      assert.equal(isMockCatalogAllowed(), true);
      assert.equal(isMockOtpExposureAllowed(), true);

      // Explicit ENABLE_EMAILS=false keeps email disabled even when ALLOW_MOCK_SERVICES=true
      setEnv("ENABLE_EMAILS", "false");
      const disabledEmail = await sendLowStockAlertEmail([{ bookId: "b1", title: "Test", stock: 1 }]);
      assert.equal(disabledEmail.success, false);
      assert.equal(disabledEmail.disabled, true);

      // Delhivery & Cloudinary mocks work without external network calls
      const pinRes = await checkPincodeServiceability("110025");
      assert.equal(pinRes.serviceable, true);
      assert.equal(pinRes.isMock, true);
      assert.equal(pinRes.mode, "mock");

      const signed = generateSignedUploadParams("mdshakib_books");
      assert.equal(signed.isMock, true);
      assert.equal(signed.mode, "mock");

      const uploaded = await uploadImageBuffer(createValidPng(), "image/png", "mdshakib_books");
      assert.equal(uploaded.isMock, true);
      assert.equal(uploaded.mode, "mock");

      const deleted = await deleteImageByPublicId("mdshakib_books/mock_1");
      assert.equal(deleted, true);

      assert.equal(outboundFetchCalls, 0, "Mock Delhivery/Cloudinary calls must perform zero fetch calls");

      // Catalog mock fallback works ONLY in explicit dev/test mock mode (falls back after local Supabase query fails)
      const catalogRes = await getBooks({});
      assert.ok(catalogRes.books.length > 0);
      const bookRes = await getBookById("a0000000-0000-0000-0000-000000000001");
      assert.ok(bookRes);
      const featured = await getFeaturedBooks(2);
      assert.equal(featured.length, 2);
      const guestCart = await getGuestCartDetails([
        { bookId: "a0000000-0000-0000-0000-000000000001", quantity: 1 },
      ]);
      assert.equal(guestCart.items.length, 1);

      assert.equal(externalServiceFetchCalls, 0);
    });

    await testCase("Production, preview, and staging strictly reject ALLOW_MOCK_SERVICES=true and fake successes", async () => {
      for (const envCase of [
        { label: "production", nodeEnv: "production", appEnv: "production", vercelEnv: "production" },
        { label: "preview", nodeEnv: "production", appEnv: "preview", vercelEnv: "preview" },
        { label: "staging", nodeEnv: "production", appEnv: "staging", vercelEnv: undefined },
      ]) {
        setValidProductionEnv();
        if (envCase.label !== "production") {
          setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_1234567890abcdef");
          setEnv("DELHIVERY_API_URL", "https://staging-express.delhivery.com");
        }
        setEnv("NODE_ENV", envCase.nodeEnv);
        setEnv("APP_ENV", envCase.appEnv);
        setEnv("NEXT_PUBLIC_APP_ENV", envCase.appEnv);
        setEnv("VERCEL_ENV", envCase.vercelEnv);
        setEnv("ALLOW_MOCK_SERVICES", "true");

        const res = validateServerEnv();
        assert.equal(res.valid, false, `Expected ${envCase.label} to reject ALLOW_MOCK_SERVICES=true`);
        assert.ok(res.errors.some((e) => e.code === "MOCK_SERVICES_FORBIDDEN"));
        assert.throws(() => assertValidServerEnvOnStartup(), EnvironmentValidationError);
        assert.equal(isMockCatalogAllowed(), false);
        assert.equal(isMockOtpExposureAllowed(), false);
      }

      // Production with ALLOW_MOCK_SERVICES=true + mock tokens fails closed across all services
      setValidProductionEnv();
      setEnv("ALLOW_MOCK_SERVICES", "true");
      setEnv("ENABLE_RAZORPAY", undefined);
      setEnv("ENABLE_EMAILS", undefined);
      setEnv("ENABLE_CLOUDINARY", undefined);
      setEnv("ENABLE_DELHIVERY", undefined);

      await assert.rejects(() => createRazorpayOrder("ord-1", "usr-1"), RazorpayConfigurationError);
      const emailErr = await sendLowStockAlertEmail([{ bookId: "b1", title: "Book", stock: 1 }]);
      assert.equal(emailErr.success, false);
      await assert.rejects(() => checkPincodeServiceability("110025"), DelhiveryConfigurationError);
      assert.throws(() => generateSignedUploadParams("mdshakib_books"));

      // Production with ALLOW_MOCK_SERVICES=false and rzp_test_mock* key NEVER falls back to mock order or refund
      setValidProductionEnv();
      setEnv("NEXT_PUBLIC_RAZORPAY_KEY_ID", "rzp_test_mock_123456");
      await assert.rejects(() => createRazorpayOrder("ord-1", "usr-1"), RazorpayConfigurationError);
      const refundFail = await initiateRazorpayRefund({ orderId: "ord-1" });
      assert.equal(refundFail.success, false);

      // Production catalog/cart NEVER fall back to MOCK_BOOKS when DB is unreachable
      setValidProductionEnv();
      assert.equal(isMockCatalogAllowed(), false);
      await assert.rejects(() => getBooks({}));
      await assert.rejects(() => getFeaturedBooks(4));
      await assert.rejects(() =>
        getGuestCartDetails([{ bookId: "a0000000-0000-0000-0000-000000000001", quantity: 1 }])
      );
    });

    await testCase("Production scheduleReturnPickup never fabricates synthetic REV-* AWBs", async () => {
      setValidProductionEnv();
      // Mock-free live mode still fails cleanly instead of fabricating REV-${Date.now()}
      const res = await scheduleReturnPickup("00000000-0000-0000-0000-000000000001");
      assert.equal(res.success, false);
      assert.equal(res.pickupAwb, undefined);
      assert.equal(outboundFetchCalls, 0);
    });

    await testCase("Enabled API failures never silently fall back to mock success", async () => {
      setValidProductionEnv();
      // 1. Delhivery enabled + fetch throws -> rethrows real error (no fake serviceable=true)
      await assert.rejects(
        () => checkPincodeServiceability("110025"),
        /Blocked outbound network call/
      );
      assert.equal(externalServiceFetchCalls, 1);

      // 2. Resend enabled + API blocked -> returns { success: false } after bounded retries, never { success: true, mode: "mock" }
      externalServiceFetchCalls = 0;
      const emailRes = await sendLowStockAlertEmail(
        [{ bookId: "b1", title: "Book", stock: 1 }],
        { retryBaseDelayMs: 0 }
      );
      assert.equal(emailRes.success, false);
      assert.notEqual(emailRes.mode, "mock");
      assert.ok(externalServiceFetchCalls >= 1 && externalServiceFetchCalls <= 3);
    });

    // -------------------------------------------------------------------------
    // 4. Client Isolation & Repo Template Checks
    // -------------------------------------------------------------------------
    await testCase("Server-only helpers reject browser runtime context", () => {
      setValidLocalEnv();
      const origWindow = (globalThis as any).window;
      try {
        (globalThis as any).window = {};
        assert.throws(() => validateServerEnv(), /server-only/i);
        assert.throws(() => createAdminClient(), /browser context/i);
        assert.throws(() => getRazorpayClient(), /browser context/i);
      } finally {
        if (origWindow === undefined) {
          Reflect.deleteProperty(globalThis, "window");
        } else {
          (globalThis as any).window = origWindow;
        }
      }
    });

    await testCase("Zero client components import server-only env/admin/integration modules or read server secrets", () => {
      const webRoot = path.resolve(__dirname, "..");
      const files = [
        ...collectTsFiles(path.join(webRoot, "app")),
        ...collectTsFiles(path.join(webRoot, "components")),
        ...collectTsFiles(path.join(webRoot, "lib")),
      ];

      const forbiddenServerSecrets = [
        "SUPABASE_SERVICE_ROLE_KEY",
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
        "RESEND_API_KEY",
        "CLOUDINARY_API_KEY",
        "CLOUDINARY_API_SECRET",
        "DELHIVERY_TOKEN",
        "DELHIVERY_WEBHOOK_SECRET",
        "DELIVERY_OTP_HMAC_SECRET",
      ];

      for (const filePath of files) {
        const content = fs.readFileSync(filePath, "utf8");
        const trimmed = content.trimStart();
        const isClientComponent =
          trimmed.startsWith('"use client"') || trimmed.startsWith("'use client'");

        if (!isClientComponent) continue;

        for (const secretKey of forbiddenServerSecrets) {
          assert.ok(
            !content.includes(secretKey),
            `Client component ${filePath} must not reference server secret ${secretKey}`
          );
          assert.ok(
            !content.includes(`NEXT_PUBLIC_${secretKey}`),
            `Client component ${filePath} must not reference NEXT_PUBLIC_${secretKey}`
          );
        }

        const nonTypeLines = content
          .split(/\r?\n/)
          .filter((line) => !/^\s*import\s+type\b/.test(line))
          .join("\n");

        assert.ok(
          !nonTypeLines.includes("@/lib/env/server") &&
            !nonTypeLines.includes("@/lib/supabase/admin") &&
            !nonTypeLines.includes("@/lib/supabase/server") &&
            !nonTypeLines.includes("@/lib/supabase/config") &&
            !nonTypeLines.includes("@/lib/integrations/"),
          `Client component ${filePath} must not import server-only modules`
        );
      }
    });

    await testCase(".env.example templates contain no real secrets or NEXT_PUBLIC_ secret leaks", () => {
      const repoRoot = path.resolve(__dirname, "../../..");
      for (const rel of [".env.example", "apps/web/.env.example"]) {
        const full = path.join(repoRoot, rel);
        const content = fs.readFileSync(full, "utf8");
        const nonCommentLines = content
          .split(/\r?\n/)
          .filter((l) => l.trim() && !l.trim().startsWith("#"))
          .join("\n");
        assert.ok(!nonCommentLines.includes("rzp_live_"), `${rel} must never assign live Razorpay keys`);
        assert.ok(!nonCommentLines.includes("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY"), `${rel} leaked service role`);
        assert.ok(!nonCommentLines.includes("NEXT_PUBLIC_RAZORPAY_KEY_SECRET"), `${rel} leaked razorpay secret`);
        assert.ok(!nonCommentLines.includes("NEXT_PUBLIC_RESEND_API_KEY"), `${rel} leaked resend key`);
        assert.ok(!nonCommentLines.includes("NEXT_PUBLIC_DELHIVERY_TOKEN"), `${rel} leaked delhivery token`);
        assert.ok(nonCommentLines.includes("ENABLE_RAZORPAY"), `${rel} should document ENABLE_RAZORPAY`);
        assert.ok(nonCommentLines.includes("ALLOW_MOCK_SERVICES"), `${rel} should document ALLOW_MOCK_SERVICES`);
      }
    });

    console.log(`\nSUMMARY: ${passed} passed, 0 failed.`);
  } finally {
    globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        Reflect.deleteProperty(process.env, key);
      }
    }
    for (const [key, val] of Object.entries(originalEnv)) {
      if (val === undefined) {
        Reflect.deleteProperty(process.env, key);
      } else {
        Reflect.set(process.env, key, val);
      }
    }
  }
}

runTests().catch((err) => {
  console.error("\nPHASE 01 TEST SUITE FAILED:", err);
  process.exit(1);
});
