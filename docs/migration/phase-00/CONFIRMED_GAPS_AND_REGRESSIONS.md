# Confirmed Gaps & Regressions Catalog
## MD Shakib Islamic Books — Deduplicated & Prioritized Remediation Backlog

> **Phase:** Phase 00 — Baseline & Audit Freeze  
> **Classification Standard:**  
> - **P0:** Critical Blocker (Completely breaks commerce, catalog administration, or brand styling)  
> - **P1:** High-Priority Business Gap (Essential customer self-service, moderation, or database failure)  
> - **P2:** Medium-Priority UX / Content Regression (Visual mismatch, missing content, or navigation gap)  
> - **P3:** Low-Priority Polish / Minor Inconsistency (Styling refinement or non-critical modal)  
> **Total Defect Count:** 25 verified defects across 44 audited features

---

## 1. P0 — Critical Functional & Visual Blockers

### [P0-01] Storefront "Add to Cart" Disconnected Across Entire Application
- **Feature ID:** `FEAT-10` (and `FEAT-05`)
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  1. In `apps/web/components/commerce/BookCard.tsx`, the `onAddToCart` prop is accepted, but neither `apps/web/app/page.tsx` nor `apps/web/app/books/BooksCatalogClient.tsx` passes an `onAddToCart` callback to `<ProductGrid />`.
  2. In `apps/web/app/books/[id]/BookDetailClient.tsx` (lines 29–34), `handleAddToCart` is a dummy stub:
     ```tsx
     const handleAddToCart = () => {
       // Phase 5A: Client-side feedback. Persistent cart is integrated in Phase 5C.
       setAdded(true);
       setTimeout(() => setAdded(false), 2000);
     };
     ```
  3. The backend server action `addToCart` in `apps/web/lib/commerce/cart.ts` (line 164) is never called by any client component in the repository.
- **Root Cause:** Storefront UI development in Phase 5A stubbed out the client handlers and failed to wire the backend server actions created in Phase 5C.
- **User Impact:** Visitors and customers cannot add any books to the shopping cart from any screen.
- **Business Impact:** 100% loss of e-commerce conversions; natural customer purchase flow is completely blocked.
- **Dependencies:** `FEAT-09` (Guest Cart), `FEAT-44` (Navbar Cart Badge).
- **Remediation Phase:** **Phase 01 (Critical Functional Restoration)**.

---

### [P0-02] Admin Book Catalog Management is 100% Read-Only
- **Feature ID:** `FEAT-32`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  `apps/web/app/admin/books/page.tsx` renders a static `<table>` displaying books from PostgreSQL. There are zero buttons, modals, or server actions to create a new book, edit title/author/price, adjust inventory stock, set the primary cover, or soft-delete a book.
- **Root Cause:** The admin interface was built as a read-only reporting table; CRUD mutation actions and modals were never implemented.
- **User Impact:** Administrators cannot add new books or manage existing inventory from the web interface.
- **Business Impact:** Store inventory cannot be updated or maintained without direct SQL database access.
- **Dependencies:** `FEAT-28` (Admin RBAC), `FEAT-39` (Cloudinary Upload), `FEAT-40` (Audit Logging).
- **Remediation Phase:** **Phase 02 (Complete Admin Management)**.

---

### [P0-03] Brand Gold CSS Variables Undefined Across 30+ Pages
- **Feature ID:** `FEAT-41`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  In `apps/web/app/globals.css`, the brand color is declared as `--color-gold: #C9A24A;` inside `@theme`. However, over 80 elements in 30+ files reference `var(--color-primary-gold)` and `var(--color-accent-gold)`:
  - `apps/web/components/commerce/BookCard.tsx`
  - `apps/web/components/ui/Button.tsx`
  - `apps/web/components/layout/Navbar.tsx`
  - `apps/web/app/books/BooksCatalogClient.tsx`
  - `apps/web/app/admin/orders/AdminOrdersClient.tsx`
  Because `--color-primary-gold` is not declared on `:root`, elements without an inline fallback fail to resolve the color, rendering text and borders transparent, gray, or default white.
- **Root Cause:** Variable naming mismatch during Tailwind CSS v4 migration (`--color-gold` declared instead of `--color-primary-gold`).
- **User Impact:** Inconsistent and broken luxury gold branding across the storefront and admin panel.
- **Business Impact:** Unprofessional visual presentation severely damaging customer brand trust.
- **Dependencies:** None.
- **Remediation Phase:** **Phase 06 (Design System & UI/UX Parity)**.

---

## 2. P1 — High-Priority Business Gaps

### [P1-01] Guest Shopping Cart Eliminated Without Client Replacement
- **Feature ID:** `FEAT-09`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  In `apps/web/app/cart/CartClient.tsx` (lines 47–67), unauthenticated users visiting `/cart` are blocked:
  ```tsx
  if (!isAuthenticated) {
    return (
      <PageContainer size="md">
        <h1 className="text-2xl font-serif text-neutral-200 uppercase font-bold">
          Sign In to View Your Cart
        </h1>
        <Link href="/login?redirect=/cart">Log In Now</Link>
      </PageContainer>
    );
  }
  ```
  Legacy application supported a persistent `localStorage` cart (`guest_cart`) allowing visitors to manage items before signing in.
- **Root Cause:** Cart implementation assumed Supabase authentication as a hard prerequisite for viewing cart state.
- **User Impact:** Prospective buyers are forced to register or log in before they can even inspect their cart.
- **Business Impact:** High cart abandonment rate; substantial drop in sales funnel conversion.
- **Dependencies:** `FEAT-10` (Add to Cart).
- **Remediation Phase:** **Phase 01 (Critical Functional Restoration)**.

---

### [P1-02] Guest Cart Merge upon Authentication Missing
- **Feature ID:** `FEAT-13`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  Search across `apps/web/lib/commerce/cart.ts` and `apps/web/lib/auth/actions.ts` shows zero occurrences of cart merging logic. Legacy `POST /api/v1/cart/merge` was completely omitted.
- **Root Cause:** Omitted during authentication and cart server action authoring.
- **User Impact:** Any items added by a guest before logging in are discarded upon sign-in.
- **Business Impact:** Frustrated customers forced to re-discover and re-add books after logging in.
- **Dependencies:** `FEAT-09` (Guest Cart), `FEAT-17` (Customer Login).
- **Remediation Phase:** **Phase 03 (Customer Account & Commerce)**.

---

### [P1-03] Customer Replacement Request Workflow Completely Missing
- **Feature ID:** `FEAT-27`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  While `apps/web/lib/admin/orders.ts` has `approveAdminReplacement` and `rejectAdminReplacement`, `apps/web/app/orders/[id]/OrderDetailClient.tsx` and `apps/web/lib/commerce/orders.ts` have zero customer replacement request actions or UI buttons.
- **Root Cause:** Asymmetric implementation where administrative review was coded but the customer submission trigger was forgotten.
- **User Impact:** Customers receiving damaged or defective books cannot exercise their 7-day replacement guarantee through the web portal.
- **Business Impact:** Customers forced to contact support manually; violation of advertised replacement policy.
- **Dependencies:** `FEAT-24` (Order Details).
- **Remediation Phase:** **Phase 03 (Customer Account & Commerce)**.

---

### [P1-04] Admin Customer Moderation Actions Missing (Read-Only Table)
- **Feature ID:** `FEAT-34`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  `apps/web/app/admin/users/page.tsx` renders a read-only table. It has zero buttons, modals, or server actions to block a user, unblock a user, or soft-delete an account.
- **Root Cause:** Administrative user screen built only as a view-only table.
- **User Impact:** Administrators cannot suspend abusive or fraudulent customer accounts.
- **Business Impact:** Security and compliance risk; inability to enforce store terms of service.
- **Dependencies:** `FEAT-28` (Admin RBAC).
- **Remediation Phase:** **Phase 02 (Complete Admin Management)**.

---

### [P1-05] Dedicated Admin Profile Page Missing
- **Feature ID:** `FEAT-35`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  No `/admin/profile` directory or page exists under `apps/web/app/admin/`. The admin navigation sidebar (`AdminNavClient.tsx`) only links to Dashboard, Orders, Books, and Users. Legacy `client/src/pages/AdminProfilePage.jsx` was omitted.
- **Root Cause:** Route omitted from Next.js App Router tree.
- **User Impact:** Administrators cannot update their contact details or change their administrative password from within the admin layout.
- **Business Impact:** Administrative credential security gap.
- **Dependencies:** `FEAT-28` (Admin RBAC).
- **Remediation Phase:** **Phase 02 (Complete Admin Management)**.

---

### [P1-06] System Audit Logging Check Constraint & RLS Failure
- **Feature ID:** `FEAT-40`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  1. `supabase/migrations/20261028000001_core_schema.sql` (lines 211–213) restricts `audit_logs.action` to:
     `'CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'PAYMENT'`.
  2. `apps/web/lib/admin/orders.ts` (lines 292, 380, 448, 501) attempts to insert:
     - `UPDATE_ORDER_STATUS`
     - `ADMIN_CANCEL_ORDER`
     - `APPROVE_REPLACEMENT`
     - `REJECT_REPLACEMENT`
  3. `supabase/migrations/20261028000003_rls_policies.sql` defines ONLY a `SELECT` policy for admins; zero `INSERT` policies exist for `authenticated` users on `audit_logs`.
- **Root Cause:** Mismatch between schema check constraint enum and application action strings, combined with missing RLS insert policy.
- **User Impact:** Admin order status transitions and cancellations fail or fail to record audit history.
- **Business Impact:** Audit trail is broken; administrative actions throw SQL errors in production.
- **Dependencies:** PostgreSQL Schema & RLS.
- **Remediation Phase:** **Phase 04 (Backend & Database Integrity)**.

---

### [P1-07] Global Navbar Dynamic Authentication & Cart State Desynchronized
- **Feature ID:** `FEAT-44`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  `apps/web/app/page.tsx` (line 26) and `apps/web/app/books/page.tsx` (line 50) invoke `<Navbar />` with zero props. In `apps/web/components/layout/Navbar.tsx`, default props are `cartCount = 0` and `user = null`.
- **Root Cause:** Public Server Components render `<Navbar />` without reading the active Supabase session or fetching user cart count.
- **User Impact:** Logged-in customers browsing the home or books catalog always see a "Login" button and cart count 0.
- **Business Impact:** Degraded user experience causing customer confusion about login state.
- **Dependencies:** `FEAT-11` (Cart Sync), `FEAT-17` (Customer Login).
- **Remediation Phase:** **Phase 01 (Critical Functional Restoration)**.

---

### [P1-08] Authenticated Cart Live Stock Validation & Guest Fallback Missing
- **Feature ID:** `FEAT-11`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  In `apps/web/lib/commerce/cart.ts:getCart`, cart items are fetched from the database, but item availability is not validated against live `books.stock` levels upon loading. If an item went out of stock after being added, the cart does not flag the shortage. In addition, unauthenticated visitors accessing `/cart` are hard-blocked rather than gracefully displaying local storage guest items.
- **Root Cause:** Omission of stock revalidation join in `getCart()` and hard sign-in gate in `CartClient.tsx`.
- **User Impact:** Customers may proceed to checkout with stale out-of-stock items, encountering errors during order creation.
- **Business Impact:** Checkout exceptions and failed order placement attempts.
- **Dependencies:** `FEAT-09` (Guest Cart), `FEAT-12` (Cart Actions).
- **Remediation Phase:** **Phase 01 (Critical Functional Restoration)**.

---

## 3. P2 — Medium-Priority UX & Content Regressions

### [P2-01] Homepage OrderSteps and Reviews Sections Omitted
- **Feature ID:** `FEAT-01`
- **Status:** **CONFIRMED REGRESSION**
- **Code Evidence:**
  Legacy `client/src/pages/HomePage.jsx` mounted `<OrderSteps />` ("How to Order") and `<Reviews />` ("What Our Customers Say"). In `apps/web/app/page.tsx`, neither component is imported or rendered.
- **User Impact:** New customers do not receive guidance on how ordering works or social proof from buyer reviews.
- **Remediation Phase:** **Phase 05 (Frontend & Content Parity)**.

---

### [P2-02] About Us Page Content Severely Truncated (65% Omitted)
- **Feature ID:** `FEAT-06`
- **Status:** **CONFIRMED REGRESSION**
- **Code Evidence:**
  Legacy `AboutPage.jsx` had 254 lines; new `apps/web/app/about/page.tsx` has 79 lines. Omitted:
  - Quranic Islamic quote callout section.
  - "Why Choose Us" 3-card grid.
  - "Our Core Values" 4-card grid.
  - Founder dedication message.
  - Animated book graphic (replaced with static emoji).
- **User Impact:** Truncated brand story and absent Islamic literature context.
- **Remediation Phase:** **Phase 05 (Frontend & Content Parity)**.

---

### [P2-03] Support & FAQ Categories and Question Count Reduced
- **Feature ID:** `FEAT-07`
- **Status:** **CONFIRMED REGRESSION**
- **Code Evidence:**
  Legacy `SupportPage.jsx` had 8 FAQ categories and 8 detailed answers with sidebar navigation. `apps/web/app/support/page.tsx` has only 5 categories and 4 questions.
- **User Impact:** Customer support self-service answers for payments, delivery, and returns are missing.
- **Remediation Phase:** **Phase 05 (Frontend & Content Parity)**.

---

### [P2-04] Customer Password Change from Profile Missing
- **Feature ID:** `FEAT-20`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  Legacy `ProfilePage.jsx` included a password change tab (`PATCH /api/v1/users/change-password`). `apps/web/app/profile/ProfileClient.tsx` has no password change UI.
- **User Impact:** Logged-in customers cannot change their password without logging out and using forgot-password recovery.
- **Remediation Phase:** **Phase 03 (Customer Account & Commerce)**.

---

### [P2-05] Saved Address Editing Action Missing
- **Feature ID:** `FEAT-21`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  `apps/web/lib/commerce/addresses.ts` has `createAddress`, `deleteAddress`, and `setDefaultAddress`, but NO `updateAddress` server action. `AddressesClient.tsx` has no edit address modal.
- **User Impact:** Customers cannot update a typo in a saved delivery address; they must delete and recreate it.
- **Remediation Phase:** **Phase 03 (Customer Account & Commerce)**.

---

### [P2-06] Real-time Order Tracking Updates Unwired
- **Feature ID:** `FEAT-25`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  Legacy used Socket.io to push live status updates to `OrderDetailsPage.jsx`. In `apps/web/app/orders/[id]/OrderDetailClient.tsx`, Supabase Realtime channel subscription is absent.
- **User Impact:** Customer order status timeline does not update when an administrator changes status without manual browser refresh.
- **Remediation Phase:** **Phase 03 (Customer Account & Commerce)**.

---

### [P2-07] Cloudinary Image Uploader Unconnected to Admin Frontend
- **Feature ID:** `FEAT-39`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  Route Handlers `/api/admin/media/upload` and `/api/admin/media/sign` exist, but no component in `apps/web/app/admin/` connects to them.
- **User Impact:** Admin cannot upload new book cover images.
- **Remediation Phase:** **Phase 02 (Complete Admin Management)**.

---

### [P2-08] Mobile Bottom Navigation Bar Missing
- **Feature ID:** `FEAT-42`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  Legacy `client/src/components/MobileBottomNav.jsx` provided fixed bottom navigation on mobile viewports. It was completely omitted from `apps/web/app/layout.tsx`.
- **User Impact:** Mobile users must rely on the top hamburger drawer, losing quick one-tap tab navigation.
- **Remediation Phase:** **Phase 08 (Advanced UX & Accessibility)**.

---

### [P2-09] Global Animated Toast Notification System Missing
- **Feature ID:** `FEAT-43`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  Legacy `client/src/context/ToastContext.jsx` provided animated slide-up toasts for success, error, warning, and info. `apps/web/` has no toast system; actions fall back to inline text or browser alerts.
- **User Impact:** Users lack tactile feedback when adding to cart, saving addresses, or copying tracking links.
- **Remediation Phase:** **Phase 07 (Animation & Micro-interactions)**.

---

### [P2-10] Customer Account Soft-Deletion & Lifetime Stats Missing
- **Feature ID:** `FEAT-19`
- **Status:** **CONFIRMED DEFECT**
- **Code Evidence:**
  Legacy `client/src/pages/ProfilePage.jsx` allowed customer self-service account deletion (`DELETE /api/v1/users/account`, soft-deleting `isDeleted = true`) and displayed user order counters. In `apps/web/app/profile/ProfileClient.tsx`, `updateCustomerProfile` updates only name and phone; account deletion and order counter cards are completely omitted.
- **Root Cause:** Incomplete profile actions implementation in `apps/web/lib/auth/actions.ts`.
- **User Impact:** Customers cannot delete their accounts or view their order history stats on the profile screen.
- **Business Impact:** Compliance and user data privacy gap (inability to self-request account deactivation).
- **Dependencies:** `FEAT-17` (Auth Session).
- **Remediation Phase:** **Phase 03 (Customer Account & Commerce)**.

---

## 4. P3 — Minor Polish & Visual Inconsistencies

### [P3-01] Related Books Carousel Visual Styling
- **Feature ID:** `FEAT-05`
- Static 4-item grid on mobile rather than smooth horizontal swipe carousel.
- **Remediation Phase:** Phase 05.

### [P3-02] Order Cancellation Browser Prompt Usage
- **Feature ID:** `FEAT-26`
- Cancellation prompt in `OrderDetailClient.tsx` uses native browser `prompt()` rather than a custom luxury modal.
- **Remediation Phase:** Phase 07.

### [P3-03] Delhivery Manual Tracking Link Formatting
- **Feature ID:** `FEAT-24`
- Order detail page renders AWB as text rather than a direct clickable external tracking link.
- **Remediation Phase:** Phase 03.

### [P3-04] Admin Order Filter Layout Minor Polish
- **Feature ID:** `FEAT-30`
- Minor layout wrap on tablet viewports when filtering orders.
- **Remediation Phase:** Phase 02.

---

## 5. Consolidated Remediation Summary & Mathematical Reconciliation

```
┌────────────────────────────────────────────────────────────────────────┐
│                   DEFECT SEVERITY BREAKDOWN (25 ENTRIES)               │
├───────────────────────────────┬────────────┬───────────────────────────┤
│ Severity Level                │ Count      │ Target Phases             │
├───────────────────────────────┼────────────┼───────────────────────────┤
│ P0 (Critical Blockers)        │     3      │ Phase 01, Phase 02, 06    │
│ P1 (High Business Priority)   │     8      │ Phase 01, Phase 02, 03, 04│
│ P2 (Medium UX / Content Gaps) │    10      │ Phase 02, 03, 05, 07, 08  │
│ P3 (Minor Polish / Refinement)│     4      │ Phase 02, 03, 05, 07      │
├───────────────────────────────┼────────────┼───────────────────────────┤
│ TOTAL CATALOGED DEFECT ENTRIES│    25      │ Phases 01 through 08      │
└───────────────────────────────┴────────────┴───────────────────────────┘
```

### Exact Mathematical Reconciliation Formula:
- **Total Features Evaluated:** **44 features**
- **Features with Implementation Parity:** **21 features (47.7%)**
  - Fully Migrated: 19 features (15 T1+T2 verified, 4 T1 static code verified)
  - Replaced Architectural Upgrades: 2 features (`FEAT-08`, `FEAT-38`)
- **Impacted Non-Migrated Features Requiring Remediation:** **23 features (52.3%)**
  - Partially Migrated: 11 features (`FEAT-01, 05, 07, 11, 19, 21, 24, 25, 34, 39, 44`)
  - Not Migrated (Missing): 9 features (`FEAT-09, 10, 13, 20, 27, 32, 35, 42, 43`)
  - Regressed: 3 features (`FEAT-06, 40, 41`)
  - **Check:** 11 + 9 + 3 = **23 features**.
- **Mapping to Defect Entries:**
  - 21 impacted features map 1-to-1 to defect entries (`21 entries`).
  - `FEAT-10` and `FEAT-05` share a common Add to Cart root cause in entry `[P0-01]` (`-1 entry`).
  - `FEAT-05` has a secondary cosmetic polish entry `[P3-01]` (`+1 entry`).
  - 2 Fully Migrated features have secondary cosmetic polish entries: `FEAT-26` in `[P3-02]` and `FEAT-30` in `[P3-04]` (`+2 entries`).
  - **Check:** 23 impacted features - 1 (shared P0-01) + 1 (FEAT-05 P3-01) + 2 (FEAT-26/30 polish) = **25 cataloged defect entries**.

---

## 6. Comprehensive Feature-to-Defect Mapping Table

| Feature ID | Feature Name | Current Status | Defect ID | Severity | Root Cause Summary | Remediation Phase |
|:---:|---|:---:|:---:|:---:|---|:---:|
| **FEAT-01** | Homepage Sections | PARTIALLY MIGRATED | `[P2-01]` | P2 | `<OrderSteps />` & `<Reviews />` omitted from `page.tsx`. | Phase 05 |
| **FEAT-05** | Book Detail Page | PARTIALLY MIGRATED | `[P0-01]`<br>`[P3-01]` | P0<br>P3 | `handleAddToCart` is a 2s timer stub; related carousel static. | Phase 01<br>Phase 05 |
| **FEAT-06** | About Us Page | REGRESSED | `[P2-02]` | P2 | 65% of legacy content omitted (quote, values, founder note). | Phase 05 |
| **FEAT-07** | Support & FAQ Page | PARTIALLY MIGRATED | `[P2-03]` | P2 | FAQ categories reduced from 8 to 5; questions from 8 to 4. | Phase 05 |
| **FEAT-09** | Guest Shopping Cart | NOT MIGRATED | `[P1-01]` | P1 | Unauthenticated visitors blocked by hard sign-in gate. | Phase 01 |
| **FEAT-10** | Storefront Add to Cart | NOT MIGRATED | `[P0-01]` | P0 | `onAddToCart` prop not passed by catalog pages to `BookCard`. | Phase 01 |
| **FEAT-11** | Authenticated Cart Sync | PARTIALLY MIGRATED | `[P1-08]` | P1 | Missing live stock validation on load and guest cart fallback. | Phase 01 |
| **FEAT-13** | Guest Cart Merge | NOT MIGRATED | `[P1-02]` | P1 | No cart merge server action or post-login sync exists. | Phase 03 |
| **FEAT-19** | Customer Profile View/Edit| PARTIALLY MIGRATED | `[P2-10]` | P2 | Account soft-deletion action and order stats omitted. | Phase 03 |
| **FEAT-20** | Customer Password Change | NOT MIGRATED | `[P2-04]` | P2 | Profile page lacks password change form and server action. | Phase 03 |
| **FEAT-21** | Address Management | PARTIALLY MIGRATED | `[P2-05]` | P2 | `updateAddress` server action and edit modal missing. | Phase 03 |
| **FEAT-24** | Order Details & Tracking | PARTIALLY MIGRATED | `[P3-03]` | P3 | Carrier AWB rendered as plain text instead of clickable link. | Phase 03 |
| **FEAT-25** | Real-time Tracking | PARTIALLY MIGRATED | `[P2-06]` | P2 | Supabase Realtime subscription not wired to timeline UI. | Phase 03 |
| **FEAT-26** | Order Cancellation | FULLY MIGRATED | `[P3-02]` | P3 | Fully operational backend; cancellation uses browser `prompt()`. | Phase 07 |
| **FEAT-27** | Replacement Request | NOT MIGRATED | `[P1-03]` | P1 | Customer order detail UI lacks replacement request action. | Phase 03 |
| **FEAT-30** | Admin Order Management | FULLY MIGRATED | `[P3-04]` | P3 | Fully operational backend; filter button layout wraps on tablet. | Phase 02 |
| **FEAT-32** | Admin Book Catalog CRUD | NOT MIGRATED | `[P0-02]` | P0 | Admin books page is 100% read-only table; no mutation actions. | Phase 02 |
| **FEAT-34** | Customer Moderation | PARTIALLY MIGRATED | `[P1-04]` | P1 | Admin users page is read-only; block/unblock actions missing. | Phase 02 |
| **FEAT-35** | Admin Profile & Password | NOT MIGRATED | `[P1-05]` | P1 | Dedicated `/admin/profile` route and password form omitted. | Phase 02 |
| **FEAT-39** | Cloudinary Media Upload | PARTIALLY MIGRATED | `[P2-07]` | P2 | Upload Route Handlers exist but are disconnected from admin UI. | Phase 02 |
| **FEAT-40** | System Audit Logging | REGRESSED | `[P1-06]` | P1 | PostgreSQL check constraint fails on `UPDATE_ORDER_STATUS`; RLS lacks insert. | Phase 04 |
| **FEAT-41** | Brand Design Tokens | REGRESSED | `[P0-03]` | P0 | `--color-primary-gold` undefined in `:root`; 80+ usages broken. | Phase 06 |
| **FEAT-42** | Mobile Bottom Nav | NOT MIGRATED | `[P2-08]` | P2 | `MobileBottomNav` component omitted from root layout. | Phase 08 |
| **FEAT-43** | Toast Notifications | NOT MIGRATED | `[P2-09]` | P2 | Zero global toast notification provider or context in app. | Phase 07 |
| **FEAT-44** | Navbar Dynamic Sync | PARTIALLY MIGRATED | `[P1-07]` | P1 | Public pages pass 0 props to `<Navbar />`, defaulting to logged-out. | Phase 01 |

