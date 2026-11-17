# Phase 06 Pre-Implementation Audit — Security & Performance Hardening

**Branch:** `new-fix`  
**Audit Date:** 2026-11-11  
**Baseline Migration:** `20261114000001_phase05_payments_emails_invoices_hardening.sql`  
**Target Migration:** `supabase/migrations/20261115000001_phase06_security_performance_hardening.sql`

---

## 1. Repository & Attack Surface Inventory

| Domain | Observed Scope | Audit Status |
|---|---|---|
| **Database Migrations** | 25 SQL files (`20261028000001` – `20261114000001`) | Audited completely |
| **PostgreSQL Functions** | 62 active functions (`57` `SECURITY DEFINER`, `5` `SECURITY INVOKER`) | 8 `SECURITY DEFINER` + 2 `SECURITY INVOKER` + privilege grants flagged |
| **RLS Tables** | 39 tables (all have `ENABLE ROW LEVEL SECURITY`) | 4 policy security/exposure flaws flagged |
| **API Route Handlers** | 39 routes under `apps/web/app/api/**` | Audited completely (`shipping/track`, `health`, `admin/books/[id]/variants`, `documents/*`, `auth/phone/*`, `reviews`, `support/*`, webhooks, exports) |
| **Middleware & Headers** | `apps/web/middleware.ts`, `apps/web/next.config.ts` | Audited CSP, security headers, SSR auth overhead |
| **External Integrations** | Razorpay, Delhivery, Resend, Cloudinary, Supabase | Audited timeouts, SDK config, error sanitization |
| **Queries, Caching & Frontend** | `lib/data/catalog.ts`, `lib/admin/*`, `lib/commerce/*`, `app/**`, `components/**` | Audited indexes, N+1/sequential queries, CSV exports, caching, LCP/assets |

---

## 2. Prioritized Audit Findings

### Critical Findings

#### CRIT-01: Unauthenticated Privilege Escalation & Cross-Tenant Corruption in Phase 02 `SECURITY DEFINER` RPCs
- **Evidence:** `supabase/migrations/20261109000006_phase02_complete_features.sql`
  - `verify_delivery_otp_atomic` (lines 287–409): `SECURITY DEFINER`, `SET search_path = public` (omits `pg_temp`), **no caller authorization check**, and **no `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`**.
  - `regenerate_delivery_otp_atomic` (lines 412–447): `SECURITY DEFINER`, `SET search_path = public` (omits `pg_temp`), **no caller authorization check**, and **no `REVOKE EXECUTE`**. An attacker can overwrite `delivery_otps.otp_hash` on any order and immediately verify delivery with the attacker-chosen hash.
  - `record_inventory_movement_atomic` (lines 662–739) & `reserve_replacement_inventory_atomic` (lines 742–766): `SECURITY DEFINER`, `SET search_path = public` (omits `pg_temp`), **no caller authorization check**, **no `REVOKE EXECUTE`**. Any `anon`/`authenticated` PostgREST RPC caller can decrement/corrupt inventory across any book or variant.
  - `anonymize_customer_account(p_user_id)` (lines 769–805): `SECURITY DEFINER`, `SET search_path = public` (omits `pg_temp`), **no `auth.uid()` / `service_role` check**, **no `REVOKE EXECUTE`**. Any `anon`/`authenticated` caller can permanently anonymize another user's profile and delete their saved addresses, wishlists, and phone verifications.
- **Remediation:** Recreate all 5 functions with `SET search_path = public, pg_temp`, enforce explicit internal authorization (`service_role` / `is_admin()` / `has_staff_permission()` / `auth.uid() = p_user_id` where applicable), and `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role, postgres;`.

---

### High Findings

#### HIGH-01: Unauthenticated Admin Endpoint Exposure (`GET /api/admin/books/[id]/variants`)
- **Evidence:** `apps/web/app/api/admin/books/[id]/variants/route.ts:5-16` calls `getBookVariants(id)` (which uses `createAdminClient()` in `apps/web/lib/catalog/variants.ts:21-44` to return all active + inactive variants and exact internal stock counts) without calling `verifyAdminApi(...)`, whereas `POST` on line 24 enforces `verifyAdminApi("inventory.manage")`.
- **Remediation:** Enforce `verifyAdminApi("books.view")` and UUID validation on `GET /api/admin/books/[id]/variants`, plus rate limiting and safe error responses.

#### HIGH-02: Stored HTML/XSS Vulnerability in Warehouse Packing Slip Endpoint
- **Evidence:** `apps/web/app/api/documents/packing-slip/[orderId]/route.ts:47, 75-94, 114-116` interpolates untrusted customer/order strings (`slip.orderNumber`, `slip.customerName`, `addr.house_no`, `addr.area`, `addr.city`, `addr.state`, `addr.pincode`, `addr.phone`, `slip.courier`, `slip.awb`, `item.title`, `item.sku`) raw into `text/html` without `escapeHtml(...)` (unlike `invoice`, `receipt`, and `refund` routes). Also missing `Cache-Control: private, no-store` on all 4 `/api/documents/*` HTML endpoints.
- **Remediation:** Escape all interpolated values via `escapeHtml(...)`, validate UUID format for `orderId`/`refundId`, and add `Cache-Control: private, no-store` and `X-Content-Type-Options: nosniff` on all document endpoints.

#### HIGH-03: Public `/api/shipping/track` Open-Proxy Abuse, AWB Enumeration & Missing Ownership Enforcement
- **Evidence:** `apps/web/app/api/shipping/track/route.ts:8-46` directly passes any unauthenticated `?awb=` query string to `trackShipment(awb)`:
  - No AWB syntax validation or length bound.
  - No authentication or order ownership verification when Delhivery is operational (any unauthenticated caller can enumerate AWBs, consume Delhivery quota, and retrieve origin/destination/scan cities).
  - No short-TTL normalized tracking cache per AWB (repeated page loads trigger redundant external Delhivery API requests).
  - Does not set `configured: false` on `DelhiveryDisabledError` consistently alongside `DelhiveryConfigurationError`.
- **Remediation:** Validate `awb` format (`^[A-Za-z0-9_-]{4,40}$`), enforce per-IP + per-user rate limiting, fail closed (`503 { configured: false }`) cleanly when Delhivery is disabled/unconfigured (preserving offline credential checks), require authenticated session + verify AWB belongs to an order owned by `user.id` or `orders.view` staff (`403`/`404` otherwise), prevent external Delhivery calls for non-Delhivery manual couriers, cache normalized tracking responses with a short bounded TTL, and return `Cache-Control: private, no-store`.

#### HIGH-04: Public `SECURITY DEFINER` Business Intelligence RPCs & Missing `pg_temp` Search Paths
- **Evidence:**
  - `get_sales_report` (`20261109000006:808-836`) and `get_inventory_report` (`20261109000006:867-892`): `SECURITY DEFINER`, `SET search_path = public` (omits `pg_temp`), no caller check, and executable by `PUBLIC` (`anon` + `authenticated`). Exposes store gross revenue, COD totals, refunds, and stock counts to anonymous callers.
  - `get_payment_report` (`20261113000001:1151-1188`): has `SET search_path = public, pg_temp`, but no caller check and no `REVOKE EXECUTE FROM PUBLIC, anon, authenticated`.
  - `protect_invoice_immutability` (`20261110000001:22-39`): `SECURITY DEFINER` trigger with `SET search_path = public` (omits `pg_temp`).
  - `adjust_inventory_atomic`, `admin_update_user_role`, `moderate_review_atomic`, `update_customer_status`, `validate_discount_coupon`: missing explicit `REVOKE EXECUTE ... FROM PUBLIC, anon` (relying on implicit `PUBLIC` default execute grant).
- **Remediation:** Harden search paths (`SET search_path = public, pg_temp`) across all remaining functions (including `handle_updated_at` and `handle_default_address`), add `service_role` / staff auth checks inside reporting RPCs, and apply explicit least-privilege `REVOKE`/`GRANT` statements in migration `20261115000001`.

#### HIGH-05: RLS Policy Bypass Risks on `phone_verifications`, `delivery_otps`, `ticket_messages`, and `book_variants`
- **Evidence:**
  - `phone_verifications` (`"phone_verifications_customer"`, `20261109000006:981`): `FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())` allows an authenticated user via browser Supabase client to read `otp_hash` and directly `UPDATE is_verified = TRUE` without entering a valid OTP. App code accesses `phone_verifications` exclusively via `createAdminClient()` in `lib/auth/phone.ts`.
  - `delivery_otps` (`"delivery_otps_owner_read"`, `20261109000006:921-928`): allows customers to `SELECT *` (including `otp_hash`) directly via Supabase client while `Out for Delivery`. App code accesses `delivery_otps` exclusively via `createAdminClient()` in `lib/delivery/otp.ts`.
  - `ticket_messages` (`"messages_customer_insert"`, `20261109000006:974-977`): `WITH CHECK` allows customers to insert `is_staff = TRUE`, spoofing official staff replies.
  - `support_tickets` (`route.ts` / `[id]/route.ts` / `[id]/messages/route.ts`): inline role check on lines `18-24` does not check `!profile.is_blocked && !profile.is_deleted`, allowing a blocked staff user to act as `isStaff = true`, and attachment URLs are not validated.
- **Remediation:** Lock `phone_verifications` to `service_role`, restrict `delivery_otps` `SELECT` to `has_staff_permission('delivery.verify')` / `service_role`, constrain `messages_customer_insert` with `AND is_staff = FALSE` (`TO authenticated`), check `!is_blocked && !is_deleted` in support routes, and validate attachment URLs.

#### HIGH-06: Health Endpoint Information Disclosure & Unbounded Check (`/api/health`)
- **Evidence:** `apps/web/app/api/health/route.ts:1-81` runs an unbounded `supabase.from("books").select("id").limit(1)` query without timeout or rate limit, and returns `appEnv`, `mockServicesAllowed`, `envValid`, `configuredServices`, `serviceModes`, and `uptimeSeconds` unauthenticated in all environments (including production).
- **Remediation:** Add per-IP rate limiting, bounded DB probe timeout (`AbortSignal` / promise race `3000ms`), `?probe=live|ready` support (returning `503` when DB check fails in readiness mode), and **redact sensitive environment topology (`serviceModes`, `mockServicesAllowed`, `configuredServices`, `uptimeSeconds`, `issues`) in production/preview unless authorized by `HEALTH_CHECK_SECRET` / `CRON_SECRET`**, while preserving local/test diagnostics expected by Phase 01 tests (`test-phase01-environment-safety.ts` & `test-delhivery-missing-credentials.ts`).

#### HIGH-07: Over-Permissive Content Security Policy & Missing Resource Isolation Header (`next.config.ts`)
- **Evidence:** `apps/web/next.config.ts:6-19, 32-89`
  - `connect-src` permanently allows `http://127.0.0.1:54321`, `http://localhost:54321`, `ws://...`, plus `https://cdn.jsdelivr.net` and `https://unpkg.com` (unused because `AboutMissionLottie.tsx:13` self-hosts `/dotlottie-player.wasm`).
  - Missing `Cross-Origin-Resource-Policy: same-origin` header and `X-DNS-Prefetch-Control`.
  - Documented evaluation of `'unsafe-inline'` / `'unsafe-eval'`: Next.js App Router inline hydration scripts and Razorpay `checkout.js` require care; production CSP can drop `'unsafe-eval'` cleanly (keeping `'wasm-unsafe-eval'` only where `@lottiefiles/dotlottie-react` WASM runs on `/about` or removing `'unsafe-eval'` in prod) and remove `localhost`/`cdn.jsdelivr.net`/`unpkg.com` from production CSP while rolling out nonce/report-only safely.
- **Remediation:** Separate development vs production CSP rules in `next.config.ts` (drop `http://127.0.0.1:54321`, `ws://*`, `cdn.jsdelivr.net`, `unpkg.com`, and `'unsafe-eval'` in production; restrict `supabase.co` cleanly; add `Cross-Origin-Resource-Policy: same-origin` and `Report-To`/tightened directives without breaking Razorpay Checkout, Next.js hydration, or `@lottiefiles/dotlottie-react`).

---

### Medium Findings

#### MED-01: Missing Rate Limiting & Raw Error Leakage on Customer/Auth/Admin API Routes
- **Evidence:**
  - Zero rate limiting on `/api/auth/phone/send-otp` & `/api/auth/phone/verify-otp` (OTP brute-force/SMS DoS), `/api/account/anonymize`, `/api/delivery/otp`, `/api/reviews`, `/api/wishlist`, `/api/support/tickets/**`, `/api/returns/**`, `/api/admin/**` (31+ routes).
  - Unbounded JSON/multipart payload parsing on webhooks (`/api/webhooks/razorpay`, `/api/webhooks/delhivery`), `/api/admin/media/upload`, and `/api/admin/books/import`.
  - Raw internal `err.message` returned in 500/400 JSON bodies across `account/anonymize`, `auth/phone/*`, `reviews`, `wishlist`, `support/tickets/*`, `admin/orders`, `admin/orders/export`, `admin/books/*`, `admin/customers/export`, `payments/*`.
  - Missing UUID validation on route params (`[id]`, `[orderId]`, `[refundId]`, `bookId`, `returnId`), causing avoidable PostgreSQL `22P02` syntax errors.
  - `lib/security/rate-limit.ts` `memoryStore` and `lib/logger.ts` `alertDeduplicationMap` lack max-entry caps under key-flooding.
- **Remediation:** Introduce shared API hardening helpers (safe error responder, UUID validator, body-size / upload-size guard, bounded map eviction in `rate-limit.ts` & `logger.ts`) and apply `checkRateLimit` + input validation + redacted `500` responses across unguarded routes.

#### MED-02: CSV Formula Injection & Unbounded Export Queries
- **Evidence:** `apps/web/lib/admin/reports.ts:125-132, 254-260` and `apps/web/lib/admin/catalog-io.ts:14-21`:
  - `escapeCsv()` does not neutralize leading `=`, `+`, `-`, `@`, `\t`, or `\r` characters, enabling spreadsheet formula injection when opened in Excel/Sheets.
  - `exportOrdersToCsv`, `exportCustomersToCsv`, and `exportBooksToCsv` execute unbounded table queries without `.limit(...)`, and `exportCustomersToCsv` fetches every non-cancelled order row into Node memory.
- **Remediation:** Harden `escapeCsv()` against formula injection, bound export row limits, and optimize `get_payment_report`/customer exports.

#### MED-03: Middleware Runs `supabase.auth.getUser()` on Public/Webhook/Health Requests
- **Evidence:** `apps/web/middleware.ts:1-82` executes `createServerClient` + `supabase.auth.getUser()` on every request matching `/((?!_next/static|_next/image|...).*)` — including `/api/health`, `/api/webhooks/*`, `/api/cron/*`, `/api/shipping/serviceability`, `/`, `/books`, `/about` even when **no Supabase session cookie (`sb-*`) exists** on anonymous public traffic.
- **Remediation:** Fast-path public/webhook/cron/unauthenticated requests cleanly: bypass `getUser()` when the request has no `sb-*` auth cookie on public routes (still calling `getUser()` when a `sb-*` cookie is present so logged-in SSR state & auth-page redirects work identically, and always enforcing redirects on protected routes `/account`, `/profile`, `/addresses`, `/orders`, `/checkout`, `/admin`). Also attach `x-request-id` correlation header for observability.

#### MED-04: PostgREST `.or()` Filter Metacharacter Injection & Over-Fetching in Catalog & Order Queries
- **Evidence:**
  - `apps/web/lib/data/catalog.ts:101-102`: `escapeLikePattern` escapes `%`, `_`, `\` but leaves `,`, `(`, `)` unsanitized before interpolation into `.or(\`title.ilike.%${sanitized}%,author.ilike.%${sanitized}%\`)`.
  - `apps/web/lib/commerce/orders.ts:264-275`: `getCustomerReplacements()` has an N+1 query (`for (const order of orders) { await supabase.from("order_items")... }`).
  - `apps/web/lib/admin/orders.ts:211-258`: `getAdminOrderById()` runs 7 sequential queries instead of `Promise.all(...)`.
  - `apps/web/app/books/[id]/page.tsx`: calls `getBookById(id)` twice (once in `generateMetadata`, once in `BookDetailPage`) with no React `cache()` / server data cache, and calls `getBooks` with `count: "exact"` for similar books.
  - `apps/web/lib/data/catalog.ts` & storefront list views use `select("*")`, `apps/web/app/books/page.tsx` and `/books/[id]` set `force-dynamic`, and zero `unstable_cache` / `revalidateTag` usage exists across the codebase.
- **Remediation:**
  - Sanitize PostgREST delimiters (`[,()]`) in `lib/data/catalog.ts` and select projected list columns on catalog list/featured queries.
  - Introduce React `cache()` + public `unstable_cache` (tagged `"books"`, `"featured-books"`, `"book:<id>"`, `"categories"`) for anonymous public catalog reads via `createPublicClient()` (keeping dynamic/mock-test paths intact and invalidating with `revalidateTag` in `lib/admin/books.ts`, `lib/admin/categories.ts`, `lib/admin/inventory.ts`, `lib/admin/catalog-io.ts`, `lib/commerce/orders-core.ts`!).
  - Never cache private customer/financial/order/admin queries in shared `unstable_cache`.
  - Batch `getCustomerReplacements` `order_items` into a single `.in("order_id", orderIds)` query and parallelize `getAdminOrderById` sub-queries via `Promise.all`.

#### MED-05: Missing Composite & Partial Database Indexes for Hot Filtering & Worker Paths
- **Evidence:** Cross-referencing `CREATE INDEX` statements across all 25 migrations against application queries (`orders`, `books`, `reviews`, `return_requests`, `support_tickets`, `inventory_reservations`, `audit_logs`, `email_logs`, `book_variants`) identifies missing targeted indexes:
  - `books`: composite partial index for active catalog category/newest `(category, created_at DESC) WHERE is_active = TRUE` and price sorting `(is_active, price, id)` where `is_active = TRUE`.
  - `book_variants`: active lookup `(book_id, created_at) WHERE is_active = TRUE`.
  - `reviews`: product review page query `(book_id, created_at DESC) WHERE status = 'approved'` + moderation queue `(status, created_at DESC)`.
  - `return_requests`: customer & status queue `(status, created_at DESC)` and `(customer_id, created_at DESC)`.
  - `support_tickets`: customer portal `(customer_id, updated_at DESC)` and admin queue `(status, updated_at DESC)`.
  - `inventory_reservations`: expiry cron worker `release_expired_reservations_atomic` `(expires_at) WHERE status = 'reserved'`.
  - `orders`: admin filtered pagination `(order_status, created_at DESC)` and `(payment_status, created_at DESC)` and active shipment tracking lookup `(shipping_awb) WHERE shipping_awb IS NOT NULL`.
  - `profiles`: admin customer listing `(role, created_at DESC)`.
- **Remediation:** Add only justified composite/partial indexes in `20261115000001_phase06_security_performance_hardening.sql` (avoiding duplicates of existing indexes).

#### MED-06: RLS `book_variants` Public Read Exposes Inactive Variants & Archived Books
- **Evidence:** `supabase/migrations/20261109000006_phase02_complete_features.sql:914`: `"variants_read_public"` uses `FOR SELECT USING (true)`.
- **Remediation:** Restrict public `SELECT` to active variants of active books (`is_active = TRUE AND EXISTS (SELECT 1 FROM public.books b WHERE b.id = book_variants.book_id AND b.is_active = TRUE)`), or `public.is_staff()`.

---

### Low / Performance Polish Findings

#### LOW-01: Frontend Font Weights, Raw `<img>` Tags & Static Catalog Revalidation
- **Evidence:**
  - `apps/web/app/layout.tsx:8-20` downloads 6 weights of `Cinzel` (`400..900`) and 5 weights of `Inter` (`300..700`) even though UI predominantly uses 3–4 weights.
  - `apps/web/components/admin/MediaUploader.tsx:185` and `apps/web/app/admin/books/AdminBooksClient.tsx:362` render raw `<img>` tags without dimensions/lazy loading (`loading="lazy" decoding="async"`) or Next `<Image>` optimization; `/api/admin/media/upload` calls `file.arrayBuffer()` before verifying file size (`MAX_IMAGE_SIZE_BYTES = 5MB`).
  - `apps/web/app/books/[id]/page.tsx` and `/books` set `force-dynamic`, bypassing Next.js ISR/caching even for public anonymous catalog views. (Check if searchParams in `/books` allow `revalidate` or `unstable_cache` underneath — wrapping `getBooks`/`getBookById`/`getFeaturedBooks` in `unstable_cache` accelerates SSR even when `/books` reads dynamic `searchParams`!).
  - `apps/web/lib/env/server.ts` + `lib/integrations/*`: Add explicit bounded `timeoutMs` on Cloudinary upload (`timeout: 15000`) and verify all external SDK timeouts/retries cleanly.

---

## 3. Target Migration Scope (`20261115000001_phase06_security_performance_hardening.sql`)

1. Harden `SET search_path = public, pg_temp`, internal caller checks, and `REVOKE/GRANT` for:
   - `verify_delivery_otp_atomic`
   - `regenerate_delivery_otp_atomic`
   - `record_inventory_movement_atomic`
   - `reserve_replacement_inventory_atomic`
   - `anonymize_customer_account`
   - `get_sales_report`, `get_payment_report`, `get_inventory_report`
   - `protect_invoice_immutability`, `handle_updated_at`, `handle_default_address`
   - Explicit `REVOKE EXECUTE ... FROM PUBLIC, anon` + least-privilege `GRANT` on `adjust_inventory_atomic`, `admin_update_user_role`, `moderate_review_atomic`, `update_customer_status`, `validate_discount_coupon`.
2. Fix RLS policies on:
   - `phone_verifications` (service-role only; block customer direct `otp_hash` / `is_verified` tampering)
   - `delivery_otps` (remove customer direct `otp_hash` SELECT; keep `delivery.verify` staff + service-role)
   - `ticket_messages` (`messages_customer_insert`: enforce `TO authenticated` + `is_staff = FALSE`)
   - `book_variants` (`variants_read_public`: enforce active variant + active book or `is_staff()`)
3. Add 9 justified composite/partial performance indexes on `books`, `book_variants`, `reviews`, `return_requests`, `support_tickets`, `inventory_reservations`, `orders`, and `profiles`.
