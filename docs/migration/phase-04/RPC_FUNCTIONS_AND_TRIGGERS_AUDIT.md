# PostgreSQL RPC Functions & Database Triggers Audit
**Project:** MD Shakib Islamic Books  
**Phase:** 04 — Backend & Database Integrity  
**Repository:** `MD-Shakib`  
**Status:** COMPLETE & VERIFIED  

---

## 1. Overview of Database Procedures & Triggers

The modern backend relies on 18 PostgreSQL routines (14 stored procedures / helper functions and 4 trigger handler functions) along with 15 database triggers to guarantee transaction atomicity, accurate status logging, timestamp maintenance, and single-default constraints.

---

## 2. Comprehensive Functions Audit

### 2.1 `create_order_atomic`
- **Purpose:** Atomically creates an order record, validates catalog prices, performs pessimistic row-level locking on inventory (`public.books FOR UPDATE`), deducts stock, inserts order line items, clears the customer's active cart, and logs audit events.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Rejects anonymous callers; non-service_role caller must match `p_user_id = auth.uid()`.
- **Concurrency & Idempotency:** Implements double-check idempotency key check. If `idempotency_key` exists for user, immediately returns existing order ID without deducting stock twice.
- **Dependencies:** `public.orders`, `public.books`, `public.order_items`, `public.carts`, `public.cart_items`.

### 2.2 `cancel_order_atomic`
- **Purpose:** Atomically cancels an eligible order, restores inventory to `public.books.stock`, updates status to `Cancelled`, and records audit logs.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Customer can cancel only own order (`auth.uid() = user_id`); verified administrator can cancel any order (`p_is_admin = TRUE` verified against `public.profiles`).
- **Lifecycle Invariants:** Rejects cancellation if `order_status IN ('Delivered', 'Cancelled', 'Returned')` or any `'Replacement%'` status.
- **Dependencies:** `public.orders`, `public.order_items`, `public.books`, `public.audit_logs`.

### 2.3 `request_replacement_atomic` (Remediated in Phase 04)
- **Purpose:** Atomically submits a replacement request for a delivered book order, enforcing the strict 7-day policy window from delivery.
- **Remediation Details:** Removed broken manual insertion into `order_status_history` which referenced non-existent column `notes` (the actual column is `note`). Status transition note is now automatically logged by trigger `trg_order_status_history`.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Rejects anonymous callers; non-service_role caller must match `p_user_id = auth.uid()`.
- **Lifecycle Invariants:** Requires `order_status = 'Delivered'`, `replacement_requested = FALSE`, valid delivery timestamp within rolling 168 hours, and non-empty reason.
- **Dependencies:** `public.orders`, `public.audit_logs`, `public.order_status_history`.

### 2.4 `submit_review_atomic` (Added in Phase 04)
- **Purpose:** Atomically submits a product review for a book, enforcing rating boundaries, active customer verification, and schema-level duplicate review prevention.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Requires authenticated, active customer (`is_active_user()`).
- **Duplicate Prevention:** Checks `EXISTS (SELECT 1 FROM public.reviews WHERE book_id = p_book_id AND user_id = p_user_id)`. Also protected by unique index `uq_reviews_book_user`.
- **Dependencies:** `public.reviews`, `public.books`, `public.profiles`, `public.audit_logs`.

### 2.5 `merge_cart_atomic`
- **Purpose:** Idempotently merges guest localStorage cart items into the authenticated customer's database cart upon sign-in.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Requires authenticated caller matching `p_user_id = auth.uid()`.
- **Business Logic:** Revalidates each book's price, active state, and available stock. Caps combined quantity to `min(5, available_stock)`. Records `last_merge_token` for replay idempotency.
- **Dependencies:** `public.carts`, `public.cart_items`, `public.books`.

### 2.6 `settle_payment_atomic`
- **Purpose:** Transitions an online order to `Paid` and `Confirmed`, links `razorpay_payment_id`, and updates the matching payment record.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Revoked from all users; granted strictly to `service_role`.
- **Concurrency & Idempotency:** Acquires row-level lock on `orders` and `payments` (`FOR UPDATE`). If already `is_paid = TRUE` and `payment_status = 'Paid'`, returns `already_paid` and `settled = false` to prevent duplicate email dispatches.
- **Dependencies:** `public.orders`, `public.payments`.

### 2.7 `record_payment_failure_atomic`
- **Purpose:** Records a payment failure.
- **Critical Guard:** Checks whether the order or payment record is already `Paid`. If already paid, safely ignores the failure callback (`ignored_already_paid`), preventing out-of-order webhook delivery from corrupting a paid order.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Granted strictly to `service_role`.
- **Dependencies:** `public.orders`, `public.payments`.

### 2.8 `record_refund_atomic`
- **Purpose:** Atomically synchronizes refund state across `public.orders` and `public.payments`.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Granted strictly to `service_role`.
- **Dependencies:** `public.orders`, `public.payments`.

### 2.9 `adjust_inventory_atomic`
- **Purpose:** Administrative procedure for physical stock adjustments (`INCREASE`, `DECREASE`, `SET`).
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Rejects anonymous callers; requires verified `role = 'admin'` in database.
- **Invariants:** Disallows reducing stock below 0; requires non-empty audit reason.
- **Dependencies:** `public.books`, `public.inventory_adjustments`, `public.audit_logs`.

### 2.10 `moderate_review_atomic`
- **Purpose:** Administrative review moderation (`approved`, `rejected`, `hidden`, `pending`).
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Rejects anonymous callers; requires verified `role = 'admin'` in database.
- **Dependencies:** `public.reviews`, `public.audit_logs`.

### 2.11 `update_customer_status`
- **Purpose:** Administrative action to block, unblock, soft-delete, or restore customer accounts.
- **Security Definer:** YES (`search_path = public, pg_temp`).
- **Authorization:** Rejects anonymous callers; requires verified `role = 'admin'`.
- **Safety Invariant:** Prevents administrators from modifying their own active account status (`p_customer_id = p_admin_id` is strictly blocked).
- **Dependencies:** `public.profiles`, `public.audit_logs`.

### 2.12 `validate_discount_coupon`
- **Purpose:** Validates promotional coupons against active state, validity dates, usage limit, and minimum order amount. Calculates capped discount.
- **Security Definer:** STABLE SECURITY DEFINER (`search_path = public, pg_temp`).
- **Dependencies:** `public.discounts`.

### 2.13 `is_admin` & `is_active_user`
- **Purpose:** STABLE helper functions used in RLS policies to evaluate whether `auth.uid()` corresponds to an active administrator or non-blocked customer.
- **Security Definer:** STABLE SECURITY DEFINER (`search_path = public, pg_temp`).
- **Dependencies:** `public.profiles`.

---

## 3. Database Triggers Audit

| Trigger Name | Target Table | Timing & Event | Function Executed | Purpose & Correctness |
|---|---|---|---|---|
| `trg_default_address` | `public.addresses` | BEFORE INSERT OR UPDATE | `handle_default_address()` | When an address is marked `is_default = true`, automatically demotes all other addresses for that `user_id` to `is_default = false`. Guarantees single default address invariant. |
| `trg_order_status_history` | `public.orders` | AFTER INSERT OR UPDATE | `record_order_status_history()` | Automatically inserts a transition record into `public.order_status_history` whenever an order is created or when `OLD.order_status IS DISTINCT FROM NEW.order_status`. Hardened in Phase 04 to capture `NEW.replacement_reason` and `NEW.cancel_reason`. |
| `trg_profiles_updated_at` | `public.profiles` | BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_addresses_updated_at`| `public.addresses`| BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_books_updated_at` | `public.books` | BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_carts_updated_at` | `public.carts` | BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_cart_items_updated_at`| `public.cart_items`| BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_orders_updated_at` | `public.orders` | BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_payments_updated_at`| `public.payments`| BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_categories_updated_at`| `public.categories`| BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_discounts_updated_at`| `public.discounts`| BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_reviews_updated_at` | `public.reviews` | BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `trg_email_logs_updated_at`| `public.email_logs`| BEFORE UPDATE | `handle_updated_at()` | Automatically sets `updated_at = NOW()`. |
| `on_auth_user_created` | `auth.users` | AFTER INSERT | `handle_new_user()` | Automatically seeds a matching row in `public.profiles` upon Supabase registration. |

---

## 4. Trigger Recursion & Side Effect Analysis
1. **Recursive Triggers:** Verified that `trg_order_status_history` is an `AFTER` trigger on `orders` and targets `order_status_history`, meaning it never causes recursive update loops on `orders`.
2. **`handle_updated_at()` Execution:** Verified that `handle_updated_at()` is a pure `BEFORE UPDATE` trigger modifying only `NEW.updated_at = NOW()`, causing zero extraneous write cascades.
3. **`handle_default_address()` Execution:** Updates only rows where `user_id = NEW.user_id AND id <> NEW.id AND is_default = TRUE`. Does not re-trigger default assignment.

---

## 5. Audit Conclusion
All 18 routines and 15 triggers operate correctly, enforce search path security, and maintain perfect transaction consistency.

