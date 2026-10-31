# Phase 03A — Initial Implementation & Security Audit

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Authenticated Customer Lifecycle, Database Security & End-to-End Verification  
**Audit Date:** October 31, 2026  
**Auditor:** Independent Systems Architect & Verification Agent  
**Branch:** `new-fix`  
**Current HEAD:** `37958f154c6f67fd0c8e869306aa68769778fb6c`  

---

## 1. Executive Summary & Purpose

Phase 03 established the Customer Account & Commerce management subsystem, introducing customer dashboard overviews, profile and address management, order cancellation modals, 7-day replacement request workflows, payment history, refund tracking, and password changes.

Phase 03A performs an exhaustive technical verification of the entire customer lifecycle in a real, authenticated runtime environment. The purpose of this initial audit is to inspect all Phase 03 assets, map existing versus missing test coverage, analyze security-sensitive logic (specifically PostgreSQL stored procedures and RLS policies), document known vulnerabilities, and define infrastructure prerequisites.

---

## 2. Git State & Working Tree Audit

### A. Commit & Branch Information
- **Active Branch:** `new-fix`
- **HEAD Commit:** `37958f154c6f67fd0c8e869306aa68769778fb6c`
- **Subject:** `Merge pull request #31 from mdshakib-books/new-fix`
- **Working Tree State:** All Phase 03 implementations are preserved in the working tree. No branch switching, resetting, cleaning, stashing, rebasing, or amending has occurred.

### B. Modified and Untracked Files
| File Path | Status | Purpose / Description |
|---|---|---|
| `apps/web/app/addresses/AddressesClient.tsx` | Modified | Integrated `AccountNav` and Edit Address modal. |
| `apps/web/app/orders/[id]/OrderDetailClient.tsx` | Modified | Integrated `AccountNav`, Cancellation modal, Replacement modal. |
| `apps/web/app/orders/page.tsx` | Modified | Integrated `AccountNav`. |
| `apps/web/app/profile/ProfileClient.tsx` | Modified | Integrated `AccountNav`. |
| `apps/web/components/layout/Navbar.tsx` | Modified | Connected customer account badge to `/account`. |
| `apps/web/lib/auth/actions.ts` | Modified | Added `changeCustomerPassword` with credential verification. |
| `apps/web/lib/commerce/addresses.ts` | Modified | Added `updateAddress` server action. |
| `apps/web/lib/commerce/orders.ts` | Modified | Added `requestOrderReplacement` and `getCustomerReplacements`. |
| `apps/web/types/database.types.ts` | Modified | Declared `request_replacement_atomic` RPC typing. |
| `apps/web/app/account/` | Untracked | Customer account hub routes (`overview`, `profile`, `addresses`, `orders`, `payments`, `refunds`, `replacements`, `security`). |
| `apps/web/components/account/` | Untracked | `AccountNav.tsx` navigation component. |
| `apps/web/lib/commerce/account.ts` | Untracked | Aggregated customer overview statistics. |
| `apps/web/lib/commerce/payments.ts` | Untracked | Customer payments and refunds query service. |
| `apps/web/scripts/test-phase03-browser-e2e.ts` | Untracked | Chrome CDP browser E2E test suite. |
| `apps/web/scripts/test-phase03-customer-account.ts` | Untracked | In-memory unit/integration test suite. |
| `supabase/migrations/20261031000003_customer_account_and_commerce.sql` | Untracked | Stored procedure migration for atomic replacement requests. |
| `docs/migration/phase-03/` | Untracked | Phase 03 implementation report and screenshots. |

---

## 3. Existing Functionality vs. Gaps Identified

### 3.1 Existing Implemented Features
1. **Customer Account Hub (`/account`):** Aggregates total orders, active orders in transit, saved addresses, primary delivery address, and recent order history.
2. **Unified Navigation (`AccountNav`):** Responsive desktop and mobile tab navigation linking all 8 account subsystems.
3. **Address CRUD:** Add, Edit, Delete, and Set Default workflows with 6-digit pincode and 10-digit phone number validations.
4. **Order Cancellation:** In-UI cancellation modal capturing customer reasons, restoring inventory atomically via `cancel_order_atomic`.
5. **Replacement Workflows:** Server action `requestOrderReplacement` and stored procedure `request_replacement_atomic` enforcing the 7-day delivery policy.
6. **Payments & Refunds Views:** Real data rendering from `public.payments` and `public.orders`.
7. **Password Changes:** Authenticated password change validating current credentials.

### 3.2 Security Gaps & Vulnerabilities Identified
1. **Critical RPC Caller Identity Vulnerability (`auth.uid() IS NOT NULL` Flaw):**
   In both `request_replacement_atomic` and `cancel_order_atomic`, the caller identity validation is written as:
   ```sql
   IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
       RAISE EXCEPTION 'Security violation: Caller identity does not match specified user ID.';
   END IF;
   ```
   **Vulnerability:** When an anonymous or unauthenticated caller invokes the procedure, `auth.uid()` is `NULL`. Therefore, `auth.uid() IS NOT NULL` evaluates to `FALSE`, bypassing the check entirely. If an attacker supplies `p_user_id` equal to the victim order's `user_id`, the ownership check (`v_order.user_id <> p_user_id`) passes, allowing unauthenticated callers to cancel orders or submit replacement requests for arbitrary users!
   **Remediation Required:** Enforce that non-service-role callers MUST have a non-null `auth.uid()` matching `p_user_id`.

2. **Future Delivery Timestamp Anomaly:**
   The replacement window calculation:
   ```sql
   IF v_delivered_at < (v_now - INTERVAL '7 days') THEN
       RAISE EXCEPTION 'Replacement window expired...';
   END IF;
   ```
   does not guard against timestamps set in the future (`v_delivered_at > v_now`). A future timestamp bypasses the expiration check because it is greater than `v_now - 7 days`.
   **Remediation Required:** Explicitly assert `v_delivered_at <= v_now`.

3. **Rolling Window vs. Calendar Day Clarification:**
   The SQL expression `INTERVAL '7 days'` enforces a strict rolling 168-hour (`7 × 24 hours`) window from the timestamp of delivery, rather than calendar day boundaries. This distinction must be documented and tested against boundary conditions (6d 23h, 7d 0s, 7d 1s).

---

## 4. Test Coverage Analysis

| Subsystem | Existing Coverage | Missing / Required Coverage in Phase 03A |
|---|---|---|
| **Authentication** | Browser smoke navigation on `/login`, `/register`, `/forgot-password`, `/reset-password`. | Real authenticated session creation, session cookie validation, invalid credential rejection against live Supabase Auth. |
| **Profile** | In-memory mock tests. | Live database profile update, persistence after browser refresh, RLS policy enforcement preventing Customer B from modifying Customer A. |
| **Addresses** | Unit tests on validation. | Live database address creation, default address trigger verification, cross-customer isolation. |
| **Orders & Checkout** | Redirect guards and in-memory cancellation tests. | End-to-end checkout flow from Cart to Order creation, stock decrement verification, live database cancellation and inventory restoration. |
| **Replacements** | In-memory 7-day rule boundary tests. | Direct database RPC execution with real JWTs, anonymous invocation rejection, admin review workflow (`approveAdminReplacement` / `rejectAdminReplacement`). |
| **Payments & Refunds** | Sanitization unit tests. | Live query verification, cross-customer isolation assertions. |

---

## 5. Infrastructure Requirements & Blocker Assessment

1. **Local Supabase Database Services:**
   - Supabase Auth on port 54321
   - PostgreSQL Database on port 54322
   - Local Mailpit SMTP on port 54324 (for password recovery inspection)
   - Status: `supabase start` was initiated to start the local Docker container stack. If local containers are healthy, direct database testing will proceed against local Postgres; otherwise blockers will be formally reported.
2. **Next.js Web Server:**
   - Active on `http://localhost:3000` (Turbopack development server).
3. **Headless Chrome CDP Automation:**
   - Google Chrome 156 binary available at `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`.
   - Controls browser via WebSocket on port 9222.

---

## 6. Audit Sign-Off

The initial audit confirms that Phase 03 code is present, compiles cleanly, and implements the required customer account subsystems. However, critical security logic in `request_replacement_atomic` and `cancel_order_atomic` must be patched, and testing must be executed against authenticated sessions and database boundaries.

*Audit completed on October 31, 2026.*

