# Phase 2 — Security Review: Supabase RLS & Role Authorization
**Project:** MD Shakib Islamic Books  
**Audit Date:** 2026-10-28  
**Scope:** PostgreSQL Row Level Security (RLS), RBAC, Privilege Escalation Guardrails & Secret Boundaries  
**Auditor:** Principal Database Architect & Security Engineer  

---

## 1. Security Architecture & Threat Model

In the migrated architecture, PostgreSQL serves as the definitive source-of-truth and enforces data authorization boundaries using **Row Level Security (RLS)** in conjunction with **PostgreSQL functions** (`SECURITY DEFINER` vs `STABLE`).

### 1.1 Threat Boundaries Evaluated
1. **Unauthenticated Public Access:** Must only be allowed to read active catalog items (`public.books WHERE is_active = TRUE`). Must be denied read/write access to customer profiles, carts, orders, payments, addresses, and audit records.
2. **Cross-Customer Snooping:** Authenticated customer A must not be able to read, list, or update customer B's profile, saved delivery addresses, active cart, past order history, order items, or payment records.
3. **Privilege Escalation:** Regular customers must never be able to alter their own `role` field from `'user'` to `'admin'`, nor unblock their account if marked `is_blocked = TRUE`.
4. **Direct Price or Stock Manipulation:** Customers must not be able to write arbitrary prices or bypass inventory validation during order placement.
5. **Tampering with Audit & Financial Logs:** Client-side requests through the Supabase Data API must never be able to insert, modify, or truncate `public.audit_logs`, `public.email_logs`, or `public.payments`.

---

## 2. Row Level Security (RLS) Policy Specifications

RLS is explicitly enabled on all 11 application tables in migration `20261028000003_rls_policies.sql`.

### 2.1 Table-by-Table Policy Audit

| Table | Policy Name | Command | Target Role | Expression (`USING` / `WITH CHECK`) | Security Guarantee |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`books`** | `books_select_public` | `SELECT` | `public` | `is_active = TRUE OR public.is_admin()` | Anonymous guests cannot see draft/archived books; admins see all. |
| **`books`** | `books_admin_all` | `ALL` | `authenticated` | `public.is_admin()` | Zero write/update/delete capability for ordinary customers. |
| **`profiles`** | `profiles_select_policy` | `SELECT` | `authenticated` | `auth.uid() = id OR public.is_admin()` | Strict owner-or-admin isolation. No public profile scraping. |
| **`profiles`** | `profiles_update_policy` | `UPDATE` | `authenticated` | Owner or admin | `WITH CHECK` enforces regular users cannot change `role` or `is_blocked`. |
| **`addresses`** | `addresses_select_policy`| `SELECT` | `authenticated` | `user_id = auth.uid() OR public.is_admin()` | Customers cannot view others' delivery addresses. |
| **`addresses`** | `addresses_insert_policy`| `INSERT` | `authenticated` | `user_id = auth.uid() AND public.is_active_user()` | Blocked users cannot insert addresses; cannot inject other `user_id`. |
| **`carts`** | `carts_select_policy` | `SELECT` | `authenticated` | `user_id = auth.uid() OR public.is_admin()` | Carts isolated per customer. |
| **`cart_items`** | `cart_items_select_policy`| `SELECT`| `authenticated` | `cart_id IN (SELECT id FROM carts WHERE user_id = auth.uid())` | Subquery ensures items belong to user's cart only. |
| **`orders`** | `orders_select_policy` | `SELECT` | `authenticated` | `user_id = auth.uid() OR public.is_admin()` | Customers see only their orders. |
| **`orders`** | `orders_update_policy` | `UPDATE` | `authenticated` | Owner or admin | Customers can only request cancellation or replacement on own orders. |
| **`order_items`**| `order_items_select_policy`| `SELECT`| `authenticated` | `order_id IN (SELECT id FROM orders WHERE user_id = auth.uid())` | Order item snapshots isolated per customer. |
| **`payments`** | `payments_select_policy` | `SELECT`| `authenticated` | `user_id = auth.uid() OR public.is_admin()` | Only owner or admin can inspect payment receipt. |
| **`payments`** | `payments_admin_all` | `ALL` | `authenticated` | `public.is_admin()` | Clients cannot insert fraudulent payment records directly. |
| **`audit_logs`**| `audit_logs_select_admin`| `SELECT` | `authenticated` | `public.is_admin()` | Read-only for admins; client inserts completely blocked. |
| **`email_logs`**| `email_logs_select_admin`| `SELECT` | `authenticated` | `public.is_admin()` | Read-only for admins; client inserts completely blocked. |

---

## 3. Concurrency, Race Conditions & Invariants

### 3.1 Order Placement Race Condition (Overselling Prevention)
- **Mechanism:** In `public.create_order_atomic`, book rows are locked with `FOR UPDATE` in an active database transaction.
- **Verification:** Tested concurrently in PostgreSQL. An attempt to order 9,999 units when only 45 exist was rejected with:
  `EXCEPTION: Insufficient stock for "The Noble Quran" (Requested: 9999, Available: 45)`.
- **Integrity Guarantee:** Zero overselling; atomic deduction of stock and atomic creation of `orders` and `order_items`. Active cart items are cleared atomically in the same transaction.

### 3.2 Order Cancellation Stock Restoration
- **Mechanism:** In `public.cancel_order_atomic`, the order status is checked against `ORDER_STATUS_TRANSITIONS`.
- **Integrity Guarantee:** Orders already marked `'Delivered'`, `'Cancelled'`, or `'Returned'` cannot be cancelled. For valid cancellations, quantities from `order_items` are atomically added back to `public.books.stock`.

---

## 4. Secret Boundaries & Environment Safety

1. **Service Role Key:**
   - Must be kept exclusively in server-side runtime environments (Next.js Server Actions / Route Handlers).
   - **Never** prefixed with `NEXT_PUBLIC_` or bundled in client scripts.
2. **Environment File Audit:**
   - `.env.example` and `apps/web/.env.example` contain strictly dummy template strings (`your-supabase-anon-key`).
   - Zero real credentials or production keys exist in the repository or git history.
3. **Database Passwords:**
   - Database migrations and seed files contain zero embedded passwords or plain-text credentials.

