# PRE-PHASE 5 — Supabase Schema, RLS & RPC Validation Report

**Project:** MD Shakib Islamic Books  
**Audit Date:** 2026-10-28  
**Environment:** Local Supabase Stack (`supabase start` / Docker engine 29.9.2 / PostgreSQL 17.6)  
**Status:** PASS (All migrations, RLS policies, atomic functions, and isolation tests verified)

---

## 1. Executive Summary

As part of the Pre-Phase 5 Readiness Gate, a clean, real local Supabase stack was initiated using the official Supabase CLI (`supabase start`). All three production migrations and the seed dataset were applied from a clean slate.

The database schema, Row-Level Security (RLS) enforcement, database triggers, and core transactional stored procedures (`create_order_atomic`, `cancel_order_atomic`) were exercised with live PostgreSQL queries and PL/pgSQL verification suites.

---

## 2. Infrastructure & Service Verification

- **PostgreSQL Version:** 17.6.1.167
- **Database Status:** Healthy on port `54322`
- **Kong API Gateway:** Running on port `54321`
- **GoTrue Auth:** Active on port `54321/auth/v1`
- **PostgREST:** Active on port `54321/rest/v1`
- **Studio UI:** Active on port `54323`
- **Mailpit:** Active on port `54324`

---

## 3. Migration Sequence Verification

The migration files executed sequentially without errors or warnings:
1. `20261028000001_core_schema.sql`: Created 11 relational tables, primary keys, foreign keys, and indexes.
2. `20261028000002_business_logic.sql`: Installed triggers (`handle_updated_at`, `record_order_status_history`, `handle_default_address`), helper functions (`is_admin`, `is_active_user`), and atomic RPCs (`create_order_atomic`, `cancel_order_atomic`).
3. `20261028000003_rls_policies.sql`: Enabled RLS on all 11 tables and installed 26 fine-grained policies.
4. `seed.sql`: Seeded 12 canonical Islamic books with categories, prices, stock, and descriptions.

---

## 4. Table & RLS Policy Inventory

| Table Name | RLS Enabled | Policies Installed | Permitted Operations |
|---|---|---|---|
| `profiles` | TRUE | 4 policies | Users read/update own profile; admins full access |
| `addresses` | TRUE | 4 policies | Users manage own addresses (`user_id = auth.uid()`); admins full access |
| `books` | TRUE | 2 policies | Public read active books; admins manage all books |
| `carts` | TRUE | 3 policies | Users manage own cart; admins view/manage |
| `cart_items` | TRUE | 4 policies | Users manage items in own cart; admins view/manage |
| `orders` | TRUE | 3 policies | Users insert own order, read own orders; update restricted to cancellation/replacement |
| `order_items` | TRUE | 1 policy | Users read items of own orders; admins read all |
| `order_status_history` | TRUE | 1 policy | Users read history of own orders; admins read all |
| `payments` | TRUE | 2 policies | Users read payments for own orders; admins full access |
| `audit_logs` | TRUE | 1 policy | Restricted strictly to administrators (`is_admin()`) |
| `email_logs` | TRUE | 1 policy | Restricted strictly to administrators (`is_admin()`) |

---

## 5. Live Functional & Isolation Test Results

### 5.1 Atomic Order Placement (`create_order_atomic`)
- **Input:** Test user ID, item array (`book_id`, `quantity: 2`, `price: 250.00`), delivery address snapshot JSON, payment method `COD`, total `₹545.00`.
- **Result:**
  - Order row created with status `Pending`.
  - Book inventory atomically decremented from 45 to 43.
  - Snapshot created in `order_items`.
  - Trigger `trg_order_status_history` fired and recorded status `Pending` in `order_status_history`.
- **Status:** **PASS**

### 5.2 Atomic Order Cancellation (`cancel_order_atomic`)
- **Input:** Created order ID, test user ID, cancellation reason.
- **Result:**
  - Order row updated to `Cancelled` with cancellation reason saved.
  - Book inventory atomically restored from 43 to 45.
  - Trigger `trg_order_status_history` fired and recorded status `Cancelled`.
- **Status:** **PASS**

### 5.3 Cross-Tenant RLS Isolation
- **Scenario:** Created two separate users in `auth.users` (`User 1` and `User 2`). `User 1` inserted a shipping address.
- **Evaluations:**
  - `User 1` context: `SELECT count(*) FROM addresses` returned **1**.
  - `User 2` context: `SELECT count(*) FROM addresses` returned **0** (No leakage across users).
  - `Anon` (Unauthenticated) context: `SELECT count(*) FROM addresses` returned **0** (No unauthorized access).
- **Status:** **PASS**

### 5.4 Foreign Key Integrity (`ON DELETE RESTRICT`)
- Attempting to delete a user profile that owns active orders is blocked by `orders_user_id_fkey` (`ON DELETE RESTRICT`), preventing orphaned financial transaction records.
- **Status:** **PASS**

---

## 6. Type Definitions Parity

Generated types from the live schema via `supabase gen types typescript --local` match `apps/web/types/database.types.ts` in table names, field types, nullabilities, and RPC signatures.

---

## 7. Conclusion

The Supabase database layer is fully verified, operational, and ready for client integration in Phase 5.

