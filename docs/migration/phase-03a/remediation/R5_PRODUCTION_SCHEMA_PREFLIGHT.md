# Phase 03A-R5 — Production Schema Preflight & Compatibility Audit

**Project:** MD Shakib Islamic Books  
**Workstream:** R5 — Production Database Schema Preflight (Read-Only)  
**Date:** October 31, 2026  
**Auditor / Engineer:** Independent Senior Database Architect  
**Target Environment:** Remote Supabase Production Database (`mhyawpnjhajytetqppam.supabase.co`)  
**Status:** **NOT VERIFIED (REMOTE CREDENTIAL BLOCKER) — READ-ONLY PREFLIGHT SCRIPT PROVIDED**  

---

## 1. Executive Summary & Rules of Engagement

Under **Safety Rules 9, 10, and 12**:
1. *Do not assume production schema matches local schema.*
2. *If production access is unavailable, explicitly mark the corresponding checks as NOT VERIFIED. Do not invent evidence.*
3. *Read-only production inspection is permitted only if an explicitly configured, authorized, read-only connection is available. Never use a privileged production connection for this audit.*

Because direct read-only PostgreSQL connection credentials (database password) are not stored in the repository, direct remote catalog queries were not executed against the production cluster. All remote schema comparisons are classified as **NOT VERIFIED**.

This report provides the full schema compatibility blueprint and the exact, non-destructive SQL diagnostic script for the release operator to run prior to migration.

---

## 2. Expected Production Schema Post-Migration 004

The proposed migration sequence (Migrations 1 through 10) defines the following complete schema state:

### 2.1 Table Inventory (15 Public Tables)
1. `public.profiles`: Customer and admin profiles linked to `auth.users(id)`.
2. `public.addresses`: Customer addresses with `trg_default_address` trigger.
3. `public.books`: Book catalog with stock, pricing, and active status.
4. `public.carts`: Shopping carts with `last_merge_token` for idempotent merges.
5. `public.cart_items`: Normalized cart line items with composite uniqueness (`cart_id`, `book_id`).
6. `public.orders`: Core order records with `idempotency_key`, shipping fields, and replacement fields.
7. `public.order_items`: Historical line-item snapshots linked to orders.
8. `public.order_status_history`: Audit trail for order lifecycle transitions.
9. `public.payments`: Payment ledger tracking provider tokens and settlement state.
10. `public.categories`: Catalog categories with URL slugs and display order.
11. `public.inventory_adjustments`: Administrative stock adjustment ledger.
12. `public.reviews`: Customer book reviews with rating and moderation status.
13. `public.discounts`: Promotional coupon codes with usage limits and expiry dates.
14. `public.audit_logs`: Administrative audit trail without action check constraint.
15. `public.email_logs`: Transactional email delivery log.

### 2.2 Stored Procedure Inventory (11 Privileged Routines)
- `create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT)`: Hardened idempotent order creation.
- `merge_cart_atomic(UUID, JSONB, TEXT)`: Hardened idempotent guest-to-customer cart merge.
- `adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT)`: Hardened administrative stock adjustments.
- `moderate_review_atomic(UUID, UUID, TEXT)`: Hardened administrative review moderation.
- `update_customer_status(UUID, UUID, TEXT)`: Hardened administrative customer account moderation.
- `cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN)`: Hardened atomic order cancellation with inventory restoration.
- `request_replacement_atomic(UUID, UUID, TEXT)`: Hardened 7-day post-delivery replacement procedure.
- `validate_discount_coupon(TEXT, NUMERIC)`: STABLE read-only coupon evaluator.
- `settle_payment_atomic(UUID, TEXT, TEXT, NUMERIC)`: Server-side Razorpay payment settlement.
- `record_payment_failure_atomic(UUID, TEXT, TEXT, TEXT)`: Server-side payment failure recorder.
- `record_refund_atomic(UUID, TEXT, NUMERIC, TEXT)`: Server-side refund recorder.

---

## 3. Application Code vs Production Schema Compatibility

### Deployment Ordering Risks:
The Next.js application codebase compiled in Phase 03A contains active references to schema objects that do not exist in unmigrated databases:
1. **Idempotent Order Creation:** `apps/web/lib/commerce/orders.ts` calls `create_order_atomic` with 6 arguments (including `p_idempotency_key`).
2. **Cart Merging:** `apps/web/lib/commerce/cart.ts` calls `merge_cart_atomic`.
3. **Replacement Requests:** `apps/web/lib/commerce/orders.ts` calls `request_replacement_atomic`.
4. **Admin Management:** `apps/web/app/admin/inventory`, `apps/web/app/admin/reviews`, and `apps/web/app/admin/discounts` query `inventory_adjustments`, `reviews`, and `discounts`.

**Critical Release Rule:** Application code deployment must **NEVER** precede database migrations. The database migrations (1 through 10) must be applied and verified before deploying the updated web application.

---

## 4. Production Read-Only Preflight SQL Script

Prior to scheduling deployment, the database administrator must execute this 100% read-only diagnostic script in Supabase Studio SQL Editor:

```sql
-- ==============================================================================
-- PRODUCTION READ-ONLY SCHEMA PREFLIGHT INSPECTION SCRIPT
-- ZERO STATE MUTATIONS. ZERO DDL EXECUTION.
-- ==============================================================================

-- 1. Applied Migration History
SELECT version, name 
FROM supabase_migrations.schema_migrations 
ORDER BY version;

-- 2. Public Tables and Estimated Row Counts
SELECT 
    c.relname AS table_name,
    c.reltuples::bigint AS estimated_rows,
    c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind = 'r'
ORDER BY c.relname;

-- 3. Check for Existing Idempotency and Replacement Columns on orders
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'orders'
  AND column_name IN ('idempotency_key', 'replacement_status', 'delivered_at', 'shipping_delivered_at');

-- 4. Check for Existing Routine Signatures
SELECT 
    p.proname AS function_name,
    pg_get_userbyid(p.proowner) AS owner,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security_mode
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- 5. Check RLS Policies Across Public Schema
SELECT tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
```

**Workstream R5 Verdict:** **NOT VERIFIED (Production access unavailable; preflight diagnostic ready for operator execution)**.

