# Phase 2 — Data Migration, Reconciliation & Rollback Plan
**Project:** MD Shakib Islamic Books  
**Audit Date:** 2026-10-28  
**Scope:** Procedures for Future Production MongoDB to Supabase/PostgreSQL Data Cutover  
**Status:** Approved Specification (Execution Deferred to Production Cutover Gate)  

---

## 1. Pre-Migration Prerequisites & Safety

> [!IMPORTANT]
> **No data migration is executed during Phase 2.** This document defines the exact deterministic migration procedure to be executed when the new Next.js application reaches production readiness (Phase 7/8).

### 1.1 Source System Snapshot
1. Prior to data extraction, freeze writes on the legacy MongoDB cluster or place the legacy Express API in maintenance mode:
   ```bash
   # MongoDB native snapshot / mongodump
   mongodump --uri="$MONGODB_URI" --out="backups/mongodb_pre_migration_$(date +%Y%m%d_%H%M%S)"
   ```
2. Verify backup archive size, document counts, and checksums.

---

## 2. Entity Transformation & Dependency Ordering

PostgreSQL enforces strict referential integrity (Foreign Keys). Data must be loaded in exact dependency order:

```
Step 1: auth.users (Supabase Auth identities)
   ↓
Step 2: public.profiles (Linked 1:1 with auth.users)
   ↓
Step 3: public.addresses (Referencing public.profiles)
   ↓
Step 4: public.books (Catalog & stock)
   ↓
Step 5: public.carts & public.cart_items (Referencing profiles and books)
   ↓
Step 6: public.orders & public.order_items (Referencing profiles and books)
   ↓
Step 7: public.order_status_history (Referencing orders)
   ↓
Step 8: public.payments (Referencing orders and profiles)
   ↓
Step 9: public.audit_logs & public.email_logs
```

---

## 3. ID Translation & Referential Mapping

### 3.1 MongoDB ObjectId to UUID Mapping
- Legacy collections use 24-character hex MongoDB `_id` strings (e.g. `65f1a2b3c4d5e6f7a8b9c0d1`).
- A deterministic UUID v5 namespace or persistent SQLite translation mapping table (`id_mapping(source_collection, mongo_id, pg_uuid)`) will be generated during the migration pipeline.
- Example mapping:
  - `User._id` $\to$ `auth.users.id` (UUID) $\to$ `public.profiles.id` (UUID).
  - `Book._id` $\to$ `public.books.id` (UUID).
  - `Order._id` $\to$ `public.orders.id` (UUID).

### 3.2 Password Hashes Strategy
- Legacy MongoDB stores bcrypt password hashes in `User.password`.
- Supabase Auth supports bcrypt password hashes natively via `auth.admin.createUser({ password_hash })` import API.
- Users will not need to reset passwords upon initial login on the new platform.

---

## 4. Reconciliation & Verification Invariants

A automated reconciliation script will compare source and destination metrics:

1. **Row Count Verification:**
   $$\text{Count}(\text{PostgreSQL Table}) = \text{Count}(\text{MongoDB Collection}) - \text{Count}(\text{Invalid/Corrupted Records})$$
2. **Financial Reconciliation:**
   $$\sum \text{orders.total\_amount} (\text{Postgres}) = \sum \text{Order.totalAmount} (\text{MongoDB})$$
3. **Inventory Quantity Reconciliation:**
   $$\sum \text{books.stock} (\text{Postgres}) = \sum \text{Book.stock} (\text{MongoDB})$$
4. **Order Items Count Verification:**
   $$\text{Count}(\text{order\_items}) = \sum \text{len}(\text{Order.items})$$

---

## 5. Rollback & Fail-Safe Criteria

### 5.1 Rollback Trigger Criteria
The migration must be aborted and rolled back immediately if any of the following occur during validation:
1. Discrepancy in financial totals between MongoDB and PostgreSQL exceeds ₹0.00.
2. Missing orders or mismatched order item prices.
3. Foreign key integrity errors during import.
4. Unresolvable user authentication failures.

### 5.2 Rollback Procedure
1. Re-enable write traffic to legacy MongoDB and legacy Express backend.
2. Purge newly migrated records from the Supabase staging database:
   ```sql
   TRUNCATE TABLE public.order_items, public.order_status_history, public.payments, public.orders, public.cart_items, public.carts, public.addresses, public.books, public.profiles CASCADE;
   ```
3. Retain MongoDB snapshot files untouched.
4. Perform Root Cause Analysis (RCA) before scheduling a subsequent cutover window.

