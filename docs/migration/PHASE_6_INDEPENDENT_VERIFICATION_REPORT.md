# PHASE 6 — Independent Verification & Acceptance Audit Report

**Project:** MD Shakib Islamic Books  
**Repository:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`  
**Audit Target:** Phase 6 — Admin Dashboard & Lifecycle Operations  
**Date of Audit:** 2026-10-29  
**Branch:** `feature/admin` (Commit `b47e8e9`)  
**Auditor:** Principal Software Auditor & Security Engineer  
**Final Status:** **FAIL** (Gate Blocked due to Critical Financial Correctness Finding)

---

## 1. Executive Summary

This independent audit conducted a comprehensive inspection of the Phase 6 implementation covering admin authorization, operations dashboard aggregations, order lifecycle state transitions, refund mechanisms, catalog views, and user account management.

### Key Audit Findings:
1. **Critical Financial Correctness Defect (CRITICAL):** In `apps/web/lib/admin/orders.ts` (`cancelAdminOrder`), when an admin cancels a prepaid order (`payment_status === 'Paid'`), the code directly updates the database to `payment_status = 'Refunded'` without invoking the Razorpay Refund API (`payments.refund`), without checking gateway status, without recording a gateway refund ID (`rfnd_xxx`), and without idempotency or settlement verification. The database records a refund that never occurred at the payment gateway, leaving the customer unrefunded while the merchant dashboard misrepresents the transaction as settled/refunded.
2. **PostgreSQL RPC Execution Privilege (HIGH / BLOCKED):** The known blocker on `public.settle_payment_atomic` granting `EXECUTE` to `authenticated` remains open in `supabase/migrations/20261029000002_payment_settlement_atomic.sql` (Line 146). It was properly tracked as mandated by Phase 6 constraints and was not silently modified.
3. **Parity Matrix Overstatement on User Management (MEDIUM):** In `docs/migration/FEATURE_PARITY_MATRIX.md`, `FEAT-31` (Admin User Management) is claimed as `INTEGRATED & VERIFIED (Phase 6)`. Inspection of `apps/web/app/admin/users/page.tsx` reveals that while user account listing is implemented, account blocking, unblocking, and soft deletion are not implemented.
4. **Verified Core Strengths:** Server-side admin authorization (`requireAdmin()`, `verifyAdminApi()`, and `public.is_admin()` RLS) is rigorous and impossible to bypass via client headers or request parameter manipulation. Real-time dashboard KPI aggregations are backed by live PostgreSQL queries with zero mock data. The order lifecycle state machine accurately enforces transitions, requires courier and AWB tracking for shipments, settles Cash on Delivery upon delivery, and atomically restores inventory via PostgreSQL stored procedure `public.cancel_order_atomic`.

Because acceptance criteria require payment and refund state transitions to be financially accurate, Phase 6 **CANNOT be approved for production cutover** until the refund gateway integration is implemented or the refund status mutation is decoupled from fake settlement.

---

## 2. Scope and Safety Constraints Followed

The audit strictly complied with the mandatory safety rules:
- **No file modifications to application code:** All application source code was inspected in read-only mode.
- **Zero Git mutations:** No `git commit`, `git push`, `git reset`, `git clean`, `git stash`, `git checkout`, `git merge`, or `git rebase` commands were executed.
- **Legacy directory preservation:** `client/` and `server/` were left completely untouched (verified by `git status --short -- client/ server/` and `git diff`).
- **No live credentials or production database access:** All verifications ran locally against the local Supabase Docker stack.
- **Zero test financial actions:** No real Razorpay refund or charge was initiated.

---

## 3. Git Baseline & Preservation Assessment

- **Repository Root:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`
- **Current Branch:** `feature/admin`
- **Current Commit:** `b47e8e9f1873a58223fe93938b930541feef8e0e`
- **Branch History & Relationship with `main`:**
  - `git rev-list --left-right --count main...HEAD` returned `0 0`, confirming `feature/admin` HEAD is perfectly aligned with `origin/main`.
  - `b47e8e9` merges Pull Request #26 (`feature/codebase-audit`, commit `7c2dbe6`), which contains all verified work and reports from Phase 1 through Phase 5D.
- **Working Tree State (`git status --short --branch`):**
  ```text
  ## feature/admin
   M apps/web/middleware.ts
   M docs/migration/FEATURE_PARITY_MATRIX.md
  ?? apps/web/app/admin/
  ?? apps/web/app/api/admin/orders/
  ?? apps/web/lib/admin/
  ?? apps/web/scripts/test-admin.ts
  ?? docs/migration/PHASE_6_IMPLEMENTATION_REPORT.md
  ```
- **Git Baseline Verdict:** **FULLY VERIFIED & RECONCILED**. Prior Phase 1–5D work is committed and merged into `main`; Phase 6 additions exist as clean unstaged/untracked files on `feature/admin`.

---

## 4. Admin Authorization Verification

| Entry Point / Route | Method / Type | Authorization Guard | Verification Evidence |
|---|---|---|---|
| Edge Middleware | Request Router | `apps/web/middleware.ts` (Lines 46–52) | Protects `/admin*`, redirecting unauthenticated traffic to `/login?redirect=/admin`. |
| Admin Layout Shell | Server Component | `apps/web/app/admin/layout.tsx` (Line 14) | Calls `await requireAdmin()`. Non-admins and guests redirected server-side before children render. |
| Admin Dashboard Page | Server Component | `apps/web/app/admin/page.tsx` (via `getAdminDashboardStats()`) | Calls `requireAdmin()` on line 35 of `apps/web/lib/admin/dashboard.ts`. |
| Admin Orders Page | Server Component | `apps/web/app/admin/orders/page.tsx` (via `getAdminOrders()`) | Calls `requireAdmin()` on line 62 of `apps/web/lib/admin/orders.ts`. |
| Admin Order Detail Page | Server Component | `apps/web/app/admin/orders/[id]/page.tsx` (via `getAdminOrderById()`) | Calls `requireAdmin()` on line 150 of `apps/web/lib/admin/orders.ts`. |
| Admin Books Page | Server Component | `apps/web/app/admin/books/page.tsx` (Line 13) | Direct server-side call: `await requireAdmin()`. |
| Admin Users Page | Server Component | `apps/web/app/admin/users/page.tsx` (Line 12) | Direct server-side call: `await requireAdmin()`. |
| Order Status API | Route Handler (`PATCH`) | `apps/web/app/api/admin/orders/[id]/status/route.ts` (Line 9) | Calls `await verifyAdminApi()`, returning HTTP 401 for unauthenticated and HTTP 403 for non-admins. |
| Media Signature API | Route Handler (`POST`) | `apps/web/app/api/admin/media/sign/route.ts` (Line 23) | Verifies user session and checks `profile.role === 'admin'`, returning HTTP 403 for non-admins. |
| Media Direct Upload API | Route Handler (`POST`) | `apps/web/app/api/admin/media/upload/route.ts` (Line 23) | Verifies user session and checks `profile.role === 'admin'`, returning HTTP 403 for non-admins. |
| PostgreSQL Database Layer | Row Level Security (RLS) | `supabase/migrations/20261028000003_rls_policies.sql` | `is_admin()` checks active admin role in `public.profiles`. Orders, order items, status history, audit logs, and payments reject unauthorized reads/updates. |

### Authorization Security Assessment:
- **Zero Client Trust:** Role checks query `public.profiles` on the server using verified `user.id` from `supabase.auth.getUser()`. Client-side cookie spoofing or parameter injection is prevented.
- **Fail-Closed Semantics:** Blocked (`is_blocked = true`) or soft-deleted (`is_deleted = true`) administrator profiles are rejected by both `requireAdmin()` and `is_admin()`.

---

## 5. Order Management and Lifecycle Rules Verification

The implementation enforces the canonical state machine in `apps/web/lib/admin/constants.ts`:

```text
Pending ──► Confirmed ──► Packed ──► Shipped ──► Out for Delivery ──► Delivered ──► Replacement Requested
   │            │            │          │               │                                │
   ▼            ▼            ▼          ▼               ▼                       ┌────────┴────────┐
Cancelled    Cancelled    Cancelled  Cancelled       Cancelled                  ▼                 ▼
                                                                        Replacement Approved   Replacement Rejected
                                                                                │
                                                                                ▼
                                                                        Replacement Shipped
                                                                                │
                                                                                ▼
                                                                        Replacement Delivered
```

### Verified Lifecycle Invariants:
1. **Prepaid Order Confirmation Invariant:** In `apps/web/lib/admin/orders.ts` (Lines 226–235), transitioning an online order (`payment_method = 'ONLINE'`) to `Confirmed` requires `order.payment_status === 'Paid'`. Unpaid online orders reject confirmation with: `"Online prepaid orders can be confirmed only after successful payment."`
2. **Logistics Prerequisite Invariant:** In `apps/web/lib/admin/orders.ts` (Lines 237–246), transitioning to `Shipped` requires both courier and AWB tracking numbers. If missing, the operation rejects with: `"Courier and AWB tracking number are required to transition order to Shipped."`
3. **Automated Cash-on-Delivery Settlement:** In `apps/web/lib/admin/orders.ts` (Lines 256–265), transitioning a COD order to `Delivered` automatically marks `payment_status = 'Paid'`, `is_paid = true`, and `paid_at = NOW()`.
4. **Payment Downgrade Protection:** In PostgreSQL stored procedure `record_payment_failure_atomic`, a verified `Paid` order cannot be downgraded to `Failed`.
5. **Audit Trail Logging:** Every status change triggers PostgreSQL trigger `trg_order_status_history` on `public.orders`, automatically inserting a row into `public.order_status_history`. In addition, `updateAdminOrderStatus` records an entry in `public.audit_logs`.

---

## 6. Critical Refund Verification (Deep Inspection)

The audit closely examined `cancelAdminOrder` in [`apps/web/lib/admin/orders.ts`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/lib/admin/orders.ts#L330-L345) and the integration services to address the 8 required financial correctness questions:

```typescript
// apps/web/lib/admin/orders.ts (Lines 330-345)
  // Call atomic cancel RPC with p_is_admin = true
  const { data: success, error: rpcErr } = await supabase.rpc("cancel_order_atomic", {
    p_order_id: orderId,
    p_user_id: user.id,
    p_cancel_reason: trimmedReason,
    p_is_admin: true,
  });

  if (rpcErr || !success) {
    return { success: false, error: rpcErr?.message || "Failed to cancel order." };
  }

  // If order was Paid, mark payment_status as Refunded
  const { data: order } = await supabase
    .from("orders")
    .select("payment_status")
    .eq("id", orderId)
    .single();

  if (order && order.payment_status === "Paid") {
    await supabase
      .from("orders")
      .update({ payment_status: "Refunded" })
      .eq("id", orderId);
  }
```

### Answers to the 8 Refund Verification Inquiries:

1. **Does cancellation merely update the database, or does it initiate a real Razorpay refund?**
   - **Finding:** Cancellation **merely updates the database**. There is **zero call** to the Razorpay API (`razorpay.payments.refund`). No refund payload is transmitted to the gateway.
2. **Is a successful refund confirmed by Razorpay before the order is marked refunded?**
   - **Finding:** **NO**. The application immediately marks `payment_status = 'Refunded'` in `public.orders` without any gateway request, response, or confirmation.
3. **What happens if the refund request fails, times out, or is retried?**
   - **Finding:** Because no gateway refund request is executed, gateway failures or timeouts cannot be detected. In reality, the customer has **not received their money back**, while the store database falsely reports that the payment has been refunded.
4. **Can a refund be initiated twice?**
   - **Finding:** No gateway refund is initiated even once. At the database layer, once marked `Cancelled`, `public.cancel_order_atomic` rejects repeated cancellation attempts with `"Order cannot be cancelled in Cancelled status"`.
5. **Can inventory be restored twice?**
   - **Finding:** **NO**. Inventory restoration inside `public.cancel_order_atomic` is protected by `IF v_order_status IN ('Delivered', 'Cancelled', 'Returned') THEN RAISE EXCEPTION...`. This invariant is safe and exact-once.
6. **Are refund identifiers, amounts, currency, and order ownership validated?**
   - **Finding:** **NO**. No Razorpay refund identifier (e.g., `rfnd_xxx`) is recorded, no refund amount or currency is validated against `public.payments`, and no ledger entry is created in `public.payments` (the `payments` table status is left as `Paid` while `orders.payment_status` is updated to `Refunded`, creating an internal table discrepancy).
7. **Can a partially completed operation leave the order in a misleading state?**
   - **Finding:** **YES**. This is a severe financial correctness issue. An admin cancels an order; the customer checks their order status and sees `Cancelled` and `Refunded`; yet no money was returned to the customer's bank card or UPI account.
8. **Are webhook events and concurrent requests handled safely?**
   - **Finding:** Razorpay dispatches `refund.created`, `refund.processed`, and `refund.failed` webhooks, but `/api/webhooks/razorpay` does not currently listen for or handle refund event types.

### Classification:
**CRITICAL FINANCIAL CORRECTNESS DEFECT (FINDING-01)**. Replicating the legacy system's pattern of database-only status flipping creates a false settlement record. In production, prepaid cancellation must either trigger a server-side Razorpay refund API call or mark the order as `Refund Pending` until gateway confirmation is received.

---

## 7. Catalog and User Overview Verification

### Catalog Overview (`app/admin/books/page.tsx`):
- **Authorization:** Enforces `await requireAdmin()`.
- **Functionality:** Lists catalog titles from `public.books` with author, category, price, stock, and active status.
- **Safety:** Read-only view. No unauthorized mutation or destructive endpoints exist.

### User Accounts Overview (`app/admin/users/page.tsx`):
- **Authorization:** Enforces `await requireAdmin()`.
- **Data Exposure:** Displays `name`, `id` (truncated), `email`, `role`, `is_blocked`, and `created_at`.
- **Sensitive Data:** Password hashes, tokens, and billing details are not exposed.
- **Parity Discrepancy:** The Phase 6 implementation report and feature matrix state that `FEAT-31` (Admin User Management) is complete. However, `app/admin/users/page.tsx` is strictly read-only. Account blocking/unblocking (`admin.controller.js:blockUser`) and user soft-deletion are **not implemented**.

---

## 8. Test and Build Execution Results

All checks were executed locally in read-only and non-destructive modes:

| Test / Verification Check | Exact Command Executed | Exit Code | Verified Output / Outcome |
|---|---|:---:|---|
| **Phase 6 Admin Test Suite** | `npx tsx --env-file=.env.local scripts/test-admin.ts` | **0** | **10/10 Passed:** Auth accounts created; RLS access control verified; dashboard calculations verified (₹15,264 revenue, 5 books, 30 users); COD lifecycle progression verified; trigger `trg_order_status_history` verified; state machine invariants verified; atomic cancellation and stock restoration verified; replacement lifecycle verified; payment downgrade protection verified. |
| **Commerce Regression Suite** | `node scripts/test-commerce.mjs` | **0** | **10/10 Passed:** Address default trigger, RLS cross-tenant isolation, persistent cart CRUD, atomic order creation (`create_order_atomic`), inventory decrements, rollback on out-of-stock, atomic cancellation stock recovery. |
| **Security Remediation Suite** | `npx tsx --env-file=.env.local scripts/test-remediation.ts` | **0** | **10/10 Passed:** Delhivery timing-safe webhook auth, state machine regressions, atomic webhook settlement, out-of-order `payment.failed` rejection, payment recovery, magic byte image validation. |
| **Integrations Regression Suite** | `npx tsx --env-file=.env.local scripts/test-integrations.ts` | **0** | **10/10 Passed:** Razorpay HMAC SHA-256 validation, idempotent webhook settlement, Resend audit logging, Cloudinary signatures, Delhivery serviceability & consignment creation. |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | **0** | **0 errors**. Type definitions across all routes and services are clean. |
| **ESLint Static Analysis** | `npm run lint` (`eslint .`) | **0** | **0 errors, 0 warnings**. Compliant with React Compiler purity rules. |
| **Next.js Production Build** | `npm run build` (`next build`) | **0** | **Compiled successfully** with Turbopack. All 22 static and dynamic routes generated cleanly. |
| **Legacy Client Build** | `cd client && npm run build` (`vite build`) | **0** | **Built in 1.08s**. 0 errors. |
| **Legacy Server Syntax** | `cd server && node -c app.js && node -c server.js` | **0** | **Clean syntax**. 0 errors. |

---

## 9. Legacy Isolation Assessment

- **Command:** `git status --short -- client/ server/`
- **Output:** Empty (no modified, deleted, or untracked files).
- **Command:** `git diff -- client/ server/`
- **Output:** Empty.
- **Verdict:** **PERFECT ISOLATION**. The legacy directories `client/` and `server/` were 100% untouched during Phase 6.

---

## 10. Razorpay RPC Security Blocker Status

- **Migration File:** `supabase/migrations/20261029000002_payment_settlement_atomic.sql`
- **Current Definition (Lines 145–147):**
  ```sql
  GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) TO postgres, service_role, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) TO postgres, service_role, authenticated;
  ```
- **Audit Verification:** The grant of `EXECUTE` on `settle_payment_atomic` to `authenticated` was **NOT altered** in Phase 6, strictly adhering to the constraint to avoid modifying payment permissions without an approved migration.
- **Status:** **CONFIRMED OPEN — PRODUCTION SECURITY BLOCKER**. Logged-in authenticated users can theoretically invoke payment settlement via PostgREST RPC. This must be remediated prior to production launch.

---

## 11. Findings Summary by Severity

### CRITICAL:
- **FINDING-01: False Payment Refund Settlement in Database:**
  - **Location:** [`apps/web/lib/admin/orders.ts`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/lib/admin/orders.ts#L330-L345) (`cancelAdminOrder`)
  - **Description:** Cancelling a paid order directly updates `orders.payment_status = 'Refunded'` without calling the Razorpay Refund API (`payments.refund`). No refund ID is generated, no funds are returned to the customer, and `public.payments` is not updated, creating an unverified refund ledger entry.

### HIGH:
- **FINDING-02: Overly Permissive Execution Grant on `settle_payment_atomic` (Existing Security Blocker):**
  - **Location:** [`supabase/migrations/20261029000002_payment_settlement_atomic.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/supabase/migrations/20261029000002_payment_settlement_atomic.sql#L145-L147)
  - **Description:** `GRANT EXECUTE ... TO authenticated` allows any logged-in customer to invoke the settlement function directly. Must be restricted to `service_role`.

### MEDIUM:
- **FINDING-03: Feature Parity Discrepancy on User Management (`FEAT-31`):**
  - **Location:** [`docs/migration/FEATURE_PARITY_MATRIX.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/FEATURE_PARITY_MATRIX.md#L38) vs [`apps/web/app/admin/users/page.tsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/app/admin/users/page.tsx)
  - **Description:** `FEAT-31` is marked as `INTEGRATED & VERIFIED (Phase 6)`, but `apps/web/app/admin/users/page.tsx` only lists user accounts. Account blocking/unblocking and soft-deletion are missing.

### LOW / INFORMATIONAL:
- **FINDING-04: Lack of Razorpay Refund Webhook Handlers:**
  - **Location:** [`apps/web/lib/integrations/razorpay/webhook.ts`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/lib/integrations/razorpay/webhook.ts)
  - **Description:** The webhook handler only listens for `payment.captured` and `payment.failed`. Event types `refund.processed` and `refund.failed` are not handled.
- **FINDING-05: Missing User Blocking UI in Admin Navigation:**
  - **Location:** [`apps/web/app/admin/AdminNavClient.tsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/app/admin/AdminNavClient.tsx)
  - **Description:** Admin navigation has links for Dashboard, Orders, Books, and Users, but actions for user management are purely read-only.

---

## 12. Remediation Checklist Ordered by Severity

- [ ] **1. Remediate Prepaid Refund Mechanism (CRITICAL - FINDING-01):**
  - Implement Razorpay Refund API call in `apps/web/lib/integrations/razorpay/service.ts`:
    ```typescript
    export async function initiateRazorpayRefund(paymentId: string, amount: number, notes?: Record<string, string>);
    ```
  - In `cancelAdminOrder`, when `order.payment_status === 'Paid'`:
    - Call `initiateRazorpayRefund` with `order.razorpay_payment_id` and authoritative amount.
    - If refund succeeds: store `razorpay_refund_id` in `orders` and `payments`, set status to `'Refunded'`.
    - If refund is asynchronous or fails: mark status as `'Refund Pending'` or roll back cancellation, returning an actionable error to the admin.
  - Add `refund.processed` and `refund.failed` handlers to `/api/webhooks/razorpay`.
- [ ] **2. Remediate `settle_payment_atomic` RPC Permission (HIGH - FINDING-02):**
  - Create a migration revoking `EXECUTE` on `settle_payment_atomic` and `record_payment_failure_atomic` from `anon` and `authenticated`, granting solely to `service_role` and `postgres`.
- [ ] **3. Complete User Management Parity or Correct Matrix (MEDIUM - FINDING-03):**
  - Either implement Server Actions for `blockUser` and `unblockUser` on `apps/web/app/admin/users/page.tsx`, or update `docs/migration/FEATURE_PARITY_MATRIX.md` to reflect `PARTIAL (Read-only list verified; block/unblock pending)`.

---

## 13. Final Acceptance Decision

**Verdict:** **FAIL**

### Justification:
While Phase 6 successfully delivered server-side admin authorization, operational dashboard metrics, order management, and valid state machine enforcement, it fails the mandatory financial correctness criterion:
> *"If the application marks an order as refunded without confirmed refund settlement, classify it as a critical financial correctness issue."*

Prepaid order cancellation currently sets `payment_status = 'Refunded'` without initiating or confirming a refund through Razorpay. This constitutes a material financial correctness defect.

**Phase 7 CANNOT be authorized until this critical financial issue is remediated.**

