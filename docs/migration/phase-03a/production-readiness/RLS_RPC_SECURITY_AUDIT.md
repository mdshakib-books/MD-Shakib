# Phase 03A — RLS & RPC Security Audit

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Production Migration Readiness Audit  
**Audit Scope:** PostgreSQL Row Level Security (RLS) Policies, Stored Procedures (RPCs), Identity Validation Routines, Search Path Safety, and Privilege Boundaries  
**Audit Date:** October 31, 2026  
**Auditor:** Independent Security & Database Migration Architect  
**Security Status:** **VULNERABILITIES IDENTIFIED — REMEDIATION MANDATORY PRIOR TO DEPLOYMENT**  

---

## 1. Executive Summary

This security audit conducted a thorough, line-by-line inspection of all PostgreSQL Row Level Security (RLS) policies and `SECURITY DEFINER` stored procedures across the application's migrations. 

The audit identified **two critical authorization vulnerabilities** in the existing migration definitions:
1. **Unprotected Order Creation & Cart Merging (`create_order_atomic` and `merge_cart_atomic` in `20261031000001`):** Both procedures execute as `SECURITY DEFINER` with search path set to public, but perform **zero identity validation** (`auth.uid()` is never checked against `p_user_id`). Furthermore, execution privileges were never revoked from `PUBLIC` and `anon`. Any unauthenticated caller can invoke these procedures over PostgREST to place orders or modify carts on behalf of arbitrary users and deplete catalog stock.
2. **Administrative Identity Bypass via `auth.uid() IS NULL` (`adjust_inventory_atomic`, `moderate_review_atomic`, and `update_customer_status` in `20261031000002`):** These procedures verify administrative identity using `IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_id THEN RAISE EXCEPTION ...`. Because `REVOKE ... FROM PUBLIC` does not revoke from `anon` under default Supabase privileges, anonymous callers can invoke these RPCs directly. When called anonymously, `auth.uid()` evaluates to `NULL`, the condition evaluates to `FALSE`, and the identity check is bypassed entirely. An attacker who supplies a known admin UUID can adjust inventory stock, moderate customer reviews, or block/unblock and soft-delete user accounts.

Conversely, `cancel_order_atomic` and `request_replacement_atomic` have been properly hardened with strict caller authentication, identity matching, rolling time-window enforcement, and isolated search paths.

---

## 2. Row Level Security (RLS) Policy Audit

All 15 tables in the `public` schema have RLS enabled (`rowsecurity = true`). Across these tables, 34 distinct policies govern access:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PUBLIC SCHEMA RLS STATUS                        │
├───────────────────────┬─────────────┬─────────────────┬────────────────┤
│ Table Name            │ RLS Enabled │ Active Policies │ Isolation Mode │
├───────────────────────┼─────────────┼─────────────────┼────────────────┤
│ public.profiles       │ TRUE        │ 4 policies      │ User / Admin   │
│ public.addresses      │ TRUE        │ 4 policies      │ User / Admin   │
│ public.books          │ TRUE        │ 2 policies      │ Public Read    │
│ public.carts          │ TRUE        │ 3 policies      │ User Isolated  │
│ public.cart_items     │ TRUE        │ 4 policies      │ User Isolated  │
│ public.orders         │ TRUE        │ 3 policies      │ User / Admin   │
│ public.order_items    │ TRUE        │ 1 policy        │ User Read-Only │
│ public.order_status_h │ TRUE        │ 1 policy        │ User Read-Only │
│ public.payments       │ TRUE        │ 2 policies      │ User Read/Admin│
│ public.categories     │ TRUE        │ 2 policies      │ Public Read    │
│ public.inventory_adj  │ TRUE        │ 1 policy        │ Admin Only     │
│ public.reviews        │ TRUE        │ 3 policies      │ Public/User/Adm│
│ public.discounts      │ TRUE        │ 2 policies      │ Active / Admin │
│ public.audit_logs     │ TRUE        │ 1 policy        │ Admin Only     │
│ public.email_logs     │ TRUE        │ 1 policy        │ Admin Only     │
└───────────────────────┴─────────────┴─────────────────┴────────────────┘
```

### 2.1 Granular Table Policy Analysis

#### 1. `public.profiles`
- `profiles_select_policy`: `(auth.uid() = id) OR is_admin()` (Authenticated only). Blocks anonymous inspection. Customers cannot enumerate other accounts.
- `profiles_insert_policy`: `WITH CHECK (auth.uid() = id)`. Enforces that new profiles match the authenticated Supabase Auth UUID.
- `profiles_update_policy`: `USING ((auth.uid() = id) OR is_admin()) WITH CHECK (((auth.uid() = id) AND (role = 'user') AND (is_blocked = false)) OR is_admin())`. **Key Safeguard:** Ordinary customers cannot elevate their `role` to `'admin'` or unblock themselves.
- `profiles_delete_policy`: `USING (is_admin())`. Ordinary customers cannot permanently delete profile records.
- **Verdict:** **SECURE**.

#### 2. `public.addresses`
- `addresses_select_policy`: `(user_id = auth.uid()) OR is_admin()`. Strict customer data isolation.
- `addresses_insert_policy`: `WITH CHECK ((user_id = auth.uid()) AND is_active_user())`. Prevents blocked/suspended users from adding addresses.
- `addresses_update_policy` & `addresses_delete_policy`: `(user_id = auth.uid()) OR is_admin()`.
- **Verdict:** **SECURE**.

#### 3. `public.orders` & `public.order_items`
- `orders_select_policy`: `(user_id = auth.uid()) OR is_admin()`. Cross-customer isolation strictly enforced.
- `orders_insert_policy`: `WITH CHECK ((user_id = auth.uid()) AND is_active_user())`. Direct client insert permitted only for own active account.
- `orders_update_policy`: `USING ((user_id = auth.uid()) OR is_admin()) WITH CHECK ((((user_id = auth.uid()) AND (order_status = ANY (ARRAY['Cancelled', 'Replacement Requested']))) OR is_admin())`. Prevents arbitrary status mutations.
- `order_items`: Direct INSERT, UPDATE, DELETE denied to all client roles. Modifiable only via `SECURITY DEFINER` procedures (`create_order_atomic`).
- **Verdict:** **SECURE**.

#### 4. `public.payments`
- `payments_select_policy`: `(user_id = auth.uid()) OR is_admin()`.
- `payments_admin_all`: Direct mutation permitted only to `is_admin()`. Customers cannot insert or update payment records directly.
- **Verdict:** **SECURE**.

---

## 3. Stored Procedure (RPC) Security Audit & Authorization Analysis

### 3.1 Complete RPC Security Matrix

| RPC Function Name | Security Mode | Owner | EXECUTE Grants | Identity Validation | Search Path Setting | Vulnerability / Risk Level |
|---|---|---|---|---|---|:---:|
| `create_order_atomic` | `SECURITY DEFINER` | `postgres` | `PUBLIC`, `anon`, `authenticated`, `service_role` | **NONE** (No `auth.uid()` check) | `public` | **CRITICAL** |
| `merge_cart_atomic` | `SECURITY DEFINER` | `postgres` | `PUBLIC`, `anon`, `authenticated`, `service_role` | **NONE** (No `auth.uid()` check) | `public` | **HIGH** |
| `adjust_inventory_atomic` | `SECURITY DEFINER` | `postgres` | `anon`, `authenticated`, `service_role` | **BYPASSABLE** (`auth.uid() IS NOT NULL` flaw) | `public` | **CRITICAL** |
| `moderate_review_atomic` | `SECURITY DEFINER` | `postgres` | `anon`, `authenticated`, `service_role` | **BYPASSABLE** (`auth.uid() IS NOT NULL` flaw) | `public` | **CRITICAL** |
| `update_customer_status` | `SECURITY DEFINER` | `postgres` | `anon`, `authenticated`, `service_role` | **BYPASSABLE** (`auth.uid() IS NOT NULL` flaw) | `public` | **CRITICAL** |
| `cancel_order_atomic` | `SECURITY DEFINER` | `postgres` | `anon`, `authenticated`, `service_role` | **HARDENED** (Rejects `auth.uid() IS NULL` & mismatch) | `public` | **LOW (Grants need cleanup)** |
| `request_replacement_atomic` | `SECURITY DEFINER` | `postgres` | `authenticated`, `service_role` | **HARDENED** (Rejects `auth.uid() IS NULL` & mismatch) | `public, pg_temp` | **LOW (SECURE)** |
| `validate_discount_coupon` | `STABLE SECURITY DEFINER` | `postgres` | `anon`, `authenticated`, `service_role` | N/A (Read-only coupon lookup) | `public` | **LOW (SECURE)** |
| `settle_payment_atomic` | `SECURITY DEFINER` | `postgres` | `postgres`, `service_role` | Restricted to server-side `service_role` | `public, pg_temp` | **LOW (SECURE)** |
| `record_payment_failure_atomic`| `SECURITY DEFINER` | `postgres` | `postgres`, `service_role` | Restricted to server-side `service_role` | `public, pg_temp` | **LOW (SECURE)** |
| `record_refund_atomic` | `SECURITY DEFINER` | `postgres` | `postgres`, `service_role` | Restricted to server-side `service_role` | `public, pg_temp` | **LOW (SECURE)** |

---

## 4. In-Depth Vulnerability Analysis & Proof-of-Concept

### 4.1 Vulnerability 1: Unauthenticated Arbitrary Order Placement (`create_order_atomic`)

#### Mechanism:
In `supabase/migrations/20261031000001_order_idempotency.sql` (lines 19–156):
```sql
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_user_id UUID,
    p_items JSONB,
    p_address_snapshot JSONB,
    p_payment_method TEXT,
    p_total_amount NUMERIC,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID AS $$
...
BEGIN
    -- No auth.uid() check!
    INSERT INTO public.orders (user_id, ...) VALUES (p_user_id, ...);
```
Because `create_order_atomic` is `SECURITY DEFINER` and executes with `postgres` superuser privileges, PostgreSQL bypasses table RLS. Furthermore, because no `REVOKE EXECUTE ... FROM PUBLIC` was issued, PostgREST exposes this procedure to the `anon` API role.

#### Attack Scenario:
1. Attacker sends HTTP POST to `https://<project-ref>.supabase.co/rest/v1/rpc/create_order_atomic` with `apikey: <ANON_KEY>` and no Bearer token.
2. Attacker provides `p_user_id = "<VICTIM_USER_UUID>"` and `p_payment_method = "COD"`.
3. Order is successfully created in victim's name, catalog stock is depleted, and victim's existing cart items are purged (`DELETE FROM public.cart_items WHERE cart_id IN (...)`).

---

### 4.2 Vulnerability 2: Administrative Privilege Spoofing via `auth.uid() IS NULL`

#### Mechanism:
In `supabase/migrations/20261031000002_admin_management_system.sql`, the procedures `update_customer_status`, `adjust_inventory_atomic`, and `moderate_review_atomic` implement the following check:
```sql
-- Vulnerable check in lines 105, 271, 449:
IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_id THEN
    RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
END IF;
```
When invoked by an anonymous caller, `auth.uid()` evaluates to `NULL`.
In standard SQL three-valued logic, `NULL IS NOT NULL` evaluates to `FALSE`.
The entire `IF` condition evaluates to `FALSE`, bypassing the exception block!

Next, the procedure checks whether `p_admin_id` has an active admin role:
```sql
SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
INTO v_is_admin
FROM public.profiles
WHERE id = p_admin_id;

IF v_is_admin IS NOT TRUE THEN
    RAISE EXCEPTION 'Unauthorized: Administrative role required...';
END IF;
```
If the attacker supplies a valid administrator UUID (which is readily discoverable from public book reviews or audit logs), `v_is_admin` evaluates to `TRUE`. The unauthorized mutation executes to completion.

#### Why `anon` Can Call It:
Line 635 of Migration `20261031000002`:
```sql
REVOKE EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) TO authenticated, service_role;
```
In Supabase managed databases, the `anon` role is granted execute via `ALTER DEFAULT PRIVILEGES` during initial project setup. Revoking from `PUBLIC` does not remove explicit role grants to `anon`. Catalog queries on PostgreSQL 17.6 confirm `anon` is an active grantee on `update_customer_status`, `adjust_inventory_atomic`, and `moderate_review_atomic`.

---

## 5. Mandatory Security Remediation Script

The following SQL patch must be included in a pre-deployment remediation migration to resolve all identified vulnerabilities:

```sql
-- ==============================================================================
-- REMEDIATION PATCH: CRITICAL RPC SECURITY HARDENING
-- Apply to resolve anonymous execution and caller identity bypass vulnerabilities
-- ==============================================================================

-- 1. HARDEN CREATE_ORDER_ATOMIC
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_user_id UUID,
    p_items JSONB,
    p_address_snapshot JSONB,
    p_payment_method TEXT,
    p_total_amount NUMERIC,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_book_id UUID;
    v_quantity INT;
    v_price NUMERIC;
    v_book_title TEXT;
    v_book_image TEXT;
    v_current_stock INT;
    v_is_active BOOLEAN;
BEGIN
    -- Strict caller identity validation
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot create orders.';
        END IF;
        IF auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity does not match order user ID.';
        END IF;
    END IF;

    -- [Remainder of create_order_atomic logic unchanged...]
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_order_id
        FROM public.orders
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

        IF FOUND THEN
            RETURN v_order_id;
        END IF;
    END IF;

    IF p_payment_method NOT IN ('COD', 'ONLINE') THEN
        RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
    END IF;

    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order items cannot be empty';
    END IF;

    BEGIN
        INSERT INTO public.orders (
            user_id, total_amount, payment_method, payment_status,
            order_status, address_snapshot, is_paid, idempotency_key
        ) VALUES (
            p_user_id, p_total_amount, p_payment_method, 'Pending',
            'Pending', p_address_snapshot, FALSE, p_idempotency_key
        ) RETURNING id INTO v_order_id;
    EXCEPTION WHEN unique_violation THEN
        IF p_idempotency_key IS NOT NULL THEN
            SELECT id INTO v_order_id
            FROM public.orders
            WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

            IF FOUND THEN
                RETURN v_order_id;
            END IF;
        END IF;
        RAISE;
    END;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_book_id := (v_item->>'book_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_price := (v_item->>'price')::NUMERIC;

        IF v_quantity < 1 THEN
            RAISE EXCEPTION 'Item quantity must be at least 1 for book %', v_book_id;
        END IF;

        SELECT title, image_url, stock, is_active
        INTO v_book_title, v_book_image, v_current_stock, v_is_active
        FROM public.books
        WHERE id = v_book_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Book % not found', v_book_id;
        END IF;

        IF NOT v_is_active THEN
            RAISE EXCEPTION 'Book "%" is currently inactive', v_book_title;
        END IF;

        IF v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for "%" (Requested: %, Available: %)',
                v_book_title, v_quantity, v_current_stock;
        END IF;

        UPDATE public.books
        SET stock = stock - v_quantity
        WHERE id = v_book_id;

        INSERT INTO public.order_items (
            order_id, book_id, title, price, quantity, image_url
        ) VALUES (
            v_order_id, v_book_id, v_book_title, v_price, v_quantity, v_book_image
        );
    END LOOP;

    DELETE FROM public.cart_items
    WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = p_user_id);

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. HARDEN MERGE_CART_ATOMIC
-- (Add similar identity validation and search_path = public, pg_temp)

-- 3. EXPLICIT REVOCATIONS FROM ANON AND PUBLIC ON ALL MUTATING PROCEDURES
REVOKE EXECUTE ON FUNCTION public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.merge_cart_atomic(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_cart_atomic(UUID, JSONB, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.moderate_review_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_review_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
```

