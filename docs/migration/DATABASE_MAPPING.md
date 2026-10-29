# Database Mapping: MongoDB / Mongoose to Supabase PostgreSQL

This document defines the relational database architecture, table schemas, relationships, constraints, indexes, Row Level Security (RLS) policies, and atomic transaction procedures required to migrate from MongoDB/Mongoose to Supabase PostgreSQL.

---

## 1. Schema Entity Mapping Table

| Mongoose Model | PostgreSQL Table | Primary Key | Key Foreign Keys & Relationships |
|---|---|---|---|
| `User` | `public.profiles` | `id UUID REFERENCES auth.users(id)` | 1-to-1 with Supabase Auth `auth.users` |
| `RegistrationOtp`| `public.registration_otps` | `id UUID DEFAULT gen_random_uuid()` | Standalone verification table by email |
| `Book` | `public.books` | `id UUID DEFAULT gen_random_uuid()` | Referenced by `cart_items`, `order_items` |
| `Cart` | `public.carts` | `id UUID DEFAULT gen_random_uuid()` | `user_id UUID REFERENCES auth.users(id)` (1-to-1) |
| `Cart.items` (array) | `public.cart_items` | `id UUID DEFAULT gen_random_uuid()` | `cart_id FK`, `book_id FK` |
| `Address` | `public.addresses` | `id UUID DEFAULT gen_random_uuid()` | `user_id UUID REFERENCES auth.users(id)` (1-to-many) |
| `Order` | `public.orders` | `id UUID DEFAULT gen_random_uuid()` | `user_id UUID REFERENCES auth.users(id)` |
| `Order.items` (array)| `public.order_items` | `id UUID DEFAULT gen_random_uuid()` | `order_id FK`, `book_id FK` (snapshot) |
| `Order.statusHistory`| `public.order_status_history`| `id UUID DEFAULT gen_random_uuid()` | `order_id FK` (immutable audit trail) |
| `Payment` | `public.payments` | `id UUID DEFAULT gen_random_uuid()` | `order_id FK`, `user_id FK` |
| `AuditLog` | `public.audit_logs` | `id UUID DEFAULT gen_random_uuid()` | `user_id FK` (nullable for system actions) |
| `EmailLog` | `public.email_logs` | `id UUID DEFAULT gen_random_uuid()` | `order_id FK` (nullable) |

---

## 2. PostgreSQL DDL Specification

```sql
-- Enums
CREATE TYPE user_role AS ENUM ('user', 'admin');
CREATE TYPE book_category AS ENUM ('Quran', 'Hadith', 'Fiqh', 'History', 'Biography', 'Other');
CREATE TYPE address_type AS ENUM ('Home', 'Office', 'Other');
CREATE TYPE order_status AS ENUM (
    'Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery',
    'Delivered', 'Cancelled', 'Replacement Requested', 'Replacement Approved',
    'Replacement Rejected', 'Replacement Shipped', 'Replacement Delivered', 'Returned'
);
CREATE TYPE payment_method AS ENUM ('COD', 'ONLINE');
CREATE TYPE payment_status AS ENUM ('Pending', 'Paid', 'Failed', 'Refunded');
CREATE TYPE replacement_status AS ENUM (
    'None', 'Requested', 'Approved', 'Rejected', 'Replacement Shipped', 'Replacement Delivered'
);

-- 1. Profiles (mirrors legacy User model)
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    phone TEXT,
    role user_role NOT NULL DEFAULT 'user',
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ,
    reset_otp INTEGER,
    otp_expires TIMESTAMPTZ,
    is_otp_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Registration OTPs (replaces Mongoose registrationOtp.model.js)
CREATE TABLE public.registration_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    otp INTEGER NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    attempts INTEGER NOT NULL DEFAULT 0,
    otp_sent_count INTEGER NOT NULL DEFAULT 1,
    rate_limit_window_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_registration_otps_email ON public.registration_otps(LOWER(email));
CREATE INDEX idx_registration_otps_expires ON public.registration_otps(expires_at);

-- 3. Books
CREATE TABLE public.books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    description TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL CHECK (stock >= 0),
    discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
    category book_category NOT NULL,
    language TEXT,
    pages INTEGER CHECK (pages > 0),
    publisher TEXT,
    published_date DATE,
    image_url TEXT NOT NULL,
    images TEXT[] NOT NULL DEFAULT '{}',
    cover_image TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', title || ' ' || author || ' ' || description || ' ' || category::text)
    ) STORED
);
CREATE INDEX idx_books_search ON public.books USING GIN(search_vector);
CREATE INDEX idx_books_category ON public.books(category);
CREATE INDEX idx_books_price ON public.books(price);
CREATE INDEX idx_books_active ON public.books(is_active);

-- 4. Addresses
CREATE TABLE public.addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    pincode TEXT NOT NULL,
    state TEXT NOT NULL,
    city TEXT NOT NULL,
    house_no TEXT NOT NULL,
    area TEXT NOT NULL,
    landmark TEXT,
    address_type address_type NOT NULL DEFAULT 'Home',
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_addresses_user ON public.addresses(user_id, is_default);

-- 5. Carts and Cart Items
CREATE TABLE public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (cart_id, book_id)
);

-- 6. Orders
CREATE TABLE public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    subtotal NUMERIC(10, 2) NOT NULL CHECK (subtotal >= 0),
    platform_fee NUMERIC(10, 2) NOT NULL DEFAULT 10.00,
    delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 35.00,
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    payment_method payment_method NOT NULL,
    payment_status payment_status NOT NULL DEFAULT 'Pending',
    order_status order_status NOT NULL DEFAULT 'Pending',
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    cancel_reason TEXT DEFAULT '',
    idempotency_key TEXT UNIQUE,
    -- Address Snapshot
    shipping_address JSONB NOT NULL,
    -- Delhivery Shipping Metadata
    shipping_courier TEXT DEFAULT 'Delhivery',
    shipping_awb TEXT,
    shipping_tracking_url TEXT,
    shipping_pickup_scheduled BOOLEAN DEFAULT FALSE,
    shipped_at TIMESTAMPTZ,
    -- Replacement Metadata
    replacement_requested BOOLEAN DEFAULT FALSE,
    replacement_status replacement_status DEFAULT 'None',
    replacement_reason TEXT,
    replacement_requested_at TIMESTAMPTZ,
    replacement_rejected_at TIMESTAMPTZ,
    replacement_rejection_reason TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_orders_user ON public.orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status ON public.orders(order_status, payment_status);

-- 7. Order Items (Immutable Book Snapshot)
CREATE TABLE public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Order Status History (Audit Trail)
CREATE TABLE public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    status order_status NOT NULL,
    note TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_order_status_history ON public.order_status_history(order_id, created_at ASC);

-- 9. Payments (Razorpay Ledger)
CREATE TABLE public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
    payment_id TEXT UNIQUE NOT NULL,
    provider_order_id TEXT UNIQUE NOT NULL,
    provider_payment_id TEXT UNIQUE,
    signature TEXT DEFAULT '',
    idempotency_key TEXT,
    amount NUMERIC(10, 2) NOT NULL,
    currency VARCHAR(10) NOT NULL DEFAULT 'INR',
    status payment_status NOT NULL DEFAULT 'Pending',
    provider VARCHAR(50) NOT NULL DEFAULT 'Razorpay',
    failure_reason TEXT DEFAULT '',
    verified_at TIMESTAMPTZ,
    webhook_event_ids TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_payments_order ON public.payments(order_id, user_id);

-- 10. Audit Logs
CREATE TABLE public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    model_name TEXT NOT NULL,
    model_id UUID,
    changes JSONB DEFAULT '{}'::JSONB,
    old_values JSONB DEFAULT '{}'::JSONB,
    new_values JSONB DEFAULT '{}'::JSONB,
    ip_address TEXT,
    user_agent TEXT,
    status TEXT NOT NULL DEFAULT 'SUCCESS',
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id, created_at DESC);

-- 11. Email Logs
CREATE TABLE public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    recipient TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
    provider_response TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Row-Level Security (RLS) Policy Blueprint

Every public table has `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`.

1. **`profiles`:**
   - `SELECT`: Own profile `auth.uid() = id`, or Admin `auth.uid() IN (SELECT id FROM profiles WHERE role = 'admin')`.
   - `UPDATE`: Own profile `auth.uid() = id` (cannot update `role`, `is_blocked`, `is_deleted`).
   - `ALL (Admin)`: Full access for verified `admin`.
2. **`books`:**
   - `SELECT`: Public access `is_active = true`. Admins can read all (`is_active = false` included).
   - `INSERT / UPDATE / DELETE`: Restricted exclusively to `role = 'admin'`.
3. **`addresses`:**
   - `SELECT / INSERT / UPDATE / DELETE`: Restricted to `auth.uid() = user_id`.
4. **`carts` & `cart_items`:**
   - `SELECT / INSERT / UPDATE / DELETE`: Restricted to `auth.uid() = user_id`.
5. **`orders` & `order_items` & `order_status_history`:**
   - `SELECT`: Customer can read their own `user_id = auth.uid()`. Admins have universal read.
   - `INSERT`: Customer via verified RPC or Server Action.
   - `UPDATE`: Admins have full update rights; customers can only initiate `cancel` or `replacement` through RPCs.
6. **`payments`:**
   - `SELECT`: Customer can inspect payments where `user_id = auth.uid()`.
   - `INSERT / UPDATE`: Restricted to Server Actions with Service Role key.

---

## 4. Atomic Transaction Stored Procedures

### A. Order Placement & Stock Decrement (`create_order_atomic`)
```sql
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_user_id UUID,
    p_address_id UUID,
    p_payment_method payment_method,
    p_idempotency_key TEXT,
    p_platform_fee NUMERIC,
    p_delivery_fee NUMERIC
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cart_id UUID;
    v_item RECORD;
    v_book RECORD;
    v_subtotal NUMERIC := 0;
    v_total NUMERIC := 0;
    v_order_id UUID;
    v_shipping_json JSONB;
BEGIN
    -- Check idempotency
    IF EXISTS (SELECT 1 FROM public.orders WHERE idempotency_key = p_idempotency_key) THEN
        RAISE EXCEPTION 'DUPLICATE_ORDER_ATTEMPT';
    END IF;

    -- Fetch Address Snapshot
    SELECT to_jsonb(a.*) INTO v_shipping_json FROM public.addresses a
    WHERE a.id = p_address_id AND a.user_id = p_user_id;
    IF v_shipping_json IS NULL THEN
        RAISE EXCEPTION 'ADDRESS_NOT_FOUND';
    END IF;

    -- Fetch Cart
    SELECT id INTO v_cart_id FROM public.carts WHERE user_id = p_user_id;
    IF v_cart_id IS NULL THEN
        RAISE EXCEPTION 'CART_EMPTY';
    END IF;

    -- Lock book rows and revalidate stock atomically
    FOR v_item IN SELECT ci.book_id, ci.quantity FROM public.cart_items ci WHERE ci.cart_id = v_cart_id LOOP
        SELECT * INTO v_book FROM public.books b WHERE b.id = v_item.book_id FOR UPDATE;
        IF NOT FOUND OR NOT v_book.is_active THEN
            RAISE EXCEPTION 'BOOK_INACTIVE_OR_DELETED: %', v_item.book_id;
        END IF;
        IF v_book.stock < v_item.quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: %', v_book.title;
        END IF;

        -- Decrement stock
        UPDATE public.books SET stock = stock - v_item.quantity WHERE id = v_item.book_id;
        v_subtotal := v_subtotal + (ROUND(v_book.price * (1 - v_book.discount::numeric / 100)) * v_item.quantity);
    END LOOP;

    v_total := v_subtotal + p_platform_fee + p_delivery_fee;

    -- Insert Order
    INSERT INTO public.orders (
        user_id, subtotal, platform_fee, delivery_fee, total_amount,
        payment_method, payment_status, order_status, shipping_address, idempotency_key
    ) VALUES (
        p_user_id, v_subtotal, p_platform_fee, p_delivery_fee, v_total,
        p_payment_method, 'Pending', 'Pending', v_shipping_json, p_idempotency_key
    ) RETURNING id INTO v_order_id;

    -- Insert Order Items
    INSERT INTO public.order_items (order_id, book_id, title, price, quantity, image_url)
    SELECT v_order_id, ci.book_id, b.title, ROUND(b.price * (1 - b.discount::numeric / 100)), ci.quantity, b.image_url
    FROM public.cart_items ci
    JOIN public.books b ON b.id = ci.book_id
    WHERE ci.cart_id = v_cart_id;

    -- Insert Initial Status History
    INSERT INTO public.order_status_history (order_id, status, note)
    VALUES (v_order_id, 'Pending', 'Order created');

    -- Clear Cart
    DELETE FROM public.cart_items WHERE cart_id = v_cart_id;

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'total_amount', v_total,
        'requires_payment', (p_payment_method = 'ONLINE')
    );
END;
$$;
```

### B. Order Cancellation & Stock Restoration (`cancel_order_atomic`)
```sql
CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
    p_order_id UUID,
    p_user_id UUID,
    p_reason TEXT,
    p_is_admin BOOLEAN DEFAULT FALSE
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND';
    END IF;

    IF NOT p_is_admin AND v_order.user_id <> p_user_id THEN
        RAISE EXCEPTION 'UNAUTHORIZED';
    END IF;

    IF v_order.order_status IN ('Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned') THEN
        RAISE EXCEPTION 'CANNOT_CANCEL_ORDER_IN_CURRENT_STATUS: %', v_order.order_status;
    END IF;

    -- Restore stock
    FOR v_item IN SELECT book_id, quantity FROM public.order_items WHERE order_id = p_order_id LOOP
        UPDATE public.books SET stock = stock + v_item.quantity WHERE id = v_item.book_id;
    END LOOP;

    -- Update Order
    UPDATE public.orders
    SET order_status = 'Cancelled',
        cancel_reason = p_reason,
        payment_status = CASE WHEN payment_status = 'Paid' THEN 'Refunded'::payment_status ELSE payment_status END,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Audit history
    INSERT INTO public.order_status_history (order_id, status, note)
    VALUES (p_order_id, 'Cancelled', p_reason);
END;
$$;
```

