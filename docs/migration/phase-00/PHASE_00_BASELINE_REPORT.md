# PHASE 00 — Baseline & Audit Freeze Report
## Comprehensive Migration Audit & Implementation Baseline

**Project:** MD Shakib Islamic Books (`mdshakib-books` / `MD-Shakib`)  
**Audit Phase:** Phase 00 — Baseline & Audit Freeze  
**Execution Date:** October 30, 2026  
**Audit Mode:** Strictly Read-Only Forensic Codebase & Artifact Audit  
**Authoritative Verdict:** **CONDITIONALLY COMPLETE — EXPLICIT GAPS REMAIN**  
**Action Directive:** **ALL CODE MODIFICATIONS FROZEN UNTIL USER APPROVES THIS BASELINE**

---

## 1. Executive Summary & Audit Mandate

This report establishes the authoritative, evidence-backed implementation baseline for the **MD Shakib Islamic Books** migration from a legacy decoupled stack (Vite + React 19 SPA, Express 5.2.1 REST API, MongoDB Mongoose ODM, and Socket.io) to a modern full-stack architecture (Next.js 16+ App Router, React 19, TypeScript strict mode, and Supabase PostgreSQL with Row Level Security).

The audit objective is to achieve **100% complete migration parity** with the legacy application across functionality, business logic, UI/UX fidelity, animations, integrations, responsiveness, accessibility, and production engineering quality.

In accordance with strict safety mandates:
- **`client/` and `server/` were treated as strictly READ-ONLY legacy sources of truth.** Zero files inside them were edited, renamed, moved, formatted, or restructured.
- **Git State is 100% frozen and preserved.** No commits, merges, resets, branches, or stashes were executed.
- **Zero database mutations occurred.** No migrations, seeds, RLS alterations, or schema updates were run against remote or local production databases.
- **Every assertion in this report is backed by direct repository code evidence.** No features were assumed complete based on route or component names.

---

## 2. Git Baseline & Change Protection Record

The exact Git state was captured prior to auditing and verified upon conclusion:

| Dimension | Verified State | Evidence & Notes |
|---|---|---|
| **Current Branch** | `audit` | Captured via `git branch --show-current`. |
| **Current HEAD Commit SHA** | `e80ff8f11f1c24a6c820ec31272f213b807ade20` | Commit message: `Merge pull request #28 from mdshakib-books/bug-fix`. |
| **Release Candidate Match** | `84b8803932189a522afe62571f8ca2ccf246ab45` verified | Commit `84b8803` is the direct ancestor commit merged into `main` via PR #28. |
| **Working Tree Status** | **0 Tracked Modifications (Clean Baseline)** | `git status -s` shows `?? docs/migration/phase-00/` containing Phase 00 docs. |
| **Tracked Modified Files** | None (0 files) | `git diff --stat` returns 0 changes. |
| **Existing Staged Changes** | None (0 files) | `git diff --cached --stat` returns 0 changes. |
| **Untracked Files** | Only new Phase 00 docs | Exactly 1 untracked directory: `docs/migration/phase-00/`. |
| **Legacy Directory Integrity** | **100% Preserved** | `client/` and `server/` trees match upstream git objects byte-for-byte. |

---

## 3. Discovered Legacy Application Footprint

A forensic inventory of `client/` and `server/` was conducted to capture every route, component, API endpoint, model, and business rule:

### 3.1 Legacy Frontend Footprint (`client/`)
- **Technology Stack:** Vite 7.3.1, React 19.2.0, Tailwind CSS v4.2.0, Redux Toolkit 2.11.2, React Router DOM 7.13.1, Socket.io-client 4.8.3, DotLottie 0.18.3, Chart.js 4.5.1.
- **Total Discovered Routes:** **26 routes** (25 functional page views + 1 wildcard 404 route in [`client/src/routes/AppRoutes.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/routes/AppRoutes.jsx)):
  1. `/` (`HomePage`)
  2. `/books` (`BooksPage`)
  3. `/books/:id` (`BookDetailsPage`)
  4. `/about` (`AboutPage`)
  5. `/support` (`SupportPage`)
  6. `/login` (`LoginPage`)
  7. `/register` (`RegisterPage`)
  8. `/verify-email` (`EmailVerificationPage`)
  9. `/verify-registration-otp` (`VerifyRegistrationOTPPage`)
  10. `/forgot-password` (`ForgotPasswordPage`)
  11. `/verify-otp` (`VerifyOTPPage`)
  12. `/reset-password` (`ResetPasswordPage`)
  13. `/cart` (`CartPage`)
  14. `/checkout` (`CheckoutPage` — Protected User)
  15. `/orders` (`OrdersPage` — Protected User)
  16. `/orders/:id` (`OrderDetailsPage` — Protected User)
  17. `/profile` (`ProfilePage` — Protected User)
  18. `/addresses` (`AddressesPage` — Protected User)
  19. `/order-success` (`OrderSuccessPage` — Protected User)
  20. `/admin` (`AdminDashboardPage` — Protected Admin)
  21. `/admin/dashboard` (`AdminDashboardPage` — Protected Admin)
  22. `/admin/books` (`AdminBooksPage` — Protected Admin)
  23. `/admin/books/add` (`AdminAddBookPage` — Protected Admin)
  24. `/admin/orders` (`AdminOrdersPage` — Protected Admin)
  25. `/admin/users` (`AdminUsersPage` — Protected Admin)
  26. `/admin/profile` (`AdminProfilePage` — Protected Admin)
  27. `*` (`NotFoundPage`)
- **UI Components:** 28 core reusable components across storefront, navigation, admin modals, and account forms.

### 3.2 Legacy Backend Footprint (`server/`)
- **Technology Stack:** Node.js (ESM), Express 5.2.1, Mongoose 9.2.1, MongoDB Atlas, Socket.io 4.8.3, Multer 2.0.2, Joi 18.0.2, Razorpay SDK 2.9.6, Google APIs 171.4.0 (Gmail REST API v1 OAuth2).
- **Total Discovered REST Endpoints:** **65 API endpoints** across 8 router modules:
  - Address Routes (`/api/v1/addresses`): 5 endpoints
  - Admin Routes (`/api/v1/admin`): 22 endpoints
  - Book Routes (`/api/v1/books`): 6 endpoints
  - Cart Routes (`/api/v1/cart`): 6 endpoints
  - Delivery Routes (`/api/v1/delhivery`): 3 endpoints
  - Order Routes (`/api/v1/orders`): 5 endpoints
  - Payment Routes (`/api/v1/payments`): 5 endpoints
  - User & Auth Routes (`/api/v1/users`): 13 endpoints
- **Database Models:** **9 Mongoose Schemas** (`User`, `Book`, `Address`, `Cart`, `Order`, `Payment`, `AuditLog`, `EmailLog`, `RegistrationOtp`).
- **Major Business Rule Domains:** **13 core domains** (Pricing & Discounts, Stock Availability, Cart Limits & Merging, Address Rules, Checkout Rules, Payment Transitions, Order Lifecycle, Cancellation Eligibility, Replacement Policies, User Moderation, Admin RBAC, Notification Triggers, Logistics Integration).

---

## 4. Current Target Architecture Footprint (`apps/web/` & `supabase/`)

- **Frontend & App Layer:** Next.js 16.4.3 (App Router), React 19.0.0, TypeScript 5.7.3 strict, Tailwind CSS v4.0.9 with PostCSS.
- **Database & Auth:** Supabase PostgreSQL with `@supabase/ssr` 0.12.7 and `@supabase/supabase-js` 2.118.0.
- **Relational Schema:** 10 application tables (`profiles`, `books`, `addresses`, `carts`, `cart_items`, `orders`, `order_items`, `order_status_history`, `payments`, `audit_logs`, `email_logs`) plus `auth.users`.
- **Database Migrations:** 6 migration scripts in [`supabase/migrations/`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/supabase/migrations):
  1. `20261028000001_core_schema.sql` (11 relational tables, constraints, foreign keys, indexes)
  2. `20261028000002_business_logic.sql` (Triggers, helper functions, `create_order_atomic`, `cancel_order_atomic`)
  3. `20261028000003_rls_policies.sql` (Row Level Security on all 11 tables, 26 policies)
  4. `20261029000001_auth_profile_trigger.sql` (Automated user profile provisioning trigger)
  5. `20261029000002_payment_settlement_atomic.sql` (Razorpay settlement stored procedure)
  6. `20261029000003_payment_security_and_refunds.sql` (Payment RPC privilege hardening & refund support)
- **External Integrations:**
  - Razorpay: Client SDK, HMAC-SHA256 signature verification, webhook handler, automated refunds.
  - Delhivery: Consignment creation, tracking, pincode serviceability, tracking webhook.
  - Resend: Transactional emails replacing Gmail OAuth2.
  - Cloudinary: Media upload and signed direct-upload Route Handlers.

---

## 5. Consolidated Feature Parity Breakdown

A total of **44 core features** spanning all modules were evaluated with forensic code inspection:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MIGRATION PARITY SUMMARY (44 FEATURES)               │
├───────────────────────────────┬────────────┬───────────────────────────┤
│ Status                        │ Count      │ Percentage                │
├───────────────────────────────┼────────────┼───────────────────────────┤
│ FULLY MIGRATED                │     19     │ 43.2%                     │
│ PARTIALLY MIGRATED            │     11     │ 25.0%                     │
│ NOT MIGRATED (MISSING)        │      9     │ 20.5%                     │
│ REGRESSED                     │      3     │  6.8%                     │
│ REPLACED (ARCHITECTURAL FIX)  │      2     │  4.5%                     │
│ UNVERIFIED                    │      0     │  0.0%                     │
│ BLOCKED                       │      0     │  0.0%                     │
├───────────────────────────────┼────────────┼───────────────────────────┤
│ TOTAL                         │     44     │ 100.0%                    │
└───────────────────────────────┴────────────┴───────────────────────────┘
```

> **Direct Audit Conclusion:**
> **19 features (43.2%) have achieved complete implementation parity** (plus 2 architectural replacements, total 21 features / 47.7%).
> **23 features (52.3%) have active defects, broken workflows, read-only stubs, or missing code requiring remediation in Phases 01 to 08.**
> **Zero features are currently verified at Tier 4 (Automated Browser / E2E) or Tier 5 (Live Production).**

---

## 6. Critical Confirmed Defects & Regressions

The following 7 defects are the highest-impact issues requiring immediate remediation in Phases 01 through 04:

1. **[P0] Storefront "Add to Cart" Disconnected Across Entire App (FEAT-10):**  
   Neither `page.tsx` nor `BooksCatalogClient.tsx` passes an `onAddToCart` handler to `<ProductGrid />` or `<BookCard />`. In `BookDetailClient.tsx` (lines 29–34), `handleAddToCart` is a dummy timer (`setAdded(true); setTimeout(...)`). The backend server action `addToCart` in `apps/web/lib/commerce/cart.ts` is never invoked. Users cannot add any books to the shopping cart.

2. **[P0] Admin Catalog is 100% Read-Only (FEAT-32):**  
   `apps/web/app/admin/books/page.tsx` renders a read-only table. It has zero buttons, modals, or server actions to create books, edit metadata, upload images to Cloudinary, adjust stock, change cover images, or delete books.

3. **[P0] Brand Gold CSS Variables Undefined Across 30+ Pages (FEAT-41):**  
   In `apps/web/app/globals.css`, the brand color is declared as `--color-gold: #C9A24A;` inside `@theme`. However, over 80 elements in 30+ files reference `var(--color-primary-gold)` and `var(--color-accent-gold)`. Because these are omitted from `:root`, gold typography, buttons, and borders fail to render properly unless an inline fallback is present.

4. **[P1] Guest Cart Eliminated Without Replacement (FEAT-09):**  
   Unauthenticated guests visiting `/cart` are blocked by a hard gate ("Sign In to View Your Cart"). Legacy supported a persistent localStorage cart that seamlessly merged into the database cart upon login.

5. **[P1] Customer Replacement Workflow Missing (FEAT-27):**  
   Customers cannot request replacements for delivered books within the 7-day window. While the admin panel has approval and rejection actions, the customer order detail UI has no replacement request action or form.

6. **[P1] Audit Log Check Constraint & RLS Failure (FEAT-40):**  
   `audit_logs.action` in PostgreSQL enforces `CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'PAYMENT'))`. Admin order actions in `apps/web/lib/admin/orders.ts` attempt to insert strings like `UPDATE_ORDER_STATUS` and `ADMIN_CANCEL_ORDER`, causing SQL check constraint violations. Additionally, RLS on `audit_logs` lacks an `INSERT` policy for authenticated admins.

7. **[P1] Navbar Authentication & Cart State Desynchronized (FEAT-44):**  
   Public Server Components (`page.tsx`, `books/page.tsx`) invoke `<Navbar />` with zero props. As a result, the header remains permanently in a logged-out state with cart count 0, even when the user has an active Supabase session.

---

## 7. Database Preflight Review & Discrepancy Reconciliation

A review of database preflight reports (`PHASE_7_3`, `PHASE_7_4S`, and SQL artifacts) confirmed:

1. **Preflight SQL Script Verified:** The read-only inspection suite ([`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql)) contains 15 non-mutating query sections. It was tested locally on PostgreSQL 17.6 with exit code 0 and zero state mutations.
2. **Remote Project Verification:** Probes against `https://mhyawpnjhajytetqppam.supabase.co` confirm HTTPS gateway, GoTrue Auth v2.197.0, and TCP ports 5432 and 6543 are active.
3. **Remote Schema Cache Limitation:** PostgREST reports `definitions: []` for the `public` schema. However, this only reflects the PostgREST cache and does not prove the state of `supabase_migrations.schema_migrations`. Direct SQL query against the remote database has not been run because database credentials (`DATABASE_URL` / password) are not stored in the repository.
4. **Resolution of `20260216000003_consolidated_rls_and_admin_security.sql`:**  
   The audit confirmed that **no migration with this name exists in the repository or git history.** The authoritative migrations are the 6 sequential files in `supabase/migrations/` (`20261028000001` through `20261029000003`). Any reference to `20260216` was an external proposal or naming discrepancy.
5. **Migration 3 Policy Collision Risk:**  
   Migration 3 (`20261028000003_rls_policies.sql`) uses `CREATE POLICY` without `DROP POLICY IF EXISTS`. If run on a database where policies already exist, it will throw fatal `policy already exists` errors.
6. **Payment RPC Privilege Sequencing:**  
   Migration 5 (`20261029000002_payment_settlement_atomic.sql`) erroneously granted `EXECUTE` on payment RPCs to `authenticated` users. Migration 6 (`20261029000003_payment_security_and_refunds.sql`) revokes this and restricts execution to `postgres, service_role`. Both migrations must always be applied together to prevent unauthorized payment manipulation.

---

## 8. Complete Deliverable Directory Index

All 9 required deliverables have been generated under `docs/migration/phase-00/`:

1. [`PHASE_00_BASELINE_REPORT.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/PHASE_00_BASELINE_REPORT.md) — This master baseline summary.
2. [`MASTER_FEATURE_CHECKLIST.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/MASTER_FEATURE_CHECKLIST.md) — Complete 44-feature checkable master list.
3. [`FEATURE_PARITY_MATRIX.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/FEATURE_PARITY_MATRIX.md) — 14-field exhaustive feature comparison matrix.
4. [`DEPENDENCY_MATRIX.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/DEPENDENCY_MATRIX.md) — Upstream/downstream dependency mapping and critical paths.
5. [`IMPLEMENTATION_ORDER.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/IMPLEMENTATION_ORDER.md) — Evidence-backed sequence across Phases 00 to 11.
6. [`PHASE_ACCEPTANCE_CRITERIA.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/PHASE_ACCEPTANCE_CRITERIA.md) — Measurable exit criteria for each implementation phase.
7. [`GIT_AND_TEST_BASELINE.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/GIT_AND_TEST_BASELINE.md) — Git baseline, branch history, and test suite inventory.
8. [`DATABASE_PREFLIGHT_REVIEW.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/DATABASE_PREFLIGHT_REVIEW.md) — Database preflight analysis, SQL safety, and migration risks.
9. [`CONFIRMED_GAPS_AND_REGRESSIONS.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-00/CONFIRMED_GAPS_AND_REGRESSIONS.md) — Deduplicated, prioritized defect catalog (P0 to P3).

---

## 9. Coverage Reconciliation & Verification Counts

To satisfy Completeness Validation (Mandate Section 13), the exact discovered entity counts are:

1. **Total Legacy Routes Discovered:** **26 routes** (25 functional pages + 404)
2. **Total Legacy Frontend Features Discovered:** **44 core features** across 25 pages & 28 components
3. **Total Backend Endpoints Discovered:** **65 REST endpoints** across 8 router modules
4. **Total Business Rules Discovered:** **13 major rule domains**
5. **Total Database Entities/Models Discovered:** **9 Mongoose ODM models** mapped to 11 PostgreSQL tables + Auth
6. **Total External Integrations Discovered:** **4 integrations** (Razorpay, Delhivery, Cloudinary, Resend)
7. **Total New Application Features Mapped:** **44 features**
8. **Total Fully Migrated Features (Implementation Parity):** **19 features (43.2%)** *(15 verified via T1 code inspection + T2 integration test scripts; 4 verified via T1 static code inspection).*
9. **Total Partially Migrated Features:** **11 features (25.0%)**
10. **Total Missing Features (Not Migrated):** **9 features (20.5%)**
11. **Total Regressions:** **3 features (6.8%)**
12. **Total Replaced Features:** **2 features (4.5%)** *(FEAT-08 404 page, FEAT-38 Resend email).*
13. **Total Features Requiring Remediation:** **23 features (52.3%)** *(11 Partially Migrated + 9 Not Migrated + 3 Regressed).*
14. **Total Unverified Features at Browser/E2E Level (Tier 4):** **44 features (100.0%)** *(0 automated browser tests currently exist in `apps/web/`).*
15. **Total Blocked Inspection Operations:** **1 operational blocker** *(Remote PostgreSQL direct catalog inspection blocked awaiting credentials).*

---

## 10. Phase 00 Exit Declaration

Phase 00 baseline audit and documentation deliverables have been fully established. However, in accordance with Phase 00R/00S reconciliation requirements, the audit reflects three explicit operational and testing boundaries:
1. **Remote Database Direct SQL Inspection:** Blocked pending database credentials (`DATABASE_URL` / password).
2. **Browser / End-to-End Test Automation (Tier 4):** Zero automated browser tests exist in `apps/web/`; runtime UI behavior is verified via static inspection and isolated scripts only.
3. **Commerce & Admin Defect Backlog:** 23 features require active implementation remediation across Phases 01 to 08.

**Phase 00 Final Verdict:** **CONDITIONALLY COMPLETE — EXPLICIT GAPS REMAIN**  
**Next Action:** Await user review and authorization of the Phase 00S reconciliation report before beginning Phase 01.

