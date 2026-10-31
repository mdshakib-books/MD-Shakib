# Phase 03A — Idempotency & Rollback Strategy

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Production Migration Readiness Audit  
**Target Migrations:**  
- `supabase/migrations/20261031000001_order_idempotency.sql`  
- `supabase/migrations/20261031000002_admin_management_system.sql`  
- `supabase/migrations/20261031000003_customer_account_and_commerce.sql`  
**Audit Date:** October 31, 2026  
**Auditor:** Independent Database Architect & Security Auditor  
**Idempotency Status:** **PARTIALLY IDEMPOTENT (DEFECT IN MIGRATION 2)**  
**Rollback Feasibility:** **MANUAL ROLLBACK UNSAFE — BACKUP RESTORATION REQUIRED FOR DESTRUCTIVE FAILS**  

---

## 1. Executive Summary

This evaluation analyzes whether the three target migrations can be safely applied, retried after failure, or reversed without causing catalog corruption or data loss.

### Key Audit Findings:
1. **Migration Execution Tracking:** Supabase tracks migrations in `supabase_migrations.schema_migrations`. In CLI transactions, migration scripts execute inside an implicit transaction block (`BEGIN ... COMMIT`). If any statement encounters an error, PostgreSQL automatically aborts the transaction (`ROLLBACK`), leaving no partial state.
2. **Retry Idempotency Defect in Migration 2 (`20261031000002`):** While tables and indexes use `IF NOT EXISTS`, RLS policies in Migration 2 use bare `CREATE POLICY`. If an administrator attempts to re-run the migration or if policies were previously created, the migration will crash immediately with `ERROR: policy "..." already exists`. Prepending `DROP POLICY IF EXISTS` is required.
3. **Rollback Asymmetry:** Introducing new tables and columns is additive; however, reversing these migrations in production after customer transactions have occurred cannot be achieved via naive `DROP TABLE` or `DROP COLUMN` without permanently destroying customer orders, reviews, or audit records. In such events, a point-in-time recovery (PITR) or full backup restore is the only reliable recovery mechanism.

---

## 2. Granular Migration Lifecycle & Rollback Analysis

### 2.1 Migration `20261031000001_order_idempotency.sql`

#### 1. Expected Pre-Migration State:
- `public.orders` exists from Migration 1; does not have column `idempotency_key`.
- `public.create_order_atomic` exists with 5 arguments.
- `public.carts` exists from Migration 1; does not have column `last_merge_token`.
- `public.merge_cart_atomic` does not exist.

#### 2. Expected Post-Migration State:
- `orders.idempotency_key` column exists (TEXT DEFAULT NULL).
- Unique partial index `idx_orders_user_idempotency_key` is active on `(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
- 5-arg `create_order_atomic` dropped; 6-arg `create_order_atomic` with default parameter created.
- `carts.last_merge_token` column exists (TEXT DEFAULT NULL).
- `public.merge_cart_atomic` created.
- Migration recorded in `supabase_migrations.schema_migrations`.

#### 3. Failure Scenarios:
- **Index Unique Violation:** If existing production data in `orders` contains duplicate `(user_id, idempotency_key)` values (unlikely since the column is newly created as NULL).
- **Function Ambiguity:** If dependent views or routines reference the old 5-arg signature without named parameters.

#### 4. Recovery Procedure:
- Supabase transaction automatically rolls back on execution failure.
- If migration succeeded and must be rolled back prior to production usage:
  ```sql
  -- PRE-PRODUCTION ROLLBACK ONLY (SAFE ONLY BEFORE PRODUCTION USAGE):
  DROP FUNCTION IF EXISTS public.merge_cart_atomic(UUID, JSONB, TEXT);
  DROP INDEX IF EXISTS public.idx_orders_user_idempotency_key;
  ALTER TABLE public.orders DROP COLUMN IF EXISTS idempotency_key;
  ALTER TABLE public.carts DROP COLUMN IF EXISTS last_merge_token;
  -- Restore original 5-arg create_order_atomic from 20261028000002_business_logic.sql
  ```

#### 5. Post-Deployment Rollback Safety:
- **UNSAFE:** If rolled back after production traffic has begun, dropping `idempotency_key` deletes deduplication tokens for in-flight customer orders.

---

### 2.2 Migration `20261031000002_admin_management_system.sql`

#### 1. Expected Pre-Migration State:
- Core tables exist (`profiles`, `books`, `orders`, `audit_logs`).
- `audit_logs` has check constraint `audit_logs_action_check` restricting actions to `('INSERT', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT')`.
- Tables `categories`, `inventory_adjustments`, `reviews`, `discounts` do not exist.
- RPC `cancel_order_atomic` exists in original unhardened version.

#### 2. Expected Post-Migration State:
- Four new tables created with RLS enabled: `categories`, `inventory_adjustments`, `reviews`, `discounts`.
- Triggers created executing `handle_updated_at()`.
- Constraint `audit_logs_action_check` removed from `audit_logs`.
- 5 stored procedures created/updated (`adjust_inventory_atomic`, `moderate_review_atomic`, `validate_discount_coupon`, `update_customer_status`, `cancel_order_atomic`).

#### 3. Failure Scenarios:
- **Policy Collision on Re-run:** If the migration script is run a second time or if any policy already exists in `pg_policies`, execution halts immediately on line 28 with: `ERROR: policy "categories_select_public" for table "categories" already exists`.
- **Exclusive Lock Timeout:** `ALTER TABLE public.audit_logs DROP CONSTRAINT ...` requires `ACCESS EXCLUSIVE`. If another transaction holds a lock on `audit_logs`, the migration may hit a statement timeout.

#### 4. Recovery Procedure:
- Fix the policy creation statements by adding `DROP POLICY IF EXISTS` and re-run within the maintenance window.
- In case of catastrophic schema incompatibility:
  - Do not attempt ad-hoc reverse drops on live data.
  - Revert database from pre-migration snapshot.

#### 5. Post-Deployment Rollback Safety:
- **HIGHLY DESTRUCTIVE / UNSAFE:** Dropping `categories`, `reviews`, `discounts`, or `inventory_adjustments` after users have submitted reviews, used coupons, or logged adjustments causes irreversible data loss.
- Restoring `audit_logs_action_check` will immediately fail if any audit records have been inserted with actions `'CANCEL'`, `'SOFT_DELETE'`, or `'RESTORE'`.
- **Verdict:** Point-in-time recovery / backup restoration is required.

---

### 2.3 Migration `20261031000003_customer_account_and_commerce.sql`

#### 1. Expected Pre-Migration State:
- `orders` table has columns `replacement_requested`, `replacement_status`, `replacement_reason`, `replacement_requested_at`, `delivered_at`, `shipping_delivered_at`.
- Stored procedure `public.request_replacement_atomic` does not exist.

#### 2. Expected Post-Migration State:
- `request_replacement_atomic` procedure defined with `SECURITY DEFINER` and `SET search_path = public, pg_temp`.
- Explicit `REVOKE EXECUTE ... FROM PUBLIC, anon;`.
- Explicit `GRANT EXECUTE ... TO authenticated, service_role;`.

#### 3. Failure Scenarios:
- Missing dependent columns on `orders` (if Migration 1 was not properly applied).
- Privileges grant failure if roles `authenticated` or `service_role` do not exist.

#### 4. Recovery Procedure:
- Fully idempotent: Re-running `CREATE OR REPLACE FUNCTION` and `GRANT`/`REVOKE` statements succeeds without error.
- Purely code-level rollback:
  ```sql
  DROP FUNCTION IF EXISTS public.request_replacement_atomic(UUID, UUID, TEXT);
  ```

#### 5. Post-Deployment Rollback Safety:
- **TECHNICALLY SAFE FOR SCHEMA:** Dropping the procedure leaves existing `orders` and `order_status_history` data intact.
- **APPLICATION BREAKAGE:** Client applications attempting to invoke the replacement RPC will receive a 404 / PostgREST function not found error.

---

## 3. Idempotency & Rollback Evaluation Summary

| Migration File | Re-run Idempotent? | Causes Table Rewrite? | Reverse SQL Safe? | Backup Required on Failure? |
|---|:---:|:---:|:---:|:---:|
| `20261031000001_order_idempotency.sql` | **YES** (`IF NOT EXISTS` / `OR REPLACE`) | No (Metadata update) | No (Destroys idempotency tokens) | Recommended |
| `20261031000002_admin_management_system.sql` | **NO** (Bare `CREATE POLICY` collisions) | No | No (Destroys reviews, coupons, stock logs) | **MANDATORY** |
| `20261031000003_customer_account_and_commerce.sql`| **YES** (`CREATE OR REPLACE`) | No | Yes (Drop routine only) | Recommended |

