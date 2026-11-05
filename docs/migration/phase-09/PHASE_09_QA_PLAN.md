# Phase 09: Integration & End-to-End QA — Master QA Plan
## MD Shakib Islamic Books

**Project:** MD Shakib Islamic Books  
**Phase:** 09 — Integration & End-to-End QA  
**Branch:** `new-fix`  
**Repository:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`  
**Application:** `apps/web`  
**Date:** November 2026  
**Status:** Approved & Fully Executed  

---

## 1. PURPOSE & OBJECTIVE

The primary objective of **Phase 09 (Integration & End-to-End QA)** is to perform an exhaustive, authoritative quality assurance audit and end-to-end integration verification across the entire MD Shakib Islamic Books platform.

Individual features functioning in isolation do not guarantee that end-to-end user journeys and cross-system transactions succeed without data corruption, race conditions, security vulnerabilities, or state inconsistencies. Phase 09 verifies complete end-to-end user journeys connecting:

- **Frontend User Interface & Components:** React 19 Client and Server Components, responsive Tailwind CSS layouts, and luxury design tokens.
- **Client State Management & Caching:** `CartProvider`, `localStorage` guest cart persistence, optimistic updates, and Next.js path revalidation.
- **Server Actions & Route Handlers:** Trusted server-side calculations, cryptographic HMAC verification, and role-based access control.
- **Authentication & Multi-tenant Authorization:** Supabase SSR cookie session handling, JWT parsing, and PostgreSQL Row-Level Security (RLS).
- **Relational Database Integrity:** PostgreSQL schema constraints (`CHECK`, `FOREIGN KEY RESTRICT/CASCADE`, `UNIQUE`), row-level locks (`FOR UPDATE`), and atomic stored procedures (`create_order_atomic`, `merge_cart_atomic`, `settle_payment_atomic`, `cancel_order_atomic`, `request_replacement_atomic`).
- **Payment & Shipping Integrations:** Razorpay order creation, payment signature verification, webhook processing, Indian 6-digit pincode serviceability, and tracking integration.
- **Administrative Operations:** Book catalog management, stock adjustments, order fulfilment state machine progression, returns, replacements, and refunds.

Phase 09 preserves all established Phase 06 design systems, Phase 07 motion standards, and Phase 08 accessibility patterns without introducing unnecessary rewrites or breaking changes.

---

## 2. PRE-TEST AUDIT & ENVIRONMENT BASELINE

### 2.1 Git Repository Safety Baseline
- **Active Branch:** `new-fix` confirmed.
- **Git Safety Protocol:** Zero destructive resets, git stashes, or unauthorized branch pushes. All pre-existing user work and test artifacts are strictly preserved.
- **Working Tree Inspection:** Audited all staged, unstaged, and untracked files prior to running tests.

### 2.2 Canonical Database & Runtime Environment
- **Local Supabase Containers:**
  - API / Auth / PostgREST: `http://127.0.0.1:54321`
  - PostgreSQL Database: `127.0.0.1:54322` (`postgres` user)
  - Applied Migrations: 10 migration files (`001_core_schema.sql` through `010_admin_roles.sql`) with all 15 relational tables, RLS policies, check constraints, and atomic stored procedures.
- **Next.js Production Runtime:**
  - Server Port: `http://localhost:3001`
  - Build Engine: Next.js 16.4.3 (Turbopack)
  - Routes Compiled: 23 static and dynamic routes
- **Safety Constraints & Simulation Rules:**
  - **Zero Live Financial Transactions:** All Razorpay tests use test key IDs, cryptographic HMAC simulation with `RAZORPAY_KEY_SECRET`, or sandbox mocks.
  - **Zero External Shipments / SMS / Emails:** Shipping serviceability and tracking use simulated payloads; Resend transactional emails are safely captured or mocked.

---

## 3. ARCHITECTURE & WORKFLOW MAPPING

| Workflow Domain | Client Components / Pages | Server Actions / API Routes | Database Tables & Stored Procedures |
| :--- | :--- | :--- | :--- |
| **01. Guest Shopping** | `/books`, `/books/[id]`, `/cart`, `BookDetailClient.tsx`, `CartClient.tsx` | `lib/commerce/cart.ts` | `localStorage` (`guest_cart`), `public.books` |
| **02. Guest to Login** | `/login`, `LoginForm.tsx`, `CartProvider.tsx` | `loginCustomer`, `mergeGuestCart` | `public.carts`, `public.cart_items`, `public.merge_cart_atomic` |
| **03. Customer Checkout** | `/checkout`, `CheckoutClient.tsx` | `placeOrderOnline`, `placeOrderCod` | `public.orders`, `public.order_items`, `public.create_order_atomic` |
| **04. Payment Success** | `/api/payments/verify`, `/order-success` | `verifyAndSettlePayment` | `public.orders`, `public.payments`, `public.settle_payment_atomic` |
| **05. Payment Failure** | `/api/payments/verify`, `/checkout` | `verifyAndSettlePayment`, `/api/webhooks/razorpay` | `public.orders`, `public.payments` |
| **06. Admin Book Creation** | `/admin/books`, `/admin/books/add`, `MediaUploader.tsx` | `createAdminBook`, `/api/admin/media/upload` | `public.books`, `public.admin_audit_logs` |
| **07. Admin Stock Update** | `/admin/inventory`, `AdminInventoryClient.tsx` | `adjustAdminStock` | `public.books`, `public.inventory_audit_log` |
| **08. Order Fulfilment** | `/admin/orders`, `/admin/orders/[id]`, `/account/orders/[id]` | `/api/admin/orders/[id]/status` | `public.orders`, `public.order_status_history` |
| **09. Cancellation** | `/account/orders/[id]`, `/admin/orders` | `cancelOrder` | `public.orders`, `public.books`, `public.cancel_order_atomic` |
| **10. Replacement** | `/account/orders/[id]`, `/admin/returns` | `requestReplacement`, `reviewReplacement` | `public.orders`, `public.replacements`, `public.request_replacement_atomic` |
| **11. Refund** | `/admin/orders/[id]`, `/account/refunds` | `refundOrder`, `record_refund_atomic` | `public.orders`, `public.payments` |

---

## 4. CRITICAL END-TO-END WORKFLOW TEST DESIGNS

### Workflow 01 — Guest Shopping
1. **Browse Catalogue:** Guest navigates to `/books` without authentication. Public catalog loads with active books.
2. **Book Detail:** Guest opens a specific book detail page `/books/[id]`.
3. **Cart Addition:** Guest clicks "Add to Cart". Verified that React state updates, `localStorage.getItem("guest_cart")` is populated, and no server-side cart API is called.
4. **Persistence:** Page is reloaded; `/cart` is opened. Guest cart items persist with accurate quantities, subtotal, platform fee (₹10), and delivery fee (₹35).
5. **Quantity Adjustment & Removal:** Item increment/decrement and removal update `guest_cart` immediately.

### Workflow 02 — Guest to Login (Cart Merge)
1. **Pre-condition:** Guest adds 2 unique books to `localStorage.getItem("guest_cart")`.
2. **Authentication:** Guest visits `/login?redirect=/cart` and submits credentials for an existing customer.
3. **Atomic Merge:** `CartProvider` detects authentication state change, extracts guest items, and invokes `mergeGuestCart`.
4. **Post-condition:** Stored procedure `merge_cart_atomic` reconciles items into `public.cart_items`. Stale guest localStorage is cleared. Items persist across page reload and re-authentication without duplication.

### Workflow 03 — Customer Checkout
1. **Cart Preparation:** Customer with verified cart visits `/checkout`.
2. **Form Validation:** Shipping address fields (Name, Phone, Address, City, State, 6-digit Pincode) are validated.
3. **Server-side Price Calculation:** Client-supplied prices are strictly ignored; prices and stock are derived from authoritative database records.
4. **Order Placement:** Order is created in `public.orders` via `create_order_atomic` with initial status `Pending` (or `Confirmed` for COD). Inventory is atomically decremented.
5. **Idempotency:** Re-submitting with the same idempotency key returns the existing order ID without double-decrementing stock.

### Workflow 04 — Payment Success
1. **Order Initiation:** Online order created with payment method `ONLINE` and `payment_status: 'Pending'`.
2. **Razorpay Intention:** `/api/payments/create-order` creates Razorpay order reference and records intention in `public.payments`.
3. **Signature Verification:** Client receives `razorpay_order_id`, `razorpay_payment_id`, and authentic HMAC SHA-256 signature generated using `RAZORPAY_KEY_SECRET`.
4. **Settlement:** `/api/payments/verify` verifies signature with timing-safe comparison, invokes `settle_payment_atomic`, and transitions order status to `Confirmed` and payment status to `Paid`.
5. **Customer UI:** Customer visits `/account/orders/[id]` and sees confirmed order with paid badge.

### Workflow 05 — Payment Failure & Retry Safety
1. **Tampered Signature:** Forged signature submitted to `/api/payments/verify`. Endpoint rejects request with 400 Bad Request.
2. **Integrity Preservation:** Order remains in `Pending` state; payment record remains `Pending` (never falsely marked `Paid`).
3. **Retry Safety:** Valid retry with authentic credentials completes settlement safely without creating duplicate orders.

### Workflow 06 — Admin Book Creation
1. **RBAC Guard:** Non-admin customer attempting creation receives 403 Forbidden.
2. **Admin Submission:** Authorized admin creates book with Title, Author, Price, Category (`Quran`, `Hadith`, `Fiqh`, `History`, `Biography`, `Other`), Stock, and Cover Image.
3. **Persistence:** Record written to `public.books`. Cache revalidation triggers for `/books` and `/`.
4. **Public Catalogue:** New title immediately appears on public catalog `/books` and detail page `/books/[id]`.

### Workflow 07 — Admin Stock Update
1. **Inventory Adjustment:** Admin updates stock via `adjustAdminStock` or database update.
2. **Storefront Reflection:** Public book detail page reflects updated stock availability.
3. **Constraint Validation:** Negative stock values are rejected by PostgreSQL check constraint `books_stock_check (stock >= 0)`.
4. **Oversell Prevention:** Checkout orders requesting quantities exceeding available inventory are rejected and rolled back by `create_order_atomic`.

### Workflow 08 — Order Fulfilment
1. **State Machine Progression:** Admin advances order status through valid transitions:
   - `Pending` &rarr; `Confirmed`
   - `Confirmed` &rarr; `Packed`
   - `Packed` &rarr; `Shipped` (assigns `shipping_awb` tracking code and `shipping_courier`)
   - `Shipped` &rarr; `Delivered` (records `delivered_at` timestamp)
2. **Parity:** Customer view `/account/orders/[id]` and admin view `/admin/orders/[id]` show identical status and tracking details.
3. **Invalid Progression:** Regressive or illegal transitions (e.g., `Delivered` &rarr; `Pending`) are rejected.

### Workflow 09 — Cancellation & Stock Restoration
1. **Eligibility Check:** Orders in `Pending` or `Confirmed` status are eligible for cancellation; `Shipped` or `Delivered` orders are ineligible.
2. **Cancellation Execution:** Customer or admin calls `cancel_order_atomic`.
3. **Inventory Restoration:** Reserved book quantities are atomically credited back to `public.books.stock`.
4. **Status & History:** Order transitions to `Cancelled` with `cancel_reason` logged in `public.orders` and `public.order_status_history`.
5. **Idempotency:** Repeated cancellation attempts on an already cancelled order are rejected idempotently.

### Workflow 10 — Replacement
1. **Eligibility Window:** Delivered order within 7 days is replacement-eligible. Orders older than 7 days or in non-delivered status are rejected.
2. **Customer Submission:** Customer submits replacement request with damaged transit reason via `request_replacement_atomic`. Order transitions to `Replacement Requested`.
3. **Admin Review:** Admin approves replacement (`Replacement Approved`).
4. **Fulfilment:** Replacement is dispatched with new tracking code (`Replacement Shipped`).
5. **Duplicate Prevention:** Submitting a second replacement on the same order is rejected by database constraint.

### Workflow 11 — Refund
1. **Eligibility Verification:** Only paid online orders (`payment_status: 'Paid'`) with cancelled or returned status are eligible. Unpaid and COD orders are rejected.
2. **Amount Bounding:** Refund amount cannot exceed `total_amount`.
3. **Execution & Records:** Refund recorded in `public.payments` with `status: 'Refunded'`, `refund_id`, `refund_amount`, and timestamp.
4. **Order Status:** `public.orders.payment_status` updates to `Refunded`. Customer and admin views reflect refund completion.

---

## 5. TESTING LEVELS & SUITE ARCHITECTURE

| Level | Script Path | Description & Test Focus | Test Count |
| :--- | :--- | :--- | :--- |
| **Level 1: Unit & Business Logic** | `apps/web/scripts/test-phase09-unit-and-business-logic.ts` | Pure functions, fee calculations, stock capping, regex validators, order status transitions, 7-day boundary math, HMAC helpers. | 28 tests |
| **Level 2: Integration & Database** | `apps/web/scripts/test-phase09-integration-and-database.ts` | Multi-user RLS, foreign keys, check constraints, atomic stored procedures (`create_order_atomic`, `merge_cart_atomic`, `settle_payment_atomic`, etc.). | 25 tests |
| **Level 3: API Routes & Security** | `apps/web/scripts/test-phase09-api-routes.ts` | Route handlers, SSR cookie auth, 401/403 guards, malformed payloads, pincode serviceability, tracking, media upload path traversal. | 17 tests |
| **Level 4: End-to-End Workflows** | `apps/web/scripts/test-phase09-e2e-workflows.ts` | Headless Chrome CDP browser automation across all 11 critical workflows and 5 responsive breakpoints with visual screenshot capture. | 18 tests |
| **Level 5: UX & Accessibility Regression** | `apps/web/scripts/test-phase08-ux-and-accessibility.ts` | WCAG 2.2 AA contrast, skip links, focus indicators, combobox search, modal dialogs, semantic landmarks, screen reader guidance. | 11 tests |
| **Level 6: Motion & Micro-interactions Regression** | `apps/web/scripts/test-phase07-targeted-verification.ts` | Reduced motion 0s delays, CLS measurement, bundle size audit, View Transitions API progressive enhancement. | 8 tests |

**Total Phase 09 Test Suite:** 107 Automated Tests (100% Passing).

---

## 6. VISUAL ARTIFACTS CAPTURED

All visual evidence is automatically generated and archived in `docs/migration/phase-09/screenshots/`:

1. `wf01_01_catalog_desktop.png` — Public catalogue browsing as an unauthenticated guest.
2. `wf01_02_book_detail_added.png` — Book detail page with active item added to guest cart.
3. `wf01_03_guest_cart.png` — Shopping cart displaying guest items, fee breakdown, and checkout prompt.
4. `wf02_01_merged_cart_authenticated.png` — Authenticated cart post-login showing atomically merged items.
5. `wf12_01_resp_375.png` — Mobile viewport (375px) with zero horizontal overflow and responsive navigation.
6. `wf12_02_resp_390.png` — Mobile viewport (390px) verifying fluid typography and touch targets.
7. `wf12_03_resp_768.png` — Tablet portrait viewport (768px) verifying 2-column catalog grid.
8. `wf12_04_resp_1024.png` — Small desktop / iPad Pro viewport (1024px) verifying 3-column layout.
9. `wf12_05_resp_1440.png` — Desktop wide viewport (1440px) verifying luxury grid and max-width containers.

