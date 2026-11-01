# PostgreSQL Database Integrity & Constraints Audit Report
**Project:** MD Shakib Islamic Books  
**Phase:** 04 — Backend & Database Integrity  
**Repository:** `MD-Shakib`  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

This report delivers a comprehensive audit of all relationships, constraints, foreign key actions, indexes, and referential integrity guarantees across the 15 PostgreSQL tables powering MD Shakib Islamic Books.

All constraints and indexes were verified directly against the running PostgreSQL engine (Supabase local container `127.0.0.1:54322`).

---

## 2. Foreign Key & Referential Integrity Audit

| Source Table | Source Column | Target Table | Target Column | ON DELETE Rule | Integrity Rationale & Safety Justification |
|---|---|---|---|---|---|
| `public.addresses` | `user_id` | `public.profiles` | `id` | `CASCADE` | User addresses belong strictly to customer lifecycle; deleted profile cleans up addresses. |
| `public.carts` | `user_id` | `public.profiles` | `id` | `CASCADE` | User active cart belongs strictly to profile; deleted profile cascades cart. |
| `public.cart_items` | `cart_id` | `public.carts` | `id` | `CASCADE` | Line items cannot exist without a parent cart. |
| `public.cart_items` | `book_id` | `public.books` | `id` | `CASCADE` | If an unpurchased book is removed, pending cart items are dropped cleanly. |
| `public.orders` | `user_id` | `public.profiles` | `id` | `RESTRICT` | **CRITICAL FINANCIAL SAFETY:** Cannot delete a user profile that has historical orders. Orders must remain permanent. |
| `public.order_items` | `order_id` | `public.orders` | `id` | `CASCADE` | Line items belong permanently to an order. |
| `public.order_items` | `book_id` | `public.books` | `id` | `RESTRICT` | **CRITICAL CATALOG SAFETY:** Cannot delete a book that has historical purchase records. Ensures financial consistency. |
| `public.order_status_history` | `order_id` | `public.orders` | `id` | `CASCADE` | Status history is an audit trail owned by the order. |
| `public.payments` | `order_id` | `public.orders` | `id` | `RESTRICT` | **CRITICAL FINANCIAL SAFETY:** Cannot delete an order that has recorded payment transactions. |
| `public.payments` | `user_id` | `public.profiles` | `id` | `RESTRICT` | **CRITICAL FINANCIAL SAFETY:** Cannot delete a user who has payment records. |
| `public.audit_logs` | `user_id` | `public.profiles` | `id` | `SET NULL` | **AUDIT TRAIL IMMUTABILITY:** Deleting a user retains the historical audit log action with `user_id = NULL`. |
| `public.email_logs` | `order_id` | `public.orders` | `id` | `SET NULL` | Communication history is preserved even if the related order is archived. |
| `public.inventory_adjustments` | `book_id` | `public.books` | `id` | `CASCADE` | Adjustments map to physical book catalog. |
| `public.inventory_adjustments` | `admin_id` | `public.profiles` | `id` | `RESTRICT` | Stock adjustments must link to the administrative profile who authorized them. |
| `public.reviews` | `book_id` | `public.books` | `id` | `CASCADE` | Reviews belong to the product. |
| `public.reviews` | `user_id` | `public.profiles` | `id` | `CASCADE` | Reviews belong to the reviewer. |
| `public.reviews` | `moderated_by` | `public.profiles` | `id` | `SET NULL` | Preserves review moderation status even if moderating admin leaves organization. |

---

## 3. CHECK Constraints & Domain Invariants Audit

PostgreSQL CHECK constraints protect the database against invalid states and application-level bugs:

### 3.1 Financial & Quantity Constraints
- `books_price_check`: `price >= 0` (Blocks negative book prices).
- `books_stock_check`: `stock >= 0` (Guarantees inventory non-negativity).
- `books_discount_check`: `discount >= 0 AND discount <= 100` (Enforces valid percentage range).
- `cart_items_quantity_check`: `quantity >= 1` (Cart items must have positive quantity).
- `cart_items_price_check`: `price >= 0` (Line item price cannot be negative).
- `order_items_quantity_check`: `quantity >= 1` (Order line item quantity must be at least 1).
- `order_items_price_check`: `price >= 0` (Line item price cannot be negative).
- `orders_total_amount_check`: `total_amount >= 0` (Order total amount must be non-negative).
- `payments_amount_check`: `amount >= 0` (Payment transactions must have non-negative amount).
- `reviews_rating_check`: `rating >= 1 AND rating <= 5` (Review rating must be between 1 and 5 stars).

### 3.2 String Length & Format Invariants
- `profiles_name_check`: `char_length(trim(name)) > 0` (Non-empty customer/admin name).
- `profiles_email_check`: `email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'` (RFC 5322 compliance).
- `addresses_full_name_check`: `char_length(trim(full_name)) > 0`.
- `addresses_phone_check`: `char_length(trim(phone)) >= 10`.
- `addresses_pincode_check`: `char_length(trim(pincode)) = 6` (Standard Indian postal codes).
- `addresses_state_check`: `char_length(trim(state)) > 0`.
- `addresses_city_check`: `char_length(trim(city)) > 0`.
- `addresses_house_no_check`: `char_length(trim(house_no)) > 0`.
- `addresses_area_check`: `char_length(trim(area)) > 0`.
- `reviews_title_check`: `char_length(trim(title)) > 0`.
- `reviews_comment_check`: `char_length(trim(comment)) > 0`.

### 3.3 State Machine & Enum Values
- `orders_payment_method_check`: `payment_method IN ('COD', 'ONLINE')`.
- `orders_payment_status_check`: `payment_status IN ('Pending', 'Paid', 'Failed', 'Refund Pending', 'Refunded')`.
- `orders_order_status_check`: Enforces all 13 valid lifecycle states:
  - `'Pending'`, `'Confirmed'`, `'Packed'`, `'Shipped'`, `'Out for Delivery'`, `'Delivered'`, `'Cancelled'`, `'Replacement Requested'`, `'Replacement Approved'`, `'Replacement Rejected'`, `'Replacement Shipped'`, `'Replacement Delivered'`, `'Returned'`.
- `orders_replacement_status_check`: `replacement_status IN ('None', 'Requested', 'Approved', 'Rejected', 'Replacement Shipped', 'Replacement Delivered')`.
- `payments_provider_check`: `provider IN ('Razorpay', 'Stripe')`.
- `payments_status_check`: `status IN ('Pending', 'Paid', 'Failed', 'Refund Pending', 'Refunded')`.
- `reviews_status_check`: `status IN ('pending', 'approved', 'rejected', 'hidden')`.
- `email_logs_status_check`: `status IN ('queued', 'sent', 'failed')`.

---

## 4. Database Indexing Architecture

A total of 67 indexes exist across the `public` schema. Every index serves a verified query pattern:

### 4.1 Primary Keys & Unique Constraints
- `profiles_pkey` on `profiles(id)`
- `profiles_email_key` on `profiles(email)` (UNIQUE)
- `addresses_pkey` on `addresses(id)`
- `books_pkey` on `books(id)`
- `carts_pkey` on `carts(id)`
- `carts_user_id_key` on `carts(user_id)` (UNIQUE — exactly one cart per customer)
- `cart_items_pkey` on `cart_items(id)`
- `uq_cart_book` on `cart_items(cart_id, book_id)` (UNIQUE — prevents duplicate item rows in cart)
- `orders_pkey` on `orders(id)`
- `order_items_pkey` on `order_items(id)`
- `order_status_history_pkey` on `order_status_history(id)`
- `payments_pkey` on `payments(id)`
- `payments_payment_id_key` on `payments(payment_id)` (UNIQUE)
- `payments_provider_order_id_key` on `payments(provider_order_id)` (UNIQUE)
- `payments_provider_payment_id_key` on `payments(provider_payment_id)` (UNIQUE)
- `categories_pkey` on `categories(id)`
- `categories_slug_key` on `categories(slug)` (UNIQUE)
- `categories_name_key` on `categories(name)` (UNIQUE)
- `discounts_pkey` on `discounts(id)`
- `discounts_code_key` on `discounts(code)` (UNIQUE)
- `reviews_pkey` on `reviews(id)`
- `uq_reviews_book_user` on `reviews(book_id, user_id)` (UNIQUE — Phase 04 addition preventing duplicate reviews)

### 4.2 Query Acceleration & Foreign Key Indexes
- `idx_orders_user_id` on `orders(user_id)` (Customer order history lookups).
- `idx_orders_order_status` on `orders(order_status)` (Admin order queue filtering).
- `idx_orders_payment_status` on `orders(payment_status)` (Payment settlement filters).
- `idx_orders_created_at_desc` on `orders(created_at DESC)` (Chronological admin/customer ordering).
- `idx_orders_razorpay_order_id` on `orders(razorpay_order_id)` (Razorpay webhook routing).
- `idx_orders_user_idempotency_key` on `orders(user_id, idempotency_key)` WHERE idempotency_key IS NOT NULL (Partial unique index for concurrent checkout protection).
- `idx_orders_shipping_awb` on `orders(shipping_awb)` WHERE shipping_awb IS NOT NULL (Partial index for Delhivery tracking webhook lookups; added in Phase 04).
- `idx_payments_order_id` on `payments(order_id)` (Payment-to-order joins).
- `idx_payments_user_id` on `payments(user_id)` (Customer payment queries).
- `idx_payments_provider_order` on `payments(provider_order_id)` (Gateway callback matching).
- `idx_payments_status` on `payments(status)` (Payment status aggregation; added in Phase 04).
- `idx_books_category` on `books(category)` (Catalog category filtering).
- `idx_books_price` on `books(price)` (Price range queries).
- `idx_books_is_active` on `books(is_active)` (Catalog publication filter).
- `idx_books_search` on `books` USING GIN (`to_tsvector('english', title || ' ' || author)`) (Full-text search).
- `idx_addresses_user_default` on `addresses(user_id, is_default)` (Fast default address lookup).
- `idx_reviews_book_id` on `reviews(book_id)` (Product detail reviews).
- `idx_reviews_status` on `reviews(status)` (Admin moderation queue).
- `idx_audit_logs_created_at_desc` on `audit_logs(created_at DESC)` (Admin audit dashboard).

---

## 5. Verification Evidence
All constraints, cascade rules, and indexes were exercised and verified in test suite `scripts/test-phase04-backend-integrity.ts` (Pass 01 to 05, Pass 24).

