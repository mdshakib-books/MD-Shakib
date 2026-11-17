# Phase 06 — Security & Performance Hardening Report

**Branch:** `new-fix`  
**Audit Report:** `docs/audits/PHASE_06_AUDIT.md`  
**Database Migration:** `supabase/migrations/20261115000001_phase06_security_performance_hardening.sql`  
**Verification Suite:** `apps/web/scripts/test-phase06-security-performance.ts`

---

## 1. Executive Summary & Honest Completion Status

Phase 06 implemented end-to-end database, API, security-header, tracking, query, caching, and asset performance hardening across the MD Shakib Islamic Books codebase while preserving all existing Phase 01–05 security, checkout, RBAC, delivery, return, payment, email, and GST invoice guarantees.

| Deliverable / Verification Layer | Status Classification | Notes |
|---|---|---|
| Pre-Implementation Audit (`docs/audits/PHASE_06_AUDIT.md`) | **Completed before implementation** | Full inventory of 62 active SQL functions, 39 RLS tables, 39 API routes, external integrations, queries, caches, and frontend assets. |
| SQL Security & Indexing Migration (`20261115000001`) | **Authored and offline SQL-audited; live DB push pending** | Ready to apply via Supabase migrations (`supabase db push`); not applied to a remote Supabase project during offline verification. |
| Security Headers, CSP, Middleware, Tracking, Health & API Hardening | **Implemented and offline verified** | Verified via unit/integration tests, TypeScript check, ESLint, and Next.js production build. |
| Live Pen-Test / Real PostgreSQL EXPLAIN ANALYZE / Core Web Vitals | **Pending runtime Supabase & production environment** | Query plan measurements, Postgres runtime RLS execution, and real-browser Lighthouse CWV require a running seeded PostgreSQL instance and browser target. |

---

## 2. Database Security & Performance Changes (`20261115000001_phase06_security_performance_hardening.sql`)

### 2.1 `SECURITY DEFINER` & Function `search_path` Hardening
- Audited all **62 active PostgreSQL functions** across migrations (`57` `SECURITY DEFINER`, `5` `SECURITY INVOKER`).
- Remediated all **10 functions** previously missing `pg_temp` (or `SET search_path` altogether):
  - `verify_delivery_otp_atomic`
  - `regenerate_delivery_otp_atomic`
  - `record_inventory_movement_atomic`
  - `reserve_replacement_inventory_atomic`
  - `anonymize_customer_account`
  - `get_sales_report`
  - `get_payment_report`
  - `get_inventory_report`
  - `protect_invoice_immutability`
  - `handle_updated_at`, `handle_default_address` (`SECURITY INVOKER` triggers)
- All 62 active functions now explicitly enforce `SET search_path = public, pg_temp`.

### 2.2 Internal Caller Authorization & Least-Privilege `REVOKE` / `GRANT`
- Added explicit internal `service_role` / `has_staff_permission(...)` / `auth.uid()` checks and applied `REVOKE ALL ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO postgres, service_role;`:
  - `verify_delivery_otp_atomic`, `regenerate_delivery_otp_atomic`
  - `record_inventory_movement_atomic`, `reserve_replacement_inventory_atomic`
  - `anonymize_customer_account` (requires `service_role` or matching `auth.uid() = p_user_id`)
  - `get_sales_report`, `get_payment_report`, `get_inventory_report` (also fixed `get_inventory_report` to query schema-valid `inventory_reservations.status = 'reserved'` instead of `'active'`).
- Applied explicit `REVOKE ALL ... FROM PUBLIC, anon; GRANT EXECUTE ... TO authenticated, service_role;` on authenticated RPCs and RLS permission helpers: `adjust_inventory_atomic`, `admin_update_user_role`, `moderate_review_atomic`, `update_customer_status`, `validate_discount_coupon`, `is_admin`, `is_active_user`, and `can_*` helpers (preserving `is_staff()` execution on `anon, authenticated, service_role` for `books_select_public`).

### 2.3 RLS Policy Hardening
- **`phone_verifications`**: Replaced overly permissive `FOR ALL USING (user_id = auth.uid())` policy (`"phone_verifications_customer"`) with service-role-only policy `"phone_verifications_service_only"` and `REVOKE ALL ... FROM PUBLIC, anon, authenticated`.
- **`delivery_otps`**: Dropped `"delivery_otps_owner_read"` (preventing customers from selecting `otp_hash` directly via PostgREST), kept `delivery.verify` staff access + added explicit `service_role` policy; customers receive OTPs exclusively via `/api/delivery/otp` (`adminDb`).
- **`ticket_messages`**: Updated `"messages_customer_insert"` (`TO authenticated`) to require `is_staff = FALSE`, blocking forged staff replies through PostgREST.
- **`book_variants`**: Updated `"variants_read_public"` to restrict anonymous reads to active variants whose parent book is active (`books.is_active = TRUE`) or `public.is_staff()`.
- **`invoices`**: Explicitly scoped `"invoices_customer_read"` and `"invoices_admin_all"` to `TO authenticated`.

### 2.4 Composite & Partial Indexes Added (12 Indexes)
- `idx_books_active_category_created`, `idx_books_active_price_id` (catalog filtering & sorting)
- `idx_book_variants_active_book` (active book variants)
- `idx_reviews_book_approved_created`, `idx_reviews_status_created` (storefront approved reviews & admin moderation queue)
- `idx_return_requests_status_created` (admin returns queue)
- `idx_support_tickets_customer_updated`, `idx_support_tickets_status_updated` (customer ticket history & staff SLA queue)
- `idx_inventory_reservations_expired_reserved` (cron worker expired ONLINE reservation cleanup)
- `idx_orders_order_status_created`, `idx_orders_payment_status_created` (admin order filtering)
- `idx_orders_shipping_awb_nonnull` (AWB lookup for shipment tracking & webhooks)

---

## 3. Application Security Hardening

### 3.1 Content Security Policy, Security Headers & Middleware
- **`apps/web/next.config.ts`**:
  - Stripped `'unsafe-eval'`, `http://127.0.0.1:54321`, `http://localhost:54321`, and `ws://...` origins from `NODE_ENV === "production"` CSP.
  - Removed unused third-party CDNs (`https://cdn.jsdelivr.net`, `https://unpkg.com`) because `/dotlottie-player.wasm` is self-hosted locally.
  - Retained `'unsafe-inline'` in `script-src` only because Next.js App Router static/ISR pages emit inline bootstrap hydration scripts without per-request dynamic nonces; `'wasm-unsafe-eval'` remains scoped for self-hosted WebAssembly on `/about`.
  - Added `upgrade-insecure-requests` (production), `Cross-Origin-Resource-Policy: same-origin`, and `Cross-Origin-Opener-Policy: same-origin-allow-popups` (compatible with Razorpay 3DS checkout popups).
- **`apps/web/middleware.ts`**:
  - Attaches `x-request-id` correlation headers across requests/responses.
  - Fast-paths `/api/webhooks/*`, `/api/cron/*`, and anonymous public requests with no `sb-*` session cookies so public catalog pages avoid unnecessary `supabase.auth.getUser()` calls, while keeping full session verification on protected routes (`/account`, `/profile`, `/addresses`, `/orders`, `/checkout`, `/admin`), auth routes, and authenticated requests.

### 3.2 `/api/health` & `/api/shipping/track` Hardening
- **`apps/web/app/api/health/route.ts`**:
  - Added per-IP rate limiting (`search` tier), `?probe=live|ready` distinction, `withHardTimeout(..., 3000)` DB readiness check, and `503` fail-closed response when `?probe=ready` detects database or environment failure.
  - Redacts `environment` topology (`appEnv`, `mockServicesAllowed`, `configuredServices`, `serviceModes`, `issueCount`) and `uptimeSeconds` on unauthenticated production/staging HTTP requests while keeping authorized diagnostic probes (`HEALTH_CHECK_SECRET` / `CRON_SECRET`) and local offline unit compatibility intact.
- **`apps/web/app/api/shipping/track/route.ts` & `apps/web/lib/integrations/delhivery/service.ts`**:
  - Enforced per-IP rate limiting, strict AWB regex validation (`^[A-Za-z0-9_-]{4,40}$`), and fail-closed `503 { configured: false }` when Delhivery is disabled/unconfigured.
  - Required authenticated user session (`401` otherwise) and verified matching order/shipment ownership (`user_id === user.id`) or active staff `"orders.view"` permission (`403`/`404` otherwise), rejecting manual non-Delhivery carriers (`422`) without external API calls.
  - Added a bounded 60-second in-memory normalized tracking cache (`MAX_TRACKING_CACHE_ENTRIES = 500`) to avoid redundant Delhivery lookups on repeat views.

### 3.3 API Route Validation, Upload Bounds, XSS & CSV Formula Safety
- **`apps/web/lib/security/http.ts`**: Shared UUID/AWB validators, `readBoundedTextBody`/`readBoundedJsonBody` (128 KB JSON / 512 KB webhook caps), `sanitizeClientErrorMessage`, `serverErrorResponse` with correlation IDs, `withHardTimeout`, `sanitizeAttachmentUrls` (HTTPS-only, blocks internal hosts/`javascript:`/`data:`), `escapeCsvCell` (neutralizes `=`, `+`, `-`, `@`, `\t`, `\r` formula prefixes), and `NO_STORE_HEADERS`.
- **Critical Route Fixes:**
  - `apps/web/app/api/admin/books/[id]/variants/route.ts`: Added `verifyAdminApi("books.view")` and UUID validation on `GET` (previously completely unauthenticated).
  - `apps/web/app/api/documents/packing-slip/[orderId]/route.ts`: Escaped all dynamic HTML interpolations with `escapeHtml(...)` and enforced `isValidUuid` + `NO_STORE_HEADERS`; added `isValidUuid`, rate limiting, and `NO_STORE_HEADERS` to `invoice`, `receipt`, and `refund` document routes.
  - `apps/web/app/api/admin/media/upload/route.ts` & `lib/integrations/cloudinary/service.ts`: Enforced 5 MB file size limit *before* buffering `file.arrayBuffer()`, and added a bounded 15-second upload stream timeout.
  - `apps/web/app/api/admin/books/import/route.ts` & `{orders,books,customers}/export/route.ts` + `lib/admin/{reports,catalog-io}.ts`: Added 2 MB CSV upload cap, formula injection neutralization via `escapeCsvCell`, and bounded export row limits (`5000`).
  - `apps/web/app/api/auth/phone/{send-otp,verify-otp}/route.ts`, `account/anonymize/route.ts`, `delivery/otp/route.ts`, `reviews/route.ts`, `wishlist/route.ts`, `support/tickets/**`, `returns/{create,eligibility}/route.ts`, `payments/{create-order,verify}/route.ts`, `webhooks/{razorpay,delhivery}/route.ts`, and `admin/**` operational routes: Applied rate limiting, UUID validation, bounded request parsing, blocked-staff checks on support ticket routes, attachment sanitization, and redacted error responses.
- **`apps/web/lib/security/rate-limit.ts` & `apps/web/lib/logger.ts`**: Capped in-memory rate limit and alert deduplication maps against unbounded key flooding; extended logger redaction to mask `rzp_live_`, `re_`, `whsec_`, `sb_secret_`, and `private_key` patterns while keeping test-verified safe fields intact.

---

## 4. Performance, Caching & Frontend Improvements

- **Public Catalog Caching (`apps/web/lib/cache/catalog.ts`, `apps/web/lib/data/catalog.ts`):**
  - Sanitized PostgREST `.or()` structural delimiters (`[,()]`) alongside `LIKE` wildcards (`%`, `_`, `\`) in `sanitizeSearchPattern`.
  - Replaced `select("*")` with explicit `PUBLIC_BOOK_SELECT_COLUMNS` projection in `getBooks`, `getBookById`, and `getFeaturedBooks`.
  - Wrapped `getBookById` in React `cache()` (eliminating duplicate queries between `generateMetadata` and `BookDetailPage`) and added `withSafePublicCatalogCache` (`unstable_cache`, 60s revalidate, tag-indexed `catalog:books`, `catalog:featured`, `catalog:categories`, `catalog:book:<id>`), automatically invalidated in `lib/admin/{books,inventory,categories,catalog-io,orders}.ts` and `lib/commerce/orders.ts`.
  - Private customer/order/financial/admin endpoints remain strictly uncached in shared server caches with `NO_STORE_HEADERS`.
- **N+1 & Serial Query Elimination:**
  - `apps/web/lib/commerce/orders.ts` (`getCustomerReplacements`): Replaced per-order loop querying `order_items` with a single batched `.in("order_id", orderIds)` fetch.
  - `apps/web/lib/admin/orders.ts` (`getAdminOrderById`): Parallelized 7 sequential sub-queries via `Promise.all([...])`.
  - `apps/web/lib/commerce/reviews.ts` (`getBookReviews`): Bounded `page`/`limit` and parallelized paginated reviews + rating summary queries via `Promise.all([...])`.
- **Frontend Asset & Rendering Optimizations:**
  - `apps/web/app/books/[id]/page.tsx`: Changed `dynamic = "force-dynamic"` to `export const revalidate = 60`.
  - `apps/web/app/layout.tsx`: Reduced `Cinzel` font weights (`400`, `600`, `700`) to trim unused `.woff2` downloads while keeping typography unchanged.
  - `apps/web/components/admin/MediaUploader.tsx` & `apps/web/app/admin/books/AdminBooksClient.tsx`: Added `loading="lazy"`, `decoding="async"`, and explicit image dimensions on raw `<img>` thumbnails.

---

## 5. Verification Results (Latest Run After Final Edit)

| Check / Suite | Command | Result |
|---|---|---|
| Phase 06 Security & Performance Suite | `./node_modules/.bin/tsx scripts/test-phase06-security-performance.ts` | **18 / 18 PASSED (0 failed)** |
| Phase 01 Environment & Safety Suite | `./node_modules/.bin/tsx scripts/test-phase01-environment-safety.ts` | **17 / 17 PASSED (0 failed)** |
| Phase 02 Checkout Hardening Suite | `./node_modules/.bin/tsx scripts/test-phase02-checkout-hardening.ts` | **14 / 14 PASSED (0 failed)** |
| Phase 03 Admin & Order Management Suite | `./node_modules/.bin/tsx scripts/test-phase03-admin-order-management.ts` | **12 / 12 PASSED (0 failed)** |
| Phase 04 Delivery & Returns Suite | `./node_modules/.bin/tsx scripts/test-phase04-delivery-returns.ts` | **8 / 8 PASSED (0 failed)** |
| Phase 05 Payments, Emails & Invoices Suite | `./node_modules/.bin/tsx scripts/test-phase05-payments-emails-invoices.ts` | **12 / 12 PASSED (0 failed)** |
| Delhivery Missing Credentials Safety Suite | `./node_modules/.bin/tsx scripts/test-delhivery-missing-credentials.ts` | **12 / 12 PASSED (0 failed)** |
| Phase 09 Unit & Business Logic Suite | `./node_modules/.bin/tsx scripts/test-phase09-unit-and-business-logic.ts` | **28 / 28 PASSED (0 failed)** |
| TypeScript Check | `npm run typecheck` (`tsc --noEmit`) | **PASS (0 errors)** |
| ESLint | `npm run lint` (`eslint .`) | **PASS (0 errors, 3 pre-existing warnings)** |
| Next.js Production Build | `npm run build` | **PASS (compiled successfully; 49/49 pages generated)** |

---

## 6. Deployment & Operations Notes

1. Apply database migrations including `supabase/migrations/20261115000001_phase06_security_performance_hardening.sql` to your target Supabase environment before deploying the Next.js build.
2. Set a strong `CRON_SECRET` / `HEALTH_CHECK_SECRET` (>= 16 non-placeholder characters) in production if monitoring probes require detailed `/api/health` diagnostics; unauthenticated production health probes intentionally return only minimal readiness status.
3. Monitor Razorpay/Delhivery CSP violations after deploying production build with `'unsafe-eval'` removed (`upgrade-insecure-requests` enabled).
