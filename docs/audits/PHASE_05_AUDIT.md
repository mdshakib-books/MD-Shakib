# Phase 05 Pre-Implementation Audit — Payments, Emails, Invoices & Shipping Fees

**Branch:** `new-fix`  
**Audit Date:** 2026-11-11  
**Baseline Migration:** `20261113000001_phase04_delivery_and_returns_hardening.sql`  
**Target Migration:** `supabase/migrations/20261114000001_phase05_payments_emails_invoices_hardening.sql`  

---

## 1. End-to-End Flow Trace Summary

1. **Cart -> Checkout -> Order Creation -> Payment:**
   `CartProvider` / `getCustomerCart` / `getGuestCartDetails` (`apps/web/lib/commerce/cart-context.tsx`, `cart.ts`) -> `CheckoutClient.tsx` -> `placeOrderOnline` / `placeOrderCOD` (`orders.ts`) -> `executeOrderCheckout` (`orders-core.ts`) -> PostgreSQL `create_order_atomic` (`20261111000001`) -> `createRazorpayOrder` (`prepare_payment_attempt_atomic`) -> `/api/payments/verify` (`verifyAndSettlePayment`) & `/api/webhooks/razorpay` (`processRazorpayWebhook`) -> `settle_payment_atomic`.
2. **Refunds & Reconciliation:**
   Cancellation (`orders-core.ts`) / Return (`returns.ts`) / Late capture webhook (`webhook.ts`) -> `initiateRazorpayRefund` (`razorpay/service.ts`) -> `record_refund_atomic` -> Razorpay webhooks (`refund.created`, `refund.processed`, `refund.failed`). COD offline payouts follow Phase 04 `complete_cod_refund_atomic`.
3. **Transactional Emails:**
   Order placement, Razorpay settlement/webhook, cancellation, shipment dispatch/delivery (`orders-core.ts`, `razorpay/service.ts`, `razorpay/webhook.ts`, `admin/orders.ts`) -> `sendOrderEmails` / `sendAdminNewOrderNotification` / `sendShipmentNotification` (`resend/service.ts`, `templates.ts`) -> `email_logs`.
4. **Invoices & GST:**
   Customer/Admin document download (`/api/documents/invoice/[orderId]/route.ts`, `/receipt/[orderId]`, `/refund/[refundId]`, `/packing-slip/[orderId]`) -> `getOrCreateOrderInvoice` (`invoices.ts`) -> `generate_order_invoice_atomic` (`20261110000001`) + `calculateOrderTaxBreakdown` (`tax.ts`) + `isValidProductionGstin` (`env/shared.ts`).

---

## 2. Verified Findings & Root Causes

### A. Razorpay Payments & Refunds
1. **Silent capture fabrication on remote fetch failure (`apps/web/lib/integrations/razorpay/service.ts:320-354`):**
   `verifyAndSettlePayment` catches `client.payments.fetch(razorpay_payment_id)` errors and silently falls back to a synthetic `{ status: "captured", currency: "INR", amount }` payload. It also never verifies `remotePayment.id === razorpay_payment_id`, `remotePayment.order_id === razorpay_order_id`, `remotePayment.status === "captured"`, `currency === "INR"`, or exact paise amount equality. An `"authorized"` (uncaptured), mismatched, or failing remote check can settle.
2. **Missing DB payment uniqueness on `orders.razorpay_payment_id` & capture status check in SQL (`settle_payment_atomic`):**
   `payments.provider_payment_id` is `UNIQUE`, but `orders.razorpay_payment_id` has no partial `UNIQUE` index (`WHERE razorpay_payment_id IS NOT NULL`), and `settle_payment_atomic` validates currency/amount from `p_raw_response` without checking capture status when status fields are present.
3. **Razorpay webhook lock & terminal state leaks (`apps/web/lib/integrations/razorpay/webhook.ts:70-99, 104-339`):**
   - Concurrent/in-flight webhook delivery (`existingEvent.status === "processing"`) falls through and executes concurrently instead of returning `in_flight_duplicate`.
   - Every early `ignored`, `rejected`, `unhandled_event`, and `refund_triggered` path returns without updating `webhook_events.status`, leaving rows stuck in `'processing'` permanently.
   - `order.paid` / `payment.captured` does not inspect `paymentEntity?.status` (e.g., rejecting non-captured entities when present), and `refund.*` webhooks do not validate `refundEntity?.currency === 'INR'`, positive refund amount bounds, or `rpcRes?.success === false` (e.g., conflict/downgrade).
4. **Refund retry & partial-refund race gaps (`razorpay/service.ts:517-650, 685-921`; `record_refund_atomic`):**
   - `priorMatch` idempotency guard only exits early for `status === "processed"`; active `'pending'`/`'processing'` partial refunds with a real `gateway_refund_id` fall past the `if (remainingRefundable <= 0)` poll guard and can trigger a second `client.payments.refund` call.
   - Timeouts/5xx errors in `client.payments.refund` immediately record `'failed'` without checking `fetchMultipleRefund` or preserving uncertain `'pending'` status, and `record_refund_atomic` only increments `attempt_count` on `'pending'`/`'processing'` (not `'failed'`), keeping retry sequence stuck.
   - `record_refund_atomic` sets `orders.refund_amount = CASE WHEN v_effective_settled > 0 THEN v_effective_settled ELSE p_refund_amount END`, letting a pending/failed attempt overwrite cumulative settled totals incorrectly when `v_effective_settled = 0`.

### B. Transactional Email Suppression & Retries
1. **Unbounded duplicates & broken deduplication (`apps/web/lib/integrations/resend/service.ts:208-299, 315-324, 393-402`):**
   - `sendOrderEmails` has zero deduplication (`order_confirmation`, `payment_success`, `order_cancellation` send again on every call).
   - `sendAdminNewOrderNotification` and `sendShipmentNotification` query `email_logs` by `(order_id, event_type)` without filtering `status = 'sent'`, permanently blocking retries after failures and risking `.maybeSingle()` errors if >1 log row exists.
2. **Missing suppression, retries, timeouts, and failure classification:**
   - No suppression of stale/contradictory events (`payment_success` / `order_confirmation` / `shipped` / `out_for_delivery` / `delivered` on `Cancelled` / `Failed` orders; missing recipient email format check; no user preference suppression flag on `profiles`).
   - Single-shot `resend.emails.send` with no timeout, no bounded retry/backoff, and no distinction between transient errors (`429`, `5xx`, network/timeout) and permanent errors (`4xx` invalid recipient/domain/suppressed).
   - `email_logs` lacks `idempotency_key`, `attempt_count`, `max_attempts`, `failure_type`, `last_error`, `next_retry_at`, and `suppressed_reason`.
3. **Zero-fee coercion bug (`resend/service.ts:262-264`, `templates.ts:121-125`):**
   `Number(order.delivery_fee || 35)` and `Number(order.platform_fee || 10)` override valid `0` fee values.

### C. Invoice Eligibility & GST Validation
1. **Unpaid & cancelled orders can generate tax invoices (`20261110000001:242-310`, `invoices.ts:35-103`):**
   `generate_order_invoice_atomic` validates seller GSTIN and order existence only; `ONLINE` `Pending`/`Failed` orders, uncollected pre-delivery `COD` orders, and cancelled unpaid orders can generate invoices. Cancelled/fully-refunded orders require blocking/credit-note handling rather than issuing fresh tax invoices.
2. **Accounting mismatch (`platform_fee` omitted from `invoices`):**
   `orders` includes `platform_fee` (`₹10.00`) in `total_amount`, whereas `invoices` only stores `subtotal`, `discount_amount`, `taxable_value`, tax components, `shipping_charges`, and `grand_total`. Consequently, `subtotal - discount + shipping != grand_total`.
3. **Incomplete GSTIN checksum & Indian state mapping:**
   - `isValidProductionGstin` (`env/shared.ts:110-118`) and SQL check length/regex only without verifying the Indian GSTIN mod-36 check digit (15th character). Optional customer B2B GSTIN (`customer_gstin`) is not supported/validated.
   - `generate_order_invoice_atomic` maps only 6 state codes (`07, 09, 06, 27, 10, 19`, others -> `'99'`), disagreeing with `tax.ts` and potentially misclassifying Intra-State (CGST+SGST) vs Inter-State (IGST).
   - `/api/documents/invoice/[orderId]/route.ts:50-165` renders raw interpolated strings without HTML escaping (XSS risk), hardcodes `State: Delhi (07)`, omits `platform_fee` / customer GSTIN / refund credit notice, and returns `500` on invoice eligibility rejections instead of `400`/`409`/`422`.

### D. Shipping Fee & Pricing Consistency
1. **Policy config mismatch (`apps/web/lib/config/business.ts:84` & `app/shipping-policy/page.tsx:45`):**
   `BUSINESS_CONFIG.shipping.standardShippingFee` is `49`, whereas `cart.ts`, `cart-context.tsx`, `calculate_cart_pricing`, `create_order_atomic`, and `test-remediation-01` enforce `DELIVERY_FEE = 35` and `PLATFORM_FEE = 10` (`₹45` combined fixed fees).
2. **Customer vs Guest cart rounding mismatch (`cart.ts:128, 388` & `cart-context.tsx:181`):**
   `getCustomerCart` and SQL (`calculate_cart_pricing`, `create_order_atomic`) round discounted unit price to 2 decimal places (`ROUND(..., 2)`), whereas `getGuestCartDetails` and `syncFromGuestStorage` use whole-rupee `Math.round(...)` and miss 2-decimal subtotal rounding (`cart.ts:151`, `cart-context.tsx:130, 171`).
3. **No single TypeScript pricing module:**
   Fee constants (`10`, `35`) and rounding arithmetic are duplicated across `cart.ts`, `cart-context.tsx`, `CheckoutClient.tsx`, `business.ts`, and `resend/service.ts`.

---

## 3. Phase 05 Hardening Plan

1. **Migration `20261114000001_phase05_payments_emails_invoices_hardening.sql` + `database.types.ts`:**
   - Partial unique index on `orders(razorpay_payment_id)` and unique `email_logs(idempotency_key)`.
   - Extend `email_logs` with `idempotency_key`, `attempt_count`, `max_attempts`, `failure_type`, `last_error`, `next_retry_at`, `suppressed_reason` (+ `'suppressed'` status) and `profiles` with `email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE`.
   - Extend `invoices` with `platform_fee`, `customer_gstin`, `seller_state_code`, `place_of_supply_code` and `orders` with `customer_gstin`.
   - Add SQL `is_valid_gstin(TEXT)` (regex + mod-36 check digit) and `resolve_indian_state_gst_code(TEXT, TEXT)` covering all 36 Indian states/UTs + Ladakh (`38`).
   - Harden `settle_payment_atomic`, `record_refund_atomic`, `generate_order_invoice_atomic` (strict eligibility + `platform_fee` + full state mapping + GSTIN checksum), and align `calculate_cart_pricing` / `create_order_atomic` / `get_payment_report` if needed.
2. **TypeScript Pricing & GSTIN SSOT:**
   - Add `apps/web/lib/commerce/pricing.ts` (`PLATFORM_FEE = 10`, `DELIVERY_FEE = 35`, 2-decimal currency rounding, authoritative item & order totals) and `gstin` checksum validation in `apps/web/lib/commerce/tax.ts` & `env/shared.ts`.
   - Wire `business.ts`, `cart.ts`, `cart-context.tsx`, `CheckoutClient.tsx`, and `resend/templates.ts` to use the shared helper and fix `0` fee coercion.
3. **Razorpay Service & Webhook Hardening (`razorpay/service.ts`, `razorpay/webhook.ts`):**
   - Fail closed in `verifyAndSettlePayment` on fetch error or payment entity mismatch (`id`, `order_id`, `status === 'captured'`, `currency === 'INR'`, `amount`).
   - Reconcile active/uncertain partial & full refunds via `fetchMultipleRefund`, preserve `'pending'` on uncertain timeouts/5xx instead of false `'failed'`, increment retry counters accurately, and finalize every `webhook_events` branch cleanly (`completed`/`failed`/`in_flight_duplicate`).
4. **Resend Email Reliability (`resend/service.ts`, `lib/auth/actions.ts`, `ProfileClient.tsx`, `admin/orders`):**
   - Deterministic `idempotency_key` deduplication across all email functions (`status = 'sent'`), order/status/recipient suppression rules + user preference respect for optional notifications, bounded exponential-backoff retries with timeout and transient vs permanent classification, truthful `email_logs` recording, and admin visibility on order detail.
5. **Invoice Eligibility & Rendering (`commerce/invoices.ts`, `api/documents/invoice/[orderId]/route.ts`, `/refund/[refundId]`, `/receipt/[orderId]`):**
   - Validate invoice eligibility, GSTIN checksum (seller + optional customer), `platform_fee` & partial refund reconciliation, HTML escaping, accurate `seller_state_code` header, and proper HTTP `409`/`422`/`400` status codes.
6. **Offline Test Suite & Verification:**
   - Implement `apps/web/scripts/test-phase05-payments-emails-invoices.ts` and verify Phase 05 + Phase 01–04 + `typecheck` + `lint` + `build` offline.
