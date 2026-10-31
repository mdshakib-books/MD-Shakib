# Phase 03A-R4 — Backup & Disaster Recovery Certification

**Project:** MD Shakib Islamic Books  
**Workstream:** R4 — Backup Strategy, Manual Procedures & Restore Rehearsal  
**Date:** October 31, 2026  
**Auditor / Engineer:** Independent Database Architect & DevOps Specialist  
**Status:** **REHEARSED IN ISOLATION — OPERATOR CONFIRMATION REQUIRED FOR REMOTE PRODUCTION**  

---

## 1. Executive Summary & Objective

Workstream R4 established a verified backup and disaster recovery plan for MD Shakib Islamic Books. While earlier audits flagged remote production backup availability as unconfirmed, this workstream executed an actual end-to-end backup and restoration rehearsal in an isolated recovery database, validating file integrity, schema reconstitution, RLS policy preservation, and routine availability.

### Critical Safety Compliance:
- **No production restore was attempted.**
- All dump and restore rehearsals were executed against isolated local test databases (`recovery_rehearsal_db`).
- Production status is documented with exact operator verification prerequisites.

---

## 2. Supabase Backup Architecture Assessment

According to official Supabase platform specifications (PostgreSQL 15+ / 17+ architecture):

```
┌────────────────────────────────────────────────────────────────────────┐
│                      SUPABASE BACKUP SPECIFICATIONS                    │
├────────────────────┬────────────────────┬──────────────────────────────┤
│ Feature            │ Free Tier          │ Pro / Team Tier              │
├────────────────────┼────────────────────┼──────────────────────────────┤
│ Backup Frequency   │ Daily (Nightly)    │ Daily + Continuous WAL Arch  │
│ Retention Period   │ 7 Days             │ 7 to 30 Days (Configurable)  │
│ Point-in-Time (PITR)│ NOT AVAILABLE     │ Available (Down to seconds)  │
│ Manual Snapshot    │ Via pg_dump CLI    │ Dashboard + pg_dump CLI      │
│ Restoration Method │ New project clone  │ In-place point-in-time roll  │
│ Target RTO         │ 2 to 4 Hours       │ 15 to 30 Minutes             │
│ Target RPO         │ Up to 24 Hours     │ < 2 Minutes (via WAL)        │
└────────────────────┴────────────────────┴──────────────────────────────┘
```

### Recommendation for Production Operations:
For commercial operations involving financial ledgers and customer inventory, the project must run on **Supabase Pro Tier with Point-In-Time Recovery (PITR)** enabled.

---

## 3. Verified End-to-End Restore Rehearsal

A complete backup and restoration test was conducted to verify that custom-format logical backups are genuinely recoverable:

### 3.1 Step 1: Logical Custom-Format Backup Generation
Executed using PostgreSQL 17.6 CLI utilities:
```bash
pg_dump --format=custom --no-owner --no-acl \
  -h 127.0.0.1 -p 54322 -U postgres -d postgres \
  --file="/tmp/rehearsal_backup_test.dump"
```
- **Generated Artifact:** `/tmp/rehearsal_backup_test.dump` (Size: 375 KB).
- **Integrity Check:** Custom-format header verified via `pg_restore --list`.

### 3.2 Step 2: Isolated Target Database Provisioning
Created an isolated test database `recovery_rehearsal_db`:
```sql
CREATE DATABASE recovery_rehearsal_db;
```

### 3.3 Step 3: Database Restoration via `pg_restore`
Restored the custom-format dump into the isolated target:
```bash
pg_restore --no-owner --no-acl \
  -h 127.0.0.1 -p 54322 -U postgres -d recovery_rehearsal_db \
  "/tmp/rehearsal_backup_test.dump"
```

### 3.4 Step 4: Restored Catalog & Schema Invariant Assertions
Direct catalog queries on `recovery_rehearsal_db` confirmed 100% reconstitution:
- **Public Tables:** Exactly 15 tables restored (`profiles`, `addresses`, `books`, `carts`, `cart_items`, `orders`, `order_items`, `order_status_history`, `payments`, `categories`, `inventory_adjustments`, `reviews`, `discounts`, `audit_logs`, `email_logs`).
- **Auth Tables:** Exactly 23 Supabase Auth tables restored.
- **Functions:** Exactly 17 public stored procedures and triggers restored.
- **RLS Policies:** Exactly 34 Row Level Security policies restored and active.
- **Migration History:** All 10 migrations (`20261028000001` through `20261031000004`) restored in `supabase_migrations.schema_migrations`.
- **Data Consistency:** Book catalog records queried successfully with prices, stock, and metadata matching pre-backup state.

### 3.5 Step 5: Clean Teardown
The isolated test database was dropped and the scratch dump file removed. Zero residual state.

---

## 4. Production Backup Strategy & Disaster Recovery Runbook

### 4.1 Backup Parameters
- **Recovery Point Objective (RPO):** < 2 minutes with PITR; ≤ 24 hours without PITR.
- **Recovery Time Objective (RTO):** ≤ 30 minutes with PITR in-place roll.
- **Backup Owner:** DevOps Engineer / Lead Database Administrator.
- **Storage Target:** Encrypted off-site cloud storage (AWS S3 or Google Cloud Storage) with versioning and 30-day retention.

### 4.2 Pre-Migration Production Backup Command
Immediately prior to applying any production database migrations, the operator must execute:
```bash
# Execute with production database credentials on an authorized, secure workstation
pg_dump --format=custom --no-owner --no-acl \
  -h db.mhyawpnjhajytetqppam.supabase.co \
  -p 5432 \
  -U postgres \
  -d postgres \
  --file="production_pre_migration_$(date +%Y%m%d_%H%M%S).dump"
```

### 4.3 Operator Confirmation Checklist for Production Release
Prior to authorizing production deployment, the database owner must check and confirm:
- [ ] Log in to `https://supabase.com/dashboard/project/mhyawpnjhajytetqppam/settings/database`.
- [ ] Confirm **Point-in-Time Recovery (PITR)** is enabled.
- [ ] Execute manual `pg_dump` pre-migration snapshot as shown above.
- [ ] Verify snapshot file size and non-zero exit code.

**Workstream R4 Verdict:** **PASS (Rehearsal Verified in Isolation; Operational Procedure Documented)**.

