# Phase 07 — Complete Regression Testing & Deployment Readiness Audit

**Project:** MD Shakib Islamic Books  
**Repository:** `mdshakib-books/MD-Shakib`  
**Branch:** `new-fix`  
**Date:** November 16, 2026  
**Auditor:** Senior Full-Stack & DevSecOps Lead (Antigravity AI)

---

## 1. Executive Summary & Objective

This document establishes the pre-implementation test coverage matrix, architecture review, and gap analysis for **Phase 07 — Complete Regression Testing**.

Across Phases 01 through 06, the MD Shakib Islamic Books application has undergone extensive security, checkout, role-based access control (RBAC), courier, refund, invoicing, performance, and database hardening:
- **Phase 01:** Environment safety, strict startup validation, zero-silent-mock fallbacks, and integration kill switches.
- **Phase 02:** Authoritative order creation, checkout idempotency, inventory reservation lifecycle, COD fail-closed serviceability, and refund reconciliation.
- **Phase 03:** Admin RBAC alignment across application and PostgreSQL database RLS, staff permission enforcement, and audit logging.
- **Phase 04:** Courier integration hardening (Delhivery), fake AWB prevention, reverse pickup validation, and out-of-order webhook reconciliation.
- **Phase 05:** Razorpay payment and refund lifecycle, GST compliance, invoice generation, single source of truth (SSOT) pricing, and transactional email retries.
- **Phase 06:** PostgreSQL `SECURITY DEFINER` hardening (`search_path = public, pg_temp`), RLS lockdowns, CSP and security headers, API route request bounds, and query/asset performance optimization.

The objective of Phase 07 is to validate the integrated system holistically, map all existing test coverage, identify any missing coverage or untested edge cases across seven critical testing categories (A through G), implement a comprehensive regression testing suite, uncover and fix any genuine defects, and provide an honest deployment-readiness verdict.

---

## 2. System Architecture & Inventory

### 2.1 API Routes Inventory (39 Endpoints)

| Category | Endpoint | Methods | Auth Required | Permissions / Scope |
|---|---|---|---|---|
| **Payments** | `/api/payments/create-order` | POST | Authenticated | Customer session + cart/reservation |
| | `/api/payments/verify` | POST | Authenticated | Customer session + HMAC signature |
| **Webhooks** | `/api/webhooks/razorpay` | POST | Webhook Secret | HMAC SHA-256 signature, idempotency |
| | `/api/webhooks/delhivery` | POST | Webhook Secret | Token/Secret auth, out-of-order guards |
| **Shipping** | `/api/shipping/serviceability` | GET | Public | Rate-limited, fail-closed Delhivery |
| | `/api/shipping/track` | GET | Authenticated | Order owner (`user_id`) or `orders.view` staff |
| **Delivery** | `/api/delivery/otp` | POST | Authenticated | Order owner, rate-limited |
| **Documents** | `/api/documents/invoice/[orderId]` | GET | Authenticated | Order owner or `orders.view` staff |
| | `/api/documents/receipt/[orderId]` | GET | Authenticated | Order owner or `orders.view` staff |
| | `/api/documents/refund/[refundId]` | GET | Authenticated | Order owner or `orders.view` staff |
| | `/api/documents/packing-slip/[orderId]` | GET | Authenticated | `warehouse_staff` / `admin` (`orders.edit`) |
| **Returns** | `/api/returns/eligibility` | GET | Authenticated | Order owner, 7-day delivery window |
| | `/api/returns/create` | POST | Authenticated | Order owner, item-level return reason |
| **Admin Operations** | `/api/admin/orders` | GET | Authenticated | `orders.view` permission |
| | `/api/admin/orders/[id]/status` | POST | Authenticated | `orders.edit` permission |
| | `/api/admin/orders/export` | GET | Authenticated | `reports.view` permission |
| | `/api/admin/books/import` | POST | Authenticated | `catalog.edit` permission |
| | `/api/admin/books/export` | GET | Authenticated | `reports.view` permission |
| | `/api/admin/books/[id]/variants` | GET, POST | Authenticated | `books.view` / `books.edit` permission |
| | `/api/admin/customers/export` | GET | Authenticated | `reports.view` permission |
| | `/api/admin/delivery/verify-otp` | POST | Authenticated | `delivery.verify` permission |
| | `/api/admin/delivery/cod-collect` | POST | Authenticated | `delivery.verify` permission |
| | `/api/admin/returns/review` | POST | Authenticated | `returns.manage` permission |
| | `/api/admin/returns/pickup` | POST | Authenticated | `returns.manage` permission |
| | `/api/admin/returns/refund` | POST | Authenticated | `returns.manage` permission |
| | `/api/admin/returns/refund/confirm` | POST | Authenticated | `returns.manage` permission |
| | `/api/admin/media/sign` | POST | Authenticated | `media.upload` permission |
| | `/api/admin/media/upload` | POST | Authenticated | `media.upload` permission |
| **Support** | `/api/support/tickets` | GET, POST | Authenticated | Customer tickets (own) |
| | `/api/support/tickets/[id]` | GET | Authenticated | Ticket owner or `support.manage` |
| | `/api/support/tickets/[id]/messages` | POST | Authenticated | Ticket owner or `support.manage` |
| | `/api/admin/support/tickets/[id]` | PATCH | Authenticated | `support.manage` permission |
| **Customer Experience** | `/api/account/anonymize` | POST | Authenticated | Customer owner (own account) |
| | `/api/auth/phone/send-otp` | POST | Public | Rate-limited phone OTP |
| | `/api/auth/phone/verify-otp` | POST | Public | Rate-limited OTP verification |
| | `/api/reviews` | GET, POST | Authenticated (POST) | Verified purchaser for POST |
| | `/api/wishlist` | GET, POST, DELETE | Authenticated | Customer session (own wishlist) |
| **System** | `/api/health` | GET | Public / Secret | Live/Ready probes, topology redaction |
| | `/api/cron/reservations` | POST | Cron Secret | Cleans up expired reservations |

### 2.2 Database Migrations & Objects Inventory (PostgreSQL 17)

All 26 migration files run cleanly in chronological sequence from scratch:
1. `20261028000001_core_schema.sql` (core tables, extensions)
2. `20261028000002_business_logic.sql` (updated_at triggers, basic RPCs)
3. `20261028000003_rls_policies.sql` (baseline RLS)
4. `20261029000001_auth_profile_trigger.sql` (auth trigger)
5. `20261029000002_payment_settlement_atomic.sql` (atomic payment settlement)
6. `20261029000003_payment_security_and_refunds.sql` (refund guards)
7. `20261031000001_order_idempotency.sql` (idempotency keying)
8. `20261031000002_admin_management_system.sql` (categories, reviews, discounts, staff)
9. `20261031000003_customer_account_and_commerce.sql` (customer features)
10. `20261031000004_security_and_idempotency_remediation.sql` (idempotency remediation)
11. `20261101000001_phase04_backend_and_database_integrity.sql` (backend integrity)
12. `20261106000001_phase10_performance_security_and_indexes.sql` (trgm, indexes)
13. `20261107000001_phase00_foundation_and_security.sql` (foundation rewrite)
14. `20261109000001_phase01_modernization_and_hardening.sql` (modernization)
15. `20261109000002_phase00_phase01_gap_closure.sql` (gap closure)
16. `20261109000003_phase00_final_security_remediation.sql` (final security)
17. `20261109000004_phase00_settlement_integrity_remediation.sql` (settlement integrity)
18. `20261109000005_phase00_already_paid_reconciliation.sql` (already paid reconciler)
19. `20261109000006_phase02_complete_features.sql` (complete features)
20. `20261110000001_phase02_remediation_defects.sql` (remediation)
21. `20261110000002_phase03_checkout_consent.sql` (checkout consent)
22. `20261111000001_phase02_checkout_hardening.sql` (Phase 02 checkout hardening)
23. `20261112000001_phase03_admin_roles_order_management.sql` (Phase 03 RBAC hardening)
24. `20261113000001_phase04_delivery_and_returns_hardening.sql` (Phase 04 delivery & returns hardening)
25. `20261114000001_phase05_payments_emails_invoices_hardening.sql` (Phase 05 payments & invoices hardening)
26. `20261115000001_phase06_security_performance_hardening.sql` (Phase 06 security & performance hardening)

**Database Object Totals (Verified against PostgreSQL 17 engine):**
- Total Public Tables: **39**
- Total Public Functions & RPCs: **139**
- Total Database Indexes: **179**
- Total Row-Level Security Policies: **83**

---

## 3. Existing Test Coverage Inventory

The repository contains established verification suites covering specific phase deliverables:

| Test Suite File | Focus Area | Assertions / Tests |
|---|---|---|
| `test-phase01-environment-safety.ts` | Env validation, kill switches, secrets redaction, mock isolation | 17 / 17 Passed |
| `test-phase02-checkout-hardening.ts` | Atomic order RPC, inventory reservations, COD fail-closed, refund RPC | 14 / 14 Passed |
| `test-phase03-admin-order-management.ts` | Staff RBAC, permission hierarchy, order lifecycle, tracking URLs | 12 / 12 Passed |
| `test-phase04-delivery-returns.ts` | Fake AWB rejection, Delhivery webhook reconciliation, return lifecycle | 8 / 8 Passed |
| `test-phase05-payments-emails-invoices.ts` | Razorpay refund cap/retry, GST mod-36, invoice generation, email retry | 12 / 12 Passed |
| `test-phase06-security-performance.ts` | `search_path`, RPC REVOKE/GRANT, CSP headers, rate-limiting, N+1 queries | 18 / 18 Passed |
| `test-delhivery-missing-credentials.ts` | Delhivery fail-closed security when credentials unconfigured | 12 / 12 Passed |
| `test-phase09-unit-and-business-logic.ts` | Cart math, status machine, 7-day return window, HMAC verification | 28 / 28 Passed |

**Current Passing Test Total across existing active suites:** **121 passed / 0 failed**.

---

## 4. Coverage Gap Analysis by Requirement Category

While existing suites cover individual phase requirements well, several critical integration, failure mode, security isolation, and end-to-end journey gaps remain unverified in an integrated test suite.

### Category A: Unit Tests & Edge Cases
- **Existing Coverage:** Cart calculations, state transitions, return windows, HMAC signatures.
- **Identified Gaps:**
  1. *Coupon code edge cases:* Percent vs fixed discount cap, minimum order threshold validation, expired coupon rejection, coupon case-insensitivity, and zero-total orders.
  2. *Reverse logistics tax calculations:* Intrastate (CGST+SGST 18%) vs Interstate (IGST 18%) on reverse shipping charges during returns.
  3. *Cart item price change handling:* Recomputing cart totals when underlying catalog prices or discounts change while items sit in cart.
  4. *Cumulative refund boundary:* Exact matching of multiple partial refunds summing up to order grand total without permitting ₹0.01 overage.

### Category B: Integration Tests & Database RPC Contracts
- **Existing Coverage:** RPC SQL string auditing and in-memory mock executions.
- **Identified Gaps:**
  1. *RPC Signature & Parameter Compatibility:* Verify that TypeScript callers (`orders-core.ts`, `payments.ts`, `reservations.ts`, `returns.ts`) pass exact parameter names and types expected by database functions:
     - `create_order_atomic(p_user_id, p_items, p_shipping_address, p_payment_method, p_expected_total, ...)`
     - `settle_order_payment_atomic(p_order_id, p_payment_id, p_gateway_order_id, p_signature, p_amount)`
     - `process_order_refund_atomic(p_order_id, p_refund_amount, p_reason, p_gateway_refund_id)`
     - `cancel_order_atomic(p_order_id, p_user_id, p_reason, p_restock)`
     - `release_expired_reservations_atomic()`
  2. *Trigger Execution & Cascade Integrity:* Verify that deleting an auth user or updating order status triggers historical audit logs and immutability rules.

### Category C: Database-Backed Tests (PostgreSQL 17)
- **Existing Coverage:** Offline mock clients; remote Supabase not connected.
- **Identified Gaps & Action:**
  1. *Clean Migration Sequence from Scratch:* Verified against PostgreSQL 17 alpine engine! All 26 migrations applied without errors.
  2. *Table Constraints & Foreign Keys:* Verify cascade behavior, unique constraints on `(order_id, idempotency_key)`, `(user_id, book_id)` for reviews/wishlists, and check constraints on non-negative amounts.

### Category D: Failure & Resilience Tests
- **Existing Coverage:** Some unit tests on mock failures.
- **Identified Gaps:**
  1. *Razorpay Failure Modes:*
     - Payment failed / user cancelled modal -> order remains pending or transitions to payment_failed without decremented permanent inventory.
     - Out-of-order webhook delivery: `refund.created` arriving before `payment.captured` or after `order.cancelled`.
     - Duplicate webhook redelivery: multiple deliveries of `payment.captured` with same `event_id` must be strictly idempotent.
  2. *Delhivery Failure Modes:*
     - Serviceability API returns 500/503 -> checkout fail-closed (blocks COD, prevents booking).
     - Network timeout on shipment creation -> no synthetic/fake AWB created, returns clean retryable error.
     - Duplicate tracking webhooks -> idempotent event recording without status regression.
  3. *Resend Email Failure Modes:*
     - 429 rate limit or 503 transient failure -> exponential backoff retry up to 3 attempts.
     - 400 validation error / invalid recipient -> marked permanently failed without infinite retry loops.
  4. *High Concurrency / Race Condition:*
     - Two concurrent checkout attempts for a book with only 1 unit remaining in stock. One must succeed and lock the reservation; the other must fail with stock exhaustion error.

### Category E: RBAC & Tenant Security Tests
- **Existing Coverage:** Function `REVOKE` checks, admin route auth checks.
- **Identified Gaps:**
  1. *Cross-Customer Isolation (Tenant Boundary):*
     - Customer A cannot view, download invoice, cancel, or track Customer B's order.
     - Customer A cannot read or mutate Customer B's addresses or support tickets.
  2. *Staff Role Boundary Violations:*
     - `support_staff` cannot initiate refunds, verify delivery OTPs, or create shipments.
     - `warehouse_staff` cannot change book prices or refund orders.
     - `order_manager` can manage orders and approve returns, but cannot alter system roles.
     - `admin` possesses full operational access.
  3. *Privilege Escalation & Profile Manipulation:*
     - Authenticated customer updating own profile cannot set `role: "admin"` or `is_blocked: false` via PostgREST.

### Category F: End-to-End User Journeys
- **Existing Coverage:** Modular phase tests.
- **Identified Gaps:**
  1. *Journey 1 (Prepaid Flow):* Add to cart -> Checkout -> Payment Success -> Order Confirmed -> Invoice Generated -> Shipment Manifested -> Delivered -> Delivery OTP verified.
  2. *Journey 2 (Prepaid Cancellation & Refund Flow):* Order Confirmed -> Cancelled by customer before dispatch -> Razorpay Gateway Refund initiated -> Refund record created -> Inventory returned to available stock -> Email dispatched.
  3. *Journey 3 (Return, Inspection & Refund/Replacement Flow):* Delivered order -> Return request submitted -> Staff approves -> Reverse pickup booked with Delhivery -> Warehouse inspects item -> Refund or Replacement order generated.
  4. *Journey 4 (COD Flow):* Pincode serviceability check passes -> COD order placed -> Shipment created -> Delivery attempt -> OTP verified -> Cash collected -> Payment settled -> Receipt issued.

### Category G: Deployment Readiness Verification
- **Existing Coverage:** Manual commands during individual phases.
- **Required Automated Verifications:**
  1. `npm run typecheck` (`tsc --noEmit`): 0 TypeScript errors.
  2. `npm run lint` (`eslint .`): 0 ESLint errors.
  3. `npm run build`: Production build compiles successfully and generates all static/dynamic routes.
  4. Production environment validation passes with zero leaked or missing variables.
  5. Secret redaction audit across all application logging.

---

## 5. Implementation Plan for Phase 07 Regression Suite

To address all identified gaps without introducing flaky network dependencies or polluting production services, we will implement `apps/web/scripts/test-phase07-regression.ts` structured into clear, self-contained test modules:

1. **`SECTION 1: UNIT CALCULATIONS & PRICING EDGE CASES`**
   - Coupon codes (percent, fixed, caps, thresholds, case-insensitivity)
   - GST state calculations (interstate IGST vs intrastate CGST/SGST)
   - Cart rounding and price-shift edge cases
   - Multi-item return calculations and partial refund limits

2. **`SECTION 2: INTEGRATION & RPC CONTRACT COMPATIBILITY`**
   - Parameter name and type parity between TypeScript code and PostgreSQL RPCs
   - Idempotency key fingerprinting and collision prevention
   - Audit log trigger and order status history triggers

3. **`SECTION 3: FAILURE & RESILIENCE SIMULATION`**
   - Razorpay gateway rejection, network timeouts, out-of-order webhook delivery
   - Delhivery serviceability fail-closed, network timeout recovery, duplicate tracking webhooks
   - Resend email retry classification (transient vs permanent)
   - Stock exhaustion concurrency race simulation (last item in stock)

4. **`SECTION 4: RBAC, TENANT ISOLATION & PRIVILEGE ESCALATION`**
   - Cross-customer data isolation (Customer A cannot access Customer B's orders, invoices, or tracking)
   - Staff role matrix validation (`support_staff`, `warehouse_staff`, `order_manager`, `admin`)
   - Profile privilege escalation prevention (`role` modification blocked)

5. **`SECTION 5: END-TO-END WORKFLOW SIMULATIONS`**
   - E2E Journey 1: Prepaid Order -> Confirmation -> Invoice -> Delivery
   - E2E Journey 2: Prepaid Order -> Customer Cancellation -> Gateway Refund -> Restock
   - E2E Journey 3: Delivered Order -> Return Request -> Approval -> Reverse Pickup -> Refund
   - E2E Journey 4: COD Order -> Fail-closed check -> Dispatch -> OTP Verification -> Cash Collected

6. **`SECTION 6: DEPLOYMENT HYGIENE & STATIC CHECKS`**
   - Environment validation and secret leakage scan
   - TypeScript compilation (`tsc --noEmit`)
   - Production Next.js build verification

---

## 6. Defect Remediation Protocol

If genuine defects or inconsistencies are uncovered during the execution of the regression suite:
1. Document the exact symptom, root cause, and affected files in the audit log.
2. Apply minimal, robust fixes directly in the application or migration files while preserving all business requirements and invariants from Phases 01–06.
3. Re-run the Phase 07 regression suite and all preceding phase test suites to verify that zero regressions were introduced.

---

*Pre-implementation audit complete. Proceeding to implement the comprehensive regression suite in `apps/web/scripts/test-phase07-regression.ts`.*
