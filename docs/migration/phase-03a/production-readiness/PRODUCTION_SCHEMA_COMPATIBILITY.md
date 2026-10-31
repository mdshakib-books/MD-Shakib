# Phase 03A — Production Schema Compatibility & Parity Audit

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Production Migration Readiness Audit  
**Target Environment:** Remote Supabase Production Database (`mhyawpnjhajytetqppam.supabase.co`)  
**Local Baseline:** Local PostgreSQL 17.6 (`127.0.0.1:54322`)  
**Audit Date:** October 31, 2026  
**Auditor:** Independent Database Architect & Security Auditor  
**Production Access Status:** **UNAVAILABLE (NO AUTHORIZED READ-ONLY CONNECTION)**  
**Compatibility Verdict:** **NOT VERIFIED (READ-ONLY INSPECTION RUNBOOK PROVIDED)**  

---

## 1. Executive Summary & Non-Negotiable Safety Boundary

Under **Non-Negotiable Safety Rules 9, 10, and 12**:
1. *Do not assume production schema matches local schema.*
2. *If production access is unavailable, explicitly mark the corresponding checks as NOT VERIFIED. Do not invent evidence.*
3. *Read-only production inspection is permitted only if an explicitly configured, authorized, read-only connection is available. Never use a privileged production connection for this audit.*

### Verification Finding:
No read-only PostgreSQL connection string or database password is configured in repository environment variables (`.env`, `apps/web/.env.local`). While network probes confirm HTTP REST and PostgreSQL endpoints are listening on `db.mhyawpnjhajytetqppam.supabase.co`, direct database catalog queries cannot be executed against production without a provisioned read-only credential.

Consequently, all direct production database catalog checks are classified as **NOT VERIFIED**. Below is the comparative schema analysis mapping the local verified schema against the expected production states, followed by the safe, non-destructive read-only preflight inspection checklist and SQL script.

---

## 2. Comprehensive Schema Object Classification

The table below contrasts the expected post-migration schema (after applying migrations 1 through 9) against potential production states:
- **Scenario A:** Production database where migrations 1 through 6 (`20261028000001` through `20261029000003`) were applied.
- **Scenario B:** Production database that has never received any repository migrations (clean or legacy state).

| Database Object | Type | Expected Schema Post-Migration 9 | Scenario A (Mig 1-6 applied) | Scenario B (Fresh DB) | Remote Production Status | Risk Assessment |
|---|---|---|:---:|:---:|:---:|---|
| `public.profiles` | Table | Primary user profile linked to `auth.users(id)` | **MATCH** | **MISSING** | **NOT VERIFIED** | High (Critical user entity) |
| `public.addresses` | Table | User address book with single default constraint | **MATCH** | **MISSING** | **NOT VERIFIED** | Medium |
| `public.books` | Table | Catalog table with stock and pricing | **MATCH** | **MISSING** | **NOT VERIFIED** | High |
| `public.carts` | Table | User cart with `last_merge_token` | **DIFFERENT** (`last_merge_token` missing) | **MISSING** | **NOT VERIFIED** | Low (Added in Mig 7) |
| `public.cart_items` | Table | Cart items with composite unique key | **MATCH** | **MISSING** | **NOT VERIFIED** | Medium |
| `public.orders` | Table | Core orders table with idempotency & refund fields | **DIFFERENT** (`idempotency_key` missing) | **MISSING** | **NOT VERIFIED** | High (Core commerce ledger) |
| `public.order_items` | Table | Line-item snapshots | **MATCH** | **MISSING** | **NOT VERIFIED** | Medium |
| `public.order_status_history` | Table | Audit history for order state transitions | **MATCH** | **MISSING** | **NOT VERIFIED** | Medium |
| `public.payments` | Table | Payment transactions ledger | **MATCH** | **MISSING** | **NOT VERIFIED** | High |
| `public.audit_logs` | Table | System audit ledger without action check | **DIFFERENT** (Old check constraint present) | **MISSING** | **NOT VERIFIED** | Medium (Dropped in Mig 8) |
| `public.email_logs` | Table | Transactional email delivery log | **MATCH** | **MISSING** | **NOT VERIFIED** | Low |
| `public.categories` | Table | Catalog categorization | **MISSING** | **MISSING** | **NOT VERIFIED** | High (New in Mig 8) |
| `public.inventory_adjustments` | Table | Administrative stock audit log | **MISSING** | **MISSING** | **NOT VERIFIED** | High (New in Mig 8) |
| `public.reviews` | Table | Customer book reviews and ratings | **MISSING** | **MISSING** | **NOT VERIFIED** | Medium (New in Mig 8) |
| `public.discounts` | Table | Promotional discount coupons | **MISSING** | **MISSING** | **NOT VERIFIED** | Medium (New in Mig 8) |
| `public.handle_updated_at` | Function | Auto-updates `updated_at` timestamps | **MATCH** | **MISSING** | **NOT VERIFIED** | Low |
| `public.handle_default_address` | Function | Enforces single default address invariant | **MATCH** | **MISSING** | **NOT VERIFIED** | Medium |
| `public.record_order_status_history` | Function | Auto-logs order state changes | **MATCH** | **MISSING** | **NOT VERIFIED** | Medium |
| `public.is_admin` | Function | Evaluates caller administrative role | **MATCH** | **MISSING** | **NOT VERIFIED** | Critical (Security foundation) |
| `public.is_active_user` | Function | Checks caller is not blocked/deleted | **MATCH** | **MISSING** | **NOT VERIFIED** | Critical (Security foundation) |
| `public.handle_new_user` | Function | Auth trigger populating `public.profiles` | **MATCH** | **MISSING** | **NOT VERIFIED** | High |
| `public.settle_payment_atomic` | Function | Atomic payment settlement RPC | **MATCH** | **MISSING** | **NOT VERIFIED** | High |
| `public.record_payment_failure_atomic` | Function | Atomic payment failure logging RPC | **MATCH** | **MISSING** | **NOT VERIFIED** | High |
| `public.record_refund_atomic` | Function | Atomic refund recording RPC | **MATCH** | **MISSING** | **NOT VERIFIED** | High |
| `public.create_order_atomic` | Function | 6-arg idempotent order creation RPC | **DIFFERENT** (5-arg non-idempotent) | **MISSING** | **NOT VERIFIED** | Critical |
| `public.merge_cart_atomic` | Function | Guest-to-user cart merge RPC | **MISSING** | **MISSING** | **NOT VERIFIED** | High (New in Mig 7) |
| `public.adjust_inventory_atomic` | Function | Administrative stock adjustment RPC | **MISSING** | **MISSING** | **NOT VERIFIED** | High (New in Mig 8) |
| `public.moderate_review_atomic` | Function | Administrative review moderation RPC | **MISSING** | **MISSING** | **NOT VERIFIED** | Medium (New in Mig 8) |
| `public.validate_discount_coupon` | Function | Coupon code evaluation RPC | **MISSING** | **MISSING** | **NOT VERIFIED** | Medium (New in Mig 8) |
| `public.update_customer_status` | Function | Administrative block/unblock RPC | **MISSING** | **MISSING** | **NOT VERIFIED** | High (New in Mig 8) |
| `public.cancel_order_atomic` | Function | Hardened atomic order cancellation RPC | **DIFFERENT** (Old unhardened v1) | **MISSING** | **NOT VERIFIED** | High (Updated in Mig 8) |
| `public.request_replacement_atomic` | Function | Atomic 7-day replacement RPC | **MISSING** | **MISSING** | **NOT VERIFIED** | High (New in Mig 9) |

---

## 3. Critical Table-by-Table Schema Inspection Targets

When read-only production database credentials are provided, the following specific table configurations must be inspected and validated:

### 3.1 `public.profiles`
- **Expected Columns:** `id` (UUID PK), `name` (TEXT), `email` (TEXT UNIQUE), `role` (TEXT DEFAULT 'user'), `phone` (TEXT), `is_blocked` (BOOLEAN DEFAULT FALSE), `is_deleted` (BOOLEAN DEFAULT FALSE), `deleted_at` (TIMESTAMPTZ), `created_at` (TIMESTAMPTZ), `updated_at` (TIMESTAMPTZ).
- **Critical Foreign Key:** `id REFERENCES auth.users(id) ON DELETE CASCADE`.
- **Key Risks:** If foreign key is missing or orphaned profiles exist, new customer registration trigger (`handle_new_user`) will fail.

### 3.2 `public.addresses`
- **Expected Columns:** `id` (UUID PK), `user_id` (UUID REFERENCES profiles(id)), `full_name` (TEXT), `phone` (TEXT), `street_address` (TEXT), `apartment_suite` (TEXT), `city` (TEXT), `state` (TEXT), `postal_code` (TEXT), `country` (TEXT DEFAULT 'India'), `is_default` (BOOLEAN DEFAULT FALSE), `created_at`, `updated_at`.
- **Key Trigger:** `trg_default_address` executing `handle_default_address()`.
- **Key Risks:** If multiple addresses currently exist for a single user with `is_default = TRUE`, the invariant will be violated.

### 3.3 `public.orders`
- **Expected Columns:** 32 columns including:
  - `id` (UUID PK), `user_id` (UUID REFERENCES profiles(id))
  - `order_status` with CHECK constraint covering 13 statuses: `'Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Replacement Requested', 'Replacement Approved', 'Replacement Rejected', 'Replacement Shipped', 'Replacement Delivered', 'Returned'`.
  - `replacement_requested` (BOOLEAN NOT NULL DEFAULT FALSE)
  - `replacement_status` with CHECK constraint covering 6 statuses: `'None', 'Requested', 'Approved', 'Rejected', 'Replacement Shipped', 'Replacement Delivered'`.
  - `replacement_reason` (TEXT), `replacement_requested_at` (TIMESTAMPTZ), `replacement_rejected_at` (TIMESTAMPTZ), `replacement_rejection_reason` (TEXT).
  - `delivered_at` (TIMESTAMPTZ), `shipping_delivered_at` (TIMESTAMPTZ).
  - `idempotency_key` (TEXT DEFAULT NULL).
- **Expected Index:** `idx_orders_user_idempotency_key` UNIQUE on `(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- **Key Risks:** If production has existing orders with custom statuses not in the check constraint, or duplicate idempotency keys, migration will fail.

### 3.4 `public.audit_logs`
- **Expected Schema:** `action` column must allow actions `'CANCEL'`, `'SOFT_DELETE'`, `'RESTORE'`.
- **Key Risks:** In Migration 1 (`20261028000001`), `audit_logs` was created with `CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'))`. If Migration 8's `ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;` is not applied, any order cancellation or customer moderation in production will fail with check constraint violation.

---

## 4. Production Read-Only Inspection Checklist & Script

Prior to authorizing any production rollout, the database administrator must execute the following 100% read-only diagnostic SQL queries against the production database:

```sql
-- ==============================================================================
-- PRODUCTION READ-ONLY SCHEMA PREFLIGHT INSPECTION SCRIPT
-- Execute in Supabase SQL Editor or psql with a READ-ONLY role.
-- ZERO STATE MUTATIONS. ZERO DDL EXECUTION.
-- ==============================================================================

-- 1. Check Applied Migration History
SELECT version, name 
FROM supabase_migrations.schema_migrations 
ORDER BY version;

-- 2. Check Existing Public Tables & Row Counts
SELECT 
    c.relname AS table_name,
    c.reltuples::bigint AS estimated_row_count,
    c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 3. Check Orders Table Columns (verify idempotency_key and replacement fields)
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
ORDER BY ordinal_position;

-- 4. Check Orders Constraints
SELECT conname, pg_get_constraintdef(oid) 
FROM pg_constraint 
WHERE conrelid = 'public.orders'::regclass;

-- 5. Check RLS Policies Across All Tables
SELECT tablename, policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 6. Check Stored Procedures and Routine Privileges
SELECT 
    p.proname AS function_name,
    pg_get_userbyid(p.proowner) AS owner,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_mode,
    string_agg(rp.grantee || ':' || rp.privilege_type, ', ') AS grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN information_schema.routine_privileges rp 
    ON rp.routine_schema = n.nspname AND rp.routine_name = p.proname
WHERE n.nspname = 'public'
GROUP BY p.proname, p.proowner, p.prosecdef
ORDER BY p.proname;

-- 7. Check Audit Logs Constraints (check if audit_logs_action_check exists)
SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.audit_logs'::regclass;
```

---

## 5. Unresolved Deployment Risks Summary

1. **Schema Divergence Risk:** If the remote production database was modified manually via the Supabase Studio dashboard or an unrecorded script, applying migrations 7, 8, and 9 may encounter name collisions or type conflicts.
2. **Missing Prerequisite Migrations:** If migrations 1 through 6 have not yet been applied to production, running migration 7 or 8 directly will fail immediately due to missing foreign key tables (`orders`, `profiles`, `books`).
3. **Migration Blocker:** Until the read-only inspection script above is executed and the results reviewed by the engineering team, production deployment remains **BLOCKED**.

