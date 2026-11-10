# PHASE 2 — COMPLETE IMPLEMENTATION PLAN
**MD Shakib Islamic Books Modernization Project**  
**Document Reference:** `docs/migration/phase-02/PHASE_2_IMPLEMENTATION_PLAN.md`  
**Date:** 2026-11-09  
**Status:** In Execution  

---

## 1. EXECUTIVE SUMMARY & OBJECTIVES

This plan outlines the complete, end-to-end implementation of **Phase 2 (Requirements 2.1 through 2.40)** for MD Shakib Islamic Books. 

### Non-Negotiable Engineering Directives:
1. **Preserve Foundation:** Preserve all Phase 0 and Phase 1 security, database, and integration invariants.
2. **Forward-Only Migration:** Single consolidated forward-only migration `20261109000006_phase02_complete_features.sql` with strict constraints, RLS, and atomic RPCs.
3. **End-to-End Integration:** Every feature must be wired into real customer or admin UI workflows — zero placeholder or dead code.
4. **Authoritative Financial Calculations:** Exact decimal / minor integer units for all invoice, tax, discount, and refund arithmetic.
5. **Decoupled Delivery & COD:** OTP delivery verification confirms receipt; COD collection records cash handover; Courier remittance reconciles funds.

---

## 2. COMPREHENSIVE REQUIREMENTS MAPPING (2.1 – 2.40)

| Req | Subphase | Feature Name | Baseline Status | Implementation Target |
|---|---|---|---|---|
| **2.1** | 2A | OTP Generation | Missing | CSPRNG 6-digit generation, order-specific |
| **2.2** | 2A | OTP Storage | Missing | HMAC-SHA256 hash storage with server secret |
| **2.3** | 2A | OTP Lifecycle | Missing | 24h expiry, 5 max attempts, atomic regeneration |
| **2.4** | 2A | Customer Tracking OTP | Missing | Visible in `/orders/[id]` only when 'Out for Delivery' |
| **2.5** | 2A | Delivery Agent Verification | Missing | Dedicated `/admin/delivery-verification` portal |
| **2.6** | 2A | Server-Side Verification | Missing | `verify_delivery_otp_atomic` PostgreSQL RPC |
| **2.7** | 2A | Delivery Audit Trail | Missing | `delivery_verifications` immutable ledger |
| **2.8** | 2A | COD Collection | Partial | `cod_collections` doorstep cash recording |
| **2.9** | 2A | Delivery Reconciliation | Partial | `cod_remittances` courier remittance reconciliation |
| **2.10** | 2B | Invoice Generation | Missing | `invoices` table, sequential numbering, PDF/print view |
| **2.11** | 2B | Tax Calculation | Missing | GST breakdown (CGST/SGST/IGST, state code rules) |
| **2.12** | 2B | Packing Slip | Missing | Warehouse packing slip view `/api/documents/packing-slip` |
| **2.13** | 2B | Payment Receipt | Missing | Customer printable receipt `/api/documents/receipt` |
| **2.14** | 2B | Refund Documentation | Missing | Official credit note document `/api/documents/refund` |
| **2.15** | 2C | Customer Return Request | Missing | Return request drawer in `/account/orders/[id]` |
| **2.16** | 2C | Return Eligibility | Missing | Policy check (7-day delivered window, returnable items) |
| **2.17** | 2C | Admin Return Management | Missing | Admin return portal `/admin/returns` |
| **2.18** | 2C | Return Pickup | Missing | Delhivery reverse pickup integration & mock adapter |
| **2.19** | 2C | Refund Workflow | Partial | `initiate_return_refund_atomic`, Razorpay API call |
| **2.20** | 2C | Replacement Workflow | Partial | `reserve_replacement_inventory_atomic` & replacement order |
| **2.21** | 2C | Refund Reconciliation | Missing | Razorpay refund status sync & discrepancy reporting |
| **2.22** | 2D | Wishlist | Missing | `wishlists` table, toggle button on books, `/wishlist` page |
| **2.23** | 2D | Product Reviews | Partial | Verified-purchase review submission on book detail page |
| **2.24** | 2D | Customer Support Tickets | Missing | Multi-turn support ticket center `/account/support` |
| **2.25** | 2D | Account Deletion | Missing | Self-service deletion with anonymization in `/account/security` |
| **2.26** | 2D | Phone Verification | Missing | OTP-based phone verification in `/account/profile` |
| **2.27** | 2D | Order Support | Missing | Direct "Need Help With Order" ticket creation |
| **2.28** | 2E | ISBN and SKU | Missing | Columns in `books`, unique validation, admin UI |
| **2.29** | 2E | Book Weight and Dimensions | Missing | Weight and dimensions in `books`, shipping calculation |
| **2.30** | 2E | Bulk Product Import | Missing | CSV upload, row validation, duplicate check, preview |
| **2.31** | 2E | Bulk Product Export | Missing | Filtered CSV/Excel export from `/admin/books` |
| **2.32** | 2E | Product Variants | Missing | `book_variants` table, format/edition selection |
| **2.33** | 2E | Inventory History | Partial | Append-only `inventory_history` ledger for all movements |
| **2.34** | 2F | Order Export | Missing | Filtered CSV export from `/admin/orders` |
| **2.35** | 2F | Customer Export | Missing | PII-restricted customer CSV export from `/admin/users` |
| **2.36** | 2F | Sales Reports | Partial | Daily/weekly/monthly aggregation RPC & dashboard report |
| **2.37** | 2F | Payment Reports | Missing | COD vs Prepaid reconciliation report |
| **2.38** | 2F | Inventory Reports | Partial | Stock health, low-stock, and movement analytics |
| **2.39** | 2F | Staff Roles | Partial | Granular RBAC (Warehouse, Support, Operations, Finance) |
| **2.40** | 2F | Admin Activity Logs | Partial | Comprehensive audit coverage across all Phase 2 entities |

---

## 3. IMPLEMENTATION SCHEDULE & DEPENDENCY SEQUENCE

### Step 1: Database Foundation
Apply forward migration `supabase/migrations/20261109000006_phase02_complete_features.sql` defining:
- All 13 new tables, 3 sequences, and 7 added book columns.
- Atomic RPC procedures and constraints.
- RLS policies for authenticated users, customers, and staff.

### Step 2: Phase 2A — Delivery OTP & Verification
- Implementation of `lib/delivery/otp.ts` and `lib/delivery/cod.ts`.
- Customer order tracking OTP display in `app/orders/[id]/page.tsx` and `app/account/orders/[id]/page.tsx`.
- Staff verification UI `/admin/delivery-verification/page.tsx`.
- Server API route `/api/admin/delivery/verify-otp`.
- Automated test suite `scripts/test-phase02a-delivery-otp.ts`.

### Step 3: Phase 2B — Commercial & Financial Documents
- Implementation of `lib/commerce/invoices.ts` and `lib/commerce/tax.ts`.
- Printable / downloadable document routes:
  - `/api/documents/invoice/[orderId]`
  - `/api/documents/packing-slip/[orderId]`
  - `/api/documents/receipt/[orderId]`
  - `/api/documents/refund/[refundId]`
- Integration of document download buttons in customer and admin order screens.
- Automated test suite `scripts/test-phase02b-documents.ts`.

### Step 4: Phase 2C — Returns, Refunds & Replacements
- Implementation of `lib/commerce/returns.ts` and `lib/integrations/razorpay/refunds.ts`.
- Customer return request modal in `/account/orders/[id]`.
- Customer replacements view in `/account/replacements`.
- Customer refunds view in `/account/refunds`.
- Admin return & replacement management portal `/admin/returns/page.tsx`.
- Reverse pickup integration in `lib/integrations/delhivery/service.ts`.
- Automated test suite `scripts/test-phase02c-returns.ts`.

### Step 5: Phase 2D — Customer Experience
- Wishlist: `lib/commerce/wishlist.ts`, `app/wishlist/page.tsx`, and book card toggle buttons.
- Reviews: Review submission on `app/books/[id]/BookDetailsClient.tsx` with verified-purchase badge.
- Support Tickets: `lib/support/tickets.ts`, customer `/account/support`, admin `/admin/support`.
- Account Deletion: Self-service anonymization action in `/account/security`.
- Phone Verification: OTP flow in `/account/profile`.
- Automated test suite `scripts/test-phase02d-customer-experience.ts`.

### Step 6: Phase 2E — Catalogue & Inventory Enhancements
- ISBN/SKU & Dimensions in `lib/admin/books.ts` and `/admin/books/AdminBooksClient.tsx`.
- Bulk product import and export in `/admin/books/page.tsx`.
- Product variants support in `lib/catalog/variants.ts` and book detail page.
- Inventory history ledger in `lib/admin/inventory.ts` and `/admin/inventory/AdminInventoryClient.tsx`.
- Automated test suite `scripts/test-phase02e-catalogue-inventory.ts`.

### Step 7: Phase 2F — Business Operations & Reporting
- Order CSV export in `/admin/orders`.
- Customer CSV export in `/admin/users`.
- Sales, Payment, and Inventory reports in `/admin/reports/page.tsx`.
- Granular staff roles in `lib/admin/permissions.ts`.
- Audit logs coverage in `lib/admin/audit.ts` and `/admin/audit-logs`.
- Automated test suite `scripts/test-phase02f-reports-operations.ts`.

### Step 8: Master Verification & Regression Suite
- Run master Phase 2 test suite `scripts/test-phase02-master-verification.ts`.
- Run Phase 0 and Phase 1 regression suites.
- Run `npm run typecheck` and `npm run lint`.
- Produce deliverables:
  - `PHASE_2_IMPLEMENTATION_REPORT.md`
  - `PHASE_2_TEST_REPORT.md`
  - `PHASE_2_PRODUCTION_READINESS.md`
