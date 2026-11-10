/**
 * ==============================================================================
 * PHASE 3: MASTER PRODUCTION HARDENING & COMPLIANCE VERIFICATION RUNNER
 * MD Shakib Islamic Books Modernization Project
 * ==============================================================================
 * 
 * Verifies all Phase 3 requirements (3.1 through 3.12):
 * - Indian E-Commerce Disclosures & Central Business Configuration (3.1)
 * - Statutory Policy Pages: Shipping, Cancellation, Returns, Privacy, Terms (3.2 - 3.6)
 * - Server-Enforced Checkout Consent & Immutable Audit Persistence (3.6)
 * - Content-Security-Policy & HTTP Security Headers (3.7)
 * - Structured Operational Alerting & PII Redaction (3.8)
 * - Isolated Database Backup & Restore Drill (3.9)
 * - Controlled Performance & Latency Benchmarks (3.10)
 * - WCAG 2.1 AA Accessibility & Landmark Compliance (3.11)
 * - Production Environment Configuration & Secret Isolation (3.12)
 * ==============================================================================
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
import { getBusinessDisclosures } from "@/lib/config/business";
import { logger, redactSensitiveData } from "@/lib/logger";
import { placeOrderCOD, placeOrderOnline } from "@/lib/commerce/orders";
import nextConfig from "../next.config";
import { runRestoreDrill } from "./test-phase03-backup-restore-drill";
import { runPerformanceBenchmarks } from "./test-phase03-performance";
import { runAccessibilityAudit } from "./test-phase03-accessibility";
import { auditProductionConfig } from "./test-phase03-production-config";

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testId: string, description: string) {
  totalTests++;
  if (condition) {
    passedTests++;
    console.log(`  ✓ [PASS] ${testId}: ${description}`);
  } else {
    failedTests++;
    console.error(`  ❌ [FAIL] ${testId}: ${description}`);
  }
}

async function runMasterPhase3Verification() {
  console.log("================================================================================");
  console.log(" PHASE 3: MASTER PRODUCTION HARDENING & COMPLIANCE VERIFICATION RUNNER");
  console.log(" MD Shakib Islamic Books Modernization Project");
  console.log("================================================================================\n");

  const supabase = createAdminClient();

  // --- 1. INDIAN E-COMMERCE DISCLOSURES & CONFIGURATION (3.1) ---
  console.log("--- 1. INDIAN E-COMMERCE DISCLOSURES & CENTRAL CONFIGURATION ---");
  const disclosures = getBusinessDisclosures();
  assert(
    Boolean(disclosures.brandName && disclosures.tradeName),
    "P3-DISC-01",
    "Brand and trade names are properly attributed ('MD Shakib Islamic Books')"
  );
  assert(
    Boolean(disclosures.supportEmail.includes("@")),
    "P3-DISC-02",
    "Authoritative support email configured"
  );
  assert(
    disclosures.grievanceOfficer.ackSlaHours === 48 && disclosures.grievanceOfficer.resolutionSlaDays === 30,
    "P3-DISC-03",
    "Statutory Grievance Officer SLA configured (48h ack, 30d resolution under Rule 4(5))"
  );

  // --- 2. STATUTORY POLICY TERMS ACCESSIBILITY (3.2 - 3.6) ---
  console.log("\n--- 2. STATUTORY POLICIES & TERMS CONFORMANCE ---");
  assert(
    disclosures.shipping.standardShippingFee === 49 && disclosures.shipping.estimatedDeliveryDays.includes("3–7"),
    "P3-POL-01",
    "Shipping Policy SLA reflects Delhivery courier capabilities (₹49 standard, 3–7 business days)"
  );
  assert(
    disclosures.cancellation.allowedBeforeDispatch === true && disclosures.cancellation.allowedAfterDispatch === false,
    "P3-POL-02",
    "Cancellation Policy aligns with dispatch cutoff (allowed before shipment, blocked after dispatch)"
  );
  assert(
    disclosures.returns.windowDays === 7,
    "P3-POL-03",
    "Return & Refund Policy enforces statutory 7-day post-delivery eligibility window"
  );

  // --- 3. SERVER-ENFORCED CHECKOUT CONSENT & AUDITING (3.6) ---
  console.log("\n--- 3. SERVER-ENFORCED CHECKOUT CONSENT & AUDIT PERSISTENCE ---");

  // Attempt COD order without consent -> Must be rejected server-side
  const dummyAddressId = "00000000-0000-0000-0000-000000000000";
  const rejectedCodRes = await placeOrderCOD(dummyAddressId, "test-idemp", undefined, undefined);
  assert(
    Boolean(rejectedCodRes.success === false && rejectedCodRes.error?.includes("Statutory purchase consent is required")),
    "P3-CSNT-01",
    "placeOrderCOD strictly rejects order creation if affirmative consent is omitted"
  );

  // Attempt Online order without consent -> Must be rejected server-side
  const rejectedOnlineRes = await placeOrderOnline(dummyAddressId, "test-idemp", undefined, { termsAccepted: false });
  assert(
    Boolean(rejectedOnlineRes.success === false && rejectedOnlineRes.error?.includes("Statutory purchase consent is required")),
    "P3-CSNT-02",
    "placeOrderOnline strictly rejects order creation if termsAccepted is false"
  );

  // Verify RPC record_order_consent_atomic directly with test fixtures
  const { data: testUser } = await supabase.from("profiles").select("id").limit(1).single();
  const { data: testOrder } = await supabase.from("orders").select("id, user_id").limit(1).single();

  if (testUser && testOrder) {
    // Attempt consent for wrong user -> Must fail authorization
    const unauthorizedRes = await supabase.rpc("record_order_consent_atomic", {
      p_order_id: testOrder.id,
      p_user_id: "00000000-0000-0000-0000-000000000000",
      p_terms_accepted: true,
      p_terms_version: "2026.11-v1",
      p_privacy_version: "2026.11-v1",
    });
    assert(
      (unauthorizedRes.data as any)?.success === false,
      "P3-CSNT-03",
      "record_order_consent_atomic rejects consent attribution if user does not own order"
    );

    // Legitimate consent recording
    const validConsentRes = await supabase.rpc("record_order_consent_atomic", {
      p_order_id: testOrder.id,
      p_user_id: testOrder.user_id,
      p_terms_accepted: true,
      p_terms_version: "2026.11-v1",
      p_privacy_version: "2026.11-v1",
      p_shipping_version: "2026.11-v1",
      p_returns_version: "2026.11-v1",
      p_ip_address: "127.0.0.1",
      p_user_agent: "Playwright-Headless-Test-Agent",
    });

    assert(
      (validConsentRes.data as any)?.success === true && Boolean((validConsentRes.data as any)?.consent_id),
      "P3-CSNT-04",
      "record_order_consent_atomic successfully writes audit record into order_consents"
    );

    // Verify order's inline consent_record was updated
    const { data: updatedOrder } = await supabase
      .from("orders")
      .select("consent_record")
      .eq("id", testOrder.id)
      .single();

    assert(
      (updatedOrder?.consent_record as any)?.terms_accepted === true &&
        (updatedOrder?.consent_record as any)?.terms_version === "2026.11-v1",
      "P3-CSNT-05",
      "Order table inline consent_record updated with terms version and timestamp"
    );
  }

  // --- 4. CONTENT-SECURITY-POLICY & SECURITY HEADERS (3.7) ---
  console.log("\n--- 4. SECURITY HEADERS & CSP CONFIGURATION ---");
  const headersConfig = typeof nextConfig.headers === "function" ? await nextConfig.headers() : [];
  const rootHeaders = headersConfig.find((h) => h.source === "/:path*")?.headers || [];

  const getHeaderVal = (name: string) => rootHeaders.find((h) => h.key.toLowerCase() === name.toLowerCase())?.value;

  const csp = getHeaderVal("Content-Security-Policy");
  const xContentType = getHeaderVal("X-Content-Type-Options");
  const xFrame = getHeaderVal("X-Frame-Options");
  const referrerPolicy = getHeaderVal("Referrer-Policy");
  const permissionsPolicy = getHeaderVal("Permissions-Policy");

  assert(Boolean(csp && csp.includes("default-src 'self'")), "P3-SEC-01", "Content-Security-Policy is defined with default-src 'self'");
  assert(Boolean(csp && csp.includes("https://checkout.razorpay.com")), "P3-SEC-02", "CSP whitelists Razorpay checkout iframe and scripts");
  assert(Boolean(csp && csp.includes("https://res.cloudinary.com")), "P3-SEC-03", "CSP whitelists Cloudinary media and CDN connections");
  assert(xContentType === "nosniff", "P3-SEC-04", "X-Content-Type-Options: nosniff configured");
  assert(xFrame === "DENY", "P3-SEC-05", "X-Frame-Options: DENY clickjacking protection configured");
  assert(referrerPolicy === "strict-origin-when-cross-origin", "P3-SEC-06", "Referrer-Policy: strict-origin-when-cross-origin configured");
  assert(Boolean(permissionsPolicy && permissionsPolicy.includes("payment=(self \"https://checkout.razorpay.com\")")), "P3-SEC-07", "Permissions-Policy explicitly delegates payment privileges to Razorpay");

  // --- 5. OPERATIONAL LOGGING & ALERT DEDUPLICATION (3.8) ---
  console.log("\n--- 5. OPERATIONAL LOGGING, PII REDACTION & ALERT DEDUPLICATION ---");
  logger.clearAlertHistoryForTesting();

  // Test Redaction
  const dirtyObject = {
    user: "Ahmad",
    password: "SuperSecretPassword123!",
    api_key: "key_live_998877665544332211",
    credit_card: "4111111111111111",
    token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
  };
  const cleanObject = redactSensitiveData(dirtyObject);
  assert(
    cleanObject.password === "[REDACTED]" &&
      cleanObject.api_key === "[REDACTED]" &&
      cleanObject.credit_card === "[REDACTED]" &&
      cleanObject.token === "[REDACTED]",
    "P3-LOG-01",
    "redactSensitiveData recursively masks secrets, API keys, passwords, and tokens"
  );

  // Test Alert Triggering & Deduplication
  const alertSent1 = logger.alert("CRITICAL", "Razorpay Webhook Signature Mismatch", "Potential HMAC forgery", {
    endpoint: "/api/webhooks/razorpay",
    orderId: "ord_test_01",
  });
  const alertSentDuplicate = logger.alert("CRITICAL", "Razorpay Webhook Signature Mismatch", "Potential HMAC forgery", {
    endpoint: "/api/webhooks/razorpay",
    orderId: "ord_test_01",
  });

  assert(alertSent1 === true, "P3-LOG-02", "logger.alert successfully emits structured operational alert");
  assert(alertSentDuplicate === false, "P3-LOG-03", "logger.alert suppresses duplicate alert within 5-minute deduplication window");

  // --- 6. ISOLATED DATABASE BACKUP & RESTORE DRILL (3.9) ---
  console.log("\n--- 6. ISOLATED BACKUP & RESTORE DRILL ---");
  try {
    const drillRes = await runRestoreDrill();
    assert(drillRes.success === true, "P3-BCK-01", `Isolated restore drill passed in ${drillRes.durationMs}ms`);
  } catch (err: any) {
    assert(false, "P3-BCK-01", `Isolated restore drill failed: ${err?.message}`);
  }

  // --- 7. CONTROLLED PERFORMANCE BENCHMARKS (3.10) ---
  console.log("\n--- 7. PERFORMANCE & LATENCY BENCHMARKS ---");
  const benchResults = await runPerformanceBenchmarks();
  assert(
    benchResults["Catalog Listing (limit 12)"]?.p50 < 50,
    "P3-PERF-01",
    `Catalog Listing p50 is within SLA (<50ms, got ${benchResults["Catalog Listing (limit 12)"]?.p50.toFixed(2)}ms)`
  );
  assert(
    benchResults["Server Cart Pricing RPC"]?.p50 < 30,
    "P3-PERF-02",
    `Server Cart Pricing RPC p50 is within SLA (<30ms, got ${benchResults["Server Cart Pricing RPC"]?.p50.toFixed(2)}ms)`
  );
  assert(
    benchResults["Admin Dashboard Metrics RPC"]?.p50 < 50,
    "P3-PERF-03",
    `Admin Dashboard Metrics RPC p50 is within SLA (<50ms, got ${benchResults["Admin Dashboard Metrics RPC"]?.p50.toFixed(2)}ms)`
  );

  // --- 8. ACCESSIBILITY (a11y) & WCAG 2.1 AA AUDIT (3.11) ---
  console.log("\n--- 8. ACCESSIBILITY & WCAG CONFORMANCE ---");
  const a11yResult = runAccessibilityAudit();
  assert(a11yResult.passed === true, "P3-A11Y-01", "100% of WCAG 2.1 AA accessibility checks passed");

  // --- 9. PRODUCTION ENVIRONMENT CONFIGURATION (3.12) ---
  console.log("\n--- 9. PRODUCTION ENVIRONMENT CONFIGURATION ---");
  const envAudit = auditProductionConfig();
  assert(envAudit.passed === true, "P3-ENV-01", "Client/server secret isolation verified with zero secrets exposed to client");

  // --- SUMMARY ---
  console.log("\n================================================================================");
  console.log(` PHASE 3 MASTER VERIFICATION RESULTS: ${passedTests} PASSED | ${failedTests} FAILED`);
  console.log(` TOTAL VERIFICATION TESTS : ${totalTests}`);
  console.log("================================================================================\n");

  if (failedTests > 0) {
    process.exit(1);
  }
}

if (require.main === module) {
  runMasterPhase3Verification()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Master verification exception:", err);
      process.exit(1);
    });
}
