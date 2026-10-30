# Git Baseline & Test Inventory Report
## MD Shakib Islamic Books — Version Control Audit & Testing Framework Baseline

> **Phase:** Phase 00 — Baseline & Audit Freeze  
> **Execution Date:** October 30, 2026  
> **Mode:** Strictly Read-Only Audit  
> **Repository:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`

---

## 1. Authoritative Git State Baseline

### 1.1 Branch & Commit Identification
- **Current Active Branch:** `audit` (verified via `git branch --show-current`)
- **Current HEAD Commit SHA:** `e80ff8f11f1c24a6c820ec31272f213b807ade20`
- **HEAD Commit Message:** `Merge pull request #28 from mdshakib-books/bug-fix`
- **Parent Commits:**
  - Parent 1: `84b8803932189a522afe62571f8ca2ccf246ab45` (`Merge pull request #27 from mdshakib-books/feature/admin`)
  - Parent 2: `b09672ae6826dbb169f496c97b1e155a95f47a37` (`audit: migration Audit`)

### 1.2 Verification of Expected Release Candidate SHA
- **Previously Reported Release Candidate SHA:** `84b8803932189a522afe62571f8ca2ccf246ab45`
- **Verification Finding:** `84b8803` is verified as the direct parent and ancestor commit of the current HEAD. The subsequent commit `b09672a` committed documentation audit reports, and commit `e80ff8f` merged those documentation changes into `main`. The underlying application code remains identical to `84b8803`.
- **Branch Tracking:** `audit` is aligned with `origin/main` and `origin/HEAD`.

### 1.3 Working Tree Status & Reconciliation
- **Exact Command Execution Outputs:**
  ```bash
  $ git branch --show-current
  audit

  $ git rev-parse HEAD
  e80ff8f11f1c24a6c820ec31272f213b807ade20

  $ git status --short
  ?? docs/migration/phase-00/

  $ git diff --stat
  # (Empty output - 0 tracked files modified)

  $ git diff --cached --stat
  # (Empty output - 0 files staged)
  ```
- **Reconciliation of Working Tree Status:**  
  Prior to generating Phase 00 documentation, the working tree was 100% clean with 0 untracked files. Following generation of the 9 requested documentation files, `git status --short` accurately reports exactly one untracked directory (`?? docs/migration/phase-00/`). There are 0 tracked modifications, 0 staged files, and 0 commits made.
- **Legacy Source Integrity:**
  - `client/`: 0 files modified, 0 files deleted, 0 files renamed.
  - `server/`: 0 files modified, 0 files deleted, 0 files renamed.
- **Git Safety Certification:** No commits, rebases, merges, resets, cleans, stashes, or branch switches were executed. All user workspace states are preserved.

---

## 2. Test Suite & Coverage Inventory

A comprehensive forensic inventory was conducted across `apps/web/`, `client/`, and `server/` to identify all existing automated and manual test facilities:

| Test Suite / Script | Location | Framework / Tool | Command | What It Verifies | Latest Evidence | Status | Known Gaps |
|---|---|---|---|---|---|:---:|---|
| **Admin Operations Integration Test** | `apps/web/scripts/test-admin.ts` | TypeScript via `tsx` | `npx tsx apps/web/scripts/test-admin.ts` | Verifies `getAdminOrders`, `updateAdminOrderStatus`, `cancelAdminOrder`, `getDashboardStats`, and `requireAdmin` role guard. | Phase 6 report records execution against local Supabase. | **PASSING (LOCAL)** | Tests backend functions directly; does not test UI components, modals, or image uploads. |
| **Authentication Integration Test** | `apps/web/scripts/test-auth.mjs` | Node.js (ESM) | `node apps/web/scripts/test-auth.mjs` | Verifies Supabase Auth sign-up, sign-in, session retrieval, profile trigger provisioning, and password recovery. | Phase 5A test results document pass on local instance. | **PASSING (LOCAL)** | Does not test UI forms, error boundary rendering, or cookie exchange in browser context. |
| **Catalog Query Test** | `apps/web/scripts/test-catalog.mjs` | Node.js (ESM) | `node apps/web/scripts/test-catalog.mjs` | Verifies `getBooks`, `getBookById`, category filtering, pagination, and search string escaping. | Phase 5A test results record successful catalog queries. | **PASSING (LOCAL)** | Does not test storefront client-side interaction or Add to Cart callback wiring. |
| **Commerce & Cart Integration Test** | `apps/web/scripts/test-commerce.mjs` | Node.js (ESM) | `node apps/web/scripts/test-commerce.mjs` | Verifies `getCart`, `addToCart`, `updateCartItem`, `removeCartItem`, `placeOrderCOD`, and inventory decrement. | Phase 5C report documents passing backend cart mutations. | **PASSING (LOCAL)** | Tests server actions in isolation; ignores storefront client button disconnection and missing guest cart. |
| **Third-Party Integrations Test** | `apps/web/scripts/test-integrations.ts` | TypeScript via `tsx` | `npx tsx apps/web/scripts/test-integrations.ts` | Verifies Razorpay order creation, HMAC signature check, Delhivery pincode check, Resend email client, and Cloudinary signing. | Phase 5D remediation report records passing tests. | **PASSING (SANDBOX)** | Depends on sandbox API keys; does not run against live production endpoints. |
| **Phase 6 Remediation Verification** | `apps/web/scripts/test-phase6r-remediation.ts` | TypeScript via `tsx` | `npx tsx apps/web/scripts/test-phase6r-remediation.ts` | Regression test verifying admin replacement approval, rejection, and payment settlement procedures. | Phase 6 independent verification report. | **PASSING (LOCAL)** | Does not verify customer replacement request workflow (which is missing in UI). |
| **Full Order Lifecycle Test (Legacy)** | `server/test_full_order_lifecycle.js` | Node.js (ESM) | `node server/test_full_order_lifecycle.js` | Legacy script testing end-to-end order placement, COD/Razorpay transitions, and stock changes against MongoDB. | Commits from March 2026 record passing tests. | **ARCHIVED (LEGACY)** | Targets legacy Express + MongoDB server; cannot run against Next.js + Supabase. |
| **Single Order Test (Legacy)** | `server/testOrder.js` | Node.js (ESM) | `node server/testOrder.js` | Legacy order creation smoke test. | March 2026 legacy test artifact. | **ARCHIVED (LEGACY)** | Legacy only. |
| **Postman API Collections (8 Collections)** | `server/features/POSTMAN/*.json` | Newman / Postman Collection Runner | `newman run server/features/POSTMAN/<Collection>.json` | Exhaustive collection of 65 REST API tests covering Address, Admin, Auth, Books, Cart, Orders, Payments, and Environment. | Postman collection files with assertion scripts. | **AVAILABLE** | Written for Express API paths (`/api/v1/*`); requires mapping or proxying to Next.js Route Handlers. |
| **Unit Test Suite (Vitest / Jest)** | `apps/web/` | None installed | N/A | Component unit tests and utility function unit tests. | None. | **MISSING** | No unit testing runner (Jest, Vitest) is installed in `apps/web/package.json`. |
| **End-to-End Browser Automation** | `apps/web/` | None installed | N/A | Playwright or Cypress browser automation testing customer journeys, clicks, modals, and toasts. | None. | **MISSING** | Zero browser automation tools installed. |
| **Accessibility (a11y) Scanner** | `apps/web/` | None installed | N/A | Automated WCAG 2.1 AA audit scanning for contrast, focus, ARIA tags, and keyboard traps. | None. | **MISSING** | No automated a11y testing suite. |
| **Lighthouse Performance CI** | `apps/web/` | None configured | N/A | Core Web Vitals, Largest Contentful Paint (LCP), Cumulative Layout Shift (CLS), and SEO audits. | None. | **MISSING** | No automated Lighthouse CI pipeline. |

---

## 3. Test Coverage Gaps & Untested Critical Journeys

Because `apps/web/package.json` contains no automated test runner (Jest, Vitest, Playwright, or Cypress), test coverage cannot be authoritatively calculated via code coverage tools (`lcov`, `c8`, `istanbul`).

### Critical Untested User Journeys:
1. **Public Storefront Browsing to Cart:**  
   No automated test verifies that clicking "Add to Cart" on a book card in the browser actually updates the cart and navbar badge. (As proven in Phase 00, this workflow was broken in the UI despite backend server action passing isolated tests).
2. **Unauthenticated Guest Cart Experience:**  
   Zero automated tests exist for localStorage persistence, guest item modifications, or cart merge upon login.
3. **End-to-End Payment Modal Interaction:**  
   Razorpay modal popup, user credit card entry, payment completion event, and browser redirect to `/order-success` have only been tested via synthetic backend script calls, not in a live browser.
4. **Customer Replacement Request Flow:**  
   Zero automated tests cover customer replacement requests because the frontend UI and server action were never implemented.
5. **Mobile Viewport Interactions:**  
   Zero automated tests cover responsive drawer opening, category tab touch-swiping, or mobile bottom navigation behavior.
6. **Accessibility Traversal:**  
   Zero automated tests verify keyboard focus trapping inside modals, visible focus indicators, or screen reader announcements.

---

## 4. Phase 00 Audit Execution Log & Limitations Analysis

In compliance with Phase 00R requirements, every interrupted command, canceled background task, and failed glob execution during the Phase 00 audit was forensically investigated to verify that no inspection gaps were left unresolved:

| Execution Event | Command / Tool Call | Observed Failure / Interruption | Root Cause | Alternative Verification Performed | Unresolved Gap Status |
|:---:|---|---|---|---|:---:|
| **Task-68** | `grep -rn "consolidated_rls" .` | Command ran in background across thousands of `node_modules` and `.next` files; completed with exit code 1. | Grep did not exclude build directories. | Targeted `git log --all --grep="consolidated_rls"` and `grep -rn "20260216" docs/ supabase/`. Confirmed 0 matches. | **RESOLVED** (No such migration exists). |
| **Task-102** | `grep -rn "merge" apps/web/` | Command matched compiled chunks in `.next/` and was manually canceled to prevent log pollution. | Search unconstrained by directory boundary. | Targeted `grep -rn "merge" apps/web/lib/ apps/web/app/` excluding `.next`. Confirmed only `twMerge` exists; cart merge is 100% missing. | **RESOLVED** (Missing feature confirmed). |
| **Task-122** | `grep -rn "changePassword" apps/web/` | Backgrounded due to scanning `.next/` cache; manually canceled. | Search unconstrained by directory boundary. | Directly inspected `apps/web/lib/auth/actions.ts` and `apps/web/app/profile/ProfileClient.tsx`. Confirmed customer password change is missing. | **RESOLVED** (Missing feature confirmed). |
| **Task-151** | `grep -rn "toast" apps/web/` | Backgrounded, matched hundreds of lines in `node_modules/next/dist/compiled/next-devtools/toast/`. | Scanned dependencies instead of application code. | Directly inspected `apps/web/components/` and `apps/web/app/layout.tsx`. Confirmed zero toast system exists in application source. | **RESOLVED** (Missing feature confirmed). |
| **Zsh Glob Error** | `ls -la server/*.md server/*.md server/features/` | Exited with `zsh:1: no matches found: server/*.md`. | No `.md` files exist in the root of `server/`. | Executed `ls -la server/` and `ls -la server/features/POSTMAN/`. Confirmed full server root file listing. | **RESOLVED** (All server files mapped). |

---

## 5. Multi-Tier Feature Verification Standard

To prevent conflating static file existence with operational runtime verification, every feature in MD Shakib Islamic Books is evaluated against 5 distinct evidence tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                   FEATURE VERIFICATION EVIDENCE TIERS                  │
├──────┬──────────────────────────────────┬──────────────────────────────┤
│ Tier │ Verification Type                │ Current Availability in Repo │
├──────┼──────────────────────────────────┼──────────────────────────────┤
│ T1   │ Static Code & Schema Inspection  │ 44 / 44 Features Inspected   │
│ T2   │ Standalone Integration Scripts   │ 16 Features Tested (Local DB)│
│      │                                  │ (15 Fully Migrated + 1 Repl.)│
│ T3   │ Unit Tests (Vitest / RTL)        │ 0 Features (No runner in repo│
│ T4   │ Automated Browser / E2E Tests    │ 0 Features (No Playwright)   │
│ T5   │ Live Production Smoke Tests      │ 0 Features (Not yet deployed)│
└──────┴──────────────────────────────────┴──────────────────────────────┘
```

> **Authoritative Baseline Finding:**  
> Of the 21 features with implementation parity (19 Fully Migrated + 2 Replaced):  
> - **16 features** are verified at Tier 1 (Code Inspection) + Tier 2 (Standalone Integration Scripts on Local Supabase / Sandbox APIs).  
> - **5 features** are verified at Tier 1 (Static Code Inspection Only).  
> - **Zero features** are currently verified at Tier 4 (Automated Browser / E2E) due to the absence of Playwright test automation. Phase 09 will implement the required Tier 4 automated browser suites.

---

## 6. Phase 09 Testing Enhancement Recommendations

To establish robust automated quality assurance prior to Phase 11 production release:
1. Install **Vitest** and **React Testing Library** in `apps/web/devDependencies` to test UI components (`BookCard`, `Navbar`, `CartClient`, `BookModal`).
2. Install **Playwright** to execute automated browser end-to-end tests for the 3 primary user journeys:
   - Journey 1: Guest visits home -> adds book -> views cart -> registers -> cart merges -> places COD order.
   - Journey 2: Logged-in user -> adds book -> selects address -> completes Razorpay test payment -> views order details.
   - Journey 3: Admin logs in -> creates new book with Cloudinary images -> verifies in public catalog -> updates stock.
3. Integrate **@axe-core/playwright** to automatically fail CI builds if WCAG 2.1 AA accessibility violations are introduced.

