# PHASE 02 — ADMINISTRATIVE SECURITY REVIEW & RBAC AUDIT
## MD Shakib Islamic Books — Security Posture Assessment

**Auditor:** Automated Engineering Gate  
**Scope:** Admin Portal, Server Actions, Route Handlers, Database Functions, RLS Policies  
**Status:** Approved / Secure  
**Date:** 2026-10-31  

---

## 1. Authentication & Role-Based Access Control (RBAC)

### 1.1 Server-Side Guards
Every administrative page, server action, and API endpoint is protected by authoritative server guards in `apps/web/lib/admin/auth.ts`:

1. **`requireAdmin()`**:
   - Queries `supabase.auth.getUser()`. If null or invalid, immediately redirects unauthenticated users to `/login?redirect=/admin`.
   - Queries `profiles` by `user.id`.
   - Evaluates three criteria:
     - `profile.role === 'admin'`
     - `profile.is_blocked === false`
     - `profile.is_deleted === false`
   - If any check fails, immediately terminates execution and redirects with `/error=forbidden`.
2. **`verifyAdminApi()`**:
   - Equivalent guard for Next.js API Route Handlers.
   - Returns standard JSON responses with HTTP 401 (unauthenticated) or HTTP 403 (unauthorized).

### 1.2 Administrative Self-Modification Guards
A critical vulnerability in multi-admin architectures is an administrator locking themselves out or an attacker who gains access to one admin account locking out the root admin.
- `apps/web/lib/admin/customers.ts` and `update_customer_status` stored procedure explicitly prohibit an administrator from blocking or deleting their own active profile:
  ```sql
  IF p_customer_id = p_admin_id THEN
      RAISE EXCEPTION 'Safety invariant: Administrators cannot modify their own active account status.';
  END IF;
  ```

---

## 2. Row-Level Security (RLS) Posture

All public tables are protected by PostgreSQL RLS:

| Table | Public / Guest Access | Authenticated Customer Access | Administrator Access |
|---|---|---|---|
| `public.profiles` | None | Read own profile; update non-critical fields (name, phone) | Full access |
| `public.books` | `SELECT` active books (`is_active = true`) | `SELECT` active books | Full CRUD |
| `public.categories` | `SELECT` active categories (`is_active = true`) | `SELECT` active categories | Full CRUD |
| `public.inventory_adjustments` | None | None | `SELECT` only (modifications via RPC) |
| `public.reviews` | `SELECT` approved reviews | `SELECT` approved + own; `INSERT` new review | Full CRUD & moderation |
| `public.discounts` | None | `SELECT` active discounts | Full CRUD |
| `public.orders` | None | Read own orders; create via `create_order_atomic` | Full access & management |
| `public.order_items` | None | Read own order items | Full access |
| `public.audit_logs` | None | None | Read-only access |

---

## 3. Atomic Procedures & `search_path` Hardening

All `SECURITY DEFINER` procedures execute with an explicit search path to neutralize schema search-path hijacking attacks:
- `SET search_path = public`
- Functions covered:
  - `public.create_order_atomic`
  - `public.cancel_order_atomic`
  - `public.merge_cart_atomic`
  - `public.adjust_inventory_atomic`
  - `public.moderate_review_atomic`
  - `public.validate_discount_coupon`
  - `public.update_customer_status`

---

## 4. Referential Integrity & Data Preservation

1. **Book Deletions:**
   - Deleting a book queries `order_items`.
   - If the book was ever ordered, hard deletion is blocked to prevent breaking financial records. The book is soft-archived (`is_active: false, stock: 0`) and removed from public discovery.
2. **Category Deletions:**
   - Deleting a category queries `books`.
   - If books are assigned, deletion is rejected with an informative error instructing the admin to reassign or archive those titles first.
3. **Customer Deletions:**
   - Soft-delete flags (`is_deleted: true, deleted_at = NOW()`) ensure customer order history remains intact for bookkeeping.

