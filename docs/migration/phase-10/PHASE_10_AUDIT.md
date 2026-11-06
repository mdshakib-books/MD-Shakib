# Phase 10: Performance, Security & Production Optimization — Initial Audit & Strategy
## Project: MD Shakib Islamic Books

**Phase:** 10 — Performance, Security & Production Optimization  
**Repository Working Directory:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`  
**Application Path:** `apps/web`  
**Git Branch:** `new-fix`  
**Head Commit:** `2cfa9e0` (*new: PHASE-09 Testing*)  
**Audit Timestamp:** November 6, 2026  
**Status:** Initial Audit Complete — Baseline Established  

---

## 1. GIT WORKING-TREE & REPOSITORY STATUS

In strict compliance with execution safety rules:
- **Current Branch:** `new-fix`
- **Working Tree State:** Completely clean (`nothing to commit, working tree clean`).
- **Modified, Staged, or Untracked Files:** 0 pre-existing untracked or uncommitted changes prior to Phase 10 initiation.
- **Safety Protocol:** Zero destructive git operations (`reset`, `rebase`, `commit`, `push`, `stash`, `clean`) will be executed. All changes are confined to non-destructive source code optimizations, testing harnesses, and documentation.

---

## 2. REVIEW OF PHASES 07, 08 & 09 OUTSTANDING FINDINGS

A thorough review of documentation and findings from previous phases was conducted:

### Phase 07: Animation & Micro-Interactions
- **Status:** Complete (14/14 automated tests passed, 8/8 targeted acceptance audits passed).
- **Core Web Vitals Baseline:** Desktop CLS on Home (`0.0000`), Books (`0.0000`), Cart (`0.0119`), Checkout (`0.0972`).
- **Outstanding Observations:**
  - Native CSS View Transitions `@view-transition { navigation: auto; }` progressive enhancement in Chromium 126+.
  - Next.js 16.4.3 Turbopack warning regarding `middleware.ts` convention recommending `proxy.ts` (retained to prevent auth regressions).
  - Luxury reduced-motion behavior verified (`prefers-reduced-motion: reduce`).

### Phase 08: Advanced UX & Accessibility
- **Status:** Complete (11/11 automated tests passed, 0 blocking accessibility defects).
- **Non-Blocking Technical Debt:**
  - 2 `@next/next/no-img-element` warnings in `AdminBooksClient.tsx` (line 362) and `MediaUploader.tsx` (line 185) due to rendering temporary local browser blob preview URLs (`URL.createObjectURL(file)`). Storefront routes correctly use responsive presentation.
  - Screen reader aria-live polite feedback added to `SearchBar.tsx`.

### Phase 09: Integration & End-to-End QA
- **Status:** Accepted (107/107 automated tests passed, 100% pass rate).
- **Defects Identified & Remediated in Phase 09:**
  - `DEF-01`: Replaced deprecated `/catalog` cache invalidation calls in admin modules with `/books` and `/`.
  - `DEF-02`: Fixed Razorpay key ID fallback in idempotent retry branch (`NEXT_PUBLIC_RAZORPAY_KEY_ID || RAZORPAY_KEY_ID`).
  - `DEF-03`: Deactivated 15+ stale test books with `is_active: false` restoring seeded titles to search suggestions.
  - `DEF-04`: Aligned test harness signatures with authoritative PostgreSQL stored procedures.
  - `DEF-05`: Configured local Supabase auth URL in standalone server environment.

---

## 3. ARCHITECTURE & DEPENDENCIES AUDIT

### 3.1 Technology Stack
- **Framework:** Next.js `16.4.3` (App Router, Turbopack)
- **Runtime:** Node.js `v22.23.3` on macOS
- **UI Library:** React `19.0.0` / React DOM `19.0.0`
- **Styling:** Tailwind CSS `v4.0.9`, PostCSS `8.5.3`
- **Database & Auth:** Supabase (`@supabase/ssr` `^0.12.7`, `@supabase/supabase-js` `^2.118.0`, CLI `^2.122.0`)
- **Payment Gateway:** Razorpay SDK `^2.9.8`
- **Media Delivery:** Cloudinary `^2.11.0`
- **Transactional Email:** Resend `^6.35.0`
- **Shipping Integration:** Delhivery Surface & Express APIs

### 3.2 Dependency Vulnerability Audit (`npm audit`)
- **Audit Execution:** Run against `apps/web/package.json` and lockfile.
- **Results:**
  - Critical Severity: **0**
  - High Severity: **0**
  - Moderate Severity: **8** (all isolated to devDependency `eslint-config-next` -> `typescript-eslint` -> `minimatch` GHSA-g3hv-75wg-m249; zero production bundle impact).
  - Low Severity: **0**
- **Action:** No blind `npm audit fix --force` will be executed; dev-only minimatch advisory does not affect production runtime.

---

## 4. EMPIRICAL BASELINE MEASUREMENTS

Baseline measurements were gathered on the untouched application running the optimized Next.js production build on port 3001 using Google Chrome 156.0.8078.80 via Lighthouse 13.6.0.

### 4.1 Lighthouse Baseline Scores (Untouched Storefront Homepage `/`)

| Category / Metric | Mobile (Baseline) | Desktop (Baseline) | Target Threshold |
| :--- | :--- | :--- | :--- |
| **Performance Score** | **99 / 100** | **86 / 100** | **90+** |
| **Accessibility Score** | **94 / 100** | **94 / 100** | **90+** |
| **Best Practices Score** | **96 / 100** | **100 / 100** | **90+** |
| **SEO Score** | **100 / 100** | **100 / 100** | **90+** |
| **First Contentful Paint (FCP)** | 1.7 s | 0.7 s | < 1.8 s |
| **Largest Contentful Paint (LCP)** | 1.7 s | **2.6 s** (Needs Fix) | < 2.5 s |
| **Cumulative Layout Shift (CLS)** | **0.000** | **0.000** | < 0.10 |
| **Total Blocking Time (TBT)** | 0 ms | 0 ms | < 200 ms |
| **Speed Index** | 1.7 s | 0.7 s | < 3.4 s |
| **Time to Interactive (TTI)** | 1.7 s | 2.6 s | < 3.8 s |

### 4.2 Identified Performance Bottlenecks
1. **Render-Blocking External Google Font `@import`:**
   - In `apps/web/app/globals.css`, Line 1:
     `@import url("https://fonts.googleapis.com/css2?family=Cinzel:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700&display=swap");`
   - Lighthouse identifies **417 ms wasted time** waiting for external network stylesheets from Google Fonts.
   - Eliminating the blocking `@import` and utilizing `next/font/google` will self-host fonts with zero layout shift and eliminate external network roundtrips.

2. **Unoptimized 3540px Hero CSS Background Image:**
   - In `apps/web/components/layout/HeroSection.tsx`, lines 17-21:
     `backgroundImage: url("https://plus.unsplash.com/premium_photo-1677231559663-b9f6a7c33c77?q=80&w=3540&auto=format&fit=crop...")`
   - Lighthouse identifies this element as the desktop **Largest Contentful Paint (LCP)** causing a 2.6s delay.
   - Because it is set via CSS inline background-image on a `div`, it is not discoverable during initial HTML preload scanning and downloads an oversized 3540px asset.
   - Converting to Next.js `<Image />` with `priority`, `fill`, and responsive `sizes` will allow modern WebP/AVIF delivery and immediate HTML discovery.

3. **Storefront Product Images Using Raw `<img>`:**
   - In `apps/web/components/commerce/BookCard.tsx`, raw `<img>` tags load uncompressed 600x900 images into 189x283 display containers.
   - Lighthouse identifies **140 KiB wasted image bytes** across catalog book cards.
   - Replacing with responsive Next.js `<Image />` components will optimize formats and resolutions.

---

## 5. SECURITY & DEFENSE AUDIT

### 5.1 API Security & Rate Limiting Gap
- **Audit Result:** Zero rate-limiting logic is currently active in Next.js middleware, API routes, or server actions.
- **Vulnerability:** Sensitive routes (`/api/payments/*`, `/api/webhooks/*`, auth server actions) are vulnerable to credential stuffing, brute-force requests, and automated scraping.
- **Remediation Plan:** Implement a robust rate limiting engine (`lib/security/rate-limit.ts`) with distinct thresholds for:
  - Authentication (5 req / min per IP)
  - Payment Order Creation & Verification (10 req / min per IP)
  - Public Search & Catalog (60 req / min per IP)
  - Webhooks (120 req / min per IP)
  - Standard API fallback (30 req / min per IP)

### 5.2 Middleware Route Protection Boundary
- **Audit Result:** In `apps/web/middleware.ts`, `isProtectedRoute` includes `/profile`, `/addresses`, `/orders`, `/checkout`, and `/admin`.
- **Gap:** `/account` subroutes (`/account/addresses`, `/account/security`, `/account/payments`, `/account/refunds`, `/account/replacements`) rely solely on server component page redirects.
- **Remediation Plan:** Add `pathname.startsWith("/account")` to `middleware.ts` to enforce authentication rejection at the edge before route computation.

### 5.3 Webhook Verification Integrity
- **Audit Result:**
  - Razorpay webhook (`/api/webhooks/razorpay/route.ts` & `lib/integrations/razorpay/webhook.ts`) verifies raw request body HMAC SHA-256 against `RAZORPAY_WEBHOOK_SECRET` using `crypto.timingSafeEqual`.
  - Atomic database stored procedure `settle_payment_atomic` is invoked with pessimistic row locking.
  - Replay and downgrade attacks are blocked (`settle_payment_atomic` ignores duplicates; `record_payment_failure_atomic` refuses to downgrade paid orders).

### 5.4 Database Query & Schema Indexes
- **Audit Result:**
  - Core tables (`profiles`, `books`, `orders`, `payments`, `addresses`, `reviews`) have RLS enabled and validated.
  - Query review revealed high-frequency queries that can benefit from composite indexes:
    - Catalog pagination: `(is_active, created_at DESC)` on `public.books`.
    - Customer orders list: `(user_id, created_at DESC)` on `public.orders`.
    - Rate limit storage: `rate_limits (key, window_start)` with automatic expiry pruning.

---

## 6. SEO, SITEMAP & STRUCTURED DATA AUDIT

- **Sitemap:** Currently **missing**. No `sitemap.ts` exists in `apps/web/app`.
- **Robots:** Currently **missing**. No `robots.ts` exists in `apps/web/app`.
- **Metadata Coverage:** Only 5 pages contain explicit metadata. Missing on `/books`, `/books/[id]`, `/cart`, `/checkout`, `/contact`.
- **JSON-LD Structured Data:** Currently **missing** across all storefront pages.
- **Remediation Plan:**
  - Implement dynamic `app/sitemap.ts` indexing public store routes and all active books.
  - Implement `app/robots.ts` disallowing admin, checkout, account, and API routes while permitting public storefront.
  - Implement comprehensive Open Graph, Twitter cards, and canonical URLs on all public routes.
  - Embed schema.org JSON-LD structured data: `Organization`, `WebSite`, `Book`, `Product`, and `BreadcrumbList`.

---

## 7. OBSERVABILITY & LOGGING AUDIT

- **Audit Result:** Application logs rely on unformatted `console.error` and `console.warn` statements without redaction or structured JSON fields.
- **Health Check Endpoint:** Currently **missing**. No `/api/health` exists for container orchestration, uptime pingers, or load balancers.
- **Remediation Plan:**
  - Implement structured, redacted production logger `apps/web/lib/logger.ts` preventing leakage of credentials, tokens, cookies, and payment secrets.
  - Implement `/api/health` providing database connectivity status, system uptime, and environment health checks.

---

## 8. PHASE 10 EXECUTION ROADMAP

| Step | Focus Area | Key Objectives |
| :--- | :--- | :--- |
| **Step 1** | Font & LCP Optimization | Replace `@import` with `next/font/google`; optimize Hero background image with Next.js `<Image priority fill />`. |
| **Step 2** | Image Delivery Optimization | Update `next.config.ts` remote patterns; convert `BookCard.tsx`, `BookDetailClient.tsx` to Next.js `<Image />` with responsive `sizes` and aspect-ratio preservation. |
| **Step 3** | Rate Limiting & Edge Hardening | Implement `lib/security/rate-limit.ts`; integrate into API routes; add `/account` to edge middleware. |
| **Step 4** | Database Query & Index Optimization | Add safe composite indexes (`idx_books_active_created_at`, `idx_orders_user_created_at`); verify zero N+1 queries. |
| **Step 5** | SEO, Sitemap, Robots & JSON-LD | Author `app/sitemap.ts`, `app/robots.ts`, dynamic metadata, and JSON-LD schemas. |
| **Step 6** | Production Logging & Health Check | Create `lib/logger.ts` with PII redaction; implement `/api/health` endpoint. |
| **Step 7** | Verification & Deliverables | Re-run Lighthouse (mobile & desktop), unit/integration suites, production build; publish all 6 Phase 10 reports. |

