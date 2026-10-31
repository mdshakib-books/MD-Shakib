/**
 * Phase 03A-R3: Environment Configuration & Canonical URL Test Suite
 *
 * Exhaustively tests:
 * 1. getCanonicalSiteUrl precedence: NEXT_PUBLIC_SITE_URL > NEXT_PUBLIC_APP_URL
 * 2. Trailing slash stripping
 * 3. Malformed URL rejection
 * 4. Production fail-closed behavior when neither is configured
 * 5. Development localhost fallback
 * 6. Secret leak audit: No server-only secrets exposed with NEXT_PUBLIC_ prefix
 */

import assert from "node:assert";
import { getCanonicalSiteUrl } from "../lib/auth/session";

async function runTestSuite() {
  console.log("================================================================================");
  console.log("PHASE 03A-R3: ENVIRONMENT & CANONICAL URL CONFIGURATION TEST SUITE");
  console.log("================================================================================\n");

  const origEnv = { ...process.env };
  let passCount = 0;

  function runCheck(label: string, fn: () => void) {
    try {
      fn();
      console.log(`  ✓ [PASS] ${label}`);
      passCount++;
    } catch (err: any) {
      console.error(`  ✗ [FAIL] ${label}: ${err.message}`);
      throw err;
    }
  }

  try {
    console.log("--- 1. Canonical Site URL Resolution Tests ---");

    runCheck("Prefers NEXT_PUBLIC_SITE_URL over NEXT_PUBLIC_APP_URL", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://mdshakibbooks.com";
      process.env.NEXT_PUBLIC_APP_URL = "https://secondary.mdshakibbooks.com";
      assert.strictEqual(getCanonicalSiteUrl(), "https://mdshakibbooks.com");
    });

    runCheck("Falls back to NEXT_PUBLIC_APP_URL when NEXT_PUBLIC_SITE_URL is absent", () => {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      process.env.NEXT_PUBLIC_APP_URL = "https://app.mdshakibbooks.com";
      assert.strictEqual(getCanonicalSiteUrl(), "https://app.mdshakibbooks.com");
    });

    runCheck("Strips trailing slashes from configured URL", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "https://mdshakibbooks.com///";
      assert.strictEqual(getCanonicalSiteUrl(), "https://mdshakibbooks.com");
    });

    runCheck("Rejects malformed URL without valid http/https protocol", () => {
      process.env.NEXT_PUBLIC_SITE_URL = "not-a-valid-url";
      assert.throws(() => getCanonicalSiteUrl(), /Invalid site URL configuration/);
    });

    runCheck("Fails closed in production if neither variable is configured", () => {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as any).NODE_ENV = "production";
      assert.throws(() => getCanonicalSiteUrl(), /Production configuration error/);
    });

    runCheck("Falls back to localhost:3000 in development if neither is configured", () => {
      delete process.env.NEXT_PUBLIC_SITE_URL;
      delete process.env.NEXT_PUBLIC_APP_URL;
      (process.env as any).NODE_ENV = "development";
      assert.strictEqual(getCanonicalSiteUrl(), "http://localhost:3000");
    });

    console.log("\n--- 2. Secret Leak & Prefix Audit ---");

    runCheck("Zero server-only secrets use NEXT_PUBLIC_ prefix in environment templates", () => {
      const fs = require("node:fs");
      const path = require("node:path");
      const envExample = fs.readFileSync(path.resolve(__dirname, "../.env.example"), "utf8");

      const serverSecretKeywords = [
        "SERVICE_ROLE_KEY",
        "RAZORPAY_KEY_SECRET",
        "RAZORPAY_WEBHOOK_SECRET",
        "CLOUDINARY_API_SECRET",
        "DELHIVERY_TOKEN",
        "DELHIVERY_WEBHOOK_SECRET",
        "RESEND_API_KEY",
      ];

      for (const keyword of serverSecretKeywords) {
        assert.ok(
          !envExample.includes(`NEXT_PUBLIC_${keyword}`),
          `Security violation: ${keyword} must NOT have NEXT_PUBLIC_ prefix!`
        );
      }
    });

    console.log("\n================================================================================");
    console.log(`R3 ENVIRONMENT SUITE RESULTS: ${passCount}/${passCount} TESTS PASSED (100%)`);
    console.log("================================================================================\n");
  } finally {
    process.env = origEnv;
  }
}

runTestSuite().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});

