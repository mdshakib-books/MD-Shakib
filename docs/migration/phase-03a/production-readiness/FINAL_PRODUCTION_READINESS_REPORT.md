# Phase 03A — Final Production Migration Readiness Audit Report

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Production Migration Readiness Audit  
**Date:** October 31, 2026  
**Repository Branch:** `new-fix`  
**Current Commit HEAD:** `37958f154c6f67fd0c8e869306aa68769778fb6c`  
**Target Migration Files:**  
- `supabase/migrations/20261031000001_order_idempotency.sql`  
- `supabase/migrations/20261031000002_admin_management_system.sql`  
- `supabase/migrations/20261031000003_customer_account_and_commerce.sql`  
**Auditor:** Independent Principal Security & Database Migration Architect  

---

## 1. Overall Audit Decision

# **FINAL DECISION: NO-GO**

### Verdict Justification:
While local implementation was verified with 157/157 passing tests, an independent, evidence-backed production readiness audit has uncovered **four critical deployment blockers** that prevent immediate authorization of production database migrations:

1. **CRITICAL RPC SECURITY VULNERABILITY (MIGRATION 001):** The stored procedures `create_order_atomic` and `merge_cart_atomic` in `20261031000001_order_idempotency.sql` execute as `SECURITY DEFINER` with **zero caller identity validation** (`auth.uid()` is never compared to `p_user_id`). Furthermore, execution privileges were never revoked from `PUBLIC` or `anon`. Any unauthenticated actor can place orders, alter carts, and deplete catalog stock for arbitrary accounts via PostgREST.
2. **CRITICAL ADMINISTRATIVE IDENTITY BYPASS (MIGRATION 002):** The administrative stored procedures `adjust_inventory_atomic`, `moderate_review_atomic`, and `update_customer_status` in `20261031000002_admin_management_system.sql` contain the bypassable logic `IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_id THEN`. When invoked anonymously, `auth.uid()` evaluates to `NULL`, bypassing the exception check. Because default Supabase privileges grant `anon` execution rights and `REVOKE ... FROM PUBLIC` does not remove explicit `anon` grants, unauthenticated callers can alter catalog stock, moderate reviews, or block and soft-delete customer profiles by supplying an administrator UUID.
3. **MIGRATION RETRY IDEMPOTENCY DEFECT (MIGRATION 002):** All 8 RLS policies created in `20261031000002_admin_management_system.sql` use bare `CREATE POLICY` statements without `DROP POLICY IF EXISTS`. Retrying a failed or partially applied migration halts with fatal policy collision errors.
4. **UNVERIFIED PRODUCTION BACKUP & RECOVERY:** In compliance with non-negotiable audit rules, direct production catalog inspection is **NOT VERIFIED** due to the absence of authorized read-only production credentials. Furthermore, Point-In-Time Recovery (PITR) or pre-migration snapshot availability on project `mhyawpnjhajytetqppam` is unconfirmed, constituting a deployment blocker.

---

## 2. Category-by-Category Readiness Status

| Audit Category | Evaluation Status | Summary Finding |
|---|:---:|---|
| **Migration Ordering** | **CONDITIONALLY VALID** | Execution order `001 -> 002 -> 003` is topologically sound, but depends on base migrations `001–006`. |
| **Schema Compatibility** | **NOT VERIFIED** | Production database access unavailable; read-only diagnostic SQL preflight runbook provided. |
| **RLS Security** | **PASS** | All 15 public tables have RLS enabled; 34 policies enforce data isolation and role separation. |
| **RPC Security** | **CRITICAL DEFECT (FAIL)** | Anonymous caller bypasses in 5 stored procedures (`create_order_atomic`, `merge_cart_atomic`, `adjust_inventory_atomic`, `moderate_review_atomic`, `update_customer_status`). |
| **Idempotency** | **DEFECT (FAIL)** | Migration 002 lacks `DROP POLICY IF EXISTS`, causing re-run failures on existing policies. |
| **Rollback Strategy** | **CONDITIONAL** | Manual schema reversal is destructive on live data; PITR/backup restoration is required. |
| **Environment Configuration** | **DEFECT (FAIL)** | `NEXT_PUBLIC_SITE_URL` vs `NEXT_PUBLIC_APP_URL` mismatch causes password reset link to fall back to `127.0.0.1:3000`. |
| **Backup & Recovery** | **NOT VERIFIED (BLOCKER)** | Automated backups and PITR activation on remote Supabase project remain unconfirmed. |
| **Staging Readiness** | **READY FOR PLANNING** | Detailed 10-step staging rehearsal runbook created; awaiting authorized staging environment. |
| **Smoke-Test Readiness** | **READY FOR EXECUTION** | 31-point comprehensive post-migration verification checklist prepared. |

---

## 3. Comprehensive Evidence & Findings Inventory

### Finding 1: Unprotected `create_order_atomic` and `merge_cart_atomic` RPCs
- **What Was Inspected:** `supabase/migrations/20261031000001_order_idempotency.sql` (lines 19–156, 165–302) and routine privileges in PostgreSQL catalog.
- **Evidence:**
  ```sql
  -- Line 19 of 20261031000001_order_idempotency.sql:
  CREATE OR REPLACE FUNCTION public.create_order_atomic(
      p_user_id UUID,
      p_items JSONB,
      p_address_snapshot JSONB,
      p_payment_method TEXT,
      p_total_amount NUMERIC,
      p_idempotency_key TEXT DEFAULT NULL
  ) RETURNS UUID AS $$
  -- Zero check comparing auth.uid() with p_user_id
  ```
  Catalog inspection confirms routine privileges:
  ```
  routine_name: create_order_atomic | grantees: PUBLIC, anon, authenticated, postgres, service_role
  ```
- **Result:** Any anonymous or authenticated client can invoke `create_order_atomic` with an arbitrary `p_user_id`.
- **Risk:** **CRITICAL**. Unauthorized order creation, catalog inventory exhaustion, and cart purging for arbitrary users.
- **Recommended Action:** Add caller identity check (`IF auth.uid() <> p_user_id THEN ...`) and execute `REVOKE EXECUTE ... FROM PUBLIC, anon;`.
- **Blocks Production Deployment?** **YES**.

---

### Finding 2: Identity Validation Bypass in Administrative Stored Procedures
- **What Was Inspected:** `supabase/migrations/20261031000002_admin_management_system.sql` (lines 105, 271, 449, 626–639) and routine privileges in PostgreSQL catalog.
- **Evidence:**
  ```sql
  -- Lines 449-451 of update_customer_status:
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_id THEN
      RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
  END IF;
  ```
  When called by anonymous clients, `auth.uid()` evaluates to `NULL`. The expression `auth.uid() IS NOT NULL` evaluates to `FALSE`, completely bypassing the exception.
  Catalog inspection confirms `anon` has `EXECUTE` privilege on `adjust_inventory_atomic`, `moderate_review_atomic`, and `update_customer_status` because `REVOKE ... FROM PUBLIC` does not revoke from `anon`.
- **Result:** Anonymous callers can supply any known admin UUID and perform privileged inventory updates, review approvals/rejections, or account soft-deletions and suspensions.
- **Risk:** **CRITICAL**. Unauthorized administrative actions by unauthenticated users.
- **Recommended Action:** Patch all three routines with:
  ```sql
  IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
      IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
      IF auth.uid() <> p_admin_id THEN RAISE EXCEPTION 'Security violation'; END IF;
  END IF;
  ```
  And explicitly revoke permissions:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.adjust_inventory_atomic(...) FROM PUBLIC, anon;
  REVOKE EXECUTE ON FUNCTION public.moderate_review_atomic(...) FROM PUBLIC, anon;
  REVOKE EXECUTE ON FUNCTION public.update_customer_status(...) FROM PUBLIC, anon;
  ```
- **Blocks Production Deployment?** **YES**.

---

### Finding 3: Non-Idempotent Policy Creation in Migration 002
- **What Was Inspected:** `supabase/migrations/20261031000002_admin_management_system.sql` (lines 28–30, 85–86, 235–244, 354–361).
- **Evidence:**
  ```sql
  CREATE POLICY "categories_select_public" ON public.categories ...
  CREATE POLICY "categories_admin_all" ON public.categories ...
  CREATE POLICY "inventory_adjustments_select_admin" ON public.inventory_adjustments ...
  CREATE POLICY "reviews_select_public" ON public.reviews ...
  CREATE POLICY "discounts_select_active" ON public.discounts ...
  ```
- **Result:** None of the 8 policies include `DROP POLICY IF EXISTS`. Re-running Migration 002 on an existing database crashes with `ERROR: policy "..." already exists`.
- **Risk:** **HIGH**. Migration failure during production deployment or retry.
- **Recommended Action:** Add `DROP POLICY IF EXISTS "..." ON ...;` immediately preceding each `CREATE POLICY`.
- **Blocks Production Deployment?** **YES**.

---

### Finding 4: Production Site URL Environment Variable Discrepancy
- **What Was Inspected:** `apps/web/lib/auth/actions.ts` (line 130) and `.env.example` templates.
- **Evidence:**
  - `apps/web/lib/auth/actions.ts`:
    ```typescript
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000"}/reset-password`
    ```
  - `apps/web/.env.example` defines:
    ```bash
    NEXT_PUBLIC_APP_URL="http://localhost:3000"
    ```
- **Result:** `NEXT_PUBLIC_SITE_URL` is omitted from the environment templates. If omitted in production hosting, password recovery emails generate redirect links to `http://127.0.0.1:3000`.
- **Risk:** **MEDIUM**. Broken password recovery in production.
- **Recommended Action:** Align code to check `process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL` and document both variables in `.env.example`.
- **Blocks Production Deployment?** **NO (Configuration prerequisite before deployment)**.

---

### Finding 5: Unverified Production Schema & Backup Status
- **What Was Inspected:** Repository configuration, git history, and environment variables.
- **Evidence:** No authorized read-only PostgreSQL connection string exists in repository files. Supabase project `mhyawpnjhajytetqppam` cannot be queried directly without violating Safety Rules 10 and 12.
- **Result:** Production schema compatibility and backup availability are unverified.
- **Risk:** **HIGH**. Potential schema divergence, lock contention, or irrecoverable data loss during migration.
- **Recommended Action:** Database administrator must execute the read-only preflight script ([`docs/migration/phase-03a/production-readiness/PRODUCTION_SCHEMA_COMPATIBILITY.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-03a/production-readiness/PRODUCTION_SCHEMA_COMPATIBILITY.md)) and verify PITR activation.
- **Blocks Production Deployment?** **YES**.

---

## 4. Critical Blockers Summary

The following items strictly block production authorization:
1. **RPC Vulnerability in Migration 001:** `create_order_atomic` and `merge_cart_atomic` lack caller identity validation and anon revoking.
2. **RPC Bypass in Migration 002:** `adjust_inventory_atomic`, `moderate_review_atomic`, and `update_customer_status` allow anonymous bypass when `auth.uid() IS NULL`.
3. **Idempotency Defect in Migration 002:** RLS policies lack `DROP POLICY IF EXISTS`.
4. **Unconfirmed Production Backup:** Absence of confirmed PITR or pre-migration logical backup for remote database.

---

## 5. Required Actions Before Production Deployment

To achieve **GO** status for production deployment, the engineering team must complete the following six sequential actions:

```mermaid
flowchart LR
    A["1. Apply Security SQL Remediations"] --> B["2. Verify Production Backup / PITR"]
    B --> C["3. Run Read-Only Schema Preflight"]
    C --> D["4. Execute Staging Rehearsal"]
    D --> E["5. Configure Production Env Vars"]
    E --> F["6. Production Rollout Authorization"]
```

1. **Author Migration Security Remediation:** Create an updated migration or pre-migration patch implementing strict caller identity checks and revoking `anon` and `PUBLIC` execute rights on all mutating RPCs.
2. **Add Policy Drop Statements:** Add `DROP POLICY IF EXISTS` before each `CREATE POLICY` in `20261031000002_admin_management_system.sql`.
3. **Verify Remote Production Database:** Execute the read-only diagnostic script against `mhyawpnjhajytetqppam.supabase.co` to establish the baseline schema.
4. **Confirm Automated Backups & PITR:** Confirm active PITR retention on the Supabase production dashboard and create a logical snapshot (`pg_dump`) prior to the maintenance window.
5. **Rehearse in Staging:** Successfully execute migrations and the 157-check automated test suite against an isolated staging Supabase instance.
6. **Set Production Environment Variables:** Ensure `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and Cloudinary variables are correctly configured in production hosting.

---

## 6. Recommended Migration Sequence

When production deployment is formally authorized, execute migrations in exact numerical order:

```bash
# Recommended Execution Sequence during Maintenance Window:
1. 20261028000001_core_schema.sql                  (If not already present)
2. 20261028000002_business_logic.sql                (If not already present)
3. 20261028000003_rls_policies.sql                  (If not already present)
4. 20261029000001_auth_profile_trigger.sql          (If not already present)
5. 20261029000002_payment_settlement_atomic.sql     (If not already present)
6. 20261029000003_payment_security_and_refunds.sql  (If not already present)
7. 20261031000001_order_idempotency.sql              (With identity patch)
8. 20261031000002_admin_management_system.sql       (With idempotency & identity patches)
9. 20261031000003_customer_account_and_commerce.sql (Hardened replacement RPC)
```

---

## 7. Conditions Required for Production Authorization

Production migration execution shall be authorized if and only if:
- [ ] All four critical blockers are resolved and verified in code.
- [ ] Staging rehearsal completes with 100% test success (157/157 checks passing).
- [ ] Pre-migration logical snapshot (`pg_dump`) is archived and verified non-empty.
- [ ] Database owner certifies Point-in-Time Recovery is active.
- [ ] Deployment maintenance window is scheduled with application placed in maintenance mode.

---

## 8. Can Phase 04 Proceed Independently of Production Deployment?

# **YES.**

**Phase 04 development can proceed immediately in the local development and staging environments without waiting for production database deployment.**

### Detailed Rationale:
1. **Local Stability:** The local development database (PostgreSQL 17.6) and Next.js application have all 9 migrations applied and passing 100% of automated checks (157/157).
2. **Isolated Scope of Phase 04:** Phase 04 focuses on:
   - Third-party carrier logistics webhooks (Delhivery tracking event handlers).
   - Payment gateway webhook signature verification (Razorpay webhook routes).
   - Transactional email dispatch integration (Resend API client).
3. **Decoupled Architecture:** These integrations can be developed, mocked, and validated locally using webhook simulators (e.g. ngrok / local payloads) and test API keys without modifying the remote production database.
4. **Operational Efficiency:** Addressing the database migration remediations in parallel with Phase 04 development ensures zero downtime and eliminates project schedule delays.

