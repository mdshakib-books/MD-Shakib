# Phase 03A — Production Backup & Disaster Recovery Readiness Plan

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Production Migration Readiness Audit  
**Target Environment:** Remote Supabase Production Database (`mhyawpnjhajytetqppam.supabase.co`)  
**Audit Date:** October 31, 2026  
**Auditor:** Independent Database Architect & Security Auditor  
**Backup Readiness Status:** **UNCONFIRMED / DEPLOYMENT BLOCKER**  

---

## 1. Executive Summary

A database migration in production introduces irreversible schema and data changes. If a migration fails mid-stream or corrupts state, an immediate, tested recovery path is the only defense against prolonged downtime or catastrophic data loss.

### Critical Safety Rule:
*Do not initiate a production backup or restore operation during this audit. If evidence of a recoverable backup is unavailable, classify this as a deployment blocker until verified.*

### Verification Verdict: **DEPLOYMENT BLOCKER**
There is no verifiable evidence in the repository indicating that automated backups or Point-In-Time Recovery (PITR) are currently enabled and tested on the remote Supabase production project (`mhyawpnjhajytetqppam`). Until the production backup configuration is explicitly verified and documented by the organization's database owner, **production migration execution is strictly BLOCKED**.

---

## 2. Supabase Backup Architecture Assessment

Supabase provides different backup tiers depending on the project subscription plan:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      SUPABASE BACKUP CAPABILITIES                      │
├────────────────────┬────────────────────┬──────────────────────────────┤
│ Feature            │ Free Tier          │ Pro / Team Tier              │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Backup Frequency   │ Daily (Nightly)    │ Daily + Continuous WAL Arch  │
│ Retention Window   │ 7 Days             │ 7 to 30 Days (Configurable)  │
│ Point-in-Time (PITR)│ NOT AVAILABLE     │ Available (Down to seconds)  │
│ Manual Snapshot    │ Via pg_dump CLI    │ Dashboard + pg_dump CLI      │
│ Restoration Method │ Project clone/repl │ In-place point-in-time roll  │
│ RTO (Recovery Time)│ 2 to 6 Hours       │ 15 to 45 Minutes             │
│ RPO (Data Loss)    │ Up to 24 Hours     │ < 2 Minutes (via WAL)        │
└────────────────────┴────────────────────┴──────────────────────────────┘
```

### Risk Evaluation for Free Tier vs Pro Tier:
- If project `mhyawpnjhajytetqppam` is on the **Free Tier**, a mid-migration failure during peak hours could result in an RPO (Recovery Point Objective) loss of up to 24 hours of customer orders and registrations.
- For production commerce operations involving financial transactions, **Supabase Pro Tier with Point-In-Time Recovery (PITR)** is mandatory.

---

## 3. Pre-Migration Backup Protocol (Mandatory Checklist)

Before executing any production migration, the database owner must complete and verify the following sequence:

### Step 1: Manual Logical Pre-Migration Snapshot
Before initiating migration scripts, generate a timestamped manual dump of the entire production PostgreSQL instance:
```bash
# Execute on authorized administrative workstation with network access to production pooler
pg_dump \
  --clean \
  --if-exists \
  --quote-all-identifiers \
  --no-owner \
  --no-privileges \
  -h db.mhyawpnjhajytetqppam.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  -F c \
  -f "pre_migration_backup_$(date +%Y%m%d_%H%M%S).dump"
```

### Step 2: Verification of Backup Artifact Integrity
Verify the generated backup file is complete and non-empty:
```bash
# Verify dump structure and table inventory
pg_restore --list "pre_migration_backup_*.dump" | grep -E "TABLE DATA public (orders|profiles|books|payments)"
```

### Step 3: Confirmation of Point-in-Time Recovery
1. Navigate to `https://supabase.com/dashboard/project/mhyawpnjhajytetqppam/settings/database`.
2. Verify **Point-in-Time Recovery (PITR)** status is marked as **Active**.
3. Record the exact UTC timestamp immediately prior to migration commencement ($T_{\text{pre-mig}}$).

---

## 4. Emergency Disaster Recovery Procedure (Rollback & Restoration)

If a migration encounters an unrecoverable catalog error, data corruption, or policy lockout:

### Scenario A: In-Place Point-in-Time Rollback (Pro Tier PITR)
1. Halt all client traffic by placing the web application into maintenance mode (`NEXT_PUBLIC_MAINTENANCE_MODE=true`).
2. Log in to the Supabase Project Dashboard.
3. Select **Database** -> **Backups** -> **Point in Time**.
4. Select the recorded pre-migration timestamp ($T_{\text{pre-mig}}$).
5. Initiate restore. Supabase will provision a restored cluster with state rolled back to the exact second prior to migration.
6. Verify catalog integrity using the read-only preflight script ([`PRODUCTION_SCHEMA_COMPATIBILITY.md`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/docs/migration/phase-03a/production-readiness/PRODUCTION_SCHEMA_COMPATIBILITY.md)).
7. Re-enable client traffic.

### Scenario B: Logical Backup Restore (Free Tier / Standalone DB)
1. Enable application maintenance mode.
2. In the Supabase SQL editor or psql, drop corrupted schemas or recreate target database.
3. Restore the logical dump:
   ```bash
   pg_restore \
     --clean \
     --if-exists \
     --no-owner \
     --no-privileges \
     -h db.mhyawpnjhajytetqppam.supabase.co \
     -p 5432 \
     -U postgres \
     -d postgres \
     "pre_migration_backup_*.dump"
   ```
4. Execute automated regression test suites to verify data consistency.
5. Deactivate maintenance mode.

---

## 5. Roles & Responsibilities

- **Recovery Owner:** Lead Database Administrator / DevOps Engineer.
- **Required Credentials:** Supabase Project Owner account, administrative PostgreSQL connection string with superuser/owner privileges (`postgres` role).
- **Communication Escalation:** CTO and Customer Operations team if recovery operation exceeds 15 minutes.
- **Deployment Blocker Certification:** This document certifies that production migrations must **NOT** be scheduled until the database owner provides written confirmation of PITR activation or pre-migration snapshot availability.

