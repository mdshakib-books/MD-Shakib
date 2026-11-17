# Phase 02 — Critical Bug Fixes & Checkout Hardening

> **Environment Context:** Phase 02 hardening builds on Phase 01 environment isolation (`APP_ENV`, service kill switches, `ALLOW_MOCK_SERVICES`). Because no separate development Supabase instance is currently provisioned locally (`NEXT_PUBLIC_SUPABASE_URL` defaults to `http://127.0.0.1:54321`), all code, schema migrations, and application-level logic were verified offline against simulated PostgreSQL/RPC and gateway harnesses. Live database migration execution and third-party sandbox verification remain pending provisioning.

---

## 1. Status Overview

| Area | Fix / Vulnerability | Implementation Status | Offline Verification | Database Verification | External Sandbox Verification |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **C-1** | Online Order Cancellation & Razorpay Refunds | `IMPLEMENTED` | `TESTED OFFLINE` | `REQUIRES DATABASE VERIFICATION` | `PENDING EXTERNAL SANDBOX VERIFICATION` |
| **H-1** | COD Serviceability Fail-Closed Gate & Timeouts | `IMPLEMENTED` | `TESTED OFFLINE` | `REQUIRES DATABASE VERIFICATION` | `PENDING EXTERNAL SANDBOX VERIFICATION` |
| **H-3** | Expired Online Reservations Cleanup & Scheduled Cron | `IMPLEMENTED` | `TESTED OFFLINE` | `REQUIRES DATABASE VERIFICATION` | N/A |
| **H-8** | Payment Method Switching, Fingerprinting & Attempts | `IMPLEMENTED` | `TESTED OFFLINE` | `REQUIRES DATABASE VERIFICATION` | `PENDING EXTERNAL SANDBOX VERIFICATION` |
| **H-2** | RPC Lockdown (`service_role` only) & Authoritative Pricing/Address | `IMPLEMENTED` | `TESTED OFFLINE` | `REQUIRES DATABASE VERIFICATION` | N/A |

---

## 2. Baseline Findings (Pre-Phase 02)

1. **C-1 — Silent Missing / False-Pending Refunds on Cancellation:**
   - `cancel_order_atomic` set `orders.payment_status = 'Refund Pending'`, `refund_status = 'pending'`, and `razorpay_refund_id = NULL` before calling `initiateRazorpayRefund()`.
   - `initiateRazorpayRefund()` in `apps/web/lib/integrations/razorpay/service.ts` returned `{ success: true, status: "pending" }` whenever `order.payment_status === "Refund Pending"` or `order.refund_status === "pending"`, causing paid cancellation refunds to return success **without ever calling Razorpay**.
   - Customer cancellation (`cancelOrder()` in `apps/web/lib/commerce/orders.ts`) never invoked `initiateRazorpayRefund()` at all for paid `ONLINE` orders.
   - Admin cancellation (`cancelAdminOrder()` in `apps/web/lib/admin/orders.ts`) returned `success: true` even when `initiateRazorpayRefund()` failed, causing admin UI banners to display green success messages.
   - Gateway errors polluted `orders.razorpay_refund_id` with synthetic `rfnd_err_*` IDs, `refund.created` / `refund.processed` webhooks did not synchronize `refund_records` or mark `webhook_events.status = 'completed'`, and `orders` constraints lacked explicit `Partially Refunded`, `not_required`, and `processing` states.
2. **H-1 — COD Serviceability Fail-Open Behavior:**
   - `placeOrderCOD` in `apps/web/lib/commerce/orders.ts` caught `checkPincodeServiceability()` exceptions with `console.warn` and still created COD orders when Delhivery was disabled, misconfigured, timed out, returned HTTP 5xx, or returned malformed payloads.
   - `checkPincodeServiceability` lacked an `AbortController` request timeout and defaulted missing `is_serviceable` flags to `true` (`pinData.is_serviceable ?? true`).
   - `CheckoutClient.tsx` left the COD radio button selectable when courier serviceability status was `"unavailable"`.
3. **H-3 — Reservation Expiry Permission Mismatch & Missing Cron:**
   - `releaseExpiredReservations()` in `apps/web/lib/commerce/orders.ts` invoked `release_expired_reservations_atomic` via `createClient()` (`authenticated`), whereas the RPC was revoked from `authenticated` (`service_role` only).
   - No authenticated scheduled endpoint existed for periodic expiry processing.
4. **H-8 — Payment Method Switching & Idempotency Collisions:**
   - `CheckoutClient.tsx` held a single `idempotencyKeyRef` across payment method toggles (`ONLINE <-> COD`), address edits, and coupon changes.
   - `placeOrderCOD` and `placeOrderOnline` looked up existing orders strictly by `(user_id, idempotency_key)` without verifying `payment_method` or request parameters, risking returning an unpaid `ONLINE` order on a `COD` request (or vice versa).
   - `create_order_atomic` updated `discounts.used_count` before its `unique_violation` `BEGIN ... EXCEPTION` subtransaction, creating a concurrency coupon over-count window on duplicate concurrent submissions, and did not lock `public.carts` to block multi-tab double submissions with different keys.
   - `createRazorpayOrder` silently logged DB insert failures into `payments` instead of failing loudly, and did not track sequential attempts atomically via `prepare_payment_attempt_atomic`.
5. **H-2 — Excessive Direct RPC Grants & Unverified Snapshots:**
   - `create_order_atomic`, `cancel_order_atomic`, and `record_order_consent_atomic` granted `EXECUTE` directly to `authenticated`, enabling direct PostgREST RPC calls bypassing server-side Delhivery COD verification, refund orchestration, and consent IP/user-agent capture.

---

## 3. Architecture & Implemented Remedies

### 3.1 C-1 — Refund Lifecycle, Capture Validation & Reconciliation

- **Schema & State Machine** (`supabase/migrations/20261111000001_phase02_checkout_hardening.sql`):
  - `orders.payment_status` allows: `Pending`, `Paid`, `Failed`, `Refund Pending`, `Partially Refunded`, `Refunded`.
  - `orders.refund_status` allows: `not_required`, `pending`, `processing`, `processed`, `failed` (mapped to `RefundLifecycleState`: `NOT_REQUIRED` | `PENDING` | `PROCESSING` | `PROCESSED` | `FAILED`).
  - `refund_records` serves as the unified refund ledger for cancellations, return claims, and late-capture refunds (`authorized_by` nullable for customer/system auto-refunds, `refund_type`, unique `idempotency_key`, `attempt_count`, `raw_response`, `processed_at`).
- **Gateway Eligibility & Idempotency** (`apps/web/lib/integrations/razorpay/service.ts`):
  - Verifies `payment_method === "ONLINE"`, order/payment ownership, real `provider_payment_id`, and cumulative remaining refundable amount (`capturedAmount - settledAmount - inFlightAmount`).
  - In `sandbox`/`live` modes, calls `client.payments.fetch(paymentId)` with a bounded `10s` timeout: rejects `authorized`-only, `created`, and `failed` payments, verifies `order_id` ownership, and queries `client.payments.fetchMultipleRefund(paymentId)` matching deterministic `receipt` (`rcpt_<sha256(idempotencyKey).slice(0,32)>`) before issuing a refund so retried/timed-out requests never double-refund.
  - Only treats an existing pending order as in-flight when a real `gateway_refund_id` already exists; orders left in `Refund Pending` without a `gateway_refund_id` always execute the gateway call.
  - Distinguishes gateway-accepted `"pending"`/`"created"` responses as `PROCESSING` (`refund_status = 'processing'`, `payment_status = 'Refund Pending'`) until Razorpay `refund.processed` webhook (or admin sync poll) confirms `PROCESSED` (`Refunded` / `Partially Refunded`).
  - Never stores synthetic `rfnd_err_*` IDs on failure; failed attempts record `error_message` while keeping `razorpay_refund_id` clean for recovery via `retryAdminOrderRefund()`.
- **UI & Server Actions:**
  - Both customer (`cancelOrder`) and admin (`cancelAdminOrder`) cancellations invoke `executeOrderCancellation()` (`apps/web/lib/commerce/orders-core.ts`), initiate Razorpay refunds for paid `ONLINE` orders, and return `success: false` (`orderCancelled: true, refundStatus: "FAILED"`) if Razorpay refund initiation fails.
  - `AdminOrderDetailClient.tsx` adds refund lifecycle status display and a **Retry / Sync Razorpay Refund** control backed by `retryAdminOrderRefund`.
  - `apps/web/lib/integrations/razorpay/webhook.ts` reconciles `refund.created`, `refund.processed`, `refund.failed`, marks `webhook_events.status = 'completed'`, and triggers tracked auto-refunds when `settle_payment_atomic` returns `requires_refund: true` (post-expiry out-of-stock or non-recoverable cancellation captures).

```
  [Paid ONLINE Order]
          │  cancel_order_atomic()
          ▼
   payment_status = 'Refund Pending', refund_status = 'pending' (gateway_refund_id = NULL)
          │
          ├─── Gateway call throws / rejected / uncaptured ──▶ FAILED (payment_status = 'Paid' or 'Partially Refunded')
          │                                                       └──▶ Admin Retry -> fetchMultipleRefund() / payments.refund()
          │
          ├─── Razorpay status = 'pending'/'created' ───────▶ PROCESSING (payment_status = 'Refund Pending', real rfnd_* ID)
          │                                                       └──▶ Webhook refund.processed ─▶ PROCESSED
          │
          └─── Razorpay status = 'processed' ───────────────▶ PROCESSED (payment_status = 'Refunded' or 'Partially Refunded')
```

### 3.2 H-1 — COD Serviceability Fail-Closed Enforcement

- `checkPincodeServiceability()` (`apps/web/lib/integrations/delhivery/service.ts`):
  - Enforces bounded `5000ms` request timeout via `AbortController` (`DelhiveryServiceabilityTimeoutError`).
  - Rejects non-JSON / missing `delivery_codes` structures and removes the `pinData.is_serviceable ?? true` fail-open default.
  - Adds a bounded (max 500 entries, `120s` TTL) in-memory cache strictly for verified **positive** `live`/`sandbox` serviceability results; errors, timeouts, unconfigured states, and unserviceable results are never cached.
- `verifyCodServiceabilityStrict()` and `executeOrderCheckout()` (`apps/web/lib/commerce/orders-core.ts`):
  - COD checkout requires a verified `Delhivery` check returning both `serviceable === true` and `cod === true` against the owned database `addresses.pincode`.
  - Disabled integration, missing credentials, HTTP 5xx, timeouts, malformed JSON, unserviceable pincodes, or prepaid-only pincodes all **fail closed**.
  - Inside SQL (`create_order_atomic`), `p_payment_method = 'COD'` rejects unless `p_cod_verified = TRUE`, and `create_order_atomic` is revoked from `authenticated`.
- `ONLINE` checkout stays operational when Delhivery is disabled or transiently unreachable (while still enforcing 6-digit pincode validation and rejecting explicitly verified unserviceable/non-prepaid responses).
- `CheckoutClient.tsx` disables COD whenever `serviceabilityStatus !== "verified"` or `!serviceability.cod`, and auto-switches selection to `ONLINE` if serviceability becomes unavailable.

### 3.3 H-3 — Expired Reservation Release & Scheduled Cron

- `release_expired_reservations_atomic` (`20261111000001_phase02_checkout_hardening.sql`):
  - Restricts candidates strictly to `payment_method = 'ONLINE'`, `COALESCE(is_paid, FALSE) = FALSE`, `payment_status = 'Pending'`, `order_status = 'Pending'`, no `'Paid'` rows in `payments`, with `expires_at < clock_timestamp()`.
  - Uses `FOR UPDATE OF o SKIP LOCKED` and deterministic `ORDER BY book_id, id` locks to avoid deadlocks and concurrent double-releases.
  - Restores `books.stock`, marks `inventory_reservations` `status = 'expired'` (`expired_at`, `released_at`, `release_reason`), releases coupon usage if `coupon_status = 'reserved'`, sets `orders.refund_status = 'not_required'`, and leaves `payments.status = 'Pending'` so `settle_payment_atomic` late-capture recovery remains intact.
- **Trusted Worker & Authenticated Cron Route:**
  - `apps/web/lib/commerce/reservations.ts` (`runReleaseExpiredReservationsWorker`) executes with `createAdminClient()` (`service_role`).
  - `apps/web/app/api/cron/release-reservations/route.ts` exposes `GET` and `POST`, failing closed (`503`) if server-only `CRON_SECRET` (`>= 16` non-placeholder chars) is unconfigured, failing (`401`) on constant-time Bearer/`x-cron-secret` mismatch, and processing bounded batches (`limit` clamped `1..500`).
  - `releaseExpiredReservations` in `orders.ts` requires `requireAdmin()`.

### 3.4 H-8 — Payment Method Switching, Fingerprinting & Payment Attempts

- **Frontend (`apps/web/app/checkout/CheckoutClient.tsx`):**
  - Scopes `idempotencyContextRef` to `{ key, signature }` including `selectedAddressId`, `paymentMethod`, `appliedCoupon.code`, and cart `(bookId, quantity)` pairs. Changing payment method (`ONLINE <-> COD`), address, coupon, or cart automatically rotates to a new UUID key while double-clicks preserve the same key.
- **Checkout Server Orchestration (`apps/web/lib/commerce/orders-core.ts`):**
  - Idempotency lookups reject cross-method (`IDEMPOTENCY_CONFLICT`), address/coupon drift (`IDEMPOTENCY_CONFLICT`), and cancelled/expired (`ORDER_CANCELLED`) key reuse instead of silently returning an incompatible order.
- **Database & Gateway Attempts (`20261111000001` & `createRazorpayOrder`):**
  - `create_order_atomic` acquires a transaction-scoped advisory lock (`pg_advisory_xact_lock`) keyed by `(user_id, idempotency_key)` before reading `order_idempotency_keys`, preventing concurrent duplicate coupon increments, and locks `public.carts` (`p_require_cart = TRUE`) so concurrent browser tabs cannot create duplicate orders from one cart.
  - `public.payment_attempts` and `prepare_payment_attempt_atomic` serialize Razorpay order initialization, reusing active `Pending` gateway sessions across concurrent tabs and cleanly creating numbered retry attempts (`attempt_number`) when `forceNewAttempt = true`, while rejecting expired/released reservations. `settle_payment_atomic` resolves `orders` via `payments.provider_order_id` fallback if a customer completes an earlier attempt and marks duplicate captures `requires_refund = TRUE`.

### 3.5 H-2 — RPC Privilege Lockdown & Authoritative Derivation

- Revoked `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` and granted strictly to `postgres, service_role` on:
  - `create_order_atomic`
  - `cancel_order_atomic`
  - `record_order_consent_atomic`
  - `prepare_payment_attempt_atomic`
  - `settle_payment_atomic`
  - `record_payment_failure_atomic`
  - `record_refund_atomic`
  - `release_expired_reservations_atomic`
  - `initiate_return_refund_atomic`
- Every function in `20261111000001_phase02_checkout_hardening.sql` uses `SECURITY DEFINER SET search_path = public, pg_temp`.
- `create_order_atomic` validates profile active status, derives `address_snapshot` directly from `public.addresses` owned by `p_user_id` via `p_address_id`, aggregates duplicate `book_id` entries, enforces `p_cod_verified` for COD, and computes authoritative unit prices (with `cart.ts` rounded to 2 decimals to match SQL), coupons, platform/delivery fees, and totals strictly inside PostgreSQL.
- Verified via grep that no `"use client"` component invokes restricted mutation RPCs; all legitimate application paths run inside `"use server"` actions / API routes using `createAdminClient()` after `getAuthenticatedUser()` or `requireAdmin()`.

---

## 4. Files Modified / Created

- **Database Migration:**
  - `supabase/migrations/20261111000001_phase02_checkout_hardening.sql` (new, forward-only, idempotent)
- **Backend & Integrations:**
  - `apps/web/lib/integrations/delhivery/service.ts`
  - `apps/web/lib/integrations/razorpay/client.ts`
  - `apps/web/lib/integrations/razorpay/service.ts`
  - `apps/web/lib/integrations/razorpay/webhook.ts`
  - `apps/web/lib/commerce/orders-core.ts` (new shared orchestrator)
  - `apps/web/lib/commerce/reservations.ts` (new server-only expiry worker)
  - `apps/web/lib/commerce/orders.ts`
  - `apps/web/lib/commerce/payments.ts`
  - `apps/web/lib/commerce/cart.ts`
  - `apps/web/lib/commerce/returns.ts`
  - `apps/web/lib/admin/orders.ts`
  - `apps/web/lib/env/server.ts`
  - `apps/web/types/database.types.ts`
- **API Routes & Frontend UI:**
  - `apps/web/app/api/cron/release-reservations/route.ts` (new authenticated cron endpoint)
  - `apps/web/app/api/shipping/serviceability/route.ts`
  - `apps/web/app/api/payments/create-order/route.ts`
  - `apps/web/app/checkout/CheckoutClient.tsx`
  - `apps/web/app/orders/[id]/OrderDetailClient.tsx`
  - `apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx`
  - `apps/web/app/admin/orders/AdminOrdersClient.tsx`
- **Config, Tests & Documentation:**
  - `.env.example` (added `CRON_SECRET` placeholder documentation)
  - `apps/web/scripts/test-phase02-checkout-hardening.ts` (new offline verification suite)
  - `docs/PHASE_02_CHECKOUT_HARDENING.md`

---

## 5. Manual Follow-Up Actions Required

1. **Apply Forward Migration to Development & Staging Supabase:**
   - Once the dedicated development Supabase project is provisioned (per `docs/ENVIRONMENT_AND_SAFETY.md`), run `supabase db push` or apply `supabase/migrations/20261111000001_phase02_checkout_hardening.sql`.
2. **Configure `CRON_SECRET` & Scheduler:**
   - Generate a unique `>= 32`-character secret for `CRON_SECRET` in staging/production deployment environment variables (never expose as `NEXT_PUBLIC_*`).
   - Configure a scheduler (e.g., Vercel Cron hitting `GET /api/cron/release-reservations` every 5 minutes with `Authorization: Bearer <CRON_SECRET>`, or PostgreSQL `pg_cron` running `SELECT public.release_expired_reservations_atomic(50);` every 5 minutes).
3. **Database & Sandbox Verification:**
   - Execute live PostgreSQL verification of `20261111000001` (`authenticated`/`anon` RPC denial, `service_role` flow, concurrency locks). Note: legacy live-DB integration test scripts (such as `test-phase6r-remediation.ts`, `test-phase09-integration-and-database.ts`, and `test-phase00-04-inventory-lifecycle.ts`) that previously called `create_order_atomic` or `cancel_order_atomic` via an `authenticated` client or omitted `p_cod_verified: true` should be updated when running against a live dev database.
   - Verify Razorpay test-mode full refund, partial refund, authorized-only rejection, and webhook delivery (`refund.created`, `refund.processed`, `refund.failed`) plus Delhivery staging pincode serviceability (`cod=Y` vs `cod=N`).
