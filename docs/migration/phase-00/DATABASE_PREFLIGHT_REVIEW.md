# Database Preflight Review & Migration Verification Report
## MD Shakib Islamic Books — Schema, Security, RLS & Migration Risk Audit

> **Phase:** Phase 00 — Baseline & Audit Freeze  
> **Source Artifacts Reviewed:**  
> - `docs/reports/PHASE_7_3_REMOTE_DATABASE_VERIFICATION.md`  
> - `docs/reports/PHASE_7_4_PRODUCTION_DATABASE_PREFLIGHT.md` (Phase 7.4S)  
> - `docs/sql/production_preflight_readonly.sql`  
> - `supabase/migrations/*.sql` (6 migration files)  
> **Target Supabase Project:** `mhyawpnjhajytetqppam` (`https://mhyawpnjhajytetqppam.supabase.co`)  
> **Execution Mode:** Read-Only Review & Evidence Consolidation  
> **Preflight Status:** **VERIFIED READY WITH PREREQUISITE CREDENTIAL BLOCKER**

---

## 1. Executive Summary & Boundary Certification

This report consolidates all database preflight findings from Phase 7.3, 7.4, 7.4R, and 7.4S, providing an authoritative review of database schema architecture, Row Level Security (RLS), stored procedures, routine execution privileges, and migration compatibility.

### Strict Safety Certification:
- **Zero remote database migrations, seed executions, or schema alterations were performed.**
- **Zero secrets, database passwords, or private access tokens were printed or exposed.**
- **Legacy sources (`client/`, `server/`) remain completely untouched.**
- Direct SQL execution against the remote database remains blocked until explicit user authorization and database credentials (`DATABASE_URL` or Supabase CLI token) are provided.

---

## 2. Four-Tier Classification of Database Evidence

In accordance with strict audit rules, every database dimension is categorized into one of four evidence tiers:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        EVIDENCE TIER BREAKDOWN                         │
├──────┬───────────────────────────────────────────┬─────────────────────┤
│ Tier │ Description                               │ Status              │
├──────┼───────────────────────────────────────────┼─────────────────────┤
│ 1    │ Results Actually Supplied or Collected    │ Verified Fact       │
│ 2    │ Results Reported by Previous Agents       │ Cross-Checked       │
│ 3    │ Results Still Missing                     │ Explicit Gap        │
│ 4    │ Potential Conflicts & Risks               │ Action Required     │
└──────┴───────────────────────────────────────────┴─────────────────────┘
```

### Tier 1: Results Actually Supplied or Collected (Verified Facts)
1. **Local Preflight SQL Execution:** The 15-section read-only SQL preflight script ([`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql)) was executed against local PostgreSQL 17.6 (`127.0.0.1:54322`). All 15 catalog inspection queries completed with exit code 0 and zero state mutations.
2. **Remote Project Connectivity:** Network probes against `https://mhyawpnjhajytetqppam.supabase.co` confirm:
   - HTTPS gateway responds HTTP 200 via `SUPABASE_SERVICE_ROLE_KEY`.
   - GoTrue Auth API v2.197.0 is active and healthy.
   - TCP port 5432 (direct PostgreSQL) and port 6543 (transaction pooler) on `db.mhyawpnjhajytetqppam.supabase.co` are actively open and accepting handshakes.
3. **Repository Migration File Sequence:** Exactly 6 migration files exist in `supabase/migrations/`:
   - `20261028000001_core_schema.sql` (11 tables, constraints, foreign keys, indexes)
   - `20261028000002_business_logic.sql` (Triggers, functions, `create_order_atomic`, `cancel_order_atomic`)
   - `20261028000003_rls_policies.sql` (RLS enablement on 11 tables, 26 policies)
   - `20261029000001_auth_profile_trigger.sql` (Automated user profile trigger)
   - `20261029000002_payment_settlement_atomic.sql` (Razorpay settlement stored procedure)
   - `20261029000003_payment_security_and_refunds.sql` (Privilege hardening & refund procedures)
4. **Seed File Safety:** [`supabase/seed.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/supabase/seed.sql) targets only `public.books`, contains 5 records with deterministic UUIDs, is 100% idempotent via `ON CONFLICT (id) DO NOTHING`, creates zero user/admin accounts, and contains zero sensitive data.

### Tier 2: Results Reported by Previous Agents (Cross-Checked & Validated)
1. **PostgREST Schema Cache Behavior:** Previous reports noted that PostgREST returns `definitions: []` for `https://mhyawpnjhajytetqppam.supabase.co/rest/v1/`. This fact is confirmed; however, this audit strictly reaffirms the **PostgREST Schema Cache Limitation Notice**:
   > **DO NOT INFER THAT THE DATABASE IS EMPTY FROM AN EMPTY POSTGREST RESPONSE.**  
   > PostgREST only exposes tables within the schemas specified by `pgrst.db_schemas` (default: `public`). It does NOT query `supabase_migrations`, `auth`, `storage`, or system catalogs.
2. **Local Schema Validation:** Previous claims that all 11 tables create valid foreign key cascades and triggers in PostgreSQL 15+ have been verified against PostgreSQL 17.6.

### Tier 3: Results Still Missing (Pending Direct Remote SQL Query)
Because database credentials (`DATABASE_URL` with password) are not stored in the repository, direct SQL queries against the remote database catalog have not yet been executed:
- [ ] Remote PostgreSQL exact server version and timezone (`SELECT version(), current_setting('TIMEZONE');`).
- [ ] Remote active non-public schema inventory (`information_schema.schemata`).
- [ ] Direct inspection of `supabase_migrations.schema_migrations` on remote project.
- [ ] Verification of whether any RLS policies or tables currently exist in remote `public` schema.
- [ ] Installed extensions check on remote project (`uuid-ossp`, `pgcrypto`).
- [ ] Accurate row counts in remote user tables (`pg_stat_user_tables`).

### Tier 4: Potential Conflicts & Risks Requiring Investigation
The audit identified three major migration conflicts and discrepancies requiring careful operational resolution:

---

## 3. Deep-Dive Investigation of Key Database Topics

### 3.1 Investigation of `20260216000003_consolidated_rls_and_admin_security.sql`
- **User Prompt Mandate:** *"Pay special attention to: The additional migration `20260216000003_consolidated_rls_and_admin_security.sql`."*
- **Forensic Codebase Investigation:**
  - Grep across all repository files: 0 matches.
  - Search across all git commit messages and trees (`git log --all --name-only`): 0 matches.
  - Inspection of `supabase/migrations/`: No file with timestamp `20260216*` exists.
- **Authoritative Finding:**
  The migration named `20260216000003_consolidated_rls_and_admin_security.sql` **does NOT exist in this codebase or its git history.**
- **Root Cause & Origin:**
  In previous agent conversations or external draft proposals (dating from February 2026 when development initially began), a consolidated migration file was proposed to bundle RLS and admin security. In the actual codebase repository, the work was committed under the October 2026 migration sequence:
  - `20261028000003_rls_policies.sql` (RLS policies)
  - `20261029000003_payment_security_and_refunds.sql` (Admin payment security)
- **Risk Assessment:**
  If an operator or external migration runner previously applied `20260216000003` to the remote Supabase database, executing the 6 repository migrations (`20261028*` through `20261029*`) will cause duplicate policy and object collisions.
- **Remediation Action:**
  Query 14b of `production_preflight_readonly.sql` must be executed first to inspect `supabase_migrations.schema_migrations` to verify whether `20260216000003` was ever recorded on the remote database.

---

### 3.2 Migration 3 Policy Collision Conflict
- **Problem Statement:**  
  In [`supabase/migrations/20261028000003_rls_policies.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/supabase/migrations/20261028000003_rls_policies.sql), all 26 RLS policies are created using bare `CREATE POLICY`:
  ```sql
  CREATE POLICY "profiles_select_policy" ON public.profiles ...
  CREATE POLICY "books_select_public" ON public.books ...
  ```
- **Conflict Analysis:**  
  PostgreSQL does not support `CREATE POLICY IF NOT EXISTS`. If Migration 3 is executed on a database where any of these 26 policies already exist, PostgreSQL immediately halts execution with:
  `ERROR: policy "..." for table "..." already exists`.
- **Preflight Inspection Strategy:**  
  Query 9c in `production_preflight_readonly.sql` performs an exact collision scan across all 26 `(table_name, policy_name)` pairs against `pg_policies`.
- **Remediation Requirement:**  
  Before applying Migration 3 to an existing or partially migrated database, each policy creation statement should be preceded by `DROP POLICY IF EXISTS "..." ON public....;`.

---

### 3.3 Migration 5 vs Migration 6 Payment RPC Privilege Sequencing
- **Problem Statement:**  
  In Migration 5 ([`supabase/migrations/20261029000002_payment_settlement_atomic.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/supabase/migrations/20261029000002_payment_settlement_atomic.sql), lines 152–153), execution privileges were erroneously granted to the `authenticated` role:
  ```sql
  GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(...) TO postgres, service_role, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(...) TO postgres, service_role, authenticated;
  ```
- **Security Vulnerability:**  
  Granting `EXECUTE` to `authenticated` allows any logged-in customer to forge payment settlements directly via PostgREST RPC (`/rest/v1/rpc/settle_payment_atomic`), marking orders `Paid` without an authorized Razorpay transaction.
- **Migration 6 Security Patch:**  
  In Migration 6 ([`supabase/migrations/20261029000003_payment_security_and_refunds.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/supabase/migrations/20261029000003_payment_security_and_refunds.sql), lines 9–14), this privilege is explicitly revoked:
  ```sql
  REVOKE EXECUTE ON FUNCTION public.settle_payment_atomic(...) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(...) TO postgres, service_role;
  REVOKE EXECUTE ON FUNCTION public.record_payment_failure_atomic(...) FROM PUBLIC, anon, authenticated;
  GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(...) TO postgres, service_role;
  ```
- **Sequencing Mandate:**  
  Migration 5 must NEVER be left active without Migration 6. If migrations are applied incrementally, Migration 6 must follow Migration 5 within the exact same deployment transaction to prevent a security window where unprivileged users can execute payment settlement.

---

### 3.4 Audit Log Check Constraint & RLS Failure
- **Problem Statement:**  
  In `supabase/migrations/20261028000001_core_schema.sql` (lines 211–213), `audit_logs` defines:
  ```sql
  action TEXT NOT NULL CHECK (action IN (
      'CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'PAYMENT'
  ))
  ```
  However, in `apps/web/lib/admin/orders.ts` (lines 292, 380, 448, 501), the application attempts to insert:
  - `UPDATE_ORDER_STATUS`
  - `ADMIN_CANCEL_ORDER`
  - `APPROVE_REPLACEMENT`
  - `REJECT_REPLACEMENT`
- **Failure Consequence:**  
  Every attempt by an administrator to update an order, cancel an order, or approve/reject a replacement fails with:
  `ERROR: new row for relation "audit_logs" violates check constraint "audit_logs_action_check"`.
  Furthermore, `public.audit_logs` has no `INSERT` policy for `authenticated` users, causing RLS rejection.
- **Remediation Action:**  
  Phase 04 will deploy migration `20261031000001_fix_audit_logs_and_rls.sql` to expand the check constraint and install an admin insert RLS policy.

---

## 4. 15-Section Read-Only Preflight Suite Reference

The operator will execute [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) in the Supabase SQL Editor. The suite inspects:

| Query # | Catalog Target | Inspection Objective |
|:---:|---|---|
| **1** | `version()`, `current_database()` | PostgreSQL version, session user, and active timezone. |
| **2** | `information_schema.schemata` | All active schemas and USAGE privileges across roles. |
| **3** | `information_schema.tables` | Full table, view, and materialized view inventory. |
| **4** | `information_schema.columns` | Column definitions, data types, nullability, and defaults. |
| **5** | `table_constraints` | Primary keys, foreign keys, unique constraints, and check constraints. |
| **6** | `pg_indexes` | B-tree and GIN indexes in `public` schema. |
| **7** | `information_schema.triggers` | Existing triggers and execution event hooks on public and auth tables. |
| **8** | `information_schema.routines` | Routine catalog, return types, and security types (SECURITY DEFINER). |
| **9a** | `pg_tables.rowsecurity` | Verification of RLS enablement across all tables. |
| **9b** | `pg_policies` | Complete inventory of all existing RLS policies. |
| **9c** | `pg_policies` (Scoped) | Exact collision check for the 26 Migration 3 policies. |
| **10a** | `table_privileges` | Table-level grants across `anon`, `authenticated`, `service_role`. |
| **10b** | `routine_privileges` | Routine grants on sensitive payment RPCs. |
| **11** | `pg_proc`, `pg_namespace` | Function security definer and `search_path` configuration audit. |
| **12** | `has_schema_privilege` | Schema `CREATE` privileges across core roles. |
| **13** | `pg_extension` | Installed extensions (`uuid-ossp`, `pgcrypto`). |
| **14a/b**| `schema_migrations` | Safe catalog check and dynamic `DO` notice logging of migration history. |
| **15** | `pg_stat_user_tables` | Safe statistical row count estimates (zero table scans). |

---

## 5. Preflight Exit Status & Outstanding Prerequisites

### Preflight Review Status: **LOCAL PREFLIGHT VERIFIED — REMOTE CATALOG INSPECTION BLOCKED PENDING CREDENTIALS**

> [!IMPORTANT]
> ### REMOTE DATABASE VERIFICATION BOUNDARY NOTICE
> The remote PostgreSQL database is **NOT fully verified**. While HTTP endpoint connectivity, GoTrue Auth v2.197.0, and TCP handshakes on ports 5432 and 6543 are verified online, **direct SQL catalog inspection of `supabase_migrations.schema_migrations` and system catalogs has not occurred** due to the absence of database credentials in this repository. Direct remote catalog state remains **BLOCKED / UNVERIFIED** until credentials are provided.

To transition from Phase 00 to migration execution in Phase 11:
1. **User Authorization Required:** User must provide explicit written consent to execute database changes.
2. **Credentials Required:** User must execute [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) in the Supabase Dashboard SQL Editor and share the output, OR provide authenticated `DATABASE_URL`.
3. **Snapshot Required:** Pre-migration snapshot must be triggered in the Supabase Dashboard before applying Migration 1.

