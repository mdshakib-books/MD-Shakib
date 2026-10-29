-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 001
-- Initial Core Schema & Tables
-- ==============================================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. PROFILES (Extends auth.users)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    email TEXT NOT NULL UNIQUE CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    phone TEXT DEFAULT NULL,
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ==============================================================================
-- 2. ADDRESSES (User Saved Delivery Addresses)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL CHECK (char_length(trim(full_name)) > 0),
    phone TEXT NOT NULL CHECK (char_length(trim(phone)) >= 10),
    pincode TEXT NOT NULL CHECK (char_length(trim(pincode)) = 6),
    state TEXT NOT NULL CHECK (char_length(trim(state)) > 0),
    city TEXT NOT NULL CHECK (char_length(trim(city)) > 0),
    house_no TEXT NOT NULL CHECK (char_length(trim(house_no)) > 0),
    area TEXT NOT NULL CHECK (char_length(trim(area)) > 0),
    landmark TEXT DEFAULT NULL,
    address_type TEXT NOT NULL DEFAULT 'Home' CHECK (address_type IN ('Home', 'Office', 'Other')),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_addresses_user_id ON public.addresses(user_id);
CREATE INDEX IF NOT EXISTS idx_addresses_user_default ON public.addresses(user_id, is_default);

-- ==============================================================================
-- 3. BOOKS (Catalog & Inventory)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.books (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
    author TEXT NOT NULL CHECK (char_length(trim(author)) > 0),
    description TEXT NOT NULL DEFAULT '',
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    discount INTEGER NOT NULL DEFAULT 0 CHECK (discount >= 0 AND discount <= 100),
    category TEXT NOT NULL CHECK (category IN ('Quran', 'Hadith', 'Fiqh', 'History', 'Biography', 'Other')),
    language TEXT DEFAULT NULL,
    pages INTEGER DEFAULT NULL CHECK (pages IS NULL OR pages > 0),
    publisher TEXT DEFAULT NULL,
    published_date DATE DEFAULT NULL,
    image_url TEXT NOT NULL CHECK (char_length(trim(image_url)) > 0),
    images TEXT[] NOT NULL DEFAULT '{}',
    cover_image TEXT NOT NULL DEFAULT '',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_books_category ON public.books(category);
CREATE INDEX IF NOT EXISTS idx_books_price ON public.books(price);
CREATE INDEX IF NOT EXISTS idx_books_is_active ON public.books(is_active);
CREATE INDEX IF NOT EXISTS idx_books_search ON public.books USING GIN (to_tsvector('english', title || ' ' || author));

-- ==============================================================================
-- 4. CARTS & CART ITEMS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.carts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.cart_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cart_id UUID NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_cart_book UNIQUE (cart_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_cart_items_cart_id ON public.cart_items(cart_id);

-- ==============================================================================
-- 5. ORDERS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('COD', 'ONLINE')),
    payment_status TEXT NOT NULL DEFAULT 'Pending' CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refunded')),
    order_status TEXT NOT NULL DEFAULT 'Pending' CHECK (order_status IN (
        'Pending', 'Confirmed', 'Packed', 'Shipped', 'Out for Delivery',
        'Delivered', 'Cancelled', 'Replacement Requested', 'Replacement Approved',
        'Replacement Rejected', 'Replacement Shipped', 'Replacement Delivered', 'Returned'
    )),
    is_paid BOOLEAN NOT NULL DEFAULT FALSE,
    paid_at TIMESTAMPTZ DEFAULT NULL,
    delivered_at TIMESTAMPTZ DEFAULT NULL,
    cancel_reason TEXT DEFAULT '',
    razorpay_order_id TEXT DEFAULT NULL,
    razorpay_payment_id TEXT DEFAULT NULL,
    shipping_courier TEXT NOT NULL DEFAULT 'Delhivery',
    shipping_awb TEXT DEFAULT NULL,
    shipping_tracking_url TEXT DEFAULT NULL,
    shipping_pickup_scheduled BOOLEAN NOT NULL DEFAULT FALSE,
    shipping_shipped_at TIMESTAMPTZ DEFAULT NULL,
    shipping_delivered_at TIMESTAMPTZ DEFAULT NULL,
    replacement_requested BOOLEAN NOT NULL DEFAULT FALSE,
    replacement_status TEXT NOT NULL DEFAULT 'None' CHECK (replacement_status IN (
        'None', 'Requested', 'Approved', 'Rejected', 'Replacement Shipped', 'Replacement Delivered'
    )),
    replacement_reason TEXT DEFAULT NULL,
    replacement_requested_at TIMESTAMPTZ DEFAULT NULL,
    replacement_rejected_at TIMESTAMPTZ DEFAULT NULL,
    replacement_rejection_reason TEXT DEFAULT '',
    address_snapshot JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_user_id ON public.orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_order_status ON public.orders(order_status);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON public.orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at_desc ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_razorpay_order_id ON public.orders(razorpay_order_id);

-- ==============================================================================
-- 6. ORDER ITEMS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
    title TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    image_url TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_book_id ON public.order_items(book_id);

-- ==============================================================================
-- 7. ORDER STATUS HISTORY
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id);

-- ==============================================================================
-- 8. PAYMENTS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    payment_id TEXT UNIQUE NOT NULL,
    provider_order_id TEXT UNIQUE NOT NULL,
    provider_payment_id TEXT UNIQUE,
    signature TEXT DEFAULT '',
    idempotency_key TEXT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    provider TEXT NOT NULL DEFAULT 'Razorpay' CHECK (provider IN ('Razorpay', 'Stripe')),
    status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Paid', 'Failed', 'Refunded')),
    raw_response JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_provider_order ON public.payments(provider_order_id);
CREATE INDEX IF NOT EXISTS idx_payments_idempotency_key ON public.payments(idempotency_key);

-- ==============================================================================
-- 9. AUDIT LOGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL CHECK (action IN (
        'CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'PAYMENT'
    )),
    model_name TEXT NOT NULL,
    model_id TEXT,
    changes JSONB NOT NULL DEFAULT '{}'::jsonb,
    old_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    new_values JSONB NOT NULL DEFAULT '{}'::jsonb,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON public.audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_model ON public.audit_logs(model_name);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at_desc ON public.audit_logs(created_at DESC);

-- ==============================================================================
-- 10. EMAIL LOGS
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.email_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    recipient TEXT NOT NULL,
    event_type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed')),
    provider_response TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_logs_order_id ON public.email_logs(order_id);
CREATE INDEX IF NOT EXISTS idx_email_logs_recipient ON public.email_logs(recipient);
CREATE INDEX IF NOT EXISTS idx_email_logs_event_type ON public.email_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_email_logs_status ON public.email_logs(status);

