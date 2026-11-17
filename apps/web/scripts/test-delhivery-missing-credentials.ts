/**
 * Verification Suite: Delhivery Integration Missing-Credentials & Production Safety
 *
 * Proves that when DELHIVERY_TOKEN is missing, blank, mocked, or uses a placeholder value:
 * 1. In production (NODE_ENV=production), no operation silently falls back to mock behavior.
 * 2. Shipment creation never fabricates an AWB and returns a clear configuration error.
 * 3. Pincode serviceability never returns fake success (neither when unconfigured nor on API error).
 * 4. Pickup requests (forward & return) never return fake confirmations or PKP/REV IDs.
 * 5. Live tracking never synthesizes fake provider scan events.
 * 6. Shipping labels never return fake HTML/PDF URLs in production.
 * 7. Webhook auth rejects missing/placeholder/mock secrets (fail closed).
 * 8. API routes (/api/shipping/serviceability, /api/shipping/track, /api/health) behave safely.
 * 9. Development/test mocks are strictly isolated to explicit non-production environments (development/test).
 * 10. Zero Delhivery server credentials are exposed to "use client" modules or NEXT_PUBLIC_ keys.
 *
 * Does NOT make live Delhivery API calls or mutate any database.
 */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  checkIntegrationStatus,
  getIntegrationsConfig,
  isValidDelhiveryToken,
} from "../lib/integrations/config";
import { getDelhiveryConfig } from "../lib/integrations/delhivery/client";
import {
  checkPincodeServiceability,
  createShipmentForOrder,
  DelhiveryConfigurationError,
  getShippingLabel,
  scheduleDelhiveryPickup,
  trackShipment,
  verifyDelhiveryWebhookAuth,
} from "../lib/integrations/delhivery/service";
import { scheduleReturnPickup } from "../lib/commerce/returns";
import { GET as serviceabilityRouteGet } from "../app/api/shipping/serviceability/route";
import { GET as trackRouteGet } from "../app/api/shipping/track/route";
import { GET as healthRouteGet } from "../app/api/health/route";
import { POST as webhookRoutePost } from "../app/api/webhooks/delhivery/route";

function setEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    Reflect.deleteProperty(process.env, key);
  } else {
    Reflect.set(process.env, key, value);
  }
}

function collectTsFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectTsFiles(full));
    } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

async function runTests() {
  const originalEnv = { ...process.env };
  const originalFetch = globalThis.fetch;

  let delhiveryNetworkCalls = 0;
  let simulateLiveApiFailure = false;

  // Guard global fetch: never allow real calls to Delhivery APIs during tests
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url.includes("delhivery.com")) {
      delhiveryNetworkCalls++;
      if (simulateLiveApiFailure) {
        return new Response(JSON.stringify({ error: "Upstream outage" }), {
          status: 503,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Blocked live Delhivery API call in test harness: ${url}`);
    }
    throw new Error(`Blocked external/DB network call in offline unit test: ${url}`);
  }) as typeof fetch;

  let passed = 0;
  async function testCase(name: string, fn: () => Promise<void> | void) {
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  [FAIL] ${name}`);
      throw err;
    }
  }

  try {
    console.log("=== DELHIVERY MISSING-CREDENTIALS & PRODUCTION SAFETY VERIFICATION ===\n");

    const invalidTokenVariants: Array<[string, string | undefined]> = [
      ["missing (undefined)", undefined],
      ["empty string", ""],
      ["whitespace only", "   "],
      ["mock prefix", "mock_delhivery_token"],
      ["uppercase MOCK prefix", "MOCK_TOKEN_123"],
      ["env template placeholder", "your_delhivery_api_token"],
    ];

    await testCase("Token validator rejects empty, mock, and template placeholders", () => {
      for (const [label, candidate] of invalidTokenVariants) {
        setEnv("DELHIVERY_TOKEN", candidate);
        setEnv("NODE_ENV", "production");
        assert.equal(
          isValidDelhiveryToken(candidate || ""),
          false,
          `Expected isValidDelhiveryToken to reject ${label}`
        );
        const cfg = getDelhiveryConfig();
        assert.equal(cfg.isConfigured, false, `Expected isConfigured=false for ${label}`);
        assert.equal(cfg.allowMock, false, `Expected allowMock=false in production for ${label}`);
        assert.equal(checkIntegrationStatus().delhivery.configured, false);
        assert.equal(getIntegrationsConfig().delhivery.isConfigured, false);
      }
    });

    for (const [label, candidate] of invalidTokenVariants) {
      await testCase(
        `Production (${label}) never fabricates AWB, serviceability, tracking, pickup, or labels`,
        async () => {
          setEnv("NODE_ENV", "production");
          setEnv("DELHIVERY_TOKEN", candidate);
          delhiveryNetworkCalls = 0;

          // 1. Pincode serviceability must fail closed (never return serviceable: true)
          await assert.rejects(
            () => checkPincodeServiceability("110025"),
            (err: unknown) =>
              err instanceof DelhiveryConfigurationError &&
              /DELHIVERY_TOKEN is not configured/i.test(err.message)
          );
          await assert.rejects(
            () => checkPincodeServiceability("110001"),
            (err: unknown) => err instanceof DelhiveryConfigurationError
          );

          // 2. Shipment creation must fail with configuration error and never fabricate DLV... AWB
          await assert.rejects(
            () => createShipmentForOrder("00000000-0000-0000-0000-000000000001"),
            (err: unknown) =>
              err instanceof DelhiveryConfigurationError &&
              /DELHIVERY_TOKEN is not configured/i.test(err.message)
          );

          // 3. Tracking must fail closed and never return synthetic MANIFESTED/IT/UD/DL events
          await assert.rejects(
            () => trackShipment("DLV123456789"),
            (err: unknown) =>
              err instanceof DelhiveryConfigurationError &&
              /DELHIVERY_TOKEN is not configured/i.test(err.message)
          );

          // 4. Forward pickup request must fail without PKP confirmation
          const pickup = await scheduleDelhiveryPickup("00000000-0000-0000-0000-000000000001");
          assert.equal(pickup.success, false);
          assert.equal(pickup.pickupRequestId, undefined);
          assert.match(pickup.error || "", /not configured/i);

          // 5. Return pickup request must fail without REV AWB confirmation
          const retPickup = await scheduleReturnPickup("00000000-0000-0000-0000-000000000002");
          assert.equal(retPickup.success, false);
          assert.equal(retPickup.pickupAwb, undefined);
          assert.match(retPickup.error || "", /not configured/i);

          // 6. Shipping label must fail without fake labelUrl or HTML
          const label = await getShippingLabel("DLV123456789");
          assert.equal(label.success, false);
          assert.equal(label.labelUrl, undefined);
          assert.equal(label.htmlContent, undefined);
          assert.match(label.error || "", /not configured/i);

          assert.equal(delhiveryNetworkCalls, 0, "Expected zero outbound Delhivery HTTP calls");
        }
      );
    }

    await testCase("Production live API failure in serviceability does not fall back to fake serviceable=true", async () => {
      const prevAppEnv = process.env.APP_ENV;
      const prevEnabled = process.env.ENABLE_DELHIVERY;
      const prevApiUrl = process.env.DELHIVERY_API_URL;
      const prevWebhook = process.env.DELHIVERY_WEBHOOK_SECRET;
      setEnv("NODE_ENV", "production");
      setEnv("APP_ENV", "production");
      setEnv("ENABLE_DELHIVERY", "true");
      setEnv("DELHIVERY_API_URL", "https://track.delhivery.com");
      setEnv("DELHIVERY_TOKEN", "prod_live_token_sample_for_offline_test");
      setEnv("DELHIVERY_WEBHOOK_SECRET", "prod_webhook_secret_sample");
      simulateLiveApiFailure = true;
      delhiveryNetworkCalls = 0;

      try {
        await assert.rejects(
          () => checkPincodeServiceability("110025"),
          /Delhivery serviceability check failed: HTTP 503/
        );
        assert.equal(delhiveryNetworkCalls, 1);
      } finally {
        simulateLiveApiFailure = false;
        setEnv("APP_ENV", prevAppEnv);
        setEnv("ENABLE_DELHIVERY", prevEnabled);
        setEnv("DELHIVERY_API_URL", prevApiUrl);
        setEnv("DELHIVERY_WEBHOOK_SECRET", prevWebhook);
      }
    });

    await testCase("API routes return explicit unconfigured 503 responses in production", async () => {
      setEnv("NODE_ENV", "production");
      setEnv("DELHIVERY_TOKEN", undefined);
      delhiveryNetworkCalls = 0;

      const svcReq = new Request("http://localhost:3000/api/shipping/serviceability?pincode=110025");
      const svcRes = await serviceabilityRouteGet(svcReq);
      assert.equal(svcRes.status, 503);
      const svcBody = await svcRes.json();
      assert.equal(svcBody.success, false);
      assert.equal(svcBody.configured, false);
      assert.equal(svcBody.serviceable, false);
      assert.equal(svcBody.prepaid, false);
      assert.equal(svcBody.cod, false);
      assert.match(svcBody.error || "", /not configured/i);

      const trackReq = new Request("http://localhost:3000/api/shipping/track?awb=TESTAWB001");
      const trackRes = await trackRouteGet(trackReq);
      assert.equal(trackRes.status, 503);
      const trackBody = await trackRes.json();
      assert.equal(trackBody.configured, false);
      assert.equal(trackBody.scans, undefined);
      assert.match(trackBody.error || "", /not configured/i);

      // Health route must report delhivery: false for mock tokens too
      setEnv("DELHIVERY_TOKEN", "mock_delhivery_token");
      const healthRes = await healthRouteGet();
      const healthBody = await healthRes.json();
      assert.equal(healthBody.environment.configuredServices.delhivery, false);
      assert.equal(delhiveryNetworkCalls, 0);
    });

    await testCase("Webhook authentication rejects missing, mock, and template secrets in production", async () => {
      setEnv("NODE_ENV", "production");
      for (const secret of [undefined, "", "   ", "your_delhivery_webhook_secret", "mock_secret"]) {
        setEnv("DELHIVERY_WEBHOOK_SECRET", secret);
        const res = verifyDelhiveryWebhookAuth(`Token ${secret || "anything"}`, secret || null);
        assert.equal(res.authorized, false);
        assert.match(res.reason || "", /fail closed/i);

        const req = new Request("http://localhost:3000/api/webhooks/delhivery", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Token ${secret || "anything"}`,
          },
          body: JSON.stringify({ waybill: "DLVTEST123", status: "Delivered" }),
        });
        const routeRes = await webhookRoutePost(req);
        assert.equal(routeRes.status, 500);
        const body = await routeRes.json();
        assert.match(body.error || "", /not configured.*fail closed/i);
      }
    });

    await testCase("Development mocks remain strictly isolated to explicit non-production environments", async () => {
      setEnv("DELHIVERY_TOKEN", undefined);
      setEnv("ENABLE_DELHIVERY", undefined);
      setEnv("APP_ENV", undefined);
      delhiveryNetworkCalls = 0;

      // Safe default in development without ALLOW_MOCK_SERVICES=true stays disabled
      setEnv("NODE_ENV", "development");
      setEnv("ALLOW_MOCK_SERVICES", undefined);
      assert.equal(getDelhiveryConfig().allowMock, false);
      await assert.rejects(() => checkPincodeServiceability("110025"), DelhiveryConfigurationError);

      // Explicit development + ALLOW_MOCK_SERVICES=true allows mocks without outbound HTTP
      setEnv("ALLOW_MOCK_SERVICES", "true");
      const devPin = await checkPincodeServiceability("110025");
      assert.equal(devPin.serviceable, true);
      assert.equal(devPin.cod, true);
      const devPrepaidOnly = await checkPincodeServiceability("110001");
      assert.equal(devPrepaidOnly.prepaid, true);
      assert.equal(devPrepaidOnly.cod, false);
      const devUnserviceable = await checkPincodeServiceability("999000");
      assert.equal(devUnserviceable.serviceable, false);
      const devLabel = await getShippingLabel("DLVDEV12345");
      assert.equal(devLabel.success, true);

      // Explicit test environment + ALLOW_MOCK_SERVICES=true allows mocks without outbound HTTP
      setEnv("NODE_ENV", "test");
      const testPin = await checkPincodeServiceability("110025");
      assert.equal(testPin.serviceable, true);

      // Unset or ambiguous NODE_ENV (e.g. undefined or "staging") does NOT activate mocks even if ALLOW_MOCK_SERVICES=true
      setEnv("NODE_ENV", undefined);
      assert.equal(getDelhiveryConfig().allowMock, false);
      await assert.rejects(() => checkPincodeServiceability("110025"), DelhiveryConfigurationError);

      setEnv("NODE_ENV", "staging");
      assert.equal(getDelhiveryConfig().allowMock, false);
      await assert.rejects(() => createShipmentForOrder("00000000-0000-0000-0000-000000000001"), DelhiveryConfigurationError);

      assert.equal(delhiveryNetworkCalls, 0);
    });

    await testCase("Zero Delhivery server secrets are referenced in client components or NEXT_PUBLIC_ variables", () => {
      const webRoot = path.resolve(__dirname, "..");
      const files = [
        ...collectTsFiles(path.join(webRoot, "app")),
        ...collectTsFiles(path.join(webRoot, "components")),
      ];

      for (const filePath of files) {
        const content = fs.readFileSync(filePath, "utf8");
        assert.ok(
          !content.includes("NEXT_PUBLIC_DELHIVERY"),
          `Found prohibited NEXT_PUBLIC_DELHIVERY reference in ${filePath}`
        );

        const isClientComponent =
          content.startsWith('"use client"') || content.startsWith("'use client'");
        if (isClientComponent) {
          assert.ok(
            !content.includes("DELHIVERY_TOKEN") && !content.includes("DELHIVERY_WEBHOOK_SECRET"),
            `Found Delhivery secret reference in client component ${filePath}`
          );
          assert.ok(
            !content.includes("getDelhiveryConfig") && !content.includes("getIntegrationsConfig"),
            `Found server integration config import in client component ${filePath}`
          );
        }
      }
    });

    console.log(`\nSUMMARY: ${passed} passed, 0 failed.`);
  } finally {
    globalThis.fetch = originalFetch;
    // Restore original process env
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
  console.error("\nTEST SUITE FAILED:", err);
  process.exit(1);
});
