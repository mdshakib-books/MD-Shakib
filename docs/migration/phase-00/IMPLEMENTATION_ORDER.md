# Master Implementation Order: Phases 00 through 11
## MD Shakib Islamic Books — Structured Roadmap to 100% Migration Parity

> **Phase Status:** Phase 00 (Baseline & Audit Freeze) Active  
> **Directive:** Strictly Read-Only Planning. **NO CODE MODIFICATIONS TO BE IMPLEMENTED UNTIL THIS ORDER IS REVIEWED AND AUTHORIZED BY USER.**  
> **Total Target Phases:** 12 structured phases (00 to 11)

---

## Roadmap Overview

```
Phase 00: Baseline & Audit Freeze (Current — Read-Only Audit & Baseline Freeze)
   │
   ├─► Phase 01: Critical Functional Restoration (Add to Cart, Guest Cart, Navbar Sync)
   │
   ├─► Phase 02: Complete Admin Management (Book CRUD, Cloudinary Upload, User Moderation)
   │
   ├─► Phase 03: Customer Account & Commerce (Address Edit, Password Change, Replacement Request)
   │
   ├─► Phase 04: Backend & Database Integrity (Audit Log Constraint Fix, RLS Hardening)
   │
   ├─► Phase 05: Frontend & Content Parity (About Us Restoration, OrderSteps, Reviews)
   │
   ├─► Phase 06: Design System & UI/UX Parity (Brand Gold Variables, Typography Fix)
   │
   ├─► Phase 07: Animation & Micro-interactions (Toast System, Modals, Hover Physics)
   │
   ├─► Phase 08: Advanced UX & Accessibility (Mobile Bottom Nav, a11y Compliance)
   │
   ├─► Phase 09: Integration & End-to-End QA (Automated Postman Tests, Gateway Staging)
   │
   ├─► Phase 10: Performance, Security & Optimization (Lighthouse 90+, CSP, Rate Limits)
   │
   └─► Phase 11: Final Production Readiness & Release (Migration Execution, Smoke Verification)
```

---

## Phase 00: Baseline & Audit Freeze
- **Scope:** Authoritative forensic audit of legacy `client/` and `server/` vs target `apps/web/` and `supabase/`.
- **Status:** **CURRENT ACTIVE PHASE (READ-ONLY)**
- **Included Features:** All 44 features evaluated; baseline frozen.
- **Dependencies:** None.
- **Implementation Sequence:**
  1. Capture exact Git state (`audit` branch, HEAD commit `e80ff8f`, clean working tree).
  2. Inspect legacy codebase (`client/`, `server/`) to establish exhaustive feature inventory (26 routes, 65 APIs, 9 models).
  3. Inspect target Next.js application (`apps/web/`, `supabase/migrations/`) to verify real implementation connectivity.
  4. Cross-check all previous audit reports and reconcile discrepancies (dispel `20260216` migration confusion).
  5. Author 9 structured deliverables under `docs/migration/phase-00/`.
- **Risks:** Premature implementation before user review and baseline alignment.
- **Required Tests:** Read-only inspection commands, git status validation, SQL preflight script syntax validation.
- **Acceptance Criteria:** All 9 deliverables created, cross-consistent, covering 100% of discovered features.
- **Exit Conditions:** Authoritative baseline documented; user review requested.

---

## Phase 01: Critical Functional Restoration
- **Scope:** Restore fundamental e-commerce purchasing capabilities broken or stubbed out across the public storefront.
- **Included Feature IDs:**
  - `FEAT-05`: Book Detail Page Add-to-Cart wiring
  - `FEAT-09`: Guest Shopping Cart (localStorage persistence)
  - `FEAT-10`: Storefront Add-to-Cart action on all book cards and detail screens
  - `FEAT-11`: Authenticated Cart Synchronization & Stock Validation
  - `FEAT-44`: Global Navbar Dynamic Session & Cart Badge Synchronization
- **Dependencies:** Phase 00 Approval.
- **Implementation Sequence:**
  1. Build a client-side `GuestCartStore` using `localStorage` with a 5-unit max cap per item.
  2. Pass operational `onAddToCart` callback in `apps/web/app/page.tsx` and `apps/web/app/books/BooksCatalogClient.tsx`.
  3. Wire `handleAddToCart` in `apps/web/app/books/[id]/BookDetailClient.tsx` to invoke `addToCart` server action or update guest cart.
  4. Update `apps/web/app/cart/CartClient.tsx` to render guest items gracefully without forced sign-in.
  5. Pass active user session and live cart count to `<Navbar />` across all server layouts (`page.tsx`, `books/page.tsx`).
- **Risks:** State desynchronization between guest cart in browser memory and database cart.
- **Required Tests:** Cart addition test, quantity update test, unauthenticated guest cart test, navbar badge update test.
- **Acceptance Criteria:** Clicking "Add to Cart" anywhere adds item, updates navbar badge instantly, and persists in cart.
- **Exit Conditions:** End-to-end purchasing journey from book discovery to cart checkout is 100% operational.

---

## Phase 02: Complete Admin Management
- **Scope:** Transform the read-only admin dashboard into a fully functional administrative operations center.
- **Included Feature IDs:**
  - `FEAT-32`: Admin Book Catalog Management (Create, Edit, Delete, Stock adjustment)
  - `FEAT-34`: Admin Customer Moderation (Block, Unblock, Soft-Delete)
  - `FEAT-35`: Admin Profile & Password Change (`/admin/profile`)
  - `FEAT-39`: Cloudinary Media Upload UI Connection
- **Dependencies:** Phase 00 Approval, Phase 04 (Audit log constraint alignment).
- **Implementation Sequence:**
  1. Implement Server Actions in `apps/web/lib/admin/books.ts` for `createBook`, `updateBook`, `deleteBook`, `updateBookStock`, `setBookCoverImage`.
  2. Port legacy `BookModal.jsx` to Next.js Client Component supporting multi-image Cloudinary upload (up to 5 images).
  3. Add "+ Add New Book" button, edit actions, stock adjustment inputs, and delete triggers to `apps/web/app/admin/books/page.tsx`.
  4. Implement Server Actions in `apps/web/lib/admin/users.ts` for `blockUser`, `unblockUser`, and `deleteUser` with admin self-protection.
  5. Add action dropdown to `apps/web/app/admin/users/page.tsx` to execute moderation actions.
  6. Create `apps/web/app/admin/profile/page.tsx` with admin name/phone edit and administrative password change.
- **Risks:** Unvalidated image uploads; admin accidentally blocking own account.
- **Required Tests:** Admin book CRUD test, multi-image upload test, stock mutation test, user moderation test.
- **Acceptance Criteria:** Admin can create, edit, image-upload, and delete books; admin can block/unblock users.
- **Exit Conditions:** Zero admin screens remain read-only.

---

## Phase 03: Customer Account & Commerce
- **Scope:** Complete post-purchase customer self-service, account maintenance, and order lifecycle parity.
- **Included Feature IDs:**
  - `FEAT-13`: Guest Cart Merge upon customer login
  - `FEAT-19`: Customer Profile Management (stats and account soft-deletion)
  - `FEAT-20`: Customer Password Change with existing password verification
  - `FEAT-21`: Customer Address Management (Edit existing saved address)
  - `FEAT-24`: Order Details & Tracking (Carrier tracking links & cancellation notes)
  - `FEAT-25`: Real-time Order Tracking via Supabase Realtime
  - `FEAT-27`: Customer Replacement Request Workflow within 7-day delivery window
- **Dependencies:** Phase 01 (Cart Restoration).
- **Implementation Sequence:**
  1. Implement `mergeGuestCart` server action in `cart.ts` and trigger on customer login/registration.
  2. Implement `updateAddress` server action and edit modal in `AddressesClient.tsx`.
  3. Implement `changeCustomerPassword` server action and password change tab in `ProfileClient.tsx`.
  4. Implement `requestOrderReplacement` server action in `orders.ts` enforcing 7-day eligibility rule.
  5. Add "Request Replacement" modal button to `OrderDetailClient.tsx` for delivered orders.
  6. Wire Supabase Realtime subscription on `orders:id=eq.[id]` to update customer order timeline live.
- **Risks:** Customers submitting replacements past the 7-day window.
- **Required Tests:** Cart merge test, address edit test, password change test, replacement request eligibility test.
- **Acceptance Criteria:** Customer can edit addresses, change passwords, merge cart, and submit replacements within 7 days.
- **Exit Conditions:** All legacy customer account and post-order self-service capabilities are 100% operational.

---

## Phase 04: Backend & Database Integrity
- **Scope:** Eliminate database schema bugs, check constraint collisions, and RLS privilege gaps.
- **Included Feature IDs:**
  - `FEAT-40`: System Audit Logging Ledger constraint & RLS fix
  - Database Preflight: Migration 3 idempotency (`DROP POLICY IF EXISTS`)
  - Database Preflight: Payment RPC privilege verification (Migration 5 & 6 alignment)
- **Dependencies:** Phase 00 Database Preflight Review.
- **Implementation Sequence:**
  1. Create database migration `20261031000001_fix_audit_logs_and_rls.sql` to expand `audit_logs.action` check constraint:
     `CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'PAYMENT', 'UPDATE_ORDER_STATUS', 'ADMIN_CANCEL_ORDER', 'APPROVE_REPLACEMENT', 'REJECT_REPLACEMENT', 'BOOK_CREATE', 'BOOK_UPDATE', 'BOOK_DELETE', 'USER_BLOCK', 'USER_UNBLOCK'))`.
  2. Add RLS policy: `CREATE POLICY "audit_logs_insert_admin" ON public.audit_logs FOR INSERT TO authenticated WITH CHECK (public.is_admin())`.
  3. Add migration safety wrapper to Migration 3 policies (`DROP POLICY IF EXISTS "..." ON public....`).
  4. Verify that `settle_payment_atomic` and `record_payment_failure_atomic` RPCs restrict `EXECUTE` strictly to `postgres, service_role`.
- **Risks:** Breaking changes to existing database check constraints.
- **Required Tests:** Admin order status transition audit log test, book creation audit log test, RLS violation test.
- **Acceptance Criteria:** All admin operations insert audit logs cleanly without throwing SQL errors.
- **Exit Conditions:** Database constraints and RLS policies are 100% aligned with application code.

---

## Phase 05: Frontend & Content Parity
- **Scope:** Restore missing brand narrative, storytelling, testimonials, and support content.
- **Included Feature IDs:**
  - `FEAT-01`: Port `<OrderSteps />` ("How to Order") and `<Reviews />` ("What Our Customers Say")
  - `FEAT-06`: Restore About Us page content (Quranic quote, Why Choose Us, Values, Founder Note)
  - `FEAT-07`: Restore Support & FAQ page (All 8 original categories and full question set)
- **Dependencies:** Phase 01 (Storefront layout).
- **Implementation Sequence:**
  1. Create `apps/web/components/home/OrderSteps.tsx` with 4 numbered ordering steps and luxury icons.
  2. Create `apps/web/components/home/Reviews.tsx` with customer testimonials, star ratings, and responsive layout.
  3. Mount `<OrderSteps />` and `<Reviews />` on `apps/web/app/page.tsx` between ProductGrid and Footer.
  4. Expand `apps/web/app/about/page.tsx` from 79 lines to 250+ lines restoring:
     - Quranic quote callout with gold typography.
     - "Why Choose Us" 3-card grid (Authenticity, Fast Courier Dispatch, Customer Dedication).
     - "Our Core Values" 4-card grid (Integrity, Preservation, Accessibility, Community).
     - Founder message and mission dedication.
  5. Expand `apps/web/app/support/page.tsx` to restore all 8 original FAQ categories and questions.
- **Risks:** Visual clutter if typography and spacing are not strictly matched to legacy design tokens.
- **Required Tests:** Content verification check, responsive layout verification on mobile and tablet.
- **Acceptance Criteria:** Homepage and About page have 100% textual and structural parity with legacy views.
- **Exit Conditions:** Zero legacy content sections or FAQ entries remain omitted.

---

## Phase 06: Design System & UI/UX Parity
- **Scope:** Correct brand design tokens, typography weights, container dimensions, and visual hierarchy.
- **Included Feature IDs:**
  - `FEAT-41`: Brand Design Tokens & CSS Variables (`--color-primary-gold` fix)
  - `FEAT-08`: 404 Page Visual Refinement
  - Global Container Width and Typography Standardization
- **Dependencies:** Phase 00 Audit.
- **Implementation Sequence:**
  1. Edit `apps/web/app/globals.css`: declare `--color-primary-gold: #C9A24A;` and `--color-accent-gold: #E5C87B;` inside `:root`.
  2. Update `apps/web/app/layout.tsx` to include Cinzel font weights 800 and 900 (`variable: '--font-cinzel'`).
  3. Audit all 30+ components using `var(--color-primary-gold)` to ensure correct color inheritance.
  4. Standardize button hover physics (`hover:bg-[var(--color-accent-gold)] hover:shadow-lg`).
  5. Align container widths across storefront (`PageContainer size="lg"` matching legacy `max-w-[1200px]`).
- **Risks:** Unintended styling regressions if global CSS rules cascade unexpectedly.
- **Required Tests:** Visual inspection across all routes, font rendering check, color contrast audit.
- **Acceptance Criteria:** Brand gold color renders consistently across all buttons, borders, and typography.
- **Exit Conditions:** Zero undefined CSS variable references remain in the codebase.

---

## Phase 07: Animation & Micro-interactions
- **Scope:** Reintroduce fluid transitions, floating toasts, modal animations, and micro-interactions.
- **Included Feature IDs:**
  - `FEAT-43`: Global Toast Notification System (`useToast`)
  - Modal animations (fade-in backdrop, scale-up dialog)
  - Book card hover lift (`-translate-y-[6px]`) and expanding gold glow shadow
  - Smooth mobile category tab scrolling and active pill transitions
- **Dependencies:** Phase 06 (Design Tokens).
- **Implementation Sequence:**
  1. Build `ToastContext.tsx`, `ToastProvider.tsx`, and `ToastContainer.tsx` in `apps/web/components/ui/`.
  2. Implement slide-up animation for toasts with auto-dismiss after 4 seconds and manual close.
  3. Wire toasts into: Add to Cart, Cart quantity updates, Address actions, Login/Logout, and Admin updates.
  4. Add CSS keyframe modal transitions for `<Modal />` and `<ConfirmModal />`.
  5. Verify BookCard hover lift (`-translate-y-[6px]`) and gold box-shadow expansion.
- **Risks:** Animation performance overhead or layout shift on lower-end mobile devices.
- **Required Tests:** Toast trigger test, modal transition test, mobile scroll FPS test.
- **Acceptance Criteria:** Floating toast notifications trigger across all core user mutations; cards have tactile feedback.
- **Exit Conditions:** Application possesses identical micro-interaction polish to the legacy SPA.

---

## Phase 08: Advanced UX & Accessibility (a11y)
- **Scope:** Complete mobile navigation, responsive touch optimization, and WCAG 2.1 AA accessibility.
- **Included Feature IDs:**
  - `FEAT-42`: Mobile Bottom Navigation Bar (`MobileBottomNav.tsx`)
  - Form accessibility (ARIA attributes, error announcements, label associations)
  - Keyboard navigation (tab indices, visible focus rings, modal escape key handling)
  - Touch target sizing (minimum 44x44px for mobile tap targets)
- **Dependencies:** Phase 06 (Design Tokens), Phase 01 (Navbar/Cart).
- **Implementation Sequence:**
  1. Build `apps/web/components/layout/MobileBottomNav.tsx` with fixed bottom positioning (`md:hidden`).
  2. Mount `<MobileBottomNav />` in root `layout.tsx` and add `pb-16 md:pb-0` container padding.
  3. Wire real-time cart badge count into bottom navigation Cart icon.
  4. Audit all interactive elements for accessible focus rings (`focus-visible:ring-2 focus-visible:ring-[var(--color-primary-gold)]`).
  5. Audit form inputs for explicit `aria-describedby` error associations.
- **Risks:** Bottom nav obscuring floating action buttons or checkout CTAs.
- **Required Tests:** Keyboard tab traversal test, screen reader label audit, mobile viewport touch test.
- **Acceptance Criteria:** Mobile bottom nav functions with live badge; zero a11y color contrast or focus failures.
- **Exit Conditions:** Automated axe-core / DevTools accessibility audit passes with 0 critical violations.

---

## Phase 09: Integration & End-to-End QA
- **Scope:** Validate all external integrations, payment gateways, courier tracking, and transactional emails.
- **Included Feature IDs:**
  - `FEAT-15` & `FEAT-36`: Razorpay Payment Gateway & Webhook Reconciliation
  - `FEAT-31` & `FEAT-37`: Delhivery Consignment Booking & Tracking Webhooks
  - `FEAT-38`: Resend Transactional Email Delivery & Logging
  - Postman / Newman Automated Test Suite execution
- **Dependencies:** Phases 01 through 04.
- **Implementation Sequence:**
  1. Execute Razorpay end-to-end checkout flow in Test Mode; verify signature verification Route Handler.
  2. Simulate Razorpay `payment.captured` webhook; verify idempotency of `settle_payment_atomic`.
  3. Test Delhivery pincode serviceability check across real metro and non-metro Indian PIN codes.
  4. Test Delhivery tracking webhook simulation; verify order status transition to `Delivered`.
  5. Test Resend outbound email delivery on order placement, cancellation, and payment capture.
  6. Execute complete Newman collection test suite across address, auth, books, cart, orders, and payments.
- **Risks:** Third-party gateway sandbox downtime or API rate limits.
- **Required Tests:** Razorpay E2E test, Delhivery webhook test, Resend email dispatch test, Newman API collection test.
- **Acceptance Criteria:** 100% of integration test suites pass with HTTP 200/201 and valid payload assertions.
- **Exit Conditions:** All external integrations validated with zero unhandled exceptions.

---

## Phase 10: Performance, Security & Optimization
- **Scope:** Harden production security posture, optimize bundle sizes, and achieve Lighthouse 90+ across all metrics.
- **Included Feature IDs:**
  - Content Security Policy (CSP) & Security Headers in `middleware.ts`
  - Route-level Rate Limiting & brute-force protection
  - Image optimization via Next.js `<Image />` with WebP/AVIF formats
  - ISR cache revalidation tuning for catalog routes
- **Dependencies:** Phases 01 through 09.
- **Implementation Sequence:**
  1. Configure strict Content Security Policy (CSP), HSTS, and X-Frame-Options headers in `middleware.ts`.
  2. Implement IP-based rate limiting on sensitive routes (`/api/auth/*`, `/api/payments/*`).
  3. Audit Next.js production build bundle (`@next/bundle-analyzer`); eliminate duplicate client packages.
  4. Verify database indexes on foreign keys and frequently filtered columns (`books.category`, `orders.user_id`).
  5. Run Lighthouse CI on mobile and desktop viewports across Home, Books, and Book Detail pages.
- **Risks:** Overly restrictive CSP blocking Razorpay checkout iframe or Cloudinary image domains.
- **Required Tests:** Lighthouse mobile audit, CSP report-only validation, rate limit brute-force test.
- **Acceptance Criteria:** Lighthouse score >= 90 across Performance, Accessibility, Best Practices, and SEO.
- **Exit Conditions:** Production build compiles cleanly with zero TypeScript errors, zero lint warnings, and optimal bundle size.

---

## Phase 11: Final Production Readiness & Release
- **Scope:** Execute authorized database migrations, perform production smoke tests, and execute release cutover.
- **Included Feature IDs:** All 44 features operational in production.
- **Dependencies:** Explicit User Approval, Database Credentials (`DATABASE_URL`).
- **Implementation Sequence:**
  1. Request explicit user authorization for remote database migration execution.
  2. Execute preflight inspection script [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) on remote database.
  3. Trigger pre-migration database snapshot in Supabase Dashboard.
  4. Sequentially execute migrations 1 through 6 plus Phase 04 audit log patch.
  5. Seed catalog via `supabase/seed.sql` and reload PostgREST schema cache.
  6. Perform live production smoke test (login, browse, add to cart, COD checkout, admin verification).
  7. Hand over operational runbook and cutover documentation to user.
- **Risks:** Remote migration execution errors; database connection timeout.
- **Required Tests:** Production smoke test, PostgREST schema cache verification, live health probe.
- **Acceptance Criteria:** Production environment is online, all 44 features operate with 100% parity, zero errors.
- **Exit Conditions:** User reviews live application and signs off on complete migration parity.

