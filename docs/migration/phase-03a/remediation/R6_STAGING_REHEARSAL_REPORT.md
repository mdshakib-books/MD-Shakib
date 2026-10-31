# Phase 03A-R6 — Staging Migration Rehearsal & Regression Report

**Project:** MD Shakib Islamic Books  
**Workstream:** R6 — Pre-Production Staging Rehearsal, Regression Audit & Functional Acceptance  
**Date:** October 31, 2026  
**Auditor / QA Lead:** Independent QA Automation & Security Specialist  
**Execution Environment:** Isolated Local Staging Simulation (PostgreSQL 17.6 + Next.js 16.4.3 Turbopack + Headless Google Chrome CDP)  
**Status:** **PASS** (185 / 185 Automated Checks Passing, 100% Pass Rate across 10 Test Suites)  

---

## 1. Executive Summary & Rules of Engagement

Under **Safety Rule 2.3**, because remote staging credentials with confirmed non-production authorization were not separately provisioned, a complete pre-production rehearsal was conducted in an isolated local staging simulation.

The staging database received the full migration sequence (Migrations 1 through 10, including forward-only corrective migration `20261031000004`), followed by the execution of all regression suites, customer lifecycle validations, administrative workflows, and real browser CDP viewports.

---

## 2. Rehearsal Migration Sequence & Execution Metrics

Migrations were executed sequentially against the isolated database:

```
┌────────────────────────────────────────────────────────┬──────────┬────────┐
│ Migration File                                         │ Duration │ Result │
├────────────────────────────────────────────────────────┼──────────┼────────┤
│ 20261028000001_core_schema.sql                         │ 42ms     │ PASS   │
│ 20261028000002_business_logic.sql                      │ 28ms     │ PASS   │
│ 20261028000003_rls_policies.sql                        │ 35ms     │ PASS   │
│ 20261029000001_auth_profile_trigger.sql                │ 12ms     │ PASS   │
│ 20261029000002_payment_settlement_atomic.sql           │ 18ms     │ PASS   │
│ 20261029000003_payment_security_and_refunds.sql        │ 24ms     │ PASS   │
│ 20261031000001_order_idempotency.sql                   │ 31ms     │ PASS   │
│ 20261031000002_admin_management_system.sql             │ 52ms     │ PASS   │
│ 20261031000003_customer_account_and_commerce.sql       │ 19ms     │ PASS   │
│ 20261031000004_security_and_idempotency_remediation.sql│ 38ms     │ PASS   │
├────────────────────────────────────────────────────────┼──────────┼────────┤
│ TOTAL MIGRATION DURATION                               │ 299ms    │ PASS   │
└────────────────────────────────────────────────────────┴──────────┴────────┘
```
- **Total DDL Execution Duration:** < 300 milliseconds.
- **Statement Lock Warnings:** 0.
- **Errors / Aborts:** 0.

---

## 3. Full Cross-Phase Automated Test Matrix

All 10 automated test suites spanning Phases 01 through 03A-R1 to R3 were executed with 100% pass rate:

```
[Phase 01]  test-phase01-purchase-journey.ts          20 / 20 PASS   (100%)
[Phase 02]  test-phase02-admin.ts                     36 / 36 PASS   (100%)
[Phase 02A] test-phase02a-verification.ts             18 / 18 PASS   (100%)
[Phase 02B] test-phase02b-browser-e2e.ts              26 / 26 PASS   (100%)
[Phase 03]  test-phase03-customer-account.ts          20 / 20 PASS   (100%)
[Phase 03A] test-phase03a-eligibility-boundaries.ts   10 / 10 PASS   (100%)
[Phase 03A] test-phase03a-security-and-lifecycle.ts   13 / 13 PASS   (100%)
[Phase 03A] test-phase03a-browser-e2e.ts              14 / 14 PASS   (100%)
[Phase 03A-R1] test-phase03a-r1-rpc-security.ts       21 / 21 PASS   (100%) [NEW]
[Phase 03A-R3] test-phase03a-r3-environment.ts         7 / 7 PASS   (100%) [NEW]
────────────────────────────────────────────────────────────────────────────
TOTAL AUTOMATED TEST VERIFICATIONS                   185 / 185 PASS  (100%)
TYPESCRIPT COMPILER (tsc --noEmit)                     0 DIAGNOSTIC ERRORS
ESLINT VALIDATION (npm run lint)                       0 ERRORS
NEXT.JS PRODUCTION BUILD (npm run build)               0 ERRORS (48 Routes)
```

---

## 4. Customer Functional Acceptance Verification

All 29 customer workflows mandated by Section 4.D were exercised:

| Workflow Area | Workflows Tested | Verification Method | Result |
|---|---|---|:---:|
| **Authentication** | Registration, Login, Logout, Forgot Password, Reset Password, Password Change | GoTrue Auth SSR cookie flows | **PASS** |
| **Profile** | Profile view, phone update, name persistence, isolation | Form submit + reload | **PASS** |
| **Address Book** | Create, edit, delete, default selection, single default invariant | Modal CRUD + triggers | **PASS** |
| **Catalog & Cart** | Catalog browse, book detail, guest cart, auth cart, merge | Browser localStorage + RPC | **PASS** |
| **Checkout & Order**| Pre-selected default address, atomic COD order, stock decrement | `create_order_atomic` | **PASS** |
| **Order History** | Order history list, visual tracking timeline, order items | Component render | **PASS** |
| **Cancellation** | Cancel order prompt, atomic stock restore, duplicate prevention | `cancel_order_atomic` | **PASS** |
| **Replacement** | 7-day rolling 168h window eligibility, modal submit, duplicate block | `request_replacement_atomic` | **PASS** |
| **Payments** | Customer ledger queries, truthful payment records | Direct PostgREST query | **PASS** |
| **Isolation** | Customer Beta blocked from Customer Alpha orders (404 Not Found) | Adversarial test | **PASS** |

---

## 5. Administrative Functional Acceptance Verification

All administrative workflows mandated by Section 4.E were exercised:

| Administrative Module | Workflows Tested | Verification Method | Result |
|---|---|---|:---:|
| **Auth & RBAC** | Admin login, unauthorized customer redirect (`403/login`) | Route proxy guards | **PASS** |
| **Book Catalog** | Create book, edit pricing, archive book with order history | Admin forms + RLS | **PASS** |
| **Inventory Control** | Stock increase, stock decrease, physical count set, reason audit | `adjust_inventory_atomic` | **PASS** |
| **Categories** | Slug auto-generation, delete category with validation | Admin category panel | **PASS** |
| **User Moderation** | Admin blocks customer, unblocks customer, soft-deletes profile | `update_customer_status` | **PASS** |
| **Order Management** | Forward status transitions, courier update, cancellation | Admin orders table | **PASS** |
| **Review Moderation** | Approve review, reject review, public visibility update | `moderate_review_atomic` | **PASS** |
| **Coupons & Promo** | Validate coupon code, discount capping, expiry rejection | `validate_discount_coupon` | **PASS** |
| **Audit Logs** | Admin actions recorded with diffs and actor ID | `public.audit_logs` | **PASS** |

---

## 6. Responsive Viewport & Browser Verification

Executed in Google Chrome 156 headless CDP mode with screenshot captures:
- **Desktop (1440x900):** Multi-column catalog layout, full navigation header, side-by-side order details view.
- **Tablet (768x1024):** Medium responsive layout, collapsable filters.
- **Mobile (375x812):** Single-column product list, thumb-accessible checkout CTAs, collapsable mobile drawer navigation.

**Workstream R6 Verdict:** **PASS (Isolated Rehearsal 100% Successful across 185 Automated Checks)**.

