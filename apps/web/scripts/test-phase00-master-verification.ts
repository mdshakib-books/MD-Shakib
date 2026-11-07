/**
 * ==============================================================================
 * PHASE 0 — MASTER SECURITY & FOUNDATION VERIFICATION RUNNER
 * MD Shakib Islamic Books
 * ==============================================================================
 * Sequentially executes all Phase 0 security suites, remediations, and regressions:
 * 1. Feature 0.1: Server-Authoritative Pricing Suite
 * 2. Feature 0.2: Order Creation Security Suite
 * 3. Feature 0.3: Profile Role Security Suite
 * 4. Feature 0.4: Inventory Reservation Lifecycle Suite
 * 5. Feature 0.5: Payment & Order State Integrity Suite
 * 6. Remediation 1: Server-Authoritative Pricing & Fee Waiver Removal Suite
 * 7. Remediation 2: Reservation Expiry & Concurrent Settlement Suite
 * 8. Remediation 3: Secured Cleanup RPC Suite
 * 9. Remediation 4: Coupon Accounting & Concurrency Suite
 * 10. Remediation 5: Webhook Boundaries & Signature Suite
 * 11. Final Remediation 1: Idempotent Payment Failure & Coupon Release Suite
 * 12. Final Remediation 2: Restrict Late-Payment Recovery Suite
 * 13. Final Remediation 3: Inventory Reservation Coverage & Deadlock Locking Suite
 * 14. Final Remediation 4: Idempotency Fingerprint Enforcement Suite
 * 15. Final Remediation 5: Order-Specific Coupon Lifecycle Suite
 * 16. Final Remediation 6: Webhook Provider Payload Verification Suite
 * 17. Final Remediation 7: Paid-Order Cancellation & Refunds Lifecycle Suite
 * 18. Phase 04 Regression: Backend & Database Integrity Suite (28 tests)
 * 19. Phase 09 Regression: Integration & Database Suite (25 tests)
 * ==============================================================================
 */

import { execSync } from "child_process";
import path from "path";

const scripts = [
  { name: "FEATURE 0.1: SERVER-AUTHORITATIVE PRICING", file: "scripts/test-phase00-01-pricing.ts" },
  { name: "FEATURE 0.2: ORDER CREATION SECURITY", file: "scripts/test-phase00-02-order-creation.ts" },
  { name: "FEATURE 0.3: PROFILE ROLE SECURITY", file: "scripts/test-phase00-03-role-security.ts" },
  { name: "FEATURE 0.4: INVENTORY RESERVATION LIFECYCLE", file: "scripts/test-phase00-04-inventory-lifecycle.ts" },
  { name: "FEATURE 0.5: PAYMENT & ORDER STATE INTEGRITY", file: "scripts/test-phase00-05-state-integrity.ts" },
  { name: "REMEDIATION 1: SERVER-AUTHORITATIVE PRICING & FEES", file: "scripts/test-remediation-01-pricing-fees.ts" },
  { name: "REMEDIATION 2: RESERVATION EXPIRY & RECOVERY", file: "scripts/test-remediation-02-reservation-expiry.ts" },
  { name: "REMEDIATION 3: CLEANUP RPC PERMISSIONS", file: "scripts/test-remediation-03-cleanup-security.ts" },
  { name: "REMEDIATION 4: COUPON ACCOUNTING & CONCURRENCY", file: "scripts/test-remediation-04-coupon-accounting.ts" },
  { name: "REMEDIATION 5: WEBHOOK TRUST BOUNDARIES", file: "scripts/test-remediation-05-webhook-boundaries.ts" },
  { name: "FINAL REMEDIATION 1: FAILURE IDEMPOTENCY & COUPON RELEASE", file: "scripts/test-remediation-final-01-failure-idempotency.ts" },
  { name: "FINAL REMEDIATION 2: RESTRICT LATE-PAYMENT RECOVERY", file: "scripts/test-remediation-final-02-late-recovery-restrictions.ts" },
  { name: "FINAL REMEDIATION 3: EXACT RESERVATION COVERAGE & LOCKING", file: "scripts/test-remediation-final-03-reservation-coverage.ts" },
  { name: "FINAL REMEDIATION 4: IDEMPOTENCY FINGERPRINT ENFORCEMENT", file: "scripts/test-remediation-final-04-idempotency-fingerprint.ts" },
  { name: "FINAL REMEDIATION 5: ORDER-SPECIFIC COUPON LIFECYCLE", file: "scripts/test-remediation-final-05-coupon-lifecycle.ts" },
  { name: "FINAL REMEDIATION 6: PROVIDER PAYLOAD & WEBHOOK BOUNDARIES", file: "scripts/test-remediation-final-06-webhook-provider-payloads.ts" },
  { name: "FINAL REMEDIATION 7: PAID CANCELLATION & REFUNDS LIFECYCLE", file: "scripts/test-remediation-final-07-paid-cancellation-refunds.ts" },
  { name: "PHASE 04 REGRESSION: BACKEND INTEGRITY", file: "scripts/test-phase04-backend-integrity.ts" },
  { name: "PHASE 09 REGRESSION: INTEGRATION & DATABASE", file: "scripts/test-phase09-integration-and-database.ts" },
];

const webDir = path.resolve(__dirname, "..");

const env = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET || "rzp_test_webhook_secret_12345",
};

let allPassed = true;
const results: { name: string; passed: boolean; durationMs: number }[] = [];

console.log("================================================================================");
console.log(" PHASE 0: MASTER SECURITY & FOUNDATION VERIFICATION SUITE");
console.log(" MD Shakib Islamic Books — Production-Grade Audit Execution");
console.log("================================================================================");

const startTime = Date.now();

for (const suite of scripts) {
  console.log(`\n>>> STARTING: ${suite.name}`);
  const suiteStart = Date.now();
  try {
    execSync(`npx tsx --tsconfig tsconfig.json ${suite.file}`, {
      stdio: "inherit",
      cwd: webDir,
      env,
    });
    const duration = Date.now() - suiteStart;
    results.push({ name: suite.name, passed: true, durationMs: duration });
    console.log(`>>> FINISHED: ${suite.name} (PASSED in ${duration}ms)`);
  } catch (err) {
    const duration = Date.now() - suiteStart;
    results.push({ name: suite.name, passed: false, durationMs: duration });
    console.error(`>>> FAILED: ${suite.name} (FAILED after ${duration}ms)`);
    allPassed = false;
  }
}

const totalDuration = Date.now() - startTime;

console.log("\n================================================================================");
console.log(" PHASE 0 MASTER VERIFICATION SUMMARY");
console.log("================================================================================");
for (const r of results) {
  const status = r.passed ? "✓ PASS" : "✗ FAIL";
  console.log(`  ${status} | ${r.name.padEnd(55)} | ${r.durationMs}ms`);
}
console.log("--------------------------------------------------------------------------------");
console.log(`TOTAL SUITES: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
console.log(`TOTAL TIME: ${totalDuration}ms`);
console.log("================================================================================\n");

if (!allPassed) {
  process.exit(1);
}
