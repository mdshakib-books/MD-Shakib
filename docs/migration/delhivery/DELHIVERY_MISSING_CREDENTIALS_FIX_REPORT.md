# Delhivery Integration Missing-Credentials Fix & Verification Report

**Repository:** MD Shakib Islamic Books  
**Scope:** Hardening Delhivery integration & related UI/routes for safe deployment without Delhivery credentials  
**Date:** 2026-11-11

---

## 1. Executive Summary

The Delhivery shipping integration has been hardened so the application can deploy safely without `DELHIVERY_TOKEN` (or with mock/placeholder values) while continuing to support customer browsing, checkout, COD/Online order creation, and manual admin order management.

In production (`NODE_ENV === "production"`), and whenever `NODE_ENV` is not explicitly `"development"` or `"test"`, Delhivery operations **fail closed** instead of silently falling back to mock AWBs, synthetic tracking events, fake pincode serviceability success, fake pickup confirmations, or mock shipping labels. Development mocks remain strictly isolated to explicit non-production environments (`NODE_ENV === "development"` or `"test"`).

No Delhivery server secrets or credentials are exposed to `"use client"` components or `NEXT_PUBLIC_*` environment variables.

---

## 2. Files Changed

### Modified Application Files (17 files)
1. `apps/web/lib/integrations/config.ts`
   - Added `isValidDelhiveryToken()` and `isExplicitNonProductionEnv()`.
   - Trims `DELHIVERY_TOKEN`, `DELHIVERY_WEBHOOK_SECRET`, and `DELHIVERY_API_URL`.
   - Rejects empty strings, whitespace, `mock*` prefixes (case-insensitive), `your_delhivery*` prefixes, `changeme`, and `placeholder` in `delhivery.isConfigured`.
2. `apps/web/lib/integrations/delhivery/client.ts`
   - Extended `getDelhiveryConfig()` to return `{ apiUrl, token, isConfigured, isProduction, allowMock }`, where `allowMock` is `true` only when `!isConfigured && isExplicitNonProductionEnv()`.
3. `apps/web/lib/integrations/delhivery/service.ts`
   - Exported `DelhiveryConfigurationError` and added `resolveDelhiveryExecution(operation)`.
   - Guarded `checkPincodeServiceability`, `createShipmentForOrder`, `trackShipment`, `scheduleDelhiveryPickup`, and `getShippingLabel` so mocks run only in explicit non-production (`development` / `test`) environments and unconfigured production calls fail closed before database mutation or fake data generation.
   - Removed the silent `{ serviceable: true, prepaid: true, cod: true }` catch-block fallback in `checkPincodeServiceability`.
   - Updated `verifyDelhiveryWebhookAuth` to trim `DELHIVERY_WEBHOOK_SECRET` and reject `your_delhivery*` placeholders (and `mock*` secrets in `NODE_ENV === "production"`).
4. `apps/web/lib/commerce/returns.ts`
   - Guarded `scheduleReturnPickup()` to fail closed with `{ success: false, error: "Delhivery reverse pickup is unavailable: DELHIVERY_TOKEN is not configured on the server." }` when `!config.isConfigured && !config.allowMock`, before updating `return_requests`.
5. `apps/web/lib/admin/orders.ts`
   - Fixed `getAdminShippingLabel()` so `!result.success` returns `{ success: false, error: result.error || "Failed to generate shipping label." }` instead of erroneously returning `{ success: true }`.
6. `apps/web/app/api/shipping/serviceability/route.ts`
   - Returns HTTP `503` with `{ success: false, configured: false, serviceable: false, prepaid: false, cod: false, error }` on `DelhiveryConfigurationError`.
7. `apps/web/app/api/shipping/track/route.ts`
   - Returns HTTP `503` with `{ configured: false, error }` on `DelhiveryConfigurationError` (no synthetic scans).
8. `apps/web/app/api/admin/returns/pickup/route.ts`
   - Propagates `{ success: false, configured: false, error }` with HTTP `503` when Delhivery is not configured.
9. `apps/web/app/api/health/route.ts`
   - Uses `checkIntegrationStatus().delhivery.configured` for `environment.configuredServices.delhivery` so mock/placeholder tokens report `false` instead of `true`.
10. `apps/web/app/checkout/CheckoutClient.tsx`
    - Tracks pincode serviceability state (`idle` | `checking` | `verified` | `unavailable`) keyed by active pincode (without synchronous `setState` inside `useEffect`).
    - No longer fabricates `{ serviceable: true, prepaid: true, cod: true }` when `/api/shipping/serviceability` returns `503`, `configured: false`, an error, or fails at the network layer.
    - Displays `"Standard shipping applies (live courier serviceability check unavailable)."` while keeping both COD and Online checkout enabled.
11. `apps/web/app/orders/[id]/OrderDetailClient.tsx`
    - Tracks `trackingUnavailable` when `/api/shipping/track` returns `503` / `configured: false` and displays a neutral message referring customers to the order status timeline rather than implying active Delhivery tracking scans.
12. `apps/web/app/admin/orders/page.tsx`
    - Passes server-evaluated booleans `delhiveryConfigured` and `delhiveryMockMode` (never secret tokens) to `AdminOrdersClient`.
13. `apps/web/app/admin/orders/AdminOrdersClient.tsx`
    - Displays an amber configuration banner when `!delhiveryConfigured && !delhiveryMockMode` informing admins that Delhivery automation is disabled while manual lifecycle management remains active.
14. `apps/web/app/admin/orders/[id]/page.tsx`
    - Passes `delhiveryConfigured` and `delhiveryMockMode` booleans to `AdminOrderDetailClient`.
15. `apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx`
    - Shows clear configuration notice inside the `Delhivery Shipping & Logistics` panel (`Delhivery is not configured.` in unconfigured production; `Delhivery Sandbox / Mock Mode:` in explicit dev/test).
    - Disables `"Book Delhivery Shipment"`, `"Download Label"`, and `"Schedule Pickup"` buttons when `!delhiveryConfigured && !delhiveryMockMode`, while keeping manual status advancement, invoice, packing slip, receipt, cancellation, and COD reconciliation intact.
16. `apps/web/app/admin/returns/page.tsx`
    - Passes `delhiveryConfigured` and `delhiveryMockMode` booleans to `AdminReturnsClient`.
17. `apps/web/app/admin/returns/AdminReturnsClient.tsx`
    - Displays a notice inside the approved return action panel and disables `"Schedule Delhivery Reverse Pickup"` when Delhivery is unconfigured outside dev/test mock mode.

### New Verification Files Created
- `apps/web/scripts/test-delhivery-missing-credentials.ts` (added test suite)
- `docs/migration/delhivery/DELHIVERY_MISSING_CREDENTIALS_FIX_REPORT.md` (this report)

---

## 3. Exact Behavior Before vs After

| Operation / Area | Behavior Before | Behavior After |
|---|---|---|
| **Token & Env Validation** (`getIntegrationsConfig`, `getDelhiveryConfig`) | Only checked `Boolean(token && !token.startsWith("mock"))`; untrimmed whitespace or template placeholders (`your_delhivery_api_token`) passed `isConfigured`; unconfigured mocks ran in any `NODE_ENV` including `"production"`. | Trims token; rejects empty, `mock*` (any case), `your_delhivery*`, `changeme`, `placeholder`. Mocks require `allowMock` (`NODE_ENV === "development" \|\| NODE_ENV === "test"`). Fails closed in `production` and unset/ambiguous `NODE_ENV`. |
| **Pincode Serviceability** (`checkPincodeServiceability`, `/api/shipping/serviceability`) | When unconfigured (including in production), returned hardcoded mock results (`110001` prepaid-only, `*000`/`999999` unserviceable, otherwise `serviceable: true, cod: true`). On `fetch` error, silently returned `{ serviceable: true, prepaid: true, cod: true }`. | When unconfigured outside explicit dev/test, throws `DelhiveryConfigurationError`; API route returns HTTP `503` `{ success: false, configured: false, serviceable: false, prepaid: false, cod: false, error }`. Live API errors rethrow instead of returning fake success. Explicit dev/test mocks preserved. |
| **Checkout Flow** (`CheckoutClient`, `placeOrderCOD`, `placeOrderOnline`) | UI showed fake `"✓ Delhivery Express: Prepaid & COD available"` when serviceability endpoint failed. | UI displays neutral `"Standard shipping applies (live courier serviceability check unavailable)."` and keeps COD & Online checkout functional. `placeOrderCOD` / `placeOrderOnline` continue catching serviceability unavailability cleanly so customer order creation is uninterrupted. |
| **Shipment Creation & AWB** (`createShipmentForOrder`, `bookAdminOrderShipment`) | In production without `DELHIVERY_TOKEN`, fabricated `DLV<UUID>` AWB, set `shipping_courier: "Delhivery"`, transitioned order to `"Shipped"`, set `shipping_pickup_scheduled: true`, and triggered shipped notification email. | Throws `DelhiveryConfigurationError` before any DB query/update or email dispatch. Never fabricates an AWB or mutates order status. `bookAdminOrderShipment` returns `{ success: false, error }` cleanly without writing audit logs. |
| **Forward Pickup Requests** (`scheduleDelhiveryPickup`, `scheduleAdminPickup`) | Generated fake `PKP-...` request IDs and set `shipping_pickup_scheduled = true` on the order in production when unconfigured. | Returns `{ success: false, error: "Delhivery pickup scheduling is unavailable: DELHIVERY_TOKEN is not configured on the server." }` before DB read/write. Never creates fake `PKP-...` confirmations. |
| **Reverse Return Pickup** (`scheduleReturnPickup`, `/api/admin/returns/pickup`) | Generated fake `REV-...` AWB and marked return request `pickup_scheduled` when unconfigured in production. | Returns `{ success: false, error: "Delhivery reverse pickup is unavailable..." }` (HTTP `503` on route) before updating `return_requests`. |
| **Shipment Tracking** (`trackShipment`, `/api/shipping/track`, `OrderDetailClient`) | Returned synthetic `MANIFESTED`, `IT`, `UD`, `DL` scans inferred from internal DB order status whenever unconfigured in production. | Throws `DelhiveryConfigurationError` (API returns HTTP `503` `{ configured: false, error }`, no `scans`). `OrderDetailClient` displays neutral unavailable message and directs customers to the order status timeline. |
| **Shipping Labels** (`getShippingLabel`, `getAdminShippingLabel`) | Returned fake HTML label and synthetic PDF URL in production when unconfigured; `getAdminShippingLabel` returned `success: true` even if `getShippingLabel` returned `success: false`. | `getShippingLabel` returns `{ success: false, error: "Delhivery shipping labels are unavailable..." }`. `getAdminShippingLabel` checks `if (!result.success)` and propagates `{ success: false, error }`. |
| **Webhook Auth & Health** (`verifyDelhiveryWebhookAuth`, `/api/health`) | `/api/health` used `Boolean(process.env.DELHIVERY_TOKEN)` (reported `mock_delhivery_token` as configured). Webhook auth didn't reject `"your_delhivery_webhook_secret"` or production `"mock*"` secrets. | `/api/health` uses `checkIntegrationStatus().delhivery.configured` (`false` for mock/placeholder). `verifyDelhiveryWebhookAuth` rejects placeholder and production `mock*` secrets (fail closed, HTTP `500` on `/api/webhooks/delhivery`). |
| **Admin Dashboard UI** (`/admin/orders`, `/admin/orders/[id]`, `/admin/returns`) | Showed active `"Book Delhivery Shipment"`, `"Download Label"`, `"Schedule Pickup"`, and `"Schedule Delhivery Reverse Pickup"` actions without indicating Delhivery was unconfigured. | Receives server-only boolean props (`delhiveryConfigured`, `delhiveryMockMode`), displays understandable notices that Delhivery is not configured, and disables Delhivery-specific API buttons in unconfigured non-mock environments while keeping manual fulfillment intact. |

---

## 4. Verification Executed & Observed Results

All checks below were executed after the final code edit in `/Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web`:

| Check / Command | Scope & Environment | Result |
|---|---|---|
| `npx tsx scripts/test-delhivery-missing-credentials.ts` | New test suite verifying token validator, `NODE_ENV="production"` fail-closed behavior across `undefined` / `""` / whitespace / `mock*` / `your_delhivery_api_token`, live API failure behavior, API routes (`/api/shipping/serviceability`, `/api/shipping/track`, `/api/health`, `/api/webhooks/delhivery`), explicit non-production mock isolation (`development`/`test` vs unset/`staging`), and `"use client"` / `NEXT_PUBLIC_` secret scan. Outbound `fetch` blocked (`0` Delhivery HTTP calls). | **12 passed, 0 failed** (exit 0) |
| `npx tsx scripts/test-phase03-production-config.ts` | Secret isolation & env template audit (`NODE_ENV` contract check). | **Passed** (`SECRET ISOLATION AUDIT: PASSED`, exit 0) |
| `npx tsx scripts/test-phase09-unit-and-business-logic.ts` | Isolated cart totals, quantity/pincode validation, order status state machine, cancellation/7-day replacement/refund rules, Razorpay HMAC signatures, inventory calculations. | **28/28 passed (100%)** (exit 0) |
| `npx tsx scripts/test-phase02a-verification.ts` | Cloudinary namespace/magic-byte/fail-closed enforcement, stored procedure caller identity & cancellation invariants. | **18/18 passed (100%)** (exit 0) |
| `npx tsx scripts/test-phase03a-security-and-lifecycle.ts` | Simulated RPC caller security, anonymous/spoof blocking, replacement & cancellation lifecycle invariants. | **13/13 passed (100%)** (exit 0) |
| `npx tsx scripts/test-phase03a-eligibility-boundaries.ts` | 7-day replacement eligibility boundary checks (`delivered_at` / `shipping_delivered_at`). | **10/10 passed (100%)** (exit 0) |
| `npm run lint` | ESLint across `apps/web`. | **0 errors, 3 pre-existing warnings** (`AccountSecurityClient.tsx`, `AdminBooksClient.tsx`, `MediaUploader.tsx`) (exit 0) |
| `npm run typecheck` | TypeScript (`tsc --noEmit`) across `apps/web` (including `scripts/`). | **Passed, 0 errors** (exit 0) |
| `npm run build` | Production build (`next build`, Next.js 16.4.3 Turbopack), static generation of 46/46 static pages + all dynamic/API routes. | **Passed** (exit 0) |

### Checks Not Executed (Environment Constraint)
- Existing local Supabase-dependent integration scripts (`test-integrations.ts`, `test-remediation.ts`, `test-phase01-e2e-verification.ts`, `test-phase01-independent-audit.ts`, `test-phase02-lean-ecommerce.ts`, `test-phase02c-returns.ts`, `test-phase02-staging-acceptance-runner.ts`) were **not** executed because no local Supabase Docker stack (`supabase_db_MD-Shakib` on `127.0.0.1:54321`) is running in this environment.
- Live Delhivery APIs were intentionally **not** called.

---

## 5. Remaining Deployment Blockers / Notes

1. **Automated Delhivery Fulfillment Requires Live Server Credentials Later:**
   - The app is now **safe to deploy without `DELHIVERY_TOKEN`** (no fake AWBs, no fake tracking/serviceability/pickups, manual admin fulfillment and checkout work cleanly).
   - Automated Delhivery shipping remains disabled in production until valid server-only credentials are configured:
     - `DELHIVERY_TOKEN`
     - `DELHIVERY_WEBHOOK_SECRET`
     - `DELHIVERY_PICKUP_LOCATION` (matching the registered Delhivery One warehouse name)
2. **Reverse Return Pickup Live Implementation (Pre-existing Gap Outside Missing-Credentials Scope):**
   - In `apps/web/lib/commerce/returns.ts`, `scheduleReturnPickup()` now safely fails closed in production when `DELHIVERY_TOKEN` is missing. Note that even when `DELHIVERY_TOKEN` is configured, its configured branch still contains a pre-existing placeholder (`awb = \`REV-${Date.now()}\``) without a real Delhivery reverse-pickup API integration; left unchanged per the constraint not to add new features.
3. **Production Environment Audit Items (Pre-existing Non-Delhivery Config):**
   - `test-phase03-production-config.ts` reported `NEXT_PUBLIC_SITE_URL` and `BUSINESS_GSTIN` missing in the local environment and staging defaults for Razorpay/Delhivery webhook secrets; ensure production values are populated in the target hosting environment before launch.
