# PHASE 02 — DATABASE CHANGES & SCHEMA AUDIT
## MD Shakib Islamic Books — PostgreSQL Schema Evolution

**Migration File:** [`20261031000002_admin_management_system.sql`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/supabase/migrations/20261031000002_admin_management_system.sql)  
**TypeScript Types:** [`database.types.ts`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/types/database.types.ts)  
**Date:** 2026-10-31  

---

## 1. New Tables Created

### 1.1 `public.categories`
Stores storewide category definitions for organizing catalog titles and powering storefront navigation.

```sql
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) > 0),
    slug TEXT NOT NULL UNIQUE CHECK (char_length(trim(slug)) > 0),
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_categories_slug` on `slug`
- `idx_categories_is_active` on `is_active`
- `idx_categories_display_order` on `display_order`

**Row-Level Security (RLS):**
- `categories_select_public`: Anyone (anon & authenticated) can view active categories; admins can view all.
- `categories_admin_all`: Only authenticated users with `role = 'admin'` can insert, update, or delete.

---

### 1.2 `public.inventory_adjustments`
Immutable audit log of all stock movements (replenishment, damage write-offs, audit corrections).

```sql
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'SET')),
    quantity_change INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
    new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_inventory_adjustments_book_id` on `book_id`
- `idx_inventory_adjustments_created_at` on `created_at DESC`

**Row-Level Security (RLS):**
- `inventory_adjustments_select_admin`: Only administrators can view historical adjustments.
- Direct inserts from clients are blocked; adjustments are committed via `adjust_inventory_atomic`.

---

### 1.3 `public.reviews`
Customer product reviews, ratings, and administrative moderation states.

```sql
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
    comment TEXT NOT NULL CHECK (char_length(trim(comment)) > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
    moderated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_reviews_book_id` on `book_id`
- `idx_reviews_user_id` on `user_id`
- `idx_reviews_status` on `status`

**Row-Level Security (RLS):**
- `reviews_select_public`: Anyone can view `status = 'approved'` reviews; users can view their own reviews; admins can view all.
- `reviews_insert_authenticated`: Authenticated, active users can submit reviews for products.
- `reviews_admin_all`: Administrators have full moderation capabilities.

---

### 1.4 `public.discounts`
Promotional coupons, percentage/fixed discounts, expiration dates, and redemption thresholds.

```sql
CREATE TABLE IF NOT EXISTS public.discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (char_length(trim(code)) > 0),
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
    max_discount_amount NUMERIC(10, 2) DEFAULT NULL CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
    usage_limit INTEGER DEFAULT NULL CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes:**
- `idx_discounts_code` on `code`
- `idx_discounts_is_active` on `is_active`

---

## 2. Atomic Stored Procedures & Functions

### 2.1 `adjust_inventory_atomic`
- **Signature:** `(p_book_id UUID, p_admin_id UUID, p_type TEXT, p_quantity INTEGER, p_reason TEXT) RETURNS JSONB`
- **Security:** `SECURITY DEFINER SET search_path = public`
- **Logic:**
  1. Verifies that `p_admin_id` belongs to an active, unblocked administrator.
  2. Validates `p_quantity >= 0` and `p_reason` non-empty.
  3. Locks the book row `FOR UPDATE`.
  4. Computes `new_stock`:
     - `INCREASE`: `prev_stock + quantity`
     - `DECREASE`: `prev_stock - quantity` (rejects if `quantity > prev_stock`)
     - `SET`: `quantity`
  5. Updates `books.stock = new_stock`.
  6. Inserts into `inventory_adjustments`.
  7. Inserts into `audit_logs`.
  8. Returns `{ success, book_id, previous_stock, new_stock, quantity_change }`.

---

### 2.2 `moderate_review_atomic`
- **Signature:** `(p_review_id UUID, p_admin_id UUID, p_status TEXT) RETURNS JSONB`
- **Security:** `SECURITY DEFINER SET search_path = public`
- **Logic:**
  1. Verifies administrator authorization.
  2. Validates `p_status IN ('approved', 'rejected', 'hidden', 'pending')`.
  3. Updates `reviews` record with new status, `moderated_by = p_admin_id`, and `moderated_at = NOW()`.
  4. Records audit log with old and new status.

---

### 2.3 `validate_discount_coupon`
- **Signature:** `(p_code TEXT, p_subtotal NUMERIC) RETURNS JSONB`
- **Security:** `STABLE SECURITY DEFINER SET search_path = public`
- **Logic:**
  1. Looks up coupon by uppercase code.
  2. Validates `is_active = true`.
  3. Validates current timestamp against `valid_from` and `valid_until`.
  4. Checks `used_count < usage_limit`.
  5. Verifies `subtotal >= min_order_amount`.
  6. Calculates discount amount (percentage with optional `max_discount_amount` cap or fixed discount capped at subtotal).
  7. Returns `{ valid, discount_id, code, discount_type, discount_value, calculated_discount }`.

---

### 2.4 `update_customer_status`
- **Signature:** `(p_customer_id UUID, p_admin_id UUID, p_action TEXT) RETURNS JSONB`
- **Security:** `SECURITY DEFINER SET search_path = public`
- **Safety Invariant:** Explicitly prevents self-modification (`IF p_customer_id = p_admin_id THEN RAISE EXCEPTION`).
- **Actions:**
  - `BLOCK`: sets `is_blocked = true`
  - `UNBLOCK`: sets `is_blocked = false`
  - `SOFT_DELETE`: sets `is_deleted = true`, `deleted_at = NOW()`
  - `RESTORE`: sets `is_deleted = false`, `deleted_at = NULL`
- Records audit log entry.

---

### 2.5 Security Hardening on Existing Functions
- **`cancel_order_atomic`:** Added explicit `SET search_path = public` to prevent search path hijacking.
- **`audit_logs` constraint:** Dropped restrictive check constraint on `public.audit_logs.action` so descriptive admin actions (`ADMIN_CANCEL_ORDER`, `UPDATE_ORDER_STATUS`, `APPROVE_REPLACEMENT`, etc.) succeed without constraint violation errors.

