# Phase 2 — Database Runbook: Local Setup, Migrations & Testing
**Project:** MD Shakib Islamic Books  
**Audit Date:** 2026-10-28  
**Scope:** Developer guide for running local database, migrations, seeds, and tests  

---

## 1. Prerequisites

- **PostgreSQL 15+** or **Supabase CLI** (installed at `/opt/homebrew/bin/supabase`).
- **Node.js 22 LTS** and **npm 10.9+**.

---

## 2. Directory Structure

```
supabase/
├── config.toml                              # Supabase project configuration
├── seed.sql                                 # Development seed data
└── migrations/
    ├── 20261028000001_core_schema.sql       # Tables, Foreign Keys, Indexes, Constraints
    ├── 20261028000002_business_logic.sql     # Functions, Triggers, Atomic RPCs
    └── 20261028000003_rls_policies.sql      # Row Level Security & RBAC policies
```

---

## 3. Running with Supabase CLI (Docker Stack)

When Docker is running locally on the workstation:
```bash
# 1. Start local Supabase containers (Postgres, GoTrue Auth, PostgREST, Studio)
supabase start

# 2. Apply all migrations
supabase db reset

# 3. Generate TypeScript types for Next.js
supabase gen types typescript --local > apps/web/types/database.types.ts
```

---

## 4. Running with Local PostgreSQL (Standalone)

If Docker is not running, migrations can be tested directly against local PostgreSQL:
```bash
# 1. Create a fresh test database
psql -h localhost -d postgres -c "CREATE DATABASE mdshakib_local;"

# 2. Provision Supabase roles (if not present)
psql -h localhost -d mdshakib_local -c "
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role; END IF;
END \$\$;"

# 3. Apply migrations in order
psql -h localhost -d mdshakib_local -f supabase/migrations/20261028000001_core_schema.sql
psql -h localhost -d mdshakib_local -f supabase/migrations/20261028000002_business_logic.sql
psql -h localhost -d mdshakib_local -f supabase/migrations/20261028000003_rls_policies.sql

# 4. Load development seed data
psql -h localhost -d mdshakib_local -f supabase/seed.sql
```

---

## 5. Verification Commands

Run the following test queries to ensure schema health:
```sql
-- Check that all 5 sample books are present
SELECT count(*) FROM public.books; -- Expect: 5

-- Check RLS is active on all tables
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
```

