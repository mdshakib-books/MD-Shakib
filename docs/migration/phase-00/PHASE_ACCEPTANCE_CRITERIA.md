# Phase Acceptance Criteria & Exit Gates
## MD Shakib Islamic Books — Authoritative Quality Gates for Phases 00 to 11

> **Phase Status:** Phase 00 (Baseline & Audit Freeze)  
> **Standard:** Zero subjective sign-offs. Every phase gate requires objective code verification, passing test scripts, and non-negotiable exit conditions.

---

## Phase 00 Gate: Baseline & Audit Freeze
- **Gate Objective:** Authoritative forensic baseline established and change freeze enforced.
- **Testable Acceptance Criteria:**
  - [x] Exact Git branch (`audit`) and HEAD SHA (`e80ff8f`) recorded and verified.
  - [x] Zero modifications made to `client/` and `server/` legacy source directories.
  - [x] Zero uncommitted changes made to existing tracked files in the workspace.
  - [x] All 26 legacy routes, 65 API endpoints, 9 database models, and 4 integrations cataloged.
  - [x] All 44 features categorized into standard parity statuses with evidence.
  - [x] Discrepancies regarding `20260216` migration resolved with forensic facts.
  - [x] All 9 Phase 00 documentation deliverables authored under `docs/migration/phase-00/`.
- **Exit Condition:** **PHASE 00 BASELINE REPORT SUBMITTED FOR USER REVIEW; NO CODE MODIFICATIONS COMMENCED.**

---

## Phase 01 Gate: Critical Functional Restoration
- **Gate Objective:** Restore complete public e-commerce purchasing journey.
- **Testable Acceptance Criteria:**
  - [ ] Clicking "Add to Cart" on `<BookCard />` in homepage featured collection persists item to cart and updates navbar badge count.
  - [ ] Clicking "Add to Cart" on `<BookCard />` in `/books` catalog persists item to cart and updates navbar badge count.
  - [ ] Selecting quantity and clicking "Add to Cart" on `/books/[id]` persists correct quantity to cart.
  - [ ] Unauthenticated guests visiting `/cart` see their persisted items, quantities, subtotal, and estimated delivery charge without being blocked by a sign-in gate.
  - [ ] Global `<Navbar />` displays live cart count badge matching current cart items on all routes.
  - [ ] Global `<Navbar />` reflects authenticated customer name and avatar when a session exists.
  - [ ] Cart quantities can be incremented and decremented up to stock limit (max 5); removing an item removes row cleanly.
- **Verification Command:** `npm --prefix apps/web run build && node apps/web/scripts/test-commerce.mjs`
- **Exit Condition:** End-to-end purchasing journey from book card to cart summary succeeds without errors.

---

## Phase 02 Gate: Complete Admin Management
- **Gate Objective:** Deliver 100% operational admin management panel.
- **Testable Acceptance Criteria:**
  - [ ] Admin can navigate to `/admin/books`, click "+ Add New Book", fill in metadata, and upload up to 5 images to Cloudinary.
  - [ ] Book creation saves valid record in `public.books` and appears immediately in the catalog.
  - [ ] Admin can edit existing book metadata, change primary cover image, and delete images.
  - [ ] Admin can update stock count directly with instant database reflection.
  - [ ] Admin can soft-delete a book (`is_active = false`), hiding it from public storefront.
  - [ ] Admin can navigate to `/admin/users` and block/unblock customer accounts with a reason.
  - [ ] Blocked customer cannot log in; attempt returns descriptive error message.
  - [ ] Admin cannot block or soft-delete their own administrative account.
  - [ ] Admin can access `/admin/profile` to update contact information and change admin password.
- **Verification Command:** `tsx apps/web/scripts/test-admin.ts`
- **Exit Condition:** All four admin sections (Dashboard, Orders, Books, Users, Profile) support full mutation workflows.

---

## Phase 03 Gate: Customer Account & Commerce
- **Gate Objective:** Deliver complete post-order self-service, account maintenance, and replacement workflows.
- **Testable Acceptance Criteria:**
  - [ ] Guest items in `localStorage` automatically merge into user's DB cart upon login without duplication.
  - [ ] Customer can navigate to `/addresses`, click "Edit Address", update fields, and save changes.
  - [ ] 6-digit Indian PIN code validation rejects invalid postal codes with inline error.
  - [ ] Customer can navigate to `/profile`, enter current password, and set new password.
  - [ ] Delivered orders within 7 days display "Request Replacement" button on `/orders/[id]`.
  - [ ] Customer submits replacement request with reason (Damaged, Defective, Wrong Item) and description; status transitions to `Replacement Requested`.
  - [ ] Orders delivered > 7 days ago disable or hide the replacement request button.
  - [ ] Supabase Realtime channel updates order status timeline live when admin updates status in another tab.
- **Verification Command:** `npm --prefix apps/web run test-remediation`
- **Exit Condition:** All customer account features, address editing, password change, and replacement flows operate with 100% parity.

---

## Phase 04 Gate: Backend & Database Integrity
- **Gate Objective:** Schema check constraints, RLS policies, and RPC privileges are fully validated.
- **Testable Acceptance Criteria:**
  - [ ] Database migration expands `audit_logs.action` check constraint to include all admin operations.
  - [ ] RLS policy allows authenticated administrators to insert into `public.audit_logs`.
  - [ ] Admin order status updates and cancellations record audit logs without throwing constraint errors.
  - [ ] Migration 3 policies wrapped with `DROP POLICY IF EXISTS` to prevent collision on existing databases.
  - [ ] `settle_payment_atomic` and `record_payment_failure_atomic` RPCs restrict execution strictly to `postgres, service_role`.
  - [ ] Unauthenticated and non-admin authenticated users cannot execute sensitive payment RPCs.
- **Verification Command:** Read-only execution of preflight query suite on PostgreSQL 17.6.
- **Exit Condition:** Zero database check constraint violations or RLS privilege errors occur during operations.

---

## Phase 05 Gate: Frontend & Content Parity
- **Gate Objective:** 100% content, storytelling, and textual parity with the legacy application.
- **Testable Acceptance Criteria:**
  - [ ] Homepage renders `<OrderSteps />` with 4 numbered steps, titles, descriptions, and icons.
  - [ ] Homepage renders `<Reviews />` with customer testimonials, verified buyer badges, and ratings.
  - [ ] About page restored to 250+ lines matching legacy text: Quranic quote, Why Choose Us, Values, Founder note.
  - [ ] Support page restored to 8 categories and all 8 original FAQ questions and answers.
  - [ ] Text content verified free of spelling errors, broken placeholders, or placeholder emojis.
- **Verification Command:** Textual diff and component presence assertion script.
- **Exit Condition:** Zero missing legacy content sections; 100% textual fidelity verified.

---

## Phase 06 Gate: Design System & UI/UX Parity
- **Gate Objective:** Brand visual tokens, typography, and styling render identically across all viewports.
- **Testable Acceptance Criteria:**
  - [ ] `--color-primary-gold: #C9A24A;` and `--color-accent-gold: #E5C87B;` declared in `:root` in `globals.css`.
  - [ ] All 80+ component references to `var(--color-primary-gold)` resolve to active gold hex without fallbacks.
  - [ ] Cinzel font weights 400, 500, 600, 700, 800, and 900 loaded in Next.js layout.
  - [ ] Primary buttons display gold background with black text; hover transition smoothly darkens to accent gold.
  - [ ] Container widths standardized using `<PageContainer size="lg">` matching legacy `max-w-[1200px]`.
- **Verification Command:** Automated CSS property resolution check across compiled DOM.
- **Exit Condition:** Zero undefined CSS variables; visual parity verified on 375px, 768px, 1280px, and 1920px viewports.

---

## Phase 07 Gate: Animation & Micro-interactions
- **Gate Objective:** Reintroduce fluid transitions, toast alerts, and interactive physics.
- **Testable Acceptance Criteria:**
  - [ ] Global `ToastProvider` mounted in root layout; `useToast()` accessible in all client components.
  - [ ] Toasts trigger on: Add to Cart, Cart quantity change, Address saved, Login success, Admin actions.
  - [ ] Toasts slide up smoothly, persist for 4 seconds, and provide manual dismiss button.
  - [ ] `<Modal />` and `<ConfirmModal />` dialogs animate with backdrop fade-in and scale-up transition.
  - [ ] `<BookCard />` elements feature `-translate-y-[6px]` lift and expanding gold box shadow on hover.
  - [ ] Animations maintain smooth 60fps performance on mobile without cumulative layout shift (CLS = 0).
- **Verification Command:** Interaction test simulating toast triggers and modal state changes.
- **Exit Condition:** Tactile feedback and animation polish match the original React SPA.

---

## Phase 08 Gate: Advanced UX & Accessibility (a11y)
- **Gate Objective:** Mobile bottom navigation bar operational and WCAG 2.1 AA compliance achieved.
- **Testable Acceptance Criteria:**
  - [ ] `<MobileBottomNav />` renders fixed to bottom of mobile viewports (`< 768px`).
  - [ ] Bottom tabs (Home, Books, Cart, Orders, Profile) highlight active route.
  - [ ] Cart icon in mobile bottom nav displays real-time item count badge.
  - [ ] Interactive elements provide visible focus rings on keyboard tab traversal (`focus-visible:ring-2`).
  - [ ] Form inputs have associated `<label>` elements and accessible validation error announcements.
  - [ ] Automated accessibility audit using axe-core reports 0 critical or serious violations.
  - [ ] Color contrast ratio between text and dark background meets minimum 4.5:1 standard.
- **Verification Command:** Chrome DevTools / axe-core accessibility audit run.
- **Exit Condition:** Mobile bottom nav operational; zero accessibility blockers.

---

## Phase 09 Gate: Integration & End-to-End QA
- **Gate Objective:** Third-party gateways, webhooks, and logistics verified end-to-end.
- **Testable Acceptance Criteria:**
  - [ ] Razorpay online checkout in Test Mode creates order, accepts test payment, and verifies HMAC signature.
  - [ ] Razorpay webhook route processes `payment.captured` idempotently without double-crediting.
  - [ ] Delhivery pincode serviceability check returns valid serviceability response for Indian postal codes.
  - [ ] Delhivery tracking webhook updates order status to `Delivered` and marks COD payment `Paid`.
  - [ ] Resend email client sends order confirmation, payment receipt, and cancellation emails asynchronously.
  - [ ] Full Postman/Newman integration collection executes with 100% pass rate.
- **Verification Command:** `newman run server/features/POSTMAN/Orders.postman_collection.json`
- **Exit Condition:** All external integrations operate reliably with comprehensive error handling and logging.

---

## Phase 10 Gate: Performance, Security & Optimization
- **Gate Objective:** Lighthouse score >= 90 across all categories; production security headers enforced.
- **Testable Acceptance Criteria:**
  - [ ] Strict Content Security Policy (CSP), HSTS, and X-Content-Type-Options configured in `middleware.ts`.
  - [ ] Rate limiting active on authentication and payment endpoints to mitigate brute-force attacks.
  - [ ] Images optimized using Next.js `<Image />` with automatic WebP conversion and responsive sizing.
  - [ ] Production bundle analyzer confirms zero redundant dependencies or oversized client packages.
  - [ ] Lighthouse score >= 90 across Performance, Accessibility, Best Practices, and SEO on mobile viewports.
  - [ ] Production build (`npm run build`) completes with zero TypeScript errors or lint warnings.
- **Verification Command:** `npm --prefix apps/web run build && npx lighthouse-ci collect`
- **Exit Condition:** Production engineering standards satisfied with verified 90+ Lighthouse score.

---

## Phase 11 Gate: Final Production Readiness & Release
- **Gate Objective:** Remote database migration applied, smoke tests verified, production release signed off.
- **Testable Acceptance Criteria:**
  - [ ] Explicit user authorization received for remote database operations.
  - [ ] Pre-migration snapshot taken in Supabase Dashboard.
  - [ ] Preflight SQL script executed against remote database with clean exit code.
  - [ ] Sequential migrations 1 through 6 applied cleanly to remote database.
  - [ ] Catalog seeded with 5 baseline books (`supabase/seed.sql`); row count verified.
  - [ ] PostgREST schema cache reloaded (`NOTIFY pgrst, 'reload schema'`).
  - [ ] Production smoke test verifies login, book search, add to cart, checkout, and admin dashboard.
  - [ ] Zero unhandled errors in Vercel or Supabase production logs.
- **Verification Command:** Live production smoke suite probe.
- **Exit Condition:** User signs off on complete 100% migration parity and approves production release.

