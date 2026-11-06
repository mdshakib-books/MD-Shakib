# Phase 11: Final Release & Production Readiness — Production Database Migration Plan
## MD Shakib Islamic Books Modernization & Migration

**Project:** MD Shakib Islamic Books  
**Phase:** 11 — Final Release & Production Readiness  
**Target Database:** Supabase PostgreSQL 17  
**Total Migration Files:** 12 sequential scripts  
**Date:** November 6, 2026  
**Auditor / Migration Engineer:** Lead Database Engineer & Release QA Lead  
**Execution Status:** **PLAN PREPARED & VALIDATED — EXECUTION PENDING EXPLICIT GATE A APPROVAL**  

---

## 1. Executive Summary & Safety Preflight

This Production Database Migration Plan governs the orderly, idempotent application of database schema, stored procedures, Row Level Security (RLS) policies, triggers, and performance indexes across the Supabase PostgreSQL production instance.

> **CRITICAL EXECUTION MANDATE:**  
> In accordance with Section 1.3 and Section 7 of the Master Execution Prompt, **THIS MIGRATION MUST NOT BE EXECUTED AUTOMATICALLY**.  
> Execution is strictly blocked until **Gate A (Production Database Migration Approval)** is explicitly signed by authorized stakeholders.

---

## 2. Current vs Target Database State

| Dimension | Current Production State | Target Production State |
| :--- | :--- | :--- |
| **Schema Baseline** | Uninitialized or Partial Legacy Baseline | Complete 15-table relational schema + extensions |
| **PostgreSQL Version**| PostgreSQL 15 / 16 | PostgreSQL 17 (Supabase Managed) |
| **Extensions** | `uuid-ossp`, `pgcrypto` | `uuid-ossp`, `pgcrypto`, `pg_trgm` |
| **Public Tables** | 0 to 10 unhardened tables | 15 fully constrained, RLS-protected tables |
| **Performance Indexes**| Basic single-column indexes | 12 optimized composite and trigram indexes |
| **Stored Procedures** | Standalone CRUD operations | 6 atomic, SECURITY DEFINER stored procedures |
| **Rate Limiting** | None / In-memory only | Atomic PostgreSQL distributed fixed-window engine |

---

## 3. Sequential Migration Execution Inventory

The 12 migration files must be applied in strict ascending chronological order:

| Step | Migration File Name | Target Schema Objects & Operations | Idempotency Safeguards | Key Security Controls |
| :---: | :--- | :--- | :--- | :--- |
| **01** | `20261028000001_core_schema.sql` | Provisions `uuid-ossp`, core tables (`profiles`, `categories`, `books`, `carts`, `cart_items`, `orders`, `order_items`, `payments`, `addresses`, `reviews`), and constraints (`uq_cart_book`). | `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` | Foreign key cascades and checks |
| **02** | `20261028000002_business_logic.sql` | Provisions atomic procedures: `create_order_atomic`, `cancel_order_atomic`, and triggers for default address (`trg_default_address`). | `CREATE OR REPLACE FUNCTION` | `SECURITY DEFINER`, search_path set |
| **03** | `20261028000003_rls_policies.sql` | Enables RLS across all 10 core tables; creates granular tenant isolation policies for customers and admins. | `DROP POLICY IF EXISTS` prior to creation | Fail-closed tenant isolation |
| **04** | `20261029000001_auth_profile_trigger.sql` | Provisions `on_auth_user_created` trigger automatically inserting public `profiles` row upon Supabase Auth signup. | `CREATE OR REPLACE FUNCTION` | Automated profile synchronization |
| **05** | `20261029000002_payment_settlement_atomic.sql`| Implements `settle_payment_atomic` procedure for atomic order confirmation and payment capture. | `CREATE OR REPLACE FUNCTION` | Row-level locking on `orders` |
| **06** | `20261029000003_payment_security_and_refunds.sql` | Provisions `refund_payment_atomic` and payment transaction audit logging. | `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` | Payment idempotency & amount caps |
| **07** | `20261031000001_order_idempotency.sql` | Adds `idempotency_key` column and unique constraint to `orders` and `payments` tables to block duplicate orders. | `ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS` | Strict duplicate checkout guard |
| **08** | `20261031000002_admin_management_system.sql` | Creates `audit_logs` table, `replacements` table, and administrative adjustment functions. | `CREATE TABLE IF NOT EXISTS` | Restricted strictly to `is_admin()` |
| **09** | `20261031000003_customer_account_and_commerce.sql`| Customer account schema extensions: profile metadata, address labels, delivery instructions. | `ADD COLUMN IF NOT EXISTS` | Non-destructive column additions |
| **10** | `20261031000004_security_and_idempotency_remediation.sql` | Security hardening: revokes public function privileges, sanitizes `search_path`, enforces strict types. | `REVOKE ALL ... FROM PUBLIC` | Eliminates search path hijacking |
| **11** | `20261101000001_phase04_backend_and_database_integrity.sql` | Enforces check constraints (`price >= 0`, `stock >= 0`, valid pincode, valid order status enum). | `ADD CONSTRAINT ... CHECK` | Database-level business invariants |
| **12** | `20261106000001_phase10_performance_security_and_indexes.sql` | Enables `pg_trgm`, creates composite indexes (`idx_books_active_created_at`, `idx_orders_user_created_at`), trigram search indexes, `rate_limits` table, and `check_rate_limit` RPC. | `CREATE EXTENSION IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS` | Privileges granted strictly to `service_role` |

---

## 4. Preflight Checks & Prerequisites

Before executing the migration:
1. **Gate A Explicit Approval:** Verify that `PHASE_11_PRODUCTION_APPROVALS.md` (Gate A) has been formally signed.
2. **Pre-Migration Backup:** Take an immediate physical snapshot in Supabase Management Console and execute a full logical schema/data dump:
   ```bash
   # Execute full logical backup prior to running migration
   supabase db dump --linked -f pre_migration_backup_$(date +%Y%m%d_%H%M%S).sql
   ```
3. **Database Connection Health:** Ping PostgreSQL port 5432 and verify active database connection pool.
4. **Maintenance Window:** Ensure migration window is scheduled during low-traffic hours (e.g., 02:00 – 04:00 IST).
5. **Disk Space Check:** Verify database storage volume has at least 30% free headroom for index builds.

---

## 5. Execution Procedure (When Authorized)

When Gate A is authorized, execute via Supabase CLI:

```bash
# 1. Connect to production project
supabase link --project-ref <production-project-id>

# 2. Check pending migration status
supabase migration list

# 3. Apply all pending migrations sequentially
supabase db push

# 4. Verify migration history table in PostgreSQL
supabase db remote execute "SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;"
```

*Estimated Execution Duration:* **45 to 90 seconds** across all 12 migration files on Supabase managed instance.

---

## 6. Post-Migration Verification Queries

Execute these verification queries immediately following migration application:

```sql
-- 1. Verify all 15 public tables exist
SELECT count(*) = 15 AS all_tables_present
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name IN (
    'profiles', 'categories', 'books', 'carts', 'cart_items',
    'orders', 'order_items', 'payments', 'addresses', 'reviews',
    'audit_logs', 'replacements', 'order_status_history', 'email_logs', 'rate_limits'
  );

-- 2. Verify Row Level Security is active on all public tables
SELECT table_name, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND rowsecurity = false;
-- Expected output: 0 rows (all tables must have rowsecurity = true)

-- 3. Verify Composite & Trigram Performance Indexes
SELECT indexname, tablename 
FROM pg_indexes 
WHERE schemaname = 'public' 
  AND indexname IN (
    'idx_books_active_created_at',
    'idx_orders_user_created_at',
    'idx_books_title_trgm',
    'idx_books_author_trgm',
    'idx_rate_limits_window_start'
  );
-- Expected output: 5 rows

-- 4. Verify check_rate_limit procedure permissions
SELECT proname, prosecdef, proacl 
FROM pg_proc 
WHERE proname = 'check_rate_limit';
-- Expected output: prosecdef = true, execution granted strictly to service_role

-- 5. Test atomic rate limiter function
SELECT public.check_rate_limit('smoke_test_key', 10, 60);
-- Expected output: {"allowed": true, "limit": 10, "remaining": 9, "current": 1, ...}
```

---

## 7. Failure Handling & Rollback Strategy

1. **Transactional Safety:** Each SQL migration script in Supabase is executed within a dedicated transaction (`BEGIN ... COMMIT`). If any statement fails, PostgreSQL rolls back the entire migration transaction automatically.
2. **If Migration Fails Mid-Execution:**
   - The CLI halts and outputs the exact line number and PostgreSQL error code.
   - Do not attempt ad-hoc manual SQL edits.
   - Investigate the error log against `docs/migration/phase-10/PHASE_10_MIGRATION_012_REVIEW.md`.
   - If backward compatibility is broken, restore the pre-migration snapshot as described in `PHASE_11_BACKUP_RECOVERY.md`.
3. **Forward-Fix vs Rollback:**
   - For minor index creation syntax or check constraint issues, apply an immediate targeted forward-fix script (`patch_001.sql`).
   - For structural table corruption or data loss, execute snapshot recovery.

---

## 8. Responsible Operators

- **Execution Lead:** Senior DevOps Engineer
- **Verification Lead:** Database QA Engineer
- **Sign-off Authority:** Technical Project Manager

---

## 9. Migration Plan Status

# **READY FOR PRODUCTION APPROVAL (GATE A REQUIRED)**

The migration execution plan is complete, idempotent, and backward-compatible. Awaiting formal execution approval.
