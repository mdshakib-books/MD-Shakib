# MongoDB Legacy Models vs PostgreSQL Schema Mapping
**Project:** MD Shakib Islamic Books  
**Phase:** 04 — Backend & Database Integrity  
**Repository:** `MD-Shakib`  
**Status:** COMPLETE & VERIFIED  

---

## 1. Overview & Data Migration Strategy

This document provides a field-level mapping between the legacy MongoDB Mongoose models (`server/src/models/`) and the modern Supabase PostgreSQL relational schema (`supabase/migrations/`).

The legacy application utilized document-oriented schemas with embedded arrays and snapshots. In PostgreSQL, these structures were normalized into strictly typed relational tables with foreign keys, check constraints, default expressions, triggers, and JSONB snapshots where immutability is required (e.g. delivery address snapshots).

---

## 2. Entity Mapping Matrix

### 2.1 User / Profile (`User` -> `auth.users` + `public.profiles`)
- **MongoDB Collection:** `users`
- **PostgreSQL Equivalent:** `auth.users` (Supabase Managed Auth) & `public.profiles` (Application Extension)

| Legacy Field | MongoDB Type | PostgreSQL Table | PostgreSQL Column | Conversion Rule | Status |
|---|---|---|---|---|---|
| `_id` | ObjectId | `public.profiles` | `id` | Map ObjectId to UUID (or link to `auth.users.id`) | MIGRATED |
| `name` | String (req, trim) | `public.profiles` | `name` | Direct string map; `CHECK (char_length(trim(name)) > 0)` | MIGRATED |
| `email` | String (req, unique, lower, trim) | `public.profiles` | `email` | Lowercased, UNIQUE constraint, RFC 5322 regex check | MIGRATED |
| `password` | String (bcrypt) | `auth.users` | `encrypted_password` | Managed via Supabase GoTrue Auth engine | MIGRATED |
| `role` | String ('user', 'admin') | `public.profiles` | `role` | `CHECK (role IN ('user', 'admin'))`, default 'user' | MIGRATED |
| `phone` | String (trim) | `public.profiles` | `phone` | TEXT nullable | MIGRATED |
| `isBlocked` | Boolean (default: false) | `public.profiles` | `is_blocked` | BOOLEAN NOT NULL DEFAULT FALSE | MIGRATED |
| `isDeleted` | Boolean (default: false) | `public.profiles` | `is_deleted` | BOOLEAN NOT NULL DEFAULT FALSE | MIGRATED |
| `deletedAt` | Date (default: null) | `public.profiles` | `deleted_at` | TIMESTAMPTZ DEFAULT NULL | MIGRATED |
| `resetOtp` | Number | N/A | N/A | Superseded by Supabase Auth password recovery tokens | DEPRECATED (BY DESIGN) |
| `otpExpires` | Date | N/A | N/A | Superseded by Supabase Auth token expiration | DEPRECATED (BY DESIGN) |
| `isOtpVerified` | Boolean | N/A | N/A | Superseded by Supabase Auth email confirmation state | DEPRECATED (BY DESIGN) |
| `createdAt` | Date | `public.profiles` | `created_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |
| `updatedAt` | Date | `public.profiles` | `updated_at` | TIMESTAMPTZ updated via `trg_profiles_updated_at` | MIGRATED |

---

### 2.2 Book Catalog (`Book` -> `public.books` & `public.categories`)
- **MongoDB Collection:** `books`
- **PostgreSQL Equivalent:** `public.books` & `public.categories`

| Legacy Field | MongoDB Type | PostgreSQL Table | PostgreSQL Column | Conversion Rule | Status |
|---|---|---|---|---|---|
| `_id` | ObjectId | `public.books` | `id` | Map ObjectId to UUID | MIGRATED |
| `title` | String (req, trim) | `public.books` | `title` | TEXT NOT NULL; `CHECK (char_length(trim(title)) > 0)` | MIGRATED |
| `author` | String (req, trim) | `public.books` | `author` | TEXT NOT NULL; `CHECK (char_length(trim(author)) > 0)` | MIGRATED |
| `description` | String (req, trim) | `public.books` | `description` | TEXT NOT NULL DEFAULT '' | MIGRATED |
| `price` | Number (req, min: 0) | `public.books` | `price` | NUMERIC(10, 2) NOT NULL; `CHECK (price >= 0)` | MIGRATED |
| `stock` | Number (req, min: 0) | `public.books` | `stock` | INTEGER NOT NULL DEFAULT 0; `CHECK (stock >= 0)` | MIGRATED |
| `discount` | Number (0..100) | `public.books` | `discount` | INTEGER NOT NULL DEFAULT 0; `CHECK (discount >= 0 AND discount <= 100)` | MIGRATED |
| `category` | String (enum) | `public.books` | `category` | TEXT NOT NULL (Enum values + dynamic category support) | MIGRATED |
| `language` | String (nullable) | `public.books` | `language` | TEXT DEFAULT NULL | MIGRATED |
| `pages` | Number (min: 1) | `public.books` | `pages` | INTEGER DEFAULT NULL; `CHECK (pages IS NULL OR pages > 0)` | MIGRATED |
| `publisher` | String (nullable) | `public.books` | `publisher` | TEXT DEFAULT NULL | MIGRATED |
| `publishedDate`| Date (nullable) | `public.books` | `published_date` | DATE DEFAULT NULL | MIGRATED |
| `imageUrl` | String (req) | `public.books` | `image_url` | TEXT NOT NULL (Primary image URL) | MIGRATED |
| `images` | [String] | `public.books` | `images` | TEXT[] NOT NULL DEFAULT '{}' | MIGRATED |
| `coverImage` | String | `public.books` | `cover_image` | TEXT NOT NULL DEFAULT '' | MIGRATED |
| `isActive` | Boolean (default: true) | `public.books` | `is_active` | BOOLEAN NOT NULL DEFAULT TRUE | MIGRATED |
| `createdAt` | Date | `public.books` | `created_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |
| `updatedAt` | Date | `public.books` | `updated_at` | TIMESTAMPTZ updated via `trg_books_updated_at` | MIGRATED |

---

### 2.3 Address (`Address` -> `public.addresses`)
- **MongoDB Collection:** `addresses`
- **PostgreSQL Equivalent:** `public.addresses`

| Legacy Field | MongoDB Type | PostgreSQL Table | PostgreSQL Column | Conversion Rule | Status |
|---|---|---|---|---|---|
| `_id` | ObjectId | `public.addresses` | `id` | Map ObjectId to UUID | MIGRATED |
| `userId` | ObjectId (ref: User) | `public.addresses` | `user_id` | UUID NOT NULL REFERENCES `public.profiles(id)` ON DELETE CASCADE | MIGRATED |
| `fullName` | String (req) | `public.addresses` | `full_name` | TEXT NOT NULL; `CHECK (char_length(trim(full_name)) > 0)` | MIGRATED |
| `phone` | String (req) | `public.addresses` | `phone` | TEXT NOT NULL; `CHECK (char_length(trim(phone)) >= 10)` | MIGRATED |
| `pincode` | String (req) | `public.addresses` | `pincode` | TEXT NOT NULL; `CHECK (char_length(trim(pincode)) = 6)` | MIGRATED |
| `state` | String (req) | `public.addresses` | `state` | TEXT NOT NULL; `CHECK (char_length(trim(state)) > 0)` | MIGRATED |
| `city` | String (req) | `public.addresses` | `city` | TEXT NOT NULL; `CHECK (char_length(trim(city)) > 0)` | MIGRATED |
| `houseNo` | String (req) | `public.addresses` | `house_no` | TEXT NOT NULL; `CHECK (char_length(trim(house_no)) > 0)` | MIGRATED |
| `area` | String (req) | `public.addresses` | `area` | TEXT NOT NULL; `CHECK (char_length(trim(area)) > 0)` | MIGRATED |
| `landmark` | String (optional) | `public.addresses` | `landmark` | TEXT DEFAULT NULL | MIGRATED |
| `addressType`| String ('Home','Office','Other') | `public.addresses` | `address_type` | `CHECK (address_type IN ('Home', 'Office', 'Other'))` | MIGRATED |
| `isDefault` | Boolean (default: false) | `public.addresses` | `is_default` | Enforced exact-single-default via trigger `trg_default_address` | MIGRATED |
| `createdAt` | Date | `public.addresses` | `created_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |
| `updatedAt` | Date | `public.addresses` | `updated_at` | TIMESTAMPTZ updated via trigger | MIGRATED |

---

### 2.4 Cart & Cart Items (`Cart` -> `public.carts` + `public.cart_items`)
- **MongoDB Collection:** `carts`
- **PostgreSQL Equivalent:** Normalized into `public.carts` and `public.cart_items`

| Legacy Field | MongoDB Type | PostgreSQL Table | PostgreSQL Column | Conversion Rule | Status |
|---|---|---|---|---|---|
| `_id` | ObjectId | `public.carts` | `id` | Map ObjectId to UUID | MIGRATED |
| `userId` | ObjectId (unique, ref: User) | `public.carts` | `user_id` | UUID UNIQUE REFERENCES `public.profiles(id)` ON DELETE CASCADE | MIGRATED |
| `items[].bookId` | ObjectId (ref: Book) | `public.cart_items` | `book_id` | UUID NOT NULL REFERENCES `public.books(id)` ON DELETE CASCADE | MIGRATED |
| `items[].quantity` | Number (min: 1) | `public.cart_items` | `quantity` | INTEGER NOT NULL; `CHECK (quantity >= 1)` | MIGRATED |
| `items[].price` | Number (min: 0) | `public.cart_items` | `price` | NUMERIC(10, 2) NOT NULL; `CHECK (price >= 0)` | MIGRATED |
| N/A | N/A | `public.cart_items` | `uq_cart_book` | UNIQUE constraint on `(cart_id, book_id)` | ENHANCED |
| N/A | N/A | `public.carts` | `last_merge_token` | TEXT for idempotent guest cart merges | ENHANCED |
| `createdAt` | Date | `public.carts` | `created_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |
| `updatedAt` | Date | `public.carts` | `updated_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |

---

### 2.5 Orders & Order Items (`Order` -> `public.orders` + `public.order_items` + `public.order_status_history`)
- **MongoDB Collection:** `orders`
- **PostgreSQL Equivalent:** `public.orders`, `public.order_items`, `public.order_status_history`

| Legacy Field | MongoDB Type | PostgreSQL Table | PostgreSQL Column | Conversion Rule | Status |
|---|---|---|---|---|---|
| `_id` | ObjectId | `public.orders` | `id` | Map ObjectId to UUID | MIGRATED |
| `userId` | ObjectId (ref: User) | `public.orders` | `user_id` | UUID NOT NULL REFERENCES `public.profiles(id)` ON DELETE RESTRICT | MIGRATED |
| `items` | Array of objects | `public.order_items` | Line item rows | Normalized into relational rows referencing `order_id` | MIGRATED |
| `items[].bookId` | ObjectId | `public.order_items` | `book_id` | UUID REFERENCES `public.books(id)` ON DELETE RESTRICT | MIGRATED |
| `items[].title` | String | `public.order_items` | `title` | TEXT NOT NULL | MIGRATED |
| `items[].price` | Number | `public.order_items` | `price` | NUMERIC(10, 2) NOT NULL | MIGRATED |
| `items[].quantity`| Number | `public.order_items` | `quantity` | INTEGER NOT NULL; `CHECK (quantity >= 1)` | MIGRATED |
| `items[].imageUrl`| String | `public.order_items` | `image_url` | TEXT NOT NULL | MIGRATED |
| `address` | Subdocument | `public.orders` | `address_snapshot` | JSONB NOT NULL (Immutable address state at purchase) | MIGRATED |
| `totalAmount` | Number (min: 0) | `public.orders` | `total_amount` | NUMERIC(10, 2) NOT NULL; `CHECK (total_amount >= 0)` | MIGRATED |
| `paymentMethod`| String ('COD', 'ONLINE') | `public.orders` | `payment_method` | `CHECK (payment_method IN ('COD', 'ONLINE'))` | MIGRATED |
| `paymentStatus`| String | `public.orders` | `payment_status` | `CHECK (payment_status IN ('Pending','Paid','Failed','Refund Pending','Refunded'))` | MIGRATED |
| `orderStatus` | String | `public.orders` | `order_status` | Validated by CHECK constraint across all 13 valid states | MIGRATED |
| `statusHistory` | Array of subdocuments | `public.order_status_history` | History rows | Normalized table populated automatically by database trigger | MIGRATED |
| `shipping.courier` | String | `public.orders` | `shipping_courier` | TEXT NOT NULL DEFAULT 'Delhivery' | MIGRATED |
| `shipping.awb` | String | `public.orders` | `shipping_awb` | TEXT (Indexed via partial index `idx_orders_shipping_awb`) | MIGRATED |
| `shipping.trackingUrl` | String | `public.orders` | `shipping_tracking_url` | TEXT | MIGRATED |
| `shipping.pickupScheduled` | Boolean | `public.orders` | `shipping_pickup_scheduled` | BOOLEAN NOT NULL DEFAULT FALSE | MIGRATED |
| `shipping.shippedAt` | Date | `public.orders` | `shipping_shipped_at` | TIMESTAMPTZ | MIGRATED |
| `shipping.deliveredAt` | Date | `public.orders` | `shipping_delivered_at` | TIMESTAMPTZ | MIGRATED |
| `replacement.requested` | Boolean | `public.orders` | `replacement_requested` | BOOLEAN NOT NULL DEFAULT FALSE | MIGRATED |
| `replacement.status` | String | `public.orders` | `replacement_status` | `CHECK (replacement_status IN ('None','Requested','Approved','Rejected','Replacement Shipped','Replacement Delivered'))` | MIGRATED |
| `replacement.reason` | String | `public.orders` | `replacement_reason` | TEXT | MIGRATED |
| `cancelReason` | String | `public.orders` | `cancel_reason` | TEXT DEFAULT '' | MIGRATED |
| `isPaid` | Boolean | `public.orders` | `is_paid` | BOOLEAN NOT NULL DEFAULT FALSE | MIGRATED |
| `paidAt` | Date | `public.orders` | `paid_at` | TIMESTAMPTZ | MIGRATED |
| `deliveredAt` | Date | `public.orders` | `delivered_at` | TIMESTAMPTZ | MIGRATED |
| `razorpayOrderId` | String | `public.orders` | `razorpay_order_id` | TEXT (Indexed for webhook routing) | MIGRATED |
| `razorpayPaymentId` | String | `public.orders` | `razorpay_payment_id` | TEXT | MIGRATED |
| N/A | N/A | `public.orders` | `idempotency_key` | TEXT (Indexed with unique partial index on `(user_id, idempotency_key)`) | ENHANCED |
| `createdAt` | Date | `public.orders` | `created_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |
| `updatedAt` | Date | `public.orders` | `updated_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |

---

### 2.6 Payments (`Payment` -> `public.payments`)
- **MongoDB Collection:** `payments`
- **PostgreSQL Equivalent:** `public.payments`

| Legacy Field | MongoDB Type | PostgreSQL Table | PostgreSQL Column | Conversion Rule | Status |
|---|---|---|---|---|---|
| `_id` | ObjectId | `public.payments` | `id` | Map ObjectId to UUID | MIGRATED |
| `orderId` | ObjectId (ref: Order) | `public.payments` | `order_id` | UUID REFERENCES `public.orders(id)` ON DELETE RESTRICT | MIGRATED |
| `userId` | ObjectId (ref: User) | `public.payments` | `user_id` | UUID REFERENCES `public.profiles(id)` ON DELETE RESTRICT | MIGRATED |
| `paymentId` | String (unique) | `public.payments` | `payment_id` | TEXT UNIQUE NOT NULL | MIGRATED |
| `providerOrderId` | String (unique) | `public.payments` | `provider_order_id` | TEXT UNIQUE NOT NULL | MIGRATED |
| `providerPaymentId` | String (unique, sparse) | `public.payments` | `provider_payment_id` | TEXT UNIQUE | MIGRATED |
| `signature` | String | `public.payments` | `signature` | TEXT DEFAULT '' | MIGRATED |
| `amount` | Number (min: 0) | `public.payments` | `amount` | NUMERIC(10, 2) NOT NULL; `CHECK (amount >= 0)` | MIGRATED |
| `currency` | String (default: 'INR') | `public.payments` | `currency` | TEXT NOT NULL DEFAULT 'INR' | MIGRATED |
| `status` | String | `public.payments` | `status` | `CHECK (status IN ('Pending','Paid','Failed','Refund Pending','Refunded'))` | MIGRATED |
| `provider` | String ('Razorpay') | `public.payments` | `provider` | `CHECK (provider IN ('Razorpay', 'Stripe'))` | MIGRATED |
| `raw_response` | N/A | `public.payments` | `raw_response` | JSONB DEFAULT '{}'::jsonb | ENHANCED |
| `createdAt` | Date | `public.payments` | `created_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |
| `updatedAt` | Date | `public.payments` | `updated_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |

---

### 2.7 Audit Logs (`AuditLog` -> `public.audit_logs`)
- **MongoDB Collection:** `auditlogs`
- **PostgreSQL Equivalent:** `public.audit_logs`

| Legacy Field | MongoDB Type | PostgreSQL Table | PostgreSQL Column | Conversion Rule | Status |
|---|---|---|---|---|---|
| `_id` | ObjectId | `public.audit_logs` | `id` | Map ObjectId to UUID | MIGRATED |
| `userId` | ObjectId (ref: User) | `public.audit_logs` | `user_id` | UUID REFERENCES `public.profiles(id)` ON DELETE SET NULL | MIGRATED |
| `action` | String (enum) | `public.audit_logs` | `action` | TEXT NOT NULL (Dynamic action tagging across admin and customer operations) | MIGRATED |
| `modelName` | String | `public.audit_logs` | `model_name` | TEXT NOT NULL | MIGRATED |
| `modelId` | String / ObjectId | `public.audit_logs` | `model_id` | TEXT | MIGRATED |
| `changes` | Object | `public.audit_logs` | `changes` | JSONB NOT NULL DEFAULT '{}'::jsonb | MIGRATED |
| `oldValues` | Object | `public.audit_logs` | `old_values` | JSONB NOT NULL DEFAULT '{}'::jsonb | MIGRATED |
| `newValues` | Object | `public.audit_logs` | `new_values` | JSONB NOT NULL DEFAULT '{}'::jsonb | MIGRATED |
| `ipAddress` | String | `public.audit_logs` | `ip_address` | TEXT | MIGRATED |
| `userAgent` | String | `public.audit_logs` | `user_agent` | TEXT | MIGRATED |
| `createdAt` | Date | `public.audit_logs` | `created_at` | TIMESTAMPTZ NOT NULL DEFAULT NOW() | MIGRATED |

---

### 2.8 Email Logs (`EmailLog` -> `public.email_logs`)
- **MongoDB Collection:** `emaillogs`
- **PostgreSQL Equivalent:** `public.email_logs`

| Legacy Field | MongoDB Type | PostgreSQL Table | PostgreSQL Column | Conversion Rule | Status |
|---|---|---|---|---|---|
| `_id` | ObjectId | `public.email_logs` | `id` | Map ObjectId to UUID | MIGRATED |
| `orderId` | ObjectId (ref: Order) | `public.email_logs` | `order_id` | UUID REFERENCES `public.orders(id)` ON DELETE SET NULL | MIGRATED |
| `recipient` | String (req) | `public.email_logs` | `recipient` | TEXT NOT NULL | MIGRATED |
| `eventType` | String (req) | `public.email_logs` | `event_type` | TEXT NOT NULL | MIGRATED |
| `status` | String ('queued','sent','failed') | `public.email_logs` | `status` | `CHECK (status IN ('queued', 'sent', 'failed'))` | MIGRATED |
| `providerResponse`| String | `public.email_logs` | `provider_response`| TEXT DEFAULT '' | MIGRATED |
| `createdAt` | Date | `public.email_logs` | `created_at` | TIMESTAMPTZ DEFAULT NOW() | MIGRATED |

---

### 2.9 Modern Additions (Introduced in PostgreSQL Architecture)
These entities did not exist in the legacy MongoDB database and were introduced to provide enterprise-grade capabilities:
1. `public.categories`: Dynamic category taxonomies with SEO slugs and active state.
2. `public.inventory_adjustments`: Formal stock ledger tracking reason, previous stock, new stock, and responsible admin ID.
3. `public.reviews`: Customer product ratings (1..5) with administrative moderation queue and schema-level duplicate prevention (`uq_reviews_book_user`).
4. `public.discounts`: Promotional coupons supporting percentage and flat discounts, expiration windows, usage limits, and minimum order thresholds.

---

## 3. Discrepancy & Parity Analysis Summary

1. **Normalization:** Embedded items in MongoDB `cart` and `order` were successfully converted to first-class relational tables (`cart_items`, `order_items`) with ON DELETE rules, preventing orphaned records.
2. **Financial Integrity:** Order total amounts, line item prices, and payment amounts in MongoDB were floats. In PostgreSQL, they are strictly defined as `NUMERIC(10, 2)` to eliminate floating-point rounding errors.
3. **Immutability of Financial Snapshots:** Address details and item prices at the time of purchase remain strictly snapshotted in `orders.address_snapshot` and `order_items.price`, preserving historical order records even if the customer edits their saved address or if the book price changes later.
4. **Referential Integrity:** `orders.user_id` and `order_items.book_id` use `ON DELETE RESTRICT`, guaranteeing that active or historical business records cannot be deleted. Books with historical orders are soft-archived (`is_active = FALSE`).

