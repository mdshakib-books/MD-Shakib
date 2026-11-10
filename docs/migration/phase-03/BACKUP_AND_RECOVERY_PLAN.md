# Database Backup & Disaster Recovery Plan
**Project:** MD Shakib Islamic Books  
**Document Code:** `BACKUP_AND_RECOVERY_PLAN.md`  
**Date:** 2026-11-10  
**Target Architecture:** Supabase Managed PostgreSQL (Production) / Local PostgreSQL Container (Staging)  

---

## 1. Backup Strategy & Architecture

| Tier | Backup Mechanism | Frequency | Retention Window | Storage Location | Recovery Point Objective (RPO) | Recovery Time Objective (RTO) |
|---|---|---|---|---|---|---|
| **Production Primary (Supabase)** | Automated Physical Daily Snapshots (pg_dump / WAL-G) | Daily (00:00 UTC) | 7 Days (Pro) / 30 Days (Team/Enterprise) | Encrypted AWS S3 (Separate Supabase backup infrastructure) | <= 24 Hours | <= 30 Minutes |
| **Point-in-Time Recovery (PITR)** | Continuous Write-Ahead Log (WAL) Archiving | Real-time streaming | Up to 7 or 14 Days (when enabled on Supabase Pro) | Multi-AZ S3 Bucket | <= 5 Minutes | <= 45 Minutes |
| **Schema & Migrations** | Monotonic SQL Migrations (`supabase/migrations/*.sql`) | Continuous / On every code commit | Immutable Git History | Git Repository (`origin/new-fix`) | 0 (Version controlled) | <= 5 Minutes (`supabase db push`) |
| **Media Assets (Cloudinary)** | Cloudinary Media Asset Store | Real-time asset synchronization | Permanent (until deleted via admin) | Cloudinary Multi-Cloud Storage | 0 | Instantaneous |

---

## 2. Disaster Recovery Runbook

### Scenario A: Accidental Data Corruption or Malicious Modification
1. **Assess Incident:** Identify the exact timestamp of data corruption.
2. **Point-in-Time Recovery (PITR):**
   - In the Supabase Dashboard, navigate to **Project Settings** -> **Backups** -> **Point in Time**.
   - Select the target timestamp immediately prior to the incident (e.g. 5 minutes before corruption).
   - Initiate restore into a temporary clone project or restore in place.
3. **Verification:** Validate row counts in `public.orders`, `public.invoices`, and `public.books` before cutting over traffic.

### Scenario B: Full Environment Rebuild from Scratch
If a new Supabase project or PostgreSQL instance must be provisioned:
1. Initialize new Supabase project:
   ```bash
   npx supabase link --project-ref <new-project-ref>
   ```
2. Apply all monotonic migrations in chronological sequence:
   ```bash
   npx supabase db push
   ```
3. Restore statutory transaction tables from the latest verified logical backup:
   ```bash
   psql "$RESTORE_DATABASE_URL" < latest_sanitized_backup.sql
   ```
4. Update environment variables in Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
5. Execute health check:
   ```bash
   curl -I https://your-domain.com/api/health
   ```

---

## 3. Isolated Restore Drill Policy

**Safety Invariant:** A disaster recovery drill must **NEVER** overwrite the production database or disturb active staging records.
All restoration drills must run against an isolated test schema or dedicated test database container to prove:
1. Logical dump restoration completes without constraint violations.
2. All tables (`books`, `orders`, `invoices`, `profiles`, `payments`, `delivery_otps`) restore with intact foreign keys.
3. Application queries execute successfully against the restored database.
