# PHASE 7.4S — Production Database Preflight & Migration Execution Package Report (Final Safety Corrections)

**Project:** MD Shakib Islamic Books  
**Repository:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`  
**Release Branch:** `main`  
**Release Candidate:** `84b8803932189a522afe62571f8ca2ccf246ab45`  
**Target Supabase Project:** `mhyawpnjhajytetqppam`  
**Audit Date:** 2026-10-30  
**SQL Preflight Artifact:** [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql)  
**Execution Mode:** Read-Only Verification Package Preparation & Safety Corrections Audit  
**Final Verdict:** **READY FOR DATABASE PREFLIGHT**

---

## 1. Executive Summary & Verification Boundaries

This report delivers the finalized, safety-corrected, read-only SQL preflight package ([`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql)) for target Supabase project `mhyawpnjhajytetqppam`.

In accordance with strict safety mandates:
- **Zero remote database mutations, zero migrations, zero seeds, zero DDL/DML, and zero git commits/pushes** were executed.
- **Zero secrets, tokens, passwords, or keys** were printed or exposed.
- **Legacy directories (`client/` and `server/`) remain completely untouched.**
- The preflight SQL package has been verified to contain strictly non-mutating statements: read-only `SELECT`, `SHOW`, and a non-mutating dynamic `DO` notice block that performs zero schema or data alterations.

### Rigorous Distinction of Facts & Verification Status:
1. **Locally Tested SQL Fact:** The preflight script [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) was executed against local PostgreSQL 17.6 (`127.0.0.1:54322`). All 15 catalog inspection sections completed with **exit code 0, zero syntax errors, and zero state mutations**.
2. **Verified Remote Infrastructure Facts:** Probes against `https://mhyawpnjhajytetqppam.supabase.co` confirm that the HTTPS gateway, GoTrue Auth API v2.197.0, and TCP ports `5432` / `6543` are actively listening and responsive.
3. **Actual Remote Database State (Unverified Direct Catalog State):** Because database password credentials are not stored in this workspace, direct PostgreSQL SQL catalog inspection (`SELECT ... FROM information_schema...`) against the remote database has **not yet been executed**. PostgREST schema cache reports `definitions: []` in the `public` schema, but this is **not treated as definitive proof** of non-public schemas (`supabase_migrations`).
4. **Outstanding Operational Step:** The operator must execute [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) in the Supabase Dashboard SQL Editor or via authenticated `psql` to capture actual catalog state prior to requesting migration authorization.

---

## 2. Read-Only SQL Preflight Suite Overview

The preflight package [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) contains 15 non-mutating inspection queries suitable for direct execution in the Supabase Dashboard SQL Editor or `psql`:

| Query | Inspection Target | Source Catalogs & Views | Key Validation |
|:---:|---|---|---|
| **1** | Server Version, Context & Timezone | `version()`, `current_database()`, `current_user` | PostgreSQL version, session user, timezone |
| **2** | Schemas & Role Usage Privileges | `information_schema.schemata`, `has_schema_privilege` | Schema inventory & USAGE grants across roles |
| **3** | Tables, Views & Materialized Views | `information_schema.tables`, `pg_matviews` | Complete relation catalog in non-system schemas |
| **4** | Columns, Types, Nullability & Defaults | `information_schema.columns` | Column definitions for `public` & `supabase_migrations` |
| **5** | Constraints (PK, FK, Unique, Check) | `table_constraints`, `key_column_usage`, `check_constraints` | Unambiguous table-level constraint mapping (`tc.table_name = kcu.table_name`) |
| **6** | Indexes (B-tree & GIN in public) | `pg_indexes` | Index definitions & coverage in `public` |
| **7** | Triggers (public schema & auth.users) | `information_schema.triggers` | Existing triggers and execution event hooks |
| **8** | Functions & Procedures in public | `information_schema.routines` | Routine catalog, return types, security types |
| **9a** | RLS Enabled Status on Tables | `pg_tables.rowsecurity` | Verification of RLS enforcement on all tables |
| **9b** | Inventory of All Active RLS Policies | `pg_policies` | Complete inventory of all existing RLS policies |
| **9c** | Scoped Collision Check for 26 Policies | `pg_policies` | Exact `(table_name, policy_name)` pair match & definition extraction (`qual`, `with_check`) |
| **10a** | Table Privileges Across Roles | `information_schema.table_privileges` | Table-level grants for `anon`, `authenticated`, `service_role`, `postgres`, `PUBLIC` |
| **10b** | Routine Execution Privileges on RPCs | `information_schema.routine_privileges` | Routine grants for sensitive payment RPCs including `PUBLIC` pseudo-role |
| **11** | Security Definer & Search Path Audit | `pg_proc`, `pg_roles`, `pg_namespace` | `prosecdef` and `search_path` configuration on functions |
| **12** | CREATE Privileges on Schemas | `has_schema_privilege(..., 'CREATE')` | Schema creation privileges for core roles |
| **13** | Installed Extensions & Versions | `pg_extension` | Extensions installed (`uuid-ossp`, `pgcrypto`, etc.) |
| **14a** | Migration Table Existence in Catalog | `information_schema.tables` | Catalog check for `supabase_migrations.schema_migrations` |
| **14b** | Safe Dynamic Migration History Query | Dynamic SQL `DO` block with `to_regclass` | Safe NOTICE logging of recorded migrations (parser-resilient) |
| **15** | Safe Estimated Table Row Counts | `pg_stat_user_tables` | Safe statistical row count estimates (no table scans) |

### Read-Only Safety Certification:
- **Zero DDL statements:** No `CREATE`, `ALTER`, or `DROP` statements.
- **Zero DML statements:** No `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE` statements.
- **Zero Session/Transaction Side-Effects:** Read-only `SELECT`, `SHOW`, and non-mutating `DO` notice statements only.
- **Parser Resilience:** Section 14 dynamically inspects `supabase_migrations.schema_migrations` only if `to_regclass` confirms existence, preventing `relation does not exist` parse errors on unmigrated databases.

---

## 3. Query 5 Join Correction (Constraint to Key Column Usage)

### Issue Identified
In standard PostgreSQL `information_schema`, table constraints and key column usages share `constraint_name` and `table_schema`. However, if different tables share identical constraint names (e.g. default constraint naming conventions or legacy DDL across tables), a join on `constraint_name` and `table_schema` alone produces Cartesian products or cross-table ambiguous column associations.

### Correction Applied
In [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql), Query 5 has been updated to include table-level matching:

```sql
SELECT 
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema
    AND tc.table_name = kcu.table_name          -- Added to prevent cross-table ambiguous mappings
LEFT JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name 
    AND tc.table_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;
```

---

## 4. RLS Policy Collision Detection & Scoped Remediation Protocol (Query 9c)

### 4.1 Strict Rejection of Blanket Policy Dropping
The initial draft proposed a blanket 26-statement `DROP POLICY` block if existing policies were detected. **That blanket remediation recommendation is strictly rejected and retracted.**
- A blanket policy drop risks destroying custom business rules, third-party policies, or intentionally configured policies.
- Policies must never be automatically dropped or replaced without inspecting their actual definitions.
- Unrelated policies in the database must be preserved under all circumstances.

### 4.2 Exact 26 `(table_name, policy_name)` Tuple Matching
Migration 3 (`20261028000003_rls_policies.sql`) defines exactly 26 policies across 11 tables. Query 9c matches the exact `(table_name, policy_name)` pairs to avoid false positive collisions with identically named policies on different tables:

| Target Table | Expected Policy Name | Target Roles | Command |
|---|---|:---:|:---:|
| `public.profiles` | `profiles_select_policy` | `authenticated` | `SELECT` |
| `public.profiles` | `profiles_update_policy` | `authenticated` | `UPDATE` |
| `public.profiles` | `profiles_insert_policy` | `authenticated` | `INSERT` |
| `public.profiles` | `profiles_delete_policy` | `authenticated` | `DELETE` |
| `public.addresses` | `addresses_select_policy` | `authenticated` | `SELECT` |
| `public.addresses` | `addresses_insert_policy` | `authenticated` | `INSERT` |
| `public.addresses` | `addresses_update_policy` | `authenticated` | `UPDATE` |
| `public.addresses` | `addresses_delete_policy` | `authenticated` | `DELETE` |
| `public.books` | `books_select_public` | `public` | `SELECT` |
| `public.books` | `books_admin_all` | `authenticated` | `ALL` |
| `public.carts` | `carts_select_policy` | `authenticated` | `SELECT` |
| `public.carts` | `carts_insert_policy` | `authenticated` | `INSERT` |
| `public.carts` | `carts_delete_policy` | `authenticated` | `DELETE` |
| `public.cart_items` | `cart_items_select_policy` | `authenticated` | `SELECT` |
| `public.cart_items` | `cart_items_insert_policy` | `authenticated` | `INSERT` |
| `public.cart_items` | `cart_items_update_policy` | `authenticated` | `UPDATE` |
| `public.cart_items` | `cart_items_delete_policy` | `authenticated` | `DELETE` |
| `public.orders` | `orders_select_policy` | `authenticated` | `SELECT` |
| `public.orders` | `orders_insert_policy` | `authenticated` | `INSERT` |
| `public.orders` | `orders_update_policy` | `authenticated` | `UPDATE` |
| `public.order_items` | `order_items_select_policy` | `authenticated` | `SELECT` |
| `public.order_status_history` | `order_status_history_select_policy` | `authenticated` | `SELECT` |
| `public.payments` | `payments_select_policy` | `authenticated` | `SELECT` |
| `public.payments` | `payments_admin_all` | `authenticated` | `ALL` |
| `public.audit_logs` | `audit_logs_select_admin` | `authenticated` | `SELECT` |
| `public.email_logs` | `email_logs_select_admin` | `authenticated` | `SELECT` |

### 4.3 Definition Extraction & Comparison Logic
In [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql), Query 9c extracts the full policy definition:
```sql
SELECT 
    p.schemaname,
    p.tablename,
    p.policyname,
    p.permissive,
    p.roles,
    p.cmd,
    p.qual,        -- USING expression
    p.with_check   -- WITH CHECK expression
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND (p.tablename, p.policyname) IN (
    ('profiles', 'profiles_select_policy'),
    ('profiles', 'profiles_update_policy'),
    ('profiles', 'profiles_insert_policy'),
    ('profiles', 'profiles_delete_policy'),
    ('addresses', 'addresses_select_policy'),
    ('addresses', 'addresses_insert_policy'),
    ('addresses', 'addresses_update_policy'),
    ('addresses', 'addresses_delete_policy'),
    ('books', 'books_select_public'),
    ('books', 'books_admin_all'),
    ('carts', 'carts_select_policy'),
    ('carts', 'carts_insert_policy'),
    ('carts', 'carts_delete_policy'),
    ('cart_items', 'cart_items_select_policy'),
    ('cart_items', 'cart_items_insert_policy'),
    ('cart_items', 'cart_items_update_policy'),
    ('cart_items', 'cart_items_delete_policy'),
    ('orders', 'orders_select_policy'),
    ('orders', 'orders_insert_policy'),
    ('orders', 'orders_update_policy'),
    ('order_items', 'order_items_select_policy'),
    ('order_status_history', 'order_status_history_select_policy'),
    ('payments', 'payments_select_policy'),
    ('payments', 'payments_admin_all'),
    ('audit_logs', 'audit_logs_select_admin'),
    ('email_logs', 'email_logs_select_admin')
  )
ORDER BY p.tablename, p.policyname;
```

### 4.4 Individually Scoped Remediation Protocol
- **Case 1 (Query 9c returns 0 rows):** Clean target database. Migration 3 executes without any prerequisite action.
- **Case 2 (Query 9c returns matching rows):**
  1. The auditor compares the returned `qual` and `with_check` expressions against the definitions in `supabase/migrations/20261028000003_rls_policies.sql`.
  2. **If expressions match identically:** The policies were already created by a previous successful run of Migration 3. The operator evaluates whether Migration 3 can be safely skipped or recorded in `supabase_migrations.schema_migrations`.
  3. **If expressions differ or conflict:** The operator formulates an individually scoped remediation statement **strictly for the confirmed conflicting policy**, e.g.:
     ```sql
     -- Example of an individually scoped remediation statement (DO NOT run blanket drops):
     DROP POLICY IF EXISTS "specific_conflicting_policy" ON public.specific_target_table;
     ```
  4. **Never drop unrelated policies.** All policies not matching the confirmed collision remain untouched.

---

## 5. Routine Privilege Inspection & the `PUBLIC` Pseudo-Role (Query 10b)

### 5.1 Significance of the `PUBLIC` Pseudo-Role in PostgreSQL
In PostgreSQL, `PUBLIC` is a special pseudo-role representing every current and future database role. By default, PostgreSQL grants `EXECUTE` privilege on newly created functions to `PUBLIC` unless explicitly revoked or unless the database `DEFAULT PRIVILEGES` have been altered.

If a security-critical function is granted to `PUBLIC`, any connected client—including unauthenticated `anon` users or standard `authenticated` users—can invoke that function unless PostgreSQL security rules or explicit `REVOKE` statements block it.

### 5.2 Payment RPC Privilege Evolution Across Migrations
1. **Migration 5 (`20261029000002_payment_settlement_atomic.sql`):**
   - Created `settle_payment_atomic` and `record_payment_failure_atomic`.
   - Explicitly granted execution:
     ```sql
     GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) TO postgres, service_role, authenticated;
     GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) TO postgres, service_role, authenticated;
     ```
   - *Security Gap:* Because `REVOKE ALL ON FUNCTION ... FROM PUBLIC` was not executed in Migration 5, both `PUBLIC` and `authenticated` roles retained execution rights.
2. **Migration 6 (`20261029000003_payment_security_and_refunds.sql`):**
   - Remediated the gap by strictly revoking execution privileges from `PUBLIC`, `anon`, and `authenticated`:
     ```sql
     REVOKE EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) FROM authenticated, anon, PUBLIC;
     REVOKE EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) FROM authenticated, anon, PUBLIC;
     REVOKE EXECUTE ON FUNCTION public.record_refund_atomic(UUID, NUMERIC, TEXT, TEXT, JSONB) FROM authenticated, anon, PUBLIC;
     GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) TO service_role;
     GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) TO service_role;
     GRANT EXECUTE ON FUNCTION public.record_refund_atomic(UUID, NUMERIC, TEXT, TEXT, JSONB) TO service_role;
     ```
   - Only `postgres` (superuser/owner) and `service_role` (backend webhook caller) retain `EXECUTE` privileges.

### 5.3 Query 10b Verification Implementation
Query 10b explicitly includes the `PUBLIC` pseudo-role in its filter:
```sql
SELECT 
    routine_schema,
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN (
    'settle_payment_atomic', 
    'record_payment_failure_atomic', 
    'record_refund_atomic', 
    'create_order_atomic', 
    'cancel_order_atomic'
  )
  AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC')
ORDER BY routine_name, grantee;
```

#### Expected Results:
- **Order RPCs (`create_order_atomic`, `cancel_order_atomic`):** Accessible to `authenticated` (and `PUBLIC` if default) as users directly create/cancel their own orders.
- **Payment RPCs (`settle_payment_atomic`, `record_payment_failure_atomic`, `record_refund_atomic`):** Must strictly show **only `postgres` and `service_role`**. Any appearance of `PUBLIC`, `anon`, or `authenticated` indicates an unapplied or improperly executed Migration 6.

---

## 6. Migration 5 and 6 Execution Atomicity & Transaction Analysis

### 6.1 Supabase CLI Runner Transaction Behavior
The Supabase CLI (`supabase db push`) executes each `.sql` file in an **independent transaction block**:
```sql
-- Migration 5 execution:
BEGIN;
-- [Contents of 20261029000002_payment_settlement_atomic.sql]
INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('20261029000002', ...);
COMMIT; -- Committed to database!

-- Migration 6 execution:
BEGIN;
-- [Contents of 20261029000003_payment_security_and_refunds.sql]
INSERT INTO supabase_migrations.schema_migrations (version, name, statements) VALUES ('20261029000003', ...);
COMMIT;
```

### 6.2 Failure Scenario & Exposure Risk
If Migration 6 fails during execution (e.g. statement timeout, connection interruption, or check constraint collision):
1. Migration 6 rolls back completely.
2. **Migration 5 remains committed.**
3. In this state, `authenticated` users possess `EXECUTE` privileges on `settle_payment_atomic` and `record_payment_failure_atomic`.
4. While client code does not expose payment settlement calls, direct Supabase PostgREST RPC requests from authenticated clients could invoke the settlement function until Migration 6 is applied.

### 6.3 Execution Options & Trade-Off Analysis

```text
┌───────────────────────────────┬───────────────────────────────────┬───────────────────────────────────┐
│ Execution Approach            │ Advantages                        │ Disadvantages & Trade-offs        │
├───────────────────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ Option 1: Supabase CLI        │ - Official Supabase workflow      │ - Migrations 5 & 6 commit in      │
│ (`supabase db push`)          │ - Automatically records versions  │   separate transactions.          │
│                               │   in schema_migrations table      │ - Exposure window if Migration 6  │
│                               │ - Seamless CI/CD compatibility    │   fails before completion.        │
├───────────────────────────────┼───────────────────────────────────┼───────────────────────────────────┤
│ Option 2: Atomic Wrapper      │ - Zero-window exposure risk       │ - Bypasses CLI tracking unless    │
│ (Single Manual Transaction    │ - Migration 5 & 6 either both     │   version records are inserted    │
│ via SQL Editor or psql)       │   succeed or both roll back       │   manually.                       │
│                               │                                   │ - May conflict with future        │
│                               │                                   │   supabase db push invocations.   │
└───────────────────────────────┴───────────────────────────────────┴───────────────────────────────────┘
```

### 6.4 Operator Recovery Action (Contingency Plan for CLI Execution)
If Option 1 (`supabase db push`) is used and Migration 6 fails, the operator must immediately execute the following emergency revocation script:

> [!CAUTION]
> **OPERATOR EMERGENCY RECOVERY ACTION ONLY**  
> This script is an emergency contingency action that requires separate operator authorization. It must only be run if Migration 6 fails after Migration 5 has already committed:
> ```sql
> -- IMMEDIATE PRIVILEGE LOCKDOWN SCRIPT
> REVOKE EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) FROM authenticated, anon, PUBLIC;
> REVOKE EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) FROM authenticated, anon, PUBLIC;
> ```

---

## 7. Preflight Execution Runbook for Database Operator

The operator should execute [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) using one of the two methods below:

### Method A: Via Supabase Dashboard SQL Editor (Recommended)
1. Navigate to the [Supabase Dashboard](https://supabase.com/dashboard/project/mhyawpnjhajytetqppam).
2. Select target project `mhyawpnjhajytetqppam`.
3. Open **SQL Editor** -> **New query**.
4. Copy and paste the entire contents of [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql).
5. Click **Run**.
6. Review the result tabs, paying specific attention to:
   - **Query 3:** Verifies whether any tables currently exist in `public`.
   - **Query 9c:** Verifies whether any of the 26 Migration 3 policies exist.
   - **Query 14b:** Review the Messages/Notice log for recorded migrations in `supabase_migrations.schema_migrations`.

### Method B: Via Authenticated `psql` Connection
```bash
psql "postgresql://postgres:[YOUR-DB-PASSWORD]@db.mhyawpnjhajytetqppam.supabase.co:5432/postgres" \
  -f docs/sql/production_preflight_readonly.sql
```

---

## 8. Prerequisites Checklist for Migration Authorization

Before requesting authorization to apply migrations 1 through 6, the following checklist must be satisfied:

- [ ] **1. Preflight Execution:** Operator executes [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) and documents the query results.
- [ ] **2. Manual Backup Snapshot:** Operator creates a manual backup snapshot in the Supabase Dashboard (`Database` -> `Backups` -> `Create Backup`).
- [ ] **3. Conflict Review:** Confirm Query 9c returns 0 rows, or review conflicting policy definitions individually.
- [ ] **4. Migration Execution Plan Selected:** Confirm whether migrations will be applied via `supabase db push` (with emergency revocation script on standby) or via manual atomic scripts.
- [ ] **5. Formal Authorization:** Obtain explicit authorization from stakeholders before executing any schema-altering SQL.

---

## 9. Final Verdict

### Final Verdict: **READY FOR DATABASE PREFLIGHT**

- **Read-Only Certification:** The SQL preflight package [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) consists strictly of non-mutating `SELECT`, `SHOW`, and a dynamic `DO` notice block with zero DDL, zero DML, and zero session side-effects.
- **Join Safety:** Query 5 table-level constraint matching (`tc.table_name = kcu.table_name`) resolves cross-table column ambiguity.
- **Policy Collision Precision:** Query 9c matches all 26 exact `(table_name, policy_name)` pairs and extracts full definitions for accurate comparison; blanket policy drops are completely retracted.
- **PUBLIC Routine Privilege Visibility:** Query 10b explicitly audits the `PUBLIC` pseudo-role for payment settlement and refund functions.
- **Transaction Safety Documented:** Supabase CLI independent transaction behavior is documented alongside trade-offs and an emergency revocation contingency.
- **Next Step:** Await operator execution of [`docs/sql/production_preflight_readonly.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/sql/production_preflight_readonly.sql) against project `mhyawpnjhajytetqppam`.
