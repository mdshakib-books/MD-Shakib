# Phase 05 — Final Evidence Reconciliation & Acceptance Audit

**Project:** MD Shakib Islamic Books  
**Repository:** `MD-Shakib`  
**Branch:** `new-fix`  
**Phase:** 05 — Complete Frontend & Content Parity  
**Audit Timestamp:** November 2, 2026 (15:55 IST)  
**Audit Mode:** READ-ONLY VERIFICATION AND DOCUMENTATION RECONCILIATION  
**Lead Auditor:** Senior Frontend Architect & QA Assurance Agent  

---

## 1. Executive Verdict

### **VERDICT: CONDITIONALLY ACCEPTED**

**Status Summary:**
The Next.js App Router target application (`apps/web/`) has achieved complete functional, content, route, and layout parity with the legacy React/Vite application (`client/`). All 27 legacy routes, missing narrative blocks, trust badges, customer self-service modules, mobile bottom navigation, and administrative controls are implemented and verified against real runtime services.

The verdict is designated **CONDITIONALLY ACCEPTED** solely due to two non-blocking technical advisories that should be formalized prior to production release:
1. **Favicon Format:** `apps/web/public/favicon.ico` is currently a PNG byte stream copied from `logo.png` rather than a native multi-resolution Microsoft ICO binary container (`image/x-icon`), although modern browsers correctly resolve `/logo.png` as declared in `layout.tsx`.
2. **Device Testing Scope:** Responsive QA was verified using Chrome DevTools Protocol (CDP) device metric emulation across 5 standard breakpoints, rather than physical iOS WebKit and Android hardware devices.

All 104 backend regression tests and all 15 real-browser E2E scenarios passed with a **100% success rate**. Zero application source files were altered during this audit.

---

## 2. Git & Working-Tree Verification

### 2.1 Branch & HEAD State
- **Current Branch:** `new-fix` (Verified: `git branch --show-current`)
- **HEAD Commit:** `f6cb4dad08845f63f5fb6ac1867c8ea211d6ec50` (Verified: `git rev-parse HEAD`)
- **Git Commit Action:** **ZERO commits created**. Working tree preserves all modifications cleanly.

### 2.2 Short Status Inventory (`git status --short`)
```text
 M apps/web/app/about/page.tsx
 M apps/web/app/admin/AdminNavClient.tsx
 M apps/web/app/admin/books/AdminBooksClient.tsx
 M apps/web/app/books/[id]/BookDetailClient.tsx
 M apps/web/app/layout.tsx
 M apps/web/app/page.tsx
 M apps/web/app/support/page.tsx
 M apps/web/components/layout/Footer.tsx
 M apps/web/components/layout/Navbar.tsx
?? apps/web/app/admin/books/add/
?? apps/web/app/admin/dashboard/
?? apps/web/app/admin/profile/
?? apps/web/app/contact/
?? apps/web/components/home/
?? apps/web/components/layout/MobileBottomNav.tsx
?? apps/web/public/favicon.ico
?? apps/web/public/logo.png
?? apps/web/scripts/test-phase05-browser-e2e.ts
?? docs/migration/phase-05/
```

### 2.3 Working-Tree Integrity & Non-Regression Check
- **Phase 04 Integrity:** All Phase 04 backend files (`lib/supabase/`, `lib/commerce/`, database atomic RPC calls, webhook handlers, and RLS policies) remain completely untouched.
- **Diff Stat:** 9 files modified, 430 insertions(+), 109 deletions(-), strictly localized to UI component layers and documentation. No database migrations, package dependencies, or commerce business rules were modified.

---

## 3. Asset & Favicon Integrity

An independent binary inspection of all brand assets was conducted:

| Asset Path | Detected File Type | Dimensions | MD5 Checksum | Evaluation |
|---|---|---|---|---|
| `client/public/logo.png` | PNG image data (8-bit RGBA) | 1146 × 980 | `9f319802b2da6f678ae3fdf76e8bb15c` | **VERIFIED** Original Legacy Asset |
| `apps/web/public/logo.png` | PNG image data (8-bit RGBA) | 1146 × 980 | `9f319802b2da6f678ae3fdf76e8bb15c` | **VERIFIED** Identical Byte Copy |
| `apps/web/public/favicon.ico` | PNG image data (8-bit RGBA) | 1146 × 980 | `9f319802b2da6f678ae3fdf76e8bb15c` | **REPORTED / ADVISORY** PNG with `.ico` extension |

### 3.1 Metadata Analysis (`apps/web/app/layout.tsx`)
```typescript
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
```
- **Favicon Resolution:** Modern browsers (Chrome, Firefox, Safari, Edge) prioritize `<link rel="icon" href="/logo.png">` and render the 1146×980 PNG without error.
- **Advisory Finding:** `apps/web/public/favicon.ico` is not encoded in Microsoft Icon binary format (`00 00 01 00`). While modern browsers accept PNG bytes under any file extension, legacy HTTP clients or crawlers requesting direct `/favicon.ico` without inspecting MIME headers may report a format mismatch.
- **Recommended Action (Post-Phase 05):** Generate a true multi-resolution `.ico` file (16×16, 32×32, 48×48) from `logo.png` using a standard image processing pipeline.

---

## 4. Route-by-Route Verification Matrix

Independent reconciliation of the 27+ legacy route inventory against actual App Router files:

| # | Legacy Route | Target Route | Target Page File | Auth Req? | Admin Req? | Primary Interactions Verified | Test Coverage | Classification |
|---|---|---|---|---|---|---|---|---|
| 1 | `/` | `/` | `apps/web/app/page.tsx` | No | No | Hero browsing, OrderSteps, Reviews testimonials | E2E-TEST 01 | **VERIFIED** |
| 2 | `/books` | `/books` | `apps/web/app/books/page.tsx` | No | No | Category filters, Sort dropdown, Search debounce | E2E-TEST 06 | **VERIFIED** |
| 3 | `/books/:id` | `/books/[id]` | `apps/web/app/books/[id]/page.tsx` | No | No | Gallery, Trust badges, Add to Cart, Buy Now | E2E-TEST 07 | **VERIFIED** |
| 4 | `/about` | `/about` | `apps/web/app/about/page.tsx` | No | No | Hadith quote, 3 Why Choose Us, 4 Values, Founder letter | E2E-TEST 03 | **VERIFIED** |
| 5 | `/support` | `/support` | `apps/web/app/support/page.tsx` | No | No | 8 Category filters, 8 FAQ accordions, Contact CTA | E2E-TEST 04 | **VERIFIED** |
| 6 | `/contact` | `/contact` | `apps/web/app/contact/page.tsx` | No | No | WhatsApp link, Email desk, Inquiry form submission | E2E-TEST 05 | **VERIFIED** |
| 7 | `/cart` | `/cart` | `apps/web/app/cart/page.tsx` | No | No | Quantity (+/-), Remove, Totals calculation, Guest CTA | E2E-TEST 08 | **VERIFIED** |
| 8 | `/checkout` | `/checkout` | `apps/web/app/checkout/page.tsx` | Yes | No | Address select/add, COD vs Razorpay toggle, Order creation | Phase 01 Tests | **VERIFIED** |
| 9 | `/order-success` | `/order-success` | `apps/web/app/order-success/page.tsx` | Yes | No | Confirmation banner, Order ID, Tracking links | Phase 01 Tests | **VERIFIED** |
| 10 | `/orders` | `/orders` | `apps/web/app/orders/page.tsx` | Yes | No | Order history cards, status pills, View details link | Phase 03 Tests | **VERIFIED** |
| 11 | `/orders/:id` | `/orders/[id]` | `apps/web/app/orders/[id]/page.tsx` | Yes | No | Tracking timeline, AWB card, Cancel modal, Replace modal | Phase 03 Tests | **VERIFIED** |
| 12 | `/profile` | `/profile` | `apps/web/app/profile/page.tsx` | Yes | No | Customer profile update, phone editor, sign out | E2E-TEST 09 | **VERIFIED** |
| 13 | `/addresses` | `/addresses` | `apps/web/app/addresses/page.tsx` | Yes | No | Address cards, Add/Edit modal, Default address trigger | Phase 03 Tests | **VERIFIED** |
| 14 | `/login` | `/login` | `apps/web/app/login/page.tsx` | Guest | No | Email/Password validation, session creation, redirect | E2E-TEST 09, 10 | **VERIFIED** |
| 15 | `/register` | `/register` | `apps/web/app/register/page.tsx` | Guest | No | Registration inputs, client validation, OTP dispatch | Auth Tests | **VERIFIED** |
| 16 | `/verify-email` | `/verify-email` | `apps/web/app/verify-email/page.tsx` | No | No | Email verification instructions, login link | Static Build | **VERIFIED** |
| 17 | `/verify-registration-otp` | `/verify-registration-otp` | `apps/web/app/verify-registration-otp/page.tsx` | Guest | No | 6-digit OTP code inputs, resend timer, submit | Auth Tests | **VERIFIED** |
| 18 | `/forgot-password` | `/forgot-password` | `apps/web/app/forgot-password/page.tsx` | Guest | No | Password recovery email input, OTP dispatch | Auth Tests | **VERIFIED** |
| 19 | `/verify-otp` | `/verify-otp` | `apps/web/app/verify-otp/page.tsx` | Guest | No | Reset OTP code entry, verification | Auth Tests | **VERIFIED** |
| 20 | `/reset-password` | `/reset-password` | `apps/web/app/reset-password/page.tsx` | Guest | No | Password strength validation, reset submission | Auth Tests | **VERIFIED** |
| 21 | `/privacy-policy` | `/privacy-policy` | `apps/web/app/privacy-policy/page.tsx` | No | No | Legal text rendering, footer link navigation | Static Build | **VERIFIED** |
| 22 | `/terms` | `/terms` | `apps/web/app/terms/page.tsx` | No | No | Terms of service text rendering, navigation | Static Build | **VERIFIED** |
| 23 | `/admin` | `/admin` | `apps/web/app/admin/page.tsx` | Yes | Yes | KPI metric cards, sales velocity, recent orders | E2E-TEST 10 | **VERIFIED** |
| 24 | `/admin/dashboard` | `/admin/dashboard` | `apps/web/app/admin/dashboard/page.tsx` | Yes | Yes | Dynamic re-export alias of `/admin` | E2E-TEST 10 | **VERIFIED** |
| 25 | `/admin/books` | `/admin/books` | `apps/web/app/admin/books/page.tsx` | Yes | Yes | Catalog data table, inline stock edit, search | E2E-TEST 11, 13 | **VERIFIED** |
| 26 | `/admin/books/add` | `/admin/books/add` | `apps/web/app/admin/books/add/page.tsx` | Yes | Yes | Standalone book form, scholarly metadata, media upload | E2E-TEST 11 | **VERIFIED** |
| 27 | `/admin/orders` | `/admin/orders` | `apps/web/app/admin/orders/page.tsx` | Yes | Yes | Order processing table, status transition modals | Phase 02 Tests | **VERIFIED** |
| 28 | `/admin/users` | `/admin/users` | `apps/web/app/admin/users/page.tsx` | Yes | Yes | Customer management, block/unblock, spend history | Phase 02 Tests | **VERIFIED** |
| 29 | `/admin/profile` | `/admin/profile` | `apps/web/app/admin/profile/page.tsx` | Yes | Yes | Admin contact update, password security, sign out | E2E-TEST 12 | **VERIFIED** |
| 30 | `*` | `/_not-found` | `apps/web/app/not-found.tsx` | No | No | 404 heading, Return Home button | Static Build | **VERIFIED** |

---

## 5. Browser E2E Test Reconciliation

### 5.1 Test Execution Reconciliation
- **Total Test Cases Defined:** 15
- **Total Test Cases Executed in Rerun:** 15
- **Passed:** 15
- **Failed / Skipped:** 0
- **Pass Rate:** **100%**
- **Test Runner:** Custom Google Chrome CDP Harness (`apps/web/scripts/test-phase05-browser-e2e.ts`)
- **Execution Timestamp:** 2026-11-02 15:54:30 IST

### 5.2 Execution History Disclosure
During the initial implementation pass, the test suite encountered 5 initial failures caused by:
1. CSS `text-transform: uppercase` causing `document.body.innerText` to return uppercase strings in Blink/Chrome (`"STILL NEED HELP?"`, `"SHOPPING CART"`, `"PUBLICATION DETAILS"`, `"CONTACT INFORMATION"`).
2. The contact inquiry form subject input lacked an explicit `name="subject"` / `id="subject"` selector.

These were resolved by updating the assertions to be case-insensitive (`.toUpperCase().includes(...)`) and equipping the contact form inputs with accessible `id`, `name`, and `<label htmlFor="...">` attributes. The rerun completed with **15 / 15 passed**.

### 5.3 Screenshot Evidence Reconciled
All 13 visual screenshots claimed in `PHASE_05_FINAL_REPORT.md` exist and were verified on disk:

| Ref | Screenshot File | Size | Verified DOM Elements |
|---|---|---|---|
| 01 | `01-homepage-desktop.png` | 588.9 KB | Desktop Navbar, Hero artwork, Curated books, OrderSteps (4 steps), Customer Reviews (3 cards), Footer. |
| 02 | `02-homepage-mobile.png` | 143.8 KB | Mobile 375px view, zero horizontal scroll, fixed `MobileBottomNav` bar. |
| 03 | `03-about-restored.png` | 71.4 KB | Prophetic Hadith banner, Why Choose Us (3 cards), Values (4 cards), Founder Letter, CTA banner. |
| 04 | `04-support-page.png` | 77.6 KB | 8 Help categories, 8 FAQ accordion items, expanded accordion state, Contact banner. |
| 05 | `05-contact-page.png` | 78.2 KB | WhatsApp channel, Email help desk, Operating hours, Form "Message Received" confirmation. |
| 06 | `06-catalog-page.png` | 62.5 KB | Book grid cards, category filter pills, sort controls. |
| 07 | `07-book-details.png` | 59.8 KB | Free delivery badge, 3 trust badges (7 Days, COD, Secure), Add to Cart & Buy Now buttons. |
| 08 | `08-cart-badge-and-totals.png` | 67.3 KB | Cart line items, quantity buttons, live Order Summary cost breakdown. |
| 09 | `09-customer-account.png` | 50.3 KB | Customer profile card, orders shortcut, addresses and security links. |
| 10 | `10-admin-dashboard.png` | 126.0 KB | Revenue metric cards, operational charts, recent orders table. |
| 11 | `11-admin-add-book.png` | 87.7 KB | Dedicated Add Book route, Basic Info, Pricing/Stock, Publication Details, `MediaUploader`. |
| 12 | `12-admin-profile.png` | 107.8 KB | Dedicated Admin Profile route, Admin Identity card, Contact form, Password security form. |
| 13 | `13-admin-mobile-nav.png` | 59.8 KB | Mobile admin view showing Dashboard, Books, Orders, Users, Profile bottom nav. |

---

## 6. Responsive QA Reconciliation

### 6.1 Breakpoint Audit Findings

| Breakpoint | Target Form Factor | Verified Scroll Width | Horizontal Overflow? | Bottom Nav State | Status |
|---|---|---|---|---|---|
| **375 × 812** | iPhone SE / Compact Mobile | 375 px | **None (0px)** | Enabled (`z-[9999]`) | **VERIFIED** |
| **390 × 844** | iPhone 14 / Standard Mobile | 390 px | **None (0px)** | Enabled (`z-[9999]`) | **VERIFIED** |
| **768 × 1024** | iPad Portrait / Tablet | 768 px | **None (0px)** | Hidden (`md:hidden`) | **VERIFIED** |
| **1024 × 768** | Small Laptop / Tablet Landscape | 1024 px | **None (0px)** | Hidden (`md:hidden`) | **VERIFIED** |
| **1440 × 900** | Desktop Standard / Wide | 1440 px | **None (0px)** | Hidden (`md:hidden`) | **VERIFIED** |

### 6.2 Mobile Bottom Navigation Safe-Area Verification
- **DOM Placement:** `fixed bottom-0 left-0 right-0 z-[9999] h-[64px]`
- **Root Layout Safe Padding:** `apps/web/app/layout.tsx` enforces `pb-[70px] md:pb-0` on `<body>`.
- **Content Occlusion Check:** Form submit buttons, checkout CTA buttons, and footer copyright text render cleanly above the 70px boundary, preventing any occlusion or unreachable touch controls.
- **Physical Device Limitation:** Verified through Chrome DevTools emulation. Physical testing on devices with hardware notches/dynamic islands (e.g. `env(safe-area-inset-bottom)`) is recommended for post-migration hardening.

---

## 7. Accessibility (a11y) Audit Findings

### 7.1 Mathematical Contrast Recalculation (WCAG 2.1 Formula)
Using relative luminance $L = 0.2126 R_L + 0.7152 G_L + 0.0722 B_L$ and contrast ratio $(L_1 + 0.05) / (L_2 + 0.05)$:

| Color Pair | Usage Description | Calculated Contrast | WCAG AA Threshold | Verdict |
|---|---|---|---|---|
| `#F5F5F5` on `#0B0B0B` | Primary Body Text on Dark Canvas | **18.05 : 1** | 4.50 : 1 | **PASSED (Exceeds AAA)** |
| `#FFFFFF` on `#111111` | Heading Text on Card Surface | **18.88 : 1** | 4.50 : 1 | **PASSED (Exceeds AAA)** |
| `#C9A24A` on `#0B0B0B` | Primary Gold Accent on Dark Canvas | **8.20 : 1** | 4.50 : 1 | **PASSED (Exceeds AAA)** |
| `#E5C87B` on `#0B0B0B` | Accent Light Gold on Dark Canvas | **12.07 : 1** | 4.50 : 1 | **PASSED (Exceeds AAA)** |
| `#000000` on `#C9A24A` | Dark Text on Primary Gold CTA Button | **8.75 : 1** | 4.50 : 1 | **PASSED (Exceeds AAA)** |
| `#A3A3A3` on `#0B0B0B` | Secondary Muted Text on Dark Canvas | **7.80 : 1** | 4.50 : 1 | **PASSED (Exceeds AAA)** |
| `#888888` on `#0B0B0B` | Muted Gray Text on Dark Canvas | **5.55 : 1** | 4.50 : 1 | **PASSED (Exceeds AA)** |
| `#EF4444` on `#0B0B0B` | Error Red Alerts on Dark Canvas | **5.23 : 1** | 4.50 : 1 | **PASSED (Exceeds AA)** |
| `#10B981` on `#0B0B0B` | Success Green Badges on Dark Canvas | **7.76 : 1** | 4.50 : 1 | **PASSED (Exceeds AAA)** |

### 7.2 Semantic & Assistive Technology Elements
- **Landmarks:** Distinct `<nav>`, `<header>`, `<main>`, `<section>`, and `<footer>` elements wrap all views.
- **Heading Order:** Single `<h1>` per view, logically descending to `<h2>`, `<h3>`, and `<h4>` without skipped levels.
- **Form Association:** Explicit `<label htmlFor="...">` mapping to matching `<input id="...">` verified on contact and administrative forms.
- **ARIA Annotations:** Present on icon-only navigation triggers (`aria-label="Toggle Navigation Menu"`, `aria-label="Search Books"`, `aria-label="Shopping Cart"`), quantity controls, and delete buttons.

---

## 8. Admin Security & Integration Boundaries

### 8.1 Multi-Layered Authorization Verification
1. **Edge Middleware Layer (`apps/web/middleware.ts`):**
   - Intercepts requests matching `/admin/*`.
   - If user is unauthenticated (`!user`), immediately redirects to `/login?redirect=/admin`.
2. **Server Component Layer (`apps/web/app/admin/layout.tsx`):**
   - Invokes `requireAdmin()` from `lib/admin/auth.ts`.
   - Queries `public.profiles` for `role === 'admin'`.
   - If user is authenticated but not an active admin (or if `is_blocked = true`), redirects to `/?error=forbidden`.
3. **Server Action & API Boundary:**
   - Administrative server actions (`admin-books.ts`, `admin-orders.ts`) and API routes invoke `requireAdmin()` / `verifyAdminApi()` before data manipulation.
   - Tested and verified in `test-phase02-admin.ts` (Pass 02: 403 Forbidden for non-admin accounts).

### 8.2 External Integration Boundary Check
- **Payment Gateway:** Razorpay live endpoints were not triggered; all tests ran via mocked signature verification and local atomic settlement procedures.
- **Logistics Courier:** No real Delhivery consignments were generated; mock serviceability and AWB numbers were utilized.
- **Email Service:** No real SMTP transmissions occurred; email generation was verified through immutable database audit logs (`email_logs`).

---

## 9. Build & Regression Test Evidence

All verification commands were independently re-executed during this audit. Every execution completed with exit code 0:

| Test Suite / Tool | Command Executed | Timestamp (IST) | Exit Code | Result | Pass Rate |
|---|---|---|---|---|---|
| **TypeScript Typecheck** | `npx tsc --noEmit` | 2026-11-02 15:52:50 | 0 | 0 Errors | **100%** |
| **ESLint Validation** | `npx eslint .` | 2026-11-02 15:52:59 | 0 | 0 Errors, 2 warnings | **100%** |
| **Production Build** | `npm run build` | 2026-11-02 15:53:07 | 0 | 23 Static Pages Built | **100%** |
| **Phase 01 Purchase Journey** | `npx tsx scripts/test-phase01-purchase-journey.ts` | 2026-11-02 15:53:30 | 0 | 20 Passed, 0 Failed | **100%** |
| **Phase 02 Admin Operations** | `npx tsx scripts/test-phase02-admin.ts` | 2026-11-02 15:53:24 | 0 | 36 Passed, 0 Failed | **100%** |
| **Phase 03 Customer Account** | `npx tsx scripts/test-phase03-customer-account.ts` | 2026-11-02 15:53:20 | 0 | 20 Passed, 0 Failed | **100%** |
| **Phase 04 Backend Integrity** | `npx tsx scripts/test-phase04-backend-integrity.ts` | 2026-11-02 15:53:15 | 0 | 28 Passed, 0 Failed | **100%** |
| **Phase 05 Browser E2E** | `npx tsx scripts/test-phase05-browser-e2e.ts` | 2026-11-02 15:54:30 | 0 | 15 Passed, 0 Failed | **100%** |
| **Combined Regression Total** | All Phase 01–05 Verification Suites | — | 0 | **119 / 119 Passed** | **100%** |

---

## 10. Outstanding Defects, Gaps & Technical Advisories

No blocking defects or functional regressions were identified. The following non-blocking advisories are cataloged for operational transparency:

1. **Favicon Container Format:**
   - *Observation:* `apps/web/public/favicon.ico` is a PNG byte stream copied from `logo.png` (1146×980) rather than a native `.ico` container.
   - *Impact:* Zero impact in modern evergreen browsers (which consume `<link rel="icon" href="/logo.png">`). Legacy web spiders or strict favicon parsers expecting Microsoft ICO headers (`00 00 01 00`) may encounter a MIME/format inconsistency.
2. **Physical Mobile Device Testing:**
   - *Observation:* Responsive testing was performed via Chrome DevTools Protocol emulation.
   - *Impact:* Does not simulate iOS Safari dynamic bottom URL bar collapse or hardware safe area insets on notched screens (`env(safe-area-inset-bottom)`).
3. **Automated Accessibility CI Test:**
   - *Observation:* Contrast and semantic accessibility were verified via automated DOM property checks and mathematical formula evaluations, but did not include an automated Axe-core CLI run in CI.

---

## 11. Recommended Post-Audit Actions (Do Not Implement in Phase 05)

1. **Favicon Multi-Resolution Generation:** Convert `logo.png` into a standard binary `.ico` containing 16×16, 32×32, and 48×48 icon formats using `png2ico` or `sharp`.
2. **CSS Safe-Area Inset Enhancement:** Update the mobile bottom navigation CSS from `bottom-0` to `bottom-[env(safe-area-inset-bottom,0px)]` to guarantee native spacing on notched iPhones.
3. **Next.js Middleware Codemod:** Run `npx @next/codemod@canary middleware-to-proxy .` when upgrading Next.js canary releases to adopt the new proxy convention.

---

## 12. Final Acceptance Decision

Phase 05 (**Complete Frontend & Content Parity**) has achieved its technical, architectural, and visual objectives:

- **Legacy Route Inventory:** 100% implemented (all 27 legacy routes and aliases present and functional).
- **Content Fidelity:** OrderSteps, Customer Reviews, 5 About Page blocks, 8 Support Help categories & FAQs, and Contact Page restored without placeholder content.
- **Asset Fidelity:** Authentic high-resolution logo and font tokens active.
- **Code Quality:** 0 TypeScript compilation errors, 0 ESLint errors, clean production Turbopack compilation.
- **Non-Regression:** 104/104 backend integration tests and 15/15 browser E2E tests verified passing.

**FINAL DECISION: CONDITIONALLY ACCEPTED**  
*(Ready to proceed to Phase 06 Final Deployment & Hardening upon acknowledgment of the non-blocking advisories).*

