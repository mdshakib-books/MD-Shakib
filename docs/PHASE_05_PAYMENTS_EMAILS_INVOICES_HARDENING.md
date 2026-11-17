# Phase 05 — Payments, Emails, Invoices & Shipping Fees Hardening

**Branch:** `new-fix`  
**Audit Report:** `docs/audits/PHASE_05_AUDIT.md`  
**Database Migration:** `supabase/migrations/20261114000001_phase05_payments_emails_invoices_hardening.sql`  
**Offline Verification Suite:** `apps/web/scripts/test-phase05-payments-emails-invoices.ts`

---

## 1. Summary of Changes

Phase 05 hardens Razorpay settlement verification, partial/timeout refund reconciliation, and Razorpay webhook finality; eliminates duplicate/suppressed/unbounded transactional email bugs; enforces statutory invoice eligibility, full 36-state Indian GST jurisdiction mapping, and Luhn mod-36 GSTIN check-digit validation; and unifies pricing, rounding, and shipping/platform fees across cart, checkout, gateway payloads, courier manifests, email receipts, and invoices.

All Phase 01–04 environment isolation, kill switches, RBAC permissions, dispatched-order cancellation safeguards, COD collection/remittance controls, and Delhivery webhook guarantees are preserved.

---

## 2. Razorpay Payment & Refund Hardening

- **Fail-Closed Capture Verification (`apps/web/lib/integrations/razorpay/service.ts`):**
  - Removed the silent fallback inside `verifyAndSettlePayment()` that previously fabricated `{ status: "captured", currency: "INR", amount }` if `client.payments.fetch()` failed in `live`/`sandbox` mode.
  - Enforced server-side verification of `remotePayment.id === razorpay_payment_id`, `remotePayment.order_id === razorpay_order_id`, `status === "captured"` (explicitly rejecting `"authorized"`, `"created"`, `"failed"`, `"refunded"`), `currency === "INR"`, and exact integer paise match (`toPaise(order.total_amount)`), alongside customer ownership and `payment_method === "ONLINE"`.
  - Normalized `createRazorpayOrder()` to compute `amountInPaise` via `toPaise()` and validate returned gateway `id`, `currency`, and `amount`.
- **Database Uniqueness & SQL Settlement Hardening (`20261114000001`):**
  - Added partial unique indexes `idx_orders_razorpay_payment_id_unique` on `public.orders(razorpay_payment_id)` and `idx_payments_single_settled_per_order` on `public.payments(order_id)` (`status IN ('Paid', 'Partially Refunded', 'Refund Pending', 'Refunded')`).
  - Hardened `settle_payment_atomic` to validate optional capture `status`, `id`, and `order_id` fields in `p_raw_response` and reject cross-order `p_razorpay_payment_id` reuse cleanly.
  - Hardened `record_payment_failure_atomic` to reject COD orders, preserve paid states, and transition pending `payment_attempts` rows to `'failed'`.
- **Partial Refund, Timeout Recovery & Webhook Finality (`service.ts`, `webhook.ts`, `record_refund_atomic`):**
  - Extracted shared `reconcileExistingActiveRefundRecord()` and `lookupAndSyncRemoteRefundByReceipt()` helpers in `apps/web/lib/integrations/razorpay/service.ts`, and evaluated explicit idempotency/refund-record matches before the `remainingRefundable` check so active partial refunds in `'processing'`/`'pending'` status poll the gateway rather than falsely failing capacity checks or issuing duplicate partial refunds.
  - Updated timeout/5xx error handling in `initiateRazorpayRefund()` to probe `payments.fetchMultipleRefund` once before recording `'failed'`, while updating `record_refund_atomic` to increment `attempt_count` on `'failed'` retries and leave `orders.refund_amount = NULL` (or prior settled sum) instead of recording an unconfirmed requested refund amount on failures.
  - Hardened `processRazorpayWebhook()` (`apps/web/lib/integrations/razorpay/webhook.ts`) and `POST /api/webhooks/razorpay` to validate signature headers before rate limiting, reject non-object JSON bodies, return `{ status: "in_flight_duplicate" }` on concurrent `'processing'` webhook deliveries, require `paymentEntity.status === "captured"` when status is present, validate `refundEntity.currency === "INR"` and positive bounded refund amounts, and finalize `webhook_events.status` on **every** terminal branch (`ignored`, `rejected`, `unhandled_event`, `already_paid`, `settled`, `refund_recorded`).

---

## 3. Transactional Email Suppression, Deduplication & Bounded Retries

- **Schema & Profile Preferences (`20261114000001`, `apps/web/lib/auth/actions.ts`, `apps/web/app/profile/ProfileClient.tsx`):**
  - Added `profiles.email_notifications_enabled` (default `TRUE`) and `profiles.email_preferences_updated_at`, exposed on the customer profile form for shipment tracking updates (keeping mandatory financial receipts and cancellation confirmations active).
  - Extended `public.email_logs` with `status IN ('queued', 'sent', 'failed', 'suppressed')`, `idempotency_key` (unique partial index `idx_email_logs_idempotency_key_unique`), `attempt_count`, `max_attempts`, `failure_type` (`'transient' | 'permanent' | 'suppressed'`), `last_error`, `next_retry_at`, `suppressed_reason`, `provider_message_id`, and `sent_at`.
- **Pipeline Hardening (`apps/web/lib/integrations/resend/service.ts` & `templates.ts`):**
  - Enforced deterministic `idempotency_key` deduplication across `sendOrderEmails()`, `sendAdminNewOrderNotification()`, and `sendShipmentNotification()`, checking terminal `status === "sent"` / `"suppressed"` / `"permanent"` failure states so previously failed transient deliveries are eligible for retry rather than permanently blocked.
  - Enforced pre-send suppression rules (`resolveOrderEmailSuppressionReason`, `isValidEmailAddress`) for invalid recipients, deleted accounts, cancelled/failed orders, unpaid `payment_success` triggers, non-delivered `delivered` triggers, and opted-out shipment updates, persisting `'suppressed'` rows in `email_logs`.
  - Wrapped `client.emails.send` with a gateway timeout (`Promise.race`) and bounded exponential-backoff retry loop (`EMAIL_DEFAULT_MAX_ATTEMPTS = 3`), stopping immediately on permanent `4xx`/validation/suppression errors (`classifyEmailError`).
  - Fixed `0 || 35` and `0 || 10` falsy fee coercion in `resend/service.ts` and `templates.ts` using `??` so valid `₹0.00` fees render accurately.
- **Admin Visibility (`apps/web/lib/admin/orders.ts`, `apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx`):**
  - Added non-sensitive `emailLogs` summary telemetry onto `getAdminOrderById()` and rendered delivery status, attempts, `failure_type`, `suppressed_reason`, and `last_error` cleanly on the admin order detail view.

---

## 4. Invoice Eligibility, Indian GST Validation & Document Security

- **Mod-36 GSTIN Validation & Full 36-State Jurisdiction Mapping (`apps/web/lib/env/shared.ts`, `apps/web/lib/commerce/tax.ts`, `20261114000001`):**
  - Implemented `validateIndianGstin()` / `calculateGstinCheckDigit()` / `isValidGstStateCode()` in TypeScript and `public.is_valid_gstin()` in PostgreSQL to enforce the official 15-character structure, valid Indian GST state codes (`01`–`38`, `97`, `99`), and Luhn mod-36 check-digit verification.
  - Updated `isValidProductionGstin()` to require full mod-36 checksum validation and reject development/placeholder GSTINs. Updated Phase 01 test fixture `BUSINESS_GSTIN` to `"07AABCU9603R1ZP"` so production env tests use a mod-36 valid sample.
  - Expanded `normalizeStateToGstCode()` and added `public.resolve_indian_state_gst_code()` covering all Indian states and union territories (including Ladakh `38`, Telangana `36`, Puducherry `34`, Andaman & Nicobar `35`, DNHDD `26`, plus PIN-prefix fallbacks) and `getGstStateName()`.
- **Strict Eligibility & Accounting Reconciliation (`apps/web/lib/commerce/invoices.ts`, `generate_order_invoice_atomic`, `/api/documents/*`):**
  - Added `checkOrderInvoiceEligibility()` in `tax.ts` and matching SQL guards in `generate_order_invoice_atomic()`: blocks `Cancelled`/`Returned` orders, `Failed`/`Refund Pending`/`Refunded` payments, unpaid `ONLINE` orders (`Pending`), and uncollected pre-delivery `COD` orders; allows confirmed paid `ONLINE` and delivered/collected/reconciled `COD` orders.
  - Added `platform_fee`, `customer_gstin`, `seller_state_code`, and `place_of_supply_code` onto `public.invoices` (and `customer_gstin` onto `public.orders`) so `(subtotal - discount) + platform_fee + shipping_charges = grand_total` reconciles accurately.
  - Preserved immutable issued invoices on repeat calls, surfacing cumulative post-invoice processed refunds (`refundSummary`) and blocking credit-note issuance on `failed` refund attempts.
  - Updated `GET /api/documents/invoice/[orderId]`, `receipt/[orderId]`, and `refund/[refundId]` to return semantic HTTP `4xx` codes (`400`/`404`/`409`/`422`) instead of `500` for business rejections, escape all rendered HTML strings via `escapeHtml()`, display dynamic `seller_state_code` + `place_of_supply_code`, render `platform_fee`, optional customer GSTIN, and post-invoice refund adjustments.
  - Gated customer/admin `Invoice` action links cleanly with `checkOrderInvoiceEligibility()`.

---

## 5. Shipping Fee & Pricing Single Source of Truth

- Added pure pricing module `apps/web/lib/commerce/pricing.ts` exporting `PLATFORM_FEE = 10`, `DELIVERY_FEE = 35`, `roundCurrency()`, `toPaise()`, `calculateDiscountedUnitPrice()`, `calculateLineTotal()`, `calculateOrderFees()`, and `calculateOrderPricing()`, aligned 1-to-1 with PostgreSQL `calculate_cart_pricing` and `create_order_atomic` (`ROUND(..., 2)` precision).
- Resolved `BUSINESS_CONFIG.shipping.standardShippingFee` discrepancy in `apps/web/lib/config/business.ts` (`49` -> `DELIVERY_FEE` = `35`) and exposed `platformFee: PLATFORM_FEE`, updating `apps/web/app/shipping-policy/page.tsx` to disclose both charges accurately.
- Unified `apps/web/lib/commerce/cart.ts`, `apps/web/lib/commerce/cart-context.tsx`, and `apps/web/app/checkout/CheckoutClient.tsx` to share `pricing.ts`, eliminating the prior whole-rupee `Math.round()` vs 2-decimal `toFixed(2)` discrepancy between guest cart previews and server/database totals.

---

## 6. Verification Results & Scope

All Phase 05 checks and regression suites executed cleanly in **offline isolation** (no live Supabase, Razorpay, Resend, or Delhivery network calls):

- `./node_modules/.bin/tsx scripts/test-phase05-payments-emails-invoices.ts`: **12 passed, 0 failed** (covers fail-closed payment verification, capture/currency/amount/order-id guards, cross-order payment uniqueness, webhook in-flight lock & terminal state updates across every branch, partial-refund concurrency & timeout recovery, email dedup/suppression/transient-retry/permanent-stop, zero-fee template rendering, mod-36 GSTIN validation, 36-state GST routing, strict invoice eligibility, `platform_fee` + partial refund reconciliation, pricing SSOT parity, and migration assertions).
- `./node_modules/.bin/tsx scripts/test-phase01-environment-safety.ts`: **17 passed, 0 failed** (updated sample GSTIN fixture to checksum-valid `"07AABCU9603R1ZP"` and bounded-retry assertion `<= 3` for `sendLowStockAlertEmail`).
- `./node_modules/.bin/tsx scripts/test-phase02-checkout-hardening.ts`: **14/14 passed**.
- `./node_modules/.bin/tsx scripts/test-phase03-admin-order-management.ts`: **12 passed, 0 failed**.
- `./node_modules/.bin/tsx scripts/test-phase04-delivery-returns.ts`: **8 passed, 0 failed**.
- `./node_modules/.bin/tsx scripts/test-delhivery-missing-credentials.ts`: **12 passed, 0 failed**.
- `./node_modules/.bin/tsx scripts/test-phase09-unit-and-business-logic.ts`: **28/28 passed**.
- `npm run typecheck` (`tsc --noEmit`): **0 errors**.
- `npm run lint` (`eslint .`): **0 errors** (3 pre-existing warnings in unrelated UI files).
- `npm run build` (`next build`): **Exited 0**.

### Remaining Live Staging / Sandbox Checks Needed

- Migrations `20261111000001_phase02_checkout_hardening.sql`, `20261112000001_phase03_admin_roles_order_management.sql`, `20261113000001_phase04_delivery_and_returns_hardening.sql`, and `20261114000001_phase05_payments_emails_invoices_hardening.sql` have **not** been applied to any remote database yet due to offline isolation rules; apply sequentially to a dedicated development/staging Supabase database before production rollout.
- Live/sandbox API round-trips against Razorpay (`payments.fetch`, `payments.refund`, webhook signatures), Resend, Delhivery, and PostgreSQL invoice SQL execution remain to be verified against isolated sandbox credentials.
