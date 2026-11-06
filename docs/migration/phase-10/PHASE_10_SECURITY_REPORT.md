# Phase 10: Performance, Security & Production Optimization — Security Architecture & Hardening Report
## Project: MD Shakib Islamic Books

**Phase:** 10 — Performance, Security & Production Optimization  
**Date:** November 2026  
**Status:** **PASSED — HARDENED & VERIFIED**  

---

## 1. EXECUTIVE SECURITY SUMMARY

Phase 10 established a defense-in-depth security posture across the entire stack. Every public entry point, authentication boundary, edge middleware route, webhook ingestion pipeline, and database table was inspected and hardened.

### Key Security Achievements:
1. **Distributed Rate Limiting Engine:** Implemented `lib/security/rate-limit.ts` backed by atomic PostgreSQL stored procedure `check_rate_limit` and resilient in-memory sliding window fallback.
2. **Edge Route Protection:** Extended `middleware.ts` to strictly protect `/account/*` alongside existing `/profile`, `/addresses`, `/orders`, `/checkout`, and `/admin` routes.
3. **Cryptographic Payment Webhook Hardening:** Audited and verified HMAC SHA-256 signature verification using raw request bodies and `crypto.timingSafeEqual`.
4. **Idempotency & Replay Protection:** Confirmed that duplicate webhook submissions and out-of-order `payment.failed` events cannot corrupt or downgrade confirmed orders.
5. **Supabase RLS Verification:** Verified Row Level Security policies across all 15 public tables, preventing unauthorized anonymous or cross-tenant customer access.
6. **Zero Critical/High Vulnerabilities:** Clean security audit across all production npm dependencies.
7. **Production Logging Redaction:** Implemented `lib/logger.ts` with deep recursive masking of passwords, OTPs, API keys, credit cards, and JWT tokens.

---

## 2. ROW LEVEL SECURITY (RLS) VERIFICATION MATRIX

Every table in the PostgreSQL database was verified against RLS policies for anonymous, authenticated customer, and administrator callers.

| Table Name | RLS Enabled | Anonymous Access | Authenticated Customer Access | Administrator Access | Verified Safeguards |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`public.profiles`** | **YES** | Blocked (0 rows) | Can SELECT & UPDATE only their own record (`auth.uid() = id`). Role escalation blocked. | Full SELECT, UPDATE, DELETE | Policy `profiles_update_policy` enforces `WITH CHECK (role = 'user' AND is_blocked = FALSE)`. Customer cannot make themselves admin. |
| **`public.addresses`** | **YES** | Blocked (0 rows) | Can SELECT, INSERT, UPDATE, DELETE only own records (`user_id = auth.uid()`). | Full access for order fulfilment | Customer A cannot view, mutate, or delete Customer B's saved shipping addresses. |
| **`public.books`** | **YES** | SELECT `is_active = true` only | SELECT `is_active = true` only | Full SELECT, INSERT, UPDATE, DELETE | Anonymous callers and regular customers cannot see unlisted/inactive drafts or modify book prices and inventory. |
| **`public.carts`** | **YES** | Blocked (0 rows) | Can SELECT, INSERT, DELETE only own cart (`user_id = auth.uid()`). | Full access | Guest cart exists strictly in client `localStorage` until authenticated atomic merge. |
| **`public.cart_items`** | **YES** | Blocked (0 rows) | Can query and mutate only items in their own cart (`cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())`). | Full access | Cross-tenant cart item injection blocked by foreign key and subquery check. |
| **`public.orders`** | **YES** | Blocked (0 rows) | Can SELECT only own orders (`user_id = auth.uid()`). Can UPDATE only `order_status IN ('Cancelled', 'Replacement Requested')`. | Full SELECT and UPDATE across all order states | Customer cannot modify `payment_status`, `is_paid`, `total_amount`, or `shipping_awb`. |
| **`public.order_items`** | **YES** | Blocked (0 rows) | Can SELECT only items belonging to their own orders. INSERT/UPDATE blocked. | Full access | Order items are immutable once written by atomic procedure `create_order_atomic`. |
| **`public.order_status_history`** | **YES** | Blocked (0 rows) | Can SELECT only history for own orders. Direct INSERT/UPDATE blocked. | Full access | Audit trail is populated strictly by database trigger `trg_order_status_history`. |
| **`public.payments`** | **YES** | Blocked (0 rows) | Can SELECT only payments for own orders (`user_id = auth.uid()`). Direct mutation BLOCKED. | Full access | Direct client INSERT/UPDATE is completely prohibited. Mutations require `service_role` backend procedures. |
| **`public.audit_logs`** | **YES** | Blocked (0 rows) | Blocked (0 rows) | Read-only access | Customer cannot view administrative audit logs. Writes restricted to server-side `service_role`. |
| **`public.email_logs`** | **YES** | Blocked (0 rows) | Blocked (0 rows) | Read-only access | Transactional email delivery logs are strictly administrative. |
| **`public.categories`** | **YES** | Public SELECT | Public SELECT | Full INSERT, UPDATE, DELETE | Public can view active categories; mutations require `public.is_admin()`. |
| **`public.inventory_adjustments`** | **YES** | Blocked (0 rows) | Blocked (0 rows) | Full access | Stock audit adjustments are confidential to inventory managers. |
| **`public.reviews`** | **YES** | SELECT `is_approved = true` | Can SELECT approved reviews and own reviews; can INSERT review for own user_id. | Full moderation access | Unapproved reviews hidden from public storefront. Duplicate reviews per book blocked by unique index `uq_reviews_book_user`. |
| **`public.discounts`** | **YES** | SELECT active & non-expired discounts | SELECT active & non-expired discounts | Full access | Inactive or expired coupon codes hidden; mutations require admin privilege. |
| **`public.rate_limits`** | **YES** | Blocked (0 rows) | Blocked (0 rows) | Full access | Distributed rate limit counters accessible only to `service_role` and administrators. |

---

## 3. AUTHENTICATION & AUTHORIZATION BOUNDARY

### 3.1 Edge Route Protection (`apps/web/middleware.ts`)
- **Protected Paths:**
  `pathname.startsWith("/account") || pathname.startsWith("/profile") || pathname.startsWith("/addresses") || pathname.startsWith("/orders") || pathname.startsWith("/checkout") || pathname.startsWith("/admin")`
- **Enforcement:**
  - Unauthenticated requests are immediately redirected to `/login?redirect=<target>` at the Edge before route computation or component loading begins.
  - Authenticated sessions arriving at guest auth routes (`/login`, `/register`, `/forgot-password`) are seamlessly redirected to `/profile`.
- **Open Redirect Protection:**
  - `sanitizeRedirectUrl()` strictly enforces that `redirect` query parameters must begin with a single `/` and cannot contain protocol-relative prefixes (`//`), backslashes (`\`), or control characters.

### 3.2 Administrative Authorization (`lib/admin/auth.ts`)
- **Server Guard (`requireAdmin()`):**
  - Validates active Supabase session.
  - Queries `public.profiles` for `role === 'admin'`.
  - Verifies `is_blocked === false` and `is_deleted === false`.
  - Unauthorized callers receive HTTP 403 Forbidden or redirection to `/?error=forbidden`.
  - Role checks cannot be bypassed through client-side state manipulation.

---

## 4. RATE LIMITING ENGINE & ABUSE MITIGATION

### 4.1 Architecture & Tier Configuration
The rate limiting engine (`apps/web/lib/security/rate-limit.ts`) evaluates client requests using a multi-tiered sliding-window token bucket:

| Tier Name | Max Requests | Window (Seconds) | Target Endpoints & Operations |
| :--- | :--- | :--- | :--- |
| **`auth`** | 5 | 60 | Customer login, registration, password reset, OTP verification |
| **`payment`** | 10 | 60 | `/api/payments/create-order`, `/api/payments/verify` |
| **`checkout`** | 15 | 60 | `/checkout` order placement (`placeOrderCOD`, `placeOrderOnline`) |
| **`contact`** | 5 | 60 | Contact form and customer support inquiries |
| **`search`** | 60 | 60 | Catalog text search queries and auto-suggest combobox |
| **`webhook`** | 120 | 60 | Razorpay (`/api/webhooks/razorpay`) and Delhivery webhooks |
| **`admin`** | 40 | 60 | Administrative management routes (`/api/admin/*`) |
| **`api`** | 30 | 60 | Default fallback for public shipping and serviceability APIs |

### 4.2 RFC-Compliant Responses
When a caller exceeds the allotted quota:
- Status Code: **HTTP 429 Too Many Requests**
- Headers Emitted:
  - `Retry-After: <seconds_remaining>`
  - `X-RateLimit-Limit: <tier_limit>`
  - `X-RateLimit-Remaining: 0`
  - `X-RateLimit-Reset: <epoch_timestamp>`
- Response Body:
  `{"error":"Too many requests. Please try again later.","limit":30,"remaining":0,"retryAfterSeconds":60}`

---

## 5. PAYMENT GATEWAY & WEBHOOK INTEGRITY

### 5.1 Cryptographic Signature Verification
- **Verification Routine:**
  `lib/integrations/razorpay/webhook.ts` captures the exact raw HTTP request body string before JSON parsing.
- **HMAC SHA-256 Calculation:**
  `crypto.createHmac("sha256", webhookSecret).update(rawBody).digest("hex")`
- **Timing-Safe Equality:**
  Compares expected signature against `x-razorpay-signature` header using `crypto.timingSafeEqual` to prevent timing-attack exploits.

### 5.2 Payment Settlement Idempotency
- **Atomic Settlement (`settle_payment_atomic`):**
  - Acquires a pessimistic row-level lock (`FOR UPDATE`) on the target order.
  - Verifies that the order is not already marked `Paid`.
  - Transitions `order_status = 'Confirmed'` and `payment_status = 'Paid'`.
  - If already settled, returns `{ status: "idempotent_ok", already_paid: true }` without triggering duplicate confirmation emails.
- **Late Failure Guard (`record_payment_failure_atomic`):**
  - If a delayed or out-of-order `payment.failed` webhook arrives after an order has already been marked `Paid`, the procedure explicitly refuses to downgrade the order, preventing false cancellations.

---

## 6. PRODUCTION LOGGING & PII REDACTION

### 6.1 Recursive Data Masking (`lib/logger.ts`)
All server-side logs pass through `redactSensitiveData()` prior to emission:
- **Redacted Field Patterns:** `password`, `secret`, `token`, `api_key`, `authorization`, `cookie`, `otp`, `signature`, `service_role`, `credit_card`, `cvv`, `pan`, `ssn`.
- **JWT Pattern Detection:** Detects any embedded string matching `eyJ[a-zA-Z0-9_-]{10,}\...` and substitutes `[REDACTED_JWT]`.
- **Safe Fields Preserved:** Operational identifiers (`userId`, `orderId`, `endpoint`, `timestamp`, `statusCode`) are preserved for incident investigation and monitoring.

---

## 7. DEPENDENCY VULNERABILITY AUDIT

### 7.1 Audit Summary
- **Tool:** `npm audit` on `apps/web`
- **Results:**
  - Critical Severity: **0**
  - High Severity: **0**
  - Moderate Severity: **8** (Isolated exclusively to devDependency `eslint-config-next` -> `typescript-eslint` -> `minimatch` GHSA-g3hv-75wg-m249).
  - Low Severity: **0**
- **Security Assessment:**
  The `minimatch` advisory impacts development-time linting workflows only. Zero vulnerable libraries are bundled or executed in production client or server runtimes. A blind `npm audit fix --force` was intentionally avoided to protect framework compatibility.

