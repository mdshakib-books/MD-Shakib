# Phase 04 — Initial Repository & Architecture Audit
**Project:** MD Shakib Islamic Books  
**Phase:** 04 — Backend & Database Integrity  
**Repository:** `MD-Shakib`  
**Branch:** `new-fix`  
**Status:** COMPLETE  
**Auditor:** Independent Senior Backend & Database Architect  

---

## 1. Executive Summary & Audit Scope

Phase 04 focuses on establishing comprehensive backend correctness, PostgreSQL database integrity, transaction atomicity, Row Level Security (RLS) enforcement, financial lifecycle consistency, and reliable third-party integrations across MD Shakib Islamic Books. 

Prior migration phases established foundational UI parity, administrative capabilities, and authenticated customer account flows. However, this architectural audit conducted an independent, bottom-up inspection of the entire database, migration history, server actions, REST API endpoints, and legacy Express/MongoDB business logic.

The audit revealed that while high-level application flows were operating, critical database-level vulnerabilities and defects were dormant in the schema:
1. **Critical Stored Procedure Defect:** `request_replacement_atomic` attempted a manual insertion into a non-existent column `notes` in `public.order_status_history` (the actual column is `note`), which caused an immediate runtime PostgreSQL error and transaction abortion whenever an eligible customer requested a replacement.
2. **Missing Search Path on `SECURITY DEFINER` Routines:** Several database functions (`handle_new_user`, `is_admin`, `is_active_user`, `record_order_status_history`, and `validate_discount_coupon`) lacked fixed `search_path = public, pg_temp` configurations, creating search-path hijacking risks.
3. **Missing Schema-Level Duplicate Review Constraint:** The `public.reviews` table lacked a unique constraint on `(book_id, user_id)`, permitting duplicate submissions and race-condition review spam.
4. **Missing AWB Consignment Lookup Index:** Frequent Delhivery tracking webhook queries on `orders(shipping_awb)` were unindexed, incurring sequential table scans.

All issues have been remediated through forward-only corrective migration `20261101000001_phase04_backend_and_database_integrity.sql`, verified by 28 automated integration tests and the 15-suite regression battery.

---

## 2. Git & Working Tree Baseline

Before performing modifications, the repository working tree was inspected:
- **Active Branch:** `new-fix`
- **Head Commit:** `41209aa31ff1fd1f0ce14f7251fb47e518ecbce3` (`new: client side complete integration`)
- **Initial Working Tree Status:** Clean (`nothing to commit, working tree clean`)
- **Safety Policy Adherence:** No destructive Git operations (`git reset`, `git clean`, `git checkout`, `git stash`) were executed. The working tree preserves all user modifications.

---

## 3. Comparative Architecture Overview

| Architectural Domain | Legacy Architecture (`server/`) | Modern Architecture (`apps/web/` + `supabase/`) | Parity Status |
|---|---|---|---|
| **Runtime & Framework** | Node.js v20+ / Express.js 5.2 | Next.js 16.4.3 (Turbopack, App Router) | Upgraded |
| **Primary Database** | MongoDB (Mongoose 9.2 ODM) | PostgreSQL 15+ (Supabase Managed Engine) | Migrated |
| **Authentication** | JWT in HTTP-Only Cookies + bcrypt | Supabase Auth (GoTrue) + JWT + PostgreSQL RLS | Migrated & Hardened |
| **Transaction Safety** | Application-level checks (unreliable) | PostgreSQL ACID Functions (`FOR UPDATE` pessimistic locks) | Vastly Improved |
| **Access Control** | Express middleware (`auth.middleware.js`) | Dual-layer: Server Action guards + Database RLS | Multi-layer Hardened |
| **Product Catalog** | Mongoose `Book` Model | `public.books` + `public.categories` | Parity Verified |
| **Customer Cart** | Mongoose `Cart` with embedded items | `public.carts` + `public.cart_items` + `merge_cart_atomic` | Parity Verified |
| **Orders & Checkout** | Mongoose `Order` with embedded snapshots | `public.orders` + `public.order_items` + `create_order_atomic` | Parity Verified |
| **Payments** | Mongoose `Payment` + Razorpay SDK | `public.payments` + `settle_payment_atomic` + HMAC SHA256 | Parity Verified |
| **Logistics** | Express Delhivery Service | Next.js API Routes + Delhivery Consignments + Webhooks | Parity Verified |
| **Media Management** | Express Multer + Cloudinary | Admin API Routes + Magic Byte Binary Validation + Cloudinary | Parity Verified |
| **Transactional Email** | Nodemailer / Google APIs | Resend SDK + `public.email_logs` Audit Trail | Parity Verified |

---

## 4. Chronological Migration History Inspection

| Migration File | Description | Core Artifacts Landed | Integrity Status |
|---|---|---|---|
| `20261028000001_core_schema.sql` | Initial core tables and relationships | `profiles`, `addresses`, `books`, `carts`, `cart_items`, `orders`, `order_items`, `order_status_history`, `payments`, `audit_logs`, `email_logs` | Verified |
| `20261028000002_business_logic.sql` | Business logic triggers & stored procedures | `create_order_atomic`, `cancel_order_atomic`, `merge_cart_atomic`, triggers | Verified |
| `20261028000003_rls_policies.sql` | Initial RLS policies & helper functions | `is_admin()`, `is_active_user()`, initial table policies | Verified |
| `20261029000001_auth_profile_trigger.sql` | Auto profile generation trigger | `handle_new_user()` trigger on `auth.users` | Hardened in Phase 04 |
| `20261029000002_payment_settlement_atomic.sql` | Payment settlement procedure | `settle_payment_atomic` with row locks | Verified |
| `20261029000003_payment_security_and_refunds.sql` | Refund recording and failure handling | `record_payment_failure_atomic`, `record_refund_atomic` | Verified |
| `20261031000001_order_idempotency.sql` | Idempotency keys on orders table | `idempotency_key` column and unique partial index | Verified |
| `20261031000002_admin_management_system.sql` | Admin operations & new tables | `categories`, `inventory_adjustments`, `reviews`, `discounts`, `adjust_inventory_atomic`, `moderate_review_atomic` | Remediated in Phase 04 |
| `20261031000003_customer_account_and_commerce.sql` | Customer lifecycle & replacements | `request_replacement_atomic` | Bug fixed in Phase 04 |
| `20261031000004_security_and_idempotency_remediation.sql` | Security remediation for RPC identities | Hardened RPC caller checks (`current_user <> 'service_role'`) | Verified |
| `20261101000001_phase04_backend_and_database_integrity.sql` | Phase 04 final integrity remediation | Fixed `request_replacement_atomic`, `uq_reviews_book_user`, `submit_review_atomic`, all `search_path` | Landed & Verified |

---

## 5. Audit Findings & Categorization

### Finding 1: Critical Typo in `request_replacement_atomic` (Severity: CRITICAL)
- **Description:** The procedure attempted an `INSERT INTO public.order_status_history (order_id, status, notes, created_at)` using column name `notes`. The table definition has `note`. This caused a syntax/column-not-found error whenever a customer invoked the procedure.
- **Side Effect:** Also duplicated the work of trigger `trg_order_status_history`, which automatically fires on `orders` updates.
- **Resolution:** Corrected in forward migration `20261101000001_phase04_backend_and_database_integrity.sql`. Enhanced `record_order_status_history` trigger to capture `NEW.replacement_reason` directly into `note`.

### Finding 2: Unsafe Search Path on `SECURITY DEFINER` Functions (Severity: HIGH)
- **Description:** Functions `handle_new_user`, `is_admin`, `is_active_user`, `record_order_status_history`, and `validate_discount_coupon` did not specify `SET search_path = public, pg_temp`. In PostgreSQL, a SECURITY DEFINER function running without a fixed search_path can be exploited if an attacker creates objects in temporary schemas.
- **Resolution:** Explicitly added `SET search_path = public, pg_temp` to all 5 routines.

### Finding 3: Missing Schema-Level Unique Constraint on Customer Reviews (Severity: MEDIUM)
- **Description:** The `public.reviews` table had indices on `book_id`, `user_id`, and `status`, but lacked a UNIQUE constraint on `(book_id, user_id)`.
- **Resolution:** Added `CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_book_user ON public.reviews (book_id, user_id);` and created atomic stored procedure `submit_review_atomic`.

### Finding 4: Unindexed Lookups on `orders(shipping_awb)` (Severity: LOW)
- **Description:** Inbound Delhivery tracking webhooks match incoming waybill IDs against `orders.shipping_awb`. Without an index, this required sequential scans.
- **Resolution:** Added partial btree index `CREATE INDEX IF NOT EXISTS idx_orders_shipping_awb ON public.orders (shipping_awb) WHERE shipping_awb IS NOT NULL;`.

---

## 6. Audit Conclusion
The repository has a mature, highly capable architecture. With the corrective forward migration and test suite introduced in Phase 04, the backend database layer achieves complete integrity, deterministic financial operations, and robust security.

