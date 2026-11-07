-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration Phase 0
-- Phase 0: Critical Foundation & Security
-- Features:
--   0.1: Server-Authoritative Pricing
--   0.2: Order Creation Security
--   0.3: Profile Role Security
--   0.4: Inventory Reservation Lifecycle
--   0.5: Payment / Order State Integrity
-- Remediation 1-7:
--   1: Idempotent payment failure & single coupon release
--   2: Strict late-payment recovery restricted to expired reservations
--   3: Exact inventory reservation coverage validation & consistent lock ordering
--   4: Canonical request fingerprinting bound to idempotency keys
--   5: Order-specific coupon reservation/consumption lifecycle
--   6: Comprehensive webhook trust & payload verification
--   7: Paid-order cancellation with durable refund pending state
-- Migration: 20261107000001_phase00_foundation_and_security.sql
-- ==============================================================================

-- ==============================================================================
-- 1. SCHEMA EXTENSIONS & NEW TABLES
-- ==============================================================================

-- 1.1 Add authoritative pricing breakdown and security columns to public.orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2) DEFAULT 0 CHECK (subtotal >= 0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10, 2) DEFAULT 0 CHECK (platform_fee >= 0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) DEFAULT 0 CHECK (delivery_fee >= 0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(10, 2) DEFAULT 0 CHECK (discount_amount >= 0);
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT NULL;

-- Order-specific coupon reservation lifecycle (Remediation 1 & 5)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS coupon_status TEXT NOT NULL DEFAULT 'none' 
    CHECK (coupon_status IN ('none', 'reserved', 'consumed', 'released'));

-- Canonical request fingerprint bound to order (Remediation 4)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS request_fingerprint TEXT DEFAULT NULL;

-- Refund & payment columns on orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT NULL 
    CHECK (refund_status IS NULL OR refund_status IN ('pending', 'processed', 'failed'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ DEFAULT NULL;

-- Validate payment_status domain constraint
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
    CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refund Pending', 'Refunded'));

-- Unique constraint for user and idempotency_key
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idempotency_key 
    ON public.orders(user_id, idempotency_key) 
    WHERE idempotency_key IS NOT NULL;

-- 1.2 Dedicated Order Idempotency Keys Table (Remediation 4)
CREATE TABLE IF NOT EXISTS public.order_idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    idempotency_key TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    request_fingerprint TEXT NOT NULL,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_order_idempotency_user_key UNIQUE (user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_order_idempotency_lookup 
    ON public.order_idempotency_keys(user_id, idempotency_key);

ALTER TABLE public.order_idempotency_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "idempotency_keys_admin_policy" ON public.order_idempotency_keys;
CREATE POLICY "idempotency_keys_admin_policy" ON public.order_idempotency_keys
    FOR ALL TO authenticated
    USING (public.is_admin());

-- 1.3 Inventory Reservations Table (Feature 0.4)
CREATE TABLE IF NOT EXISTS public.inventory_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity >= 1),
    status TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'committed', 'released', 'expired')),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('COD', 'ONLINE')),
    expires_at TIMESTAMPTZ DEFAULT NULL, -- NULL for COD, NOW() + INTERVAL '15 minutes' for ONLINE
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_order_id ON public.inventory_reservations(order_id);
CREATE INDEX IF NOT EXISTS idx_reservations_book_id ON public.inventory_reservations(book_id);
CREATE INDEX IF NOT EXISTS idx_reservations_status_expires ON public.inventory_reservations(status, expires_at);

ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reservations_select_admin" ON public.inventory_reservations;
CREATE POLICY "reservations_select_admin" ON public.inventory_reservations
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- 1.4 Webhook Events Table (Feature 0.5 Durable Idempotency & Remediation 6)
CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id TEXT NOT NULL UNIQUE,
    provider TEXT NOT NULL CHECK (provider IN ('Razorpay', 'Delhivery')),
    event_type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('processing', 'completed', 'failed')),
    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed' 
    CHECK (status IN ('processing', 'completed', 'failed'));
ALTER TABLE public.webhook_events ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_webhook_events_provider_type ON public.webhook_events(provider, event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_id_status ON public.webhook_events(event_id, status);

ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_events_admin_all" ON public.webhook_events;
CREATE POLICY "webhook_events_admin_all" ON public.webhook_events
    FOR ALL TO authenticated
    USING (public.is_admin());

-- 1.5 Payments Table Extensions
ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check 
    CHECK (status IN ('Pending', 'Paid', 'Failed', 'Refund Pending', 'Refunded'));

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_id TEXT DEFAULT NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) DEFAULT NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT NULL 
    CHECK (refund_status IS NULL OR refund_status IN ('pending', 'processed', 'failed'));
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ DEFAULT NULL;


-- ==============================================================================
-- 2. FEATURE 0.1: SERVER-AUTHORITATIVE PRICING CALCULATION
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.calculate_cart_pricing(
    p_items JSONB,              -- Array of { "book_id": UUID, "quantity": INT }
    p_coupon_code TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item JSONB;
    v_book_id UUID;
    v_quantity INT;
    v_db_price NUMERIC;
    v_db_discount INT;
    v_db_stock INT;
    v_is_active BOOLEAN;
    v_book_title TEXT;
    v_book_image TEXT;
    v_effective_price NUMERIC;
    v_line_total NUMERIC;
    v_subtotal NUMERIC := 0.00;
    v_platform_fee NUMERIC := 0.00;
    v_delivery_fee NUMERIC := 0.00;
    v_coupon_discount NUMERIC := 0.00;
    v_total_amount NUMERIC := 0.00;
    v_item_count INT := 0;
    v_calculated_items JSONB := '[]'::jsonb;
    v_coupon RECORD;
BEGIN
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cart items cannot be empty.'
        );
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_book_id := (v_item->>'book_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_quantity < 1 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Quantity must be at least 1.'
            );
        END IF;

        IF v_quantity > 1000 THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Quantity exceeds maximum allowed limit.'
            );
        END IF;

        SELECT title, image_url, price, discount, stock, is_active
        INTO v_book_title, v_book_image, v_db_price, v_db_discount, v_db_stock, v_is_active
        FROM public.books
        WHERE id = v_book_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Book not found: ' || v_book_id::text
            );
        END IF;

        IF NOT v_is_active THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Book "' || v_book_title || '" is currently unavailable.'
            );
        END IF;

        IF v_db_stock < v_quantity THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Insufficient stock for "' || v_book_title || '". Available: ' || v_db_stock::text || ', Requested: ' || v_quantity::text
            );
        END IF;

        -- Authoritative price computation using safe 2-decimal arithmetic
        v_effective_price := ROUND(v_db_price * (1.0 - (COALESCE(v_db_discount, 0)::NUMERIC / 100.0)), 2);
        v_line_total := ROUND(v_effective_price * v_quantity, 2);
        v_subtotal := v_subtotal + v_line_total;
        v_item_count := v_item_count + v_quantity;

        v_calculated_items := v_calculated_items || jsonb_build_object(
            'book_id', v_book_id,
            'title', v_book_title,
            'unit_price', v_effective_price,
            'original_price', v_db_price,
            'discount_percent', COALESCE(v_db_discount, 0),
            'quantity', v_quantity,
            'line_total', v_line_total,
            'image_url', v_book_image
        );
    END LOOP;

    -- Standard business fees
    IF v_item_count > 0 THEN
        v_platform_fee := 10.00;
        v_delivery_fee := 35.00;
    END IF;

    -- Authoritative coupon evaluation
    IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon
        FROM public.discounts
        WHERE UPPER(code) = UPPER(trim(p_coupon_code));

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid discount coupon code: ' || p_coupon_code);
        END IF;

        IF NOT v_coupon.is_active THEN
            RETURN jsonb_build_object('success', false, 'error', 'Coupon "' || p_coupon_code || '" is no longer active.');
        END IF;

        IF v_coupon.valid_from > NOW() THEN
            RETURN jsonb_build_object('success', false, 'error', 'Coupon "' || p_coupon_code || '" has not started yet.');
        END IF;

        IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < NOW() THEN
            RETURN jsonb_build_object('success', false, 'error', 'Coupon "' || p_coupon_code || '" has expired.');
        END IF;

        IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
            RETURN jsonb_build_object('success', false, 'error', 'Coupon "' || p_coupon_code || '" has reached its usage limit.');
        END IF;

        IF v_subtotal < v_coupon.min_order_amount THEN
            RETURN jsonb_build_object('success', false, 'error', 'Minimum order amount for coupon "' || p_coupon_code || '" is ₹' || v_coupon.min_order_amount::text);
        END IF;

        IF v_coupon.discount_type = 'percentage' THEN
            v_coupon_discount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
            IF v_coupon.max_discount_amount IS NOT NULL AND v_coupon_discount > v_coupon.max_discount_amount THEN
                v_coupon_discount := v_coupon.max_discount_amount;
            END IF;
        ELSE
            v_coupon_discount := LEAST(v_coupon.discount_value, v_subtotal);
        END IF;
    END IF;

    v_total_amount := v_subtotal - v_coupon_discount + v_delivery_fee + v_platform_fee;
    IF v_total_amount < 0 THEN
        v_total_amount := 0.00;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'subtotal', v_subtotal,
        'platform_fee', v_platform_fee,
        'delivery_fee', v_delivery_fee,
        'discount_amount', v_coupon_discount,
        'coupon_code', p_coupon_code,
        'total_amount', v_total_amount,
        'item_count', v_item_count,
        'items', v_calculated_items
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.calculate_cart_pricing(JSONB, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.calculate_cart_pricing(JSONB, TEXT) TO anon, authenticated, service_role;


-- ==============================================================================
-- 3. FEATURE 0.2: SECURE ORDER CREATION & RLS RESTRICTIONS
-- ==============================================================================

-- Drop permissive client direct-insert policies
DROP POLICY IF EXISTS "orders_insert_policy" ON public.orders;
CREATE POLICY "orders_insert_policy" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "order_items_insert_policy" ON public.order_items;
CREATE POLICY "order_items_insert_policy" ON public.order_items
    FOR INSERT TO authenticated
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ==============================================================================
-- 4. FEATURE 0.3: PROFILE ROLE ESCALATION DEFENSE & ADMIN ROLE RPC
-- ==============================================================================

DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
CREATE POLICY "profiles_insert_policy" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (
        auth.uid() = id
        AND role = 'user'
        AND is_blocked = FALSE
        AND is_deleted = FALSE
    );

DROP POLICY IF EXISTS "profiles_update_policy" ON public.profiles;
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (
        (auth.uid() = id AND role = 'user' AND is_blocked = FALSE AND is_deleted = FALSE)
        OR public.is_admin()
    );

CREATE OR REPLACE FUNCTION public.protect_profile_privileged_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF NOT public.is_admin() THEN
            IF NEW.role <> OLD.role THEN
                RAISE EXCEPTION 'Security violation: Customers cannot modify their account role.';
            END IF;
            IF NEW.is_blocked <> OLD.is_blocked THEN
                RAISE EXCEPTION 'Security violation: Customers cannot modify account block status.';
            END IF;
            IF NEW.is_deleted <> OLD.is_deleted THEN
                RAISE EXCEPTION 'Security violation: Customers cannot modify account deletion status.';
            END IF;
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_privileged_fields
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW
    EXECUTE FUNCTION public.protect_profile_privileged_fields();

CREATE OR REPLACE FUNCTION public.admin_update_user_role(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_new_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_is_admin BOOLEAN := FALSE;
    v_old_role TEXT;
BEGIN
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot modify roles.';
        END IF;
        IF auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
        END IF;
    END IF;

    SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
    INTO v_caller_is_admin
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_caller_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Administrative role required to assign roles.';
    END IF;

    IF p_admin_id = p_target_user_id THEN
        RAISE EXCEPTION 'Safety invariant: Administrators cannot modify their own active role.';
    END IF;

    IF p_new_role NOT IN ('user', 'admin') THEN
        RAISE EXCEPTION 'Invalid role: %. Allowed roles are: user, admin.', p_new_role;
    END IF;

    SELECT role INTO v_old_role
    FROM public.profiles
    WHERE id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user % not found.', p_target_user_id;
    END IF;

    UPDATE public.profiles
    SET role = p_new_role,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    INSERT INTO public.audit_logs (
        user_id,
        action,
        model_name,
        model_id,
        old_values,
        new_values,
        changes,
        created_at
    ) VALUES (
        p_admin_id,
        'UPDATE_ROLE',
        'profiles',
        p_target_user_id::text,
        jsonb_build_object('role', v_old_role),
        jsonb_build_object('role', p_new_role),
        jsonb_build_object('role', p_new_role, 'assigned_by', p_admin_id::text),
        NOW()
    );

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_update_user_role(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, UUID, TEXT) TO authenticated, service_role;


-- ==============================================================================
-- 5. FEATURE 0.1, 0.2 & 0.4: SECURE ATOMIC ORDER CREATION & RESERVATION
-- ==============================================================================

DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_user_id UUID,
    p_items JSONB,              -- Array of { "book_id": UUID, "quantity": INT }
    p_address_snapshot JSONB,
    p_payment_method TEXT,
    p_total_amount NUMERIC DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_coupon_code TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_book_id UUID;
    v_quantity INT;
    v_db_price NUMERIC;
    v_db_discount INT;
    v_effective_price NUMERIC;
    v_line_total NUMERIC;
    v_book_title TEXT;
    v_book_image TEXT;
    v_current_stock INT;
    v_is_active BOOLEAN;
    v_subtotal NUMERIC := 0.00;
    v_platform_fee NUMERIC := 0.00;
    v_delivery_fee NUMERIC := 0.00;
    v_coupon_discount NUMERIC := 0.00;
    v_authoritative_total NUMERIC := 0.00;
    v_item_count INT := 0;
    v_coupon RECORD;
    v_reservation_expires TIMESTAMPTZ := NULL;
    v_cached_items RECORD;
    v_normalized_items JSONB;
    v_request_fingerprint TEXT;
    v_existing_order_id UUID;
    v_existing_fingerprint TEXT;
    v_target_coupon_status TEXT := 'none';
BEGIN
    -- 1. Caller identity validation
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot place orders.';
        END IF;
        IF auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity does not match order user ID.';
        END IF;
    END IF;

    -- 2. Validate payment method
    IF p_payment_method NOT IN ('COD', 'ONLINE') THEN
        RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
    END IF;

    -- 3. Validate items array
    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order items cannot be empty';
    END IF;

    -- 4. Calculate Canonical Request Fingerprint (Remediation 4)
    -- Normalize items: sort by book_id ascending for consistent fingerprint
    SELECT jsonb_agg(
        jsonb_build_object(
            'book_id', (item->>'book_id')::text,
            'quantity', COALESCE((item->>'quantity')::int, 0)
        ) ORDER BY (item->>'book_id')::text
    ) INTO v_normalized_items
    FROM jsonb_array_elements(p_items) item;

    v_request_fingerprint := encode(
        sha256(
            (p_user_id::text || '|' ||
             p_payment_method || '|' ||
             COALESCE(UPPER(trim(p_coupon_code)), '') || '|' ||
             COALESCE(v_normalized_items::text, '[]') || '|' ||
             COALESCE(p_address_snapshot::text, '{}')
            )::bytea
        ),
        'hex'
    );

    -- 5. Idempotency Check Bound to Request Fingerprint (Remediation 4)
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        -- Check dedicated order_idempotency_keys table
        SELECT order_id, request_fingerprint INTO v_existing_order_id, v_existing_fingerprint
        FROM public.order_idempotency_keys
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
        FOR UPDATE;

        IF FOUND THEN
            IF v_existing_fingerprint <> v_request_fingerprint THEN
                RAISE EXCEPTION 'Idempotency conflict: Key "%" has already been used with a different request payload.', p_idempotency_key;
            END IF;
            RETURN v_existing_order_id;
        END IF;

        -- Fallback: check orders table directly
        SELECT id, request_fingerprint INTO v_existing_order_id, v_existing_fingerprint
        FROM public.orders
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
        FOR UPDATE;

        IF FOUND THEN
            IF v_existing_fingerprint IS NOT NULL AND v_existing_fingerprint <> v_request_fingerprint THEN
                RAISE EXCEPTION 'Idempotency conflict: Key "%" has already been used with a different request payload.', p_idempotency_key;
            END IF;
            RETURN v_existing_order_id;
        END IF;
    END IF;

    -- 6. Calculate Server-Authoritative Line Items and Subtotal with Consistent Row Locking
    CREATE TEMP TABLE tmp_order_calc_items (
        book_id UUID PRIMARY KEY,
        title TEXT,
        image_url TEXT,
        effective_price NUMERIC,
        quantity INT,
        line_total NUMERIC
    ) ON COMMIT DROP;

    -- Iterate in consistent book_id order to prevent deadlock across concurrent orders
    FOR v_item IN 
        SELECT * FROM jsonb_array_elements(p_items) 
        ORDER BY (value->>'book_id')::UUID
    LOOP
        v_book_id := (v_item->>'book_id')::UUID;
        v_quantity := COALESCE((v_item->>'quantity')::INT, 0);

        IF v_quantity < 1 THEN
            RAISE EXCEPTION 'Quantity must be at least 1 for book %', v_book_id;
        END IF;

        IF v_quantity > 1000 THEN
            RAISE EXCEPTION 'Quantity exceeds maximum limit of 1000 units for book %', v_book_id;
        END IF;

        -- Lock book row FOR UPDATE in consistent order
        SELECT title, image_url, price, discount, stock, is_active
        INTO v_book_title, v_book_image, v_db_price, v_db_discount, v_current_stock, v_is_active
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

        -- Server-Authoritative Price Calculation (2 decimal precision)
        v_effective_price := ROUND(v_db_price * (1.0 - (COALESCE(v_db_discount, 0)::NUMERIC / 100.0)), 2);
        v_line_total := ROUND(v_effective_price * v_quantity, 2);
        v_subtotal := v_subtotal + v_line_total;
        v_item_count := v_item_count + v_quantity;

        INSERT INTO tmp_order_calc_items (
            book_id, title, image_url, effective_price, quantity, line_total
        ) VALUES (
            v_book_id, v_book_title, v_book_image, v_effective_price, v_quantity, v_line_total
        );
    END LOOP;

    -- Authoritative Coupon Validation & Discount Calculation
    IF p_coupon_code IS NOT NULL AND trim(p_coupon_code) <> '' THEN
        SELECT * INTO v_coupon
        FROM public.discounts
        WHERE UPPER(code) = UPPER(trim(p_coupon_code))
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid discount coupon code: %', p_coupon_code;
        END IF;

        IF NOT v_coupon.is_active THEN
            RAISE EXCEPTION 'This coupon is no longer active.';
        END IF;

        IF v_coupon.valid_from > NOW() THEN
            RAISE EXCEPTION 'This coupon has not started yet.';
        END IF;

        IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < NOW() THEN
            RAISE EXCEPTION 'This coupon has expired.';
        END IF;

        IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
            RAISE EXCEPTION 'This coupon has reached its maximum usage limit.';
        END IF;

        IF v_subtotal < v_coupon.min_order_amount THEN
            RAISE EXCEPTION 'Minimum order amount for this coupon is ₹%', v_coupon.min_order_amount;
        END IF;

        IF v_coupon.discount_type = 'percentage' THEN
            v_coupon_discount := ROUND((v_subtotal * (v_coupon.discount_value / 100.0)), 2);
            IF v_coupon.max_discount_amount IS NOT NULL AND v_coupon_discount > v_coupon.max_discount_amount THEN
                v_coupon_discount := v_coupon.max_discount_amount;
            END IF;
        ELSE
            v_coupon_discount := LEAST(v_coupon.discount_value, v_subtotal);
        END IF;

        -- Order-specific coupon reservation lifecycle:
        -- ONLINE orders place coupon in 'reserved' state.
        -- COD orders place coupon in 'consumed' state immediately.
        v_target_coupon_status := CASE WHEN p_payment_method = 'COD' THEN 'consumed' ELSE 'reserved' END;

        UPDATE public.discounts
        SET used_count = used_count + 1
        WHERE id = v_coupon.id;
    END IF;

    -- Determine authoritative fee structure (unconditionally applied)
    v_platform_fee := 10.00;
    v_delivery_fee := 35.00;
    v_authoritative_total := v_subtotal + v_platform_fee + v_delivery_fee - v_coupon_discount;

    IF v_authoritative_total < 0 THEN
        v_authoritative_total := 0.00;
    END IF;

    -- 7. Insert Order Record with Authoritative Values & Fingerprint
    BEGIN
        INSERT INTO public.orders (
            user_id,
            total_amount,
            subtotal,
            platform_fee,
            delivery_fee,
            discount_amount,
            coupon_code,
            coupon_status,
            payment_method,
            payment_status,
            order_status,
            address_snapshot,
            is_paid,
            idempotency_key,
            request_fingerprint
        ) VALUES (
            p_user_id,
            v_authoritative_total,
            v_subtotal,
            v_platform_fee,
            v_delivery_fee,
            v_coupon_discount,
            p_coupon_code,
            v_target_coupon_status,
            p_payment_method,
            'Pending',
            'Pending',
            p_address_snapshot,
            FALSE,
            p_idempotency_key,
            v_request_fingerprint
        ) RETURNING id INTO v_order_id;
    EXCEPTION WHEN unique_violation THEN
        IF p_idempotency_key IS NOT NULL THEN
            SELECT id, request_fingerprint INTO v_existing_order_id, v_existing_fingerprint
            FROM public.orders
            WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

            IF FOUND THEN
                IF v_existing_fingerprint IS NOT NULL AND v_existing_fingerprint <> v_request_fingerprint THEN
                    RAISE EXCEPTION 'Idempotency conflict: Key "%" has already been used with a different request payload.', p_idempotency_key;
                END IF;
                RETURN v_existing_order_id;
            END IF;
        END IF;
        RAISE;
    END;

    -- 8. Record in order_idempotency_keys table
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        INSERT INTO public.order_idempotency_keys (
            idempotency_key,
            user_id,
            request_fingerprint,
            order_id
        ) VALUES (
            p_idempotency_key,
            p_user_id,
            v_request_fingerprint,
            v_order_id
        )
        ON CONFLICT (user_id, idempotency_key) DO NOTHING;
    END IF;

    -- 9. Process Stock Decrement, Order Items Snapshot & Inventory Reservation (Feature 0.4)
    IF p_payment_method = 'ONLINE' THEN
        v_reservation_expires := NOW() + INTERVAL '15 minutes';
    ELSE
        v_reservation_expires := NULL; -- COD orders immediately commit stock with no timeout
    END IF;

    FOR v_cached_items IN SELECT * FROM tmp_order_calc_items ORDER BY book_id
    LOOP
        -- Decrement physical stock
        UPDATE public.books
        SET stock = stock - v_cached_items.quantity
        WHERE id = v_cached_items.book_id;

        -- Record inventory reservation lifecycle record
        INSERT INTO public.inventory_reservations (
            order_id,
            book_id,
            quantity,
            status,
            payment_method,
            expires_at
        ) VALUES (
            v_order_id,
            v_cached_items.book_id,
            v_cached_items.quantity,
            CASE WHEN p_payment_method = 'COD' THEN 'committed' ELSE 'reserved' END,
            p_payment_method,
            v_reservation_expires
        );

        -- Insert order item immutable price snapshot
        INSERT INTO public.order_items (
            order_id,
            book_id,
            title,
            price,
            quantity,
            image_url
        ) VALUES (
            v_order_id,
            v_cached_items.book_id,
            v_cached_items.title,
            v_cached_items.effective_price,
            v_cached_items.quantity,
            v_cached_items.image_url
        );
    END LOOP;

    -- 10. Clear customer active cart
    DELETE FROM public.cart_items
    WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = p_user_id);

    RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT, TEXT) TO authenticated, service_role;


-- ==============================================================================
-- 6. FEATURE 0.4 & 0.5: SETTLEMENT, EXPIRY & FAILURE ATOMICITY
-- ==============================================================================

-- 6.1 Settle Payment Atomic (Payment Success -> Commit Inventory Reservation)
CREATE OR REPLACE FUNCTION public.settle_payment_atomic(
    p_razorpay_order_id TEXT,
    p_razorpay_payment_id TEXT,
    p_signature TEXT DEFAULT NULL,
    p_raw_response JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_payment RECORD;
    v_item RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_raw_amount NUMERIC;
    v_raw_currency TEXT;
    v_items_distinct_count INT := 0;
    v_res_distinct_count INT := 0;
    v_mismatch_count INT := 0;
    v_exact_coverage BOOLEAN := FALSE;
    v_stock_available BOOLEAN := TRUE;
    v_book_stock INT;
    v_needed_qty INT;
    v_active_reserved_qty INT;
BEGIN
    -- Strict authorization check: Only service_role or admin may execute payment settlement
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Payment settlement requires service-role credentials.';
        END IF;
    END IF;

    -- Validate payment provider arguments (Remediation 6)
    IF p_razorpay_order_id IS NULL OR trim(p_razorpay_order_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_provider_order_id',
            'message', 'Provider order ID cannot be empty'
        );
    END IF;

    IF p_razorpay_payment_id IS NULL OR trim(p_razorpay_payment_id) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_provider_payment_id',
            'message', 'Provider payment ID cannot be empty'
        );
    END IF;

    -- 1. Pessimistic concurrency control: Lock candidate order row FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE razorpay_order_id = p_razorpay_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'order_not_found',
            'message', 'No order associated with Razorpay order ID ' || p_razorpay_order_id
        );
    END IF;

    -- 2. Reject online prepaid settlement for COD orders
    IF v_order.payment_method = 'COD' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_payment_method',
            'message', 'COD orders cannot be settled via online prepaid webhook'
        );
    END IF;

    -- 3. Idempotency Check: if order is already marked Paid, return early without re-mutating
    IF v_order.is_paid IS TRUE AND v_order.payment_status = 'Paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_paid',
            'order_id', v_order.id,
            'user_id', v_order.user_id,
            'settled', false
        );
    END IF;

    -- 4. Verify payment currency matches INR if currency is in raw response (Remediation 6)
    IF p_raw_response ? 'currency' THEN
        v_raw_currency := UPPER(p_raw_response->>'currency');
    ELSIF p_raw_response #> '{payment,entity,currency}' IS NOT NULL THEN
        v_raw_currency := UPPER(p_raw_response #>> '{payment,entity,currency}');
    END IF;

    IF v_raw_currency IS NOT NULL AND v_raw_currency <> 'INR' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'currency_mismatch',
            'message', 'Payment currency mismatch: Expected INR but received ' || v_raw_currency
        );
    END IF;

    -- 5. Verify payment amount matches order total if amount is in raw response (Remediation 6)
    IF p_raw_response ? 'amount' THEN
        v_raw_amount := (p_raw_response->>'amount')::NUMERIC / 100.0;
    ELSIF p_raw_response #> '{payment,entity,amount}' IS NOT NULL THEN
        v_raw_amount := (p_raw_response #>> '{payment,entity,amount}')::NUMERIC / 100.0;
    END IF;

    IF v_raw_amount IS NOT NULL AND ABS(v_raw_amount - v_order.total_amount) > 0.01 THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'amount_mismatch',
            'message', 'Payment amount mismatch: Expected ' || v_order.total_amount::text || ' but received ' || v_raw_amount::text
        );
    END IF;

    -- 6. Lock candidate payment record FOR UPDATE
    SELECT * INTO v_payment
    FROM public.payments
    WHERE provider_order_id = p_razorpay_order_id
    FOR UPDATE;

    -- 7. Validate Complete Inventory Reservation Coverage (Remediation 3)
    SELECT COUNT(DISTINCT book_id) INTO v_items_distinct_count
    FROM public.order_items
    WHERE order_id = v_order.id;

    SELECT COUNT(DISTINCT book_id) INTO v_res_distinct_count
    FROM public.inventory_reservations
    WHERE order_id = v_order.id
      AND status = 'reserved'
      AND (expires_at IS NULL OR expires_at >= v_now);

    SELECT COUNT(*) INTO v_mismatch_count
    FROM (
        SELECT book_id, SUM(quantity) AS item_qty
        FROM public.order_items
        WHERE order_id = v_order.id
        GROUP BY book_id
    ) oi
    FULL OUTER JOIN (
        SELECT book_id, SUM(quantity) AS reserved_qty
        FROM public.inventory_reservations
        WHERE order_id = v_order.id
          AND status = 'reserved'
          AND (expires_at IS NULL OR expires_at >= v_now)
        GROUP BY book_id
    ) r ON oi.book_id = r.book_id
    WHERE oi.item_qty IS NULL 
       OR r.reserved_qty IS NULL 
       OR oi.item_qty <> r.reserved_qty;

    IF v_items_distinct_count > 0 
       AND v_items_distinct_count = v_res_distinct_count 
       AND v_mismatch_count = 0 THEN
        v_exact_coverage := TRUE;
    ELSE
        v_exact_coverage := FALSE;
    END IF;

    -- -------------------------------------------------------------------------
    -- Path A: Complete, exact non-expired reservations exist AND order is Pending
    -- -------------------------------------------------------------------------
    IF v_exact_coverage IS TRUE AND v_order.order_status = 'Pending' THEN
        -- Authoritatively transition order to Paid & Confirmed
        UPDATE public.orders
        SET payment_status = 'Paid',
            order_status = 'Confirmed',
            is_paid = TRUE,
            paid_at = v_now,
            coupon_status = CASE WHEN coupon_status = 'reserved' THEN 'consumed' ELSE coupon_status END,
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = v_now
        WHERE id = v_order.id;

        -- Transition payment record to Paid
        IF v_payment.id IS NOT NULL THEN
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = p_signature,
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;
        END IF;

        -- Convert Inventory Reservations from 'reserved' to 'committed'
        UPDATE public.inventory_reservations
        SET status = 'committed',
            expires_at = NULL,
            updated_at = v_now
        WHERE order_id = v_order.id AND status = 'reserved';

        -- Record in order status history
        INSERT INTO public.order_status_history (
            order_id,
            status,
            note,
            created_at
        ) VALUES (
            v_order.id,
            'Confirmed',
            'Payment settled and verified via Razorpay (' || p_razorpay_payment_id || ')',
            v_now
        );

        RETURN jsonb_build_object(
            'success', true,
            'status', 'settled',
            'order_id', v_order.id,
            'user_id', v_order.user_id,
            'settled', true
        );
    END IF;

    -- -------------------------------------------------------------------------
    -- Path B: Incomplete, expired reservations or order in non-Pending state
    -- -------------------------------------------------------------------------

    -- Remediation 2: Reject recovery for non-recoverable cancellations
    -- Only orders cancelled specifically because online reservation expired can be recovered
    IF v_order.order_status = 'Cancelled' AND (v_order.cancel_reason IS NULL OR v_order.cancel_reason <> 'Payment reservation expired') THEN
        -- Non-recoverable cancellation (Customer cancelled, admin cancelled, fraud, etc.)
        -- Update payment record to Paid because money was captured by payment gateway
        IF v_payment.id IS NOT NULL THEN
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = p_signature,
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;
        END IF;

        -- Order CANNOT be confirmed. Create durable refund-required state
        UPDATE public.orders
        SET payment_status = 'Paid',
            is_paid = TRUE,
            paid_at = v_now,
            refund_status = 'pending',
            refund_amount = v_order.total_amount,
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = v_now
        WHERE id = v_order.id;

        INSERT INTO public.order_status_history (
            order_id,
            status,
            note,
            created_at
        ) VALUES (
            v_order.id,
            'Cancelled',
            'Payment captured for non-recoverable cancelled order (' || COALESCE(v_order.cancel_reason, 'unspecified') || '). Marked for refund.',
            v_now
        );

        RETURN jsonb_build_object(
            'success', false,
            'status', 'cancelled_non_recoverable',
            'message', 'Payment captured for cancelled order. Order cannot be recovered; refund required.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

    -- If order is in an unrelated terminal state (Delivered, Shipped, Returned, etc.)
    IF v_order.order_status NOT IN ('Pending', 'Cancelled') THEN
        IF v_payment.id IS NOT NULL THEN
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = p_signature,
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;
        END IF;

        UPDATE public.orders
        SET refund_status = 'pending',
            refund_amount = v_order.total_amount,
            updated_at = v_now
        WHERE id = v_order.id;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'terminal_state_conflict',
            'message', 'Payment arrived for order in terminal status ' || v_order.order_status || '; marked for refund.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

    -- Permitted Expiry Recovery Path:
    -- Order was cancelled specifically because reservation expired OR order is Pending with expired/partial reservations.
    -- Lock book rows in consistent order to prevent deadlocks (Remediation 3)
    FOR v_item IN
        SELECT oi.book_id, oi.quantity,
               COALESCE((
                   SELECT SUM(r.quantity)
                   FROM public.inventory_reservations r
                   WHERE r.order_id = v_order.id
                     AND r.book_id = oi.book_id
                     AND r.status = 'reserved'
                     AND (r.expires_at IS NULL OR r.expires_at >= v_now)
               ), 0) AS active_qty
        FROM public.order_items oi
        WHERE oi.order_id = v_order.id
        ORDER BY oi.book_id
    LOOP
        v_needed_qty := v_item.quantity - v_item.active_qty;

        IF v_needed_qty > 0 THEN
            SELECT stock INTO v_book_stock
            FROM public.books
            WHERE id = v_item.book_id
            FOR UPDATE;

            IF v_book_stock IS NULL OR v_book_stock < v_needed_qty THEN
                v_stock_available := FALSE;
                EXIT;
            END IF;
        END IF;
    END LOOP;

    -- If stock is NO LONGER AVAILABLE:
    IF NOT v_stock_available THEN
        -- Record payment in payments table as Paid
        IF v_payment.id IS NOT NULL THEN
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = p_signature,
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;
        END IF;

        -- Release any lingering active reservations for this order and restore their stock
        FOR v_item IN
            SELECT id, book_id, quantity
            FROM public.inventory_reservations
            WHERE order_id = v_order.id AND status = 'reserved'
            FOR UPDATE
        LOOP
            UPDATE public.books SET stock = stock + v_item.quantity WHERE id = v_item.book_id;
            UPDATE public.inventory_reservations SET status = 'released', updated_at = v_now WHERE id = v_item.id;
        END LOOP;

        -- Release coupon if coupon was reserved
        IF v_order.coupon_status = 'reserved' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
            UPDATE public.discounts
            SET used_count = GREATEST(used_count - 1, 0)
            WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
        END IF;

        -- Mark order Cancelled with durable refund pending state
        UPDATE public.orders
        SET payment_status = 'Paid',
            is_paid = TRUE,
            paid_at = v_now,
            order_status = 'Cancelled',
            coupon_status = CASE WHEN coupon_status = 'reserved' THEN 'released' ELSE coupon_status END,
            cancel_reason = 'Payment received after reservation expired; stock unavailable for fulfillment. Marked for refund.',
            refund_status = 'pending',
            refund_amount = v_order.total_amount,
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = v_now
        WHERE id = v_order.id;

        INSERT INTO public.order_status_history (
            order_id,
            status,
            note,
            created_at
        ) VALUES (
            v_order.id,
            'Cancelled',
            'Payment captured post-expiry but inventory out of stock. Automatic refund required.',
            v_now
        );

        RETURN jsonb_build_object(
            'success', false,
            'status', 'expired_stock_unavailable',
            'message', 'Payment captured after reservation expired, but inventory is no longer available. Order marked for refund.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

    -- If stock IS available: Re-reserve stock, commit reservation, and confirm order
    FOR v_item IN
        SELECT oi.book_id, oi.quantity,
               COALESCE((
                   SELECT SUM(r.quantity)
                   FROM public.inventory_reservations r
                   WHERE r.order_id = v_order.id
                     AND r.book_id = oi.book_id
                     AND r.status = 'reserved'
                     AND (r.expires_at IS NULL OR r.expires_at >= v_now)
               ), 0) AS active_qty
        FROM public.order_items oi
        WHERE oi.order_id = v_order.id
        ORDER BY oi.book_id
    LOOP
        v_needed_qty := v_item.quantity - v_item.active_qty;
        IF v_needed_qty > 0 THEN
            UPDATE public.books
            SET stock = stock - v_needed_qty
            WHERE id = v_item.book_id;
        END IF;
    END LOOP;

    -- Update all reservations for this order to committed
    UPDATE public.inventory_reservations
    SET status = 'committed',
        expires_at = NULL,
        updated_at = v_now
    WHERE order_id = v_order.id;

    -- Re-increment coupon if coupon was released
    IF v_order.coupon_status = 'released' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts
        SET used_count = used_count + 1
        WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
    END IF;

    -- Transition order to Confirmed & Paid
    UPDATE public.orders
    SET payment_status = 'Paid',
        order_status = 'Confirmed',
        is_paid = TRUE,
        paid_at = v_now,
        cancel_reason = NULL,
        coupon_status = CASE WHEN v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN 'consumed' ELSE 'none' END,
        razorpay_payment_id = p_razorpay_payment_id,
        updated_at = v_now
    WHERE id = v_order.id;

    -- Transition payment to Paid
    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET provider_payment_id = p_razorpay_payment_id,
            signature = p_signature,
            status = 'Paid',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;
    END IF;

    INSERT INTO public.order_status_history (
        order_id,
        status,
        note,
        created_at
    ) VALUES (
        v_order.id,
        'Confirmed',
        'Payment settled post-expiry (stock successfully re-reserved and committed)',
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'settled_recovered',
        'order_id', v_order.id,
        'user_id', v_order.user_id,
        'settled', true
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) TO postgres, service_role;


-- 6.2 Record Payment Failure Atomic (Idempotent Failure Handling - Remediation 1 & 5)
CREATE OR REPLACE FUNCTION public.record_payment_failure_atomic(
    p_razorpay_order_id TEXT,
    p_raw_response JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_payment RECORD;
    v_res RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_lingering_res INT := 0;
BEGIN
    -- Strict authorization check
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Recording payment failure requires service-role credentials.';
        END IF;
    END IF;

    -- 1. Check order status under row lock
    SELECT * INTO v_order
    FROM public.orders
    WHERE razorpay_order_id = p_razorpay_order_id
    FOR UPDATE;

    -- If the order is already Paid, REJECT downgrading!
    IF v_order.id IS NOT NULL AND (v_order.is_paid IS TRUE OR v_order.payment_status = 'Paid') THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'ignored_already_paid',
            'message', 'Order is already marked as Paid; failure event safely ignored'
        );
    END IF;

    -- Check if order has already transitioned to Failed and reservations already released (Idempotency)
    IF v_order.id IS NOT NULL AND v_order.payment_status = 'Failed' AND v_order.order_status = 'Cancelled' THEN
        SELECT COUNT(*) INTO v_lingering_res
        FROM public.inventory_reservations
        WHERE order_id = v_order.id AND status = 'reserved';

        IF v_lingering_res = 0 THEN
            -- Idempotent duplicate: already failed, reservations released, coupon already handled
            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_failed',
                'order_id', v_order.id,
                'message', 'Payment failure has already been recorded'
            );
        END IF;
    END IF;

    -- 2. Lock matching payment row FOR UPDATE
    SELECT * INTO v_payment
    FROM public.payments
    WHERE provider_order_id = p_razorpay_order_id
    FOR UPDATE;

    -- If payment record is already Paid, REJECT downgrading!
    IF v_payment.id IS NOT NULL AND v_payment.status = 'Paid' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'ignored_already_paid',
            'message', 'Payment record is already Paid; failure event safely ignored'
        );
    END IF;

    -- 3. Update payment record to Failed only if not Paid
    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET status = 'Failed',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;
    END IF;

    -- 4. Release active inventory reservations and restore stock (executed exactly once)
    IF v_order.id IS NOT NULL THEN
        FOR v_res IN
            SELECT * FROM public.inventory_reservations
            WHERE order_id = v_order.id AND status = 'reserved'
            ORDER BY id
            FOR UPDATE
        LOOP
            UPDATE public.books
            SET stock = stock + v_res.quantity
            WHERE id = v_res.book_id;

            UPDATE public.inventory_reservations
            SET status = 'released',
                updated_at = v_now
            WHERE id = v_res.id;
        END LOOP;

        -- Order-specific coupon release: ONLY release if order owns an active reservation (Remediation 1 & 5)
        IF v_order.coupon_status = 'reserved' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
            UPDATE public.discounts
            SET used_count = GREATEST(used_count - 1, 0)
            WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));

            UPDATE public.orders
            SET coupon_status = 'released'
            WHERE id = v_order.id;
        END IF;

        -- Update order status to Cancelled / Failed
        UPDATE public.orders
        SET payment_status = 'Failed',
            order_status = 'Cancelled',
            cancel_reason = 'Payment failed or rejected by payment gateway',
            updated_at = v_now
        WHERE id = v_order.id AND payment_status <> 'Paid';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'recorded_failure',
        'order_id', v_order.id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) TO postgres, service_role;


-- 6.3 Cancel Order Atomic (Paid & Unpaid Order Cancellation - Remediation 5 & 7)
CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
    p_order_id UUID,
    p_user_id UUID,
    p_cancel_reason TEXT,
    p_is_admin BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_actual_is_admin BOOLEAN := FALSE;
    v_res RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_target_payment_status TEXT;
    v_target_refund_status TEXT;
    v_target_refund_amount NUMERIC;
    v_target_coupon_status TEXT;
BEGIN
    -- Caller identity validation
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot cancel orders.';
        END IF;
        IF auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity does not match specified user ID.';
        END IF;
    END IF;

    -- Validate admin claim
    IF p_is_admin THEN
        SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
        INTO v_actual_is_admin
        FROM public.profiles
        WHERE id = p_user_id;

        IF v_actual_is_admin IS NOT TRUE THEN
            RAISE EXCEPTION 'Unauthorized: Administrative role required to cancel arbitrary orders.';
        END IF;
    END IF;

    -- Fetch and lock order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- Authorization check
    IF NOT v_actual_is_admin AND v_order.user_id <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to cancel order %', p_order_id;
    END IF;

    -- Rejection check: cannot cancel in terminal or post-delivery states
    IF v_order.order_status IN ('Cancelled', 'Delivered', 'Returned') OR v_order.order_status LIKE 'Replacement%' THEN
        RAISE EXCEPTION 'Order cannot be cancelled in % status', v_order.order_status;
    END IF;

    -- Release inventory reservations and restore stock (executed safely in order)
    FOR v_res IN
        SELECT * FROM public.inventory_reservations
        WHERE order_id = p_order_id AND status IN ('reserved', 'committed')
        ORDER BY id
        FOR UPDATE
    LOOP
        UPDATE public.books
        SET stock = stock + v_res.quantity
        WHERE id = v_res.book_id;

        UPDATE public.inventory_reservations
        SET status = 'released',
            updated_at = v_now
        WHERE id = v_res.id;
    END LOOP;

    -- Order-specific coupon accounting (Remediation 5)
    v_target_coupon_status := v_order.coupon_status;
    IF v_order.coupon_status IN ('reserved', 'consumed') AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts
        SET used_count = GREATEST(used_count - 1, 0)
        WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));

        v_target_coupon_status := 'released';
    END IF;

    -- Paid Order vs Unpaid Order Cancellation Policy (Remediation 7)
    IF v_order.is_paid IS TRUE OR v_order.payment_status = 'Paid' THEN
        -- Paid order cancelled: requires refund
        v_target_payment_status := 'Refund Pending';
        v_target_refund_status := 'pending';
        v_target_refund_amount := v_order.total_amount;
    ELSE
        -- Unpaid order cancelled
        v_target_payment_status := 'Failed';
        v_target_refund_status := NULL;
        v_target_refund_amount := NULL;
    END IF;

    -- Update order status
    UPDATE public.orders
    SET order_status = 'Cancelled',
        payment_status = v_target_payment_status,
        refund_status = v_target_refund_status,
        refund_amount = v_target_refund_amount,
        coupon_status = v_target_coupon_status,
        cancel_reason = COALESCE(p_cancel_reason, 'Cancelled by user'),
        updated_at = v_now
    WHERE id = p_order_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        user_id,
        action,
        model_name,
        model_id,
        old_values,
        new_values,
        changes,
        created_at
    ) VALUES (
        p_user_id,
        'CANCEL',
        'orders',
        p_order_id::text,
        jsonb_build_object('order_status', v_order.order_status, 'payment_status', v_order.payment_status),
        jsonb_build_object('order_status', 'Cancelled', 'payment_status', v_target_payment_status, 'refund_status', v_target_refund_status),
        jsonb_build_object('reason', COALESCE(p_cancel_reason, 'Cancelled by user'), 'is_admin', v_actual_is_admin),
        v_now
    );

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;


-- 6.4 Release Expired Reservations (Automated Cleanup RPC - Secured - Remediation 1, 3, 5)
CREATE OR REPLACE FUNCTION public.release_expired_reservations_atomic(
    p_limit INT DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_id UUID;
    v_res RECORD;
    v_released_orders UUID[] := '{}';
    v_count INT := 0;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_effective_limit INT;
    v_order_rec RECORD;
BEGIN
    -- Strict authorization check: Only service_role or admin may execute global cleanup
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Global cleanup requires service-role or administrative privileges.';
        END IF;
    END IF;

    -- Validate and bound p_limit to [1, 500]
    IF p_limit IS NULL OR p_limit < 1 THEN
        v_effective_limit := 50;
    ELSIF p_limit > 500 THEN
        v_effective_limit := 500;
    ELSE
        v_effective_limit := p_limit;
    END IF;

    -- Find distinct orders with expired unpaid reservations using FOR UPDATE SKIP LOCKED
    FOR v_order_id IN
        SELECT o.id
        FROM public.orders o
        WHERE o.payment_status = 'Pending'
          AND o.order_status = 'Pending'
          AND o.id IN (
              SELECT r.order_id
              FROM public.inventory_reservations r
              WHERE r.status = 'reserved'
                AND r.expires_at < v_now
          )
        ORDER BY o.id
        LIMIT v_effective_limit
        FOR UPDATE SKIP LOCKED
    LOOP
        SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id FOR UPDATE;

        -- For each reserved item, restore stock and mark expired
        FOR v_res IN
            SELECT * FROM public.inventory_reservations
            WHERE order_id = v_order_id AND status = 'reserved'
            ORDER BY id
            FOR UPDATE
        LOOP
            UPDATE public.books
            SET stock = stock + v_res.quantity
            WHERE id = v_res.book_id;

            UPDATE public.inventory_reservations
            SET status = 'expired',
                updated_at = v_now
            WHERE id = v_res.id;
        END LOOP;

        -- Release coupon usage ONLY if order owns an active reservation (Remediation 1 & 5)
        IF v_order_rec.coupon_status = 'reserved' AND v_order_rec.coupon_code IS NOT NULL AND trim(v_order_rec.coupon_code) <> '' THEN
            UPDATE public.discounts
            SET used_count = GREATEST(used_count - 1, 0)
            WHERE UPPER(code) = UPPER(trim(v_order_rec.coupon_code));

            UPDATE public.orders
            SET coupon_status = 'released'
            WHERE id = v_order_id;
        END IF;

        -- Cancel order due to reservation expiration
        UPDATE public.orders
        SET order_status = 'Cancelled',
            payment_status = 'Failed',
            cancel_reason = 'Payment reservation expired',
            updated_at = v_now
        WHERE id = v_order_id;

        v_released_orders := array_append(v_released_orders, v_order_id);
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'released_orders_count', v_count,
        'order_ids', to_jsonb(v_released_orders)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_expired_reservations_atomic(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations_atomic(INT) TO postgres, service_role;


-- 6.5 Record Refund Atomic (Remediation 7)
CREATE OR REPLACE FUNCTION public.record_refund_atomic(
    p_order_id UUID,
    p_refund_id TEXT,
    p_refund_amount NUMERIC,
    p_refund_status TEXT,
    p_raw_response JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_payment RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_target_payment_status TEXT;
BEGIN
    -- Strict authorization check
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Recording refunds requires service-role credentials.';
        END IF;
    END IF;

    -- Validate refund status input
    IF p_refund_status NOT IN ('pending', 'processed', 'failed') THEN
        RAISE EXCEPTION 'Invalid refund status: %', p_refund_status;
    END IF;

    -- 1. Fetch and lock order
    SELECT id, payment_status, total_amount, is_paid, razorpay_refund_id, refund_status
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- 2. Fetch and lock payment record
    SELECT id, status, amount, refund_id, refund_status, raw_response
    INTO v_payment
    FROM public.payments
    WHERE order_id = p_order_id
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE;

    -- Idempotency check: if already processed with this refund_id and matching status
    IF v_order.razorpay_refund_id = p_refund_id AND v_order.refund_status = p_refund_status THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_processed',
            'order_id', v_order.id,
            'refund_id', p_refund_id,
            'message', 'Refund event has already been recorded'
        );
    END IF;

    -- Determine target order/payment status
    IF p_refund_status = 'processed' THEN
        v_target_payment_status := 'Refunded';
    ELSIF p_refund_status = 'pending' THEN
        v_target_payment_status := 'Refund Pending';
    ELSE
        -- Failed refund: payment was collected, so order reverts to Paid, but refund marked failed
        v_target_payment_status := 'Paid';
    END IF;

    -- 3. Update orders table
    UPDATE public.orders
    SET payment_status = v_target_payment_status,
        razorpay_refund_id = p_refund_id,
        refund_amount = p_refund_amount,
        refund_status = p_refund_status,
        refunded_at = CASE WHEN p_refund_status = 'processed' THEN v_now ELSE refunded_at END,
        updated_at = v_now
    WHERE id = p_order_id;

    -- 4. Update payments table if payment record exists
    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET status = v_target_payment_status,
            refund_id = p_refund_id,
            refund_amount = p_refund_amount,
            refund_status = p_refund_status,
            refunded_at = CASE WHEN p_refund_status = 'processed' THEN v_now ELSE refunded_at END,
            raw_response = jsonb_set(COALESCE(raw_response, '{}'::jsonb), '{refund}', COALESCE(p_raw_response, '{}'::jsonb)),
            updated_at = v_now
        WHERE id = v_payment.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_refund_status,
        'payment_status', v_target_payment_status,
        'order_id', v_order.id,
        'refund_id', p_refund_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB) TO postgres, service_role;


-- ==============================================================================
-- 7. FEATURE 0.5: ORDER & PAYMENT STATE MACHINE INTEGRITY TRIGGER (Remediation 2 & 7)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.validate_order_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 1. Validate Order Status Transitions
    IF OLD.order_status <> NEW.order_status THEN
        -- Pending -> Confirmed, Cancelled
        IF OLD.order_status = 'Pending' AND NEW.order_status NOT IN ('Confirmed', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Pending" to "%"', NEW.order_status;
        -- Confirmed -> Packed, Shipped, Cancelled
        ELSIF OLD.order_status = 'Confirmed' AND NEW.order_status NOT IN ('Packed', 'Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Confirmed" to "%"', NEW.order_status;
        -- Packed -> Shipped, Cancelled
        ELSIF OLD.order_status = 'Packed' AND NEW.order_status NOT IN ('Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Packed" to "%"', NEW.order_status;
        -- Shipped -> Out for Delivery, Delivered, Cancelled, Returned
        ELSIF OLD.order_status = 'Shipped' AND NEW.order_status NOT IN ('Out for Delivery', 'Delivered', 'Cancelled', 'Returned') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Shipped" to "%"', NEW.order_status;
        -- Out for Delivery -> Delivered, Cancelled, Returned
        ELSIF OLD.order_status = 'Out for Delivery' AND NEW.order_status NOT IN ('Delivered', 'Cancelled', 'Returned') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Out for Delivery" to "%"', NEW.order_status;
        -- Delivered -> Replacement Requested
        ELSIF OLD.order_status = 'Delivered' AND NEW.order_status NOT IN ('Replacement Requested') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Delivered" to "%"', NEW.order_status;
        -- Cancelled is terminal, EXCEPT recovery of expired reservation upon successful payment settlement
        ELSIF OLD.order_status = 'Cancelled' THEN
            IF NEW.order_status = 'Confirmed' AND OLD.cancel_reason = 'Payment reservation expired' AND NEW.payment_status = 'Paid' THEN
                -- Permitted recovery: late payment arrived and stock was successfully re-reserved
                NULL;
            ELSE
                RAISE EXCEPTION 'Cannot transition cancelled order to "%"', NEW.order_status;
            END IF;
        -- Returned is terminal
        ELSIF OLD.order_status = 'Returned' THEN
            RAISE EXCEPTION 'Cannot transition returned order to "%"', NEW.order_status;
        -- Replacement Requested -> Replacement Approved, Replacement Rejected
        ELSIF OLD.order_status = 'Replacement Requested' AND NEW.order_status NOT IN ('Replacement Approved', 'Replacement Rejected') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Requested" to "%"', NEW.order_status;
        -- Replacement Approved -> Replacement Shipped
        ELSIF OLD.order_status = 'Replacement Approved' AND NEW.order_status NOT IN ('Replacement Shipped') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Approved" to "%"', NEW.order_status;
        -- Replacement Rejected is terminal
        ELSIF OLD.order_status = 'Replacement Rejected' THEN
            RAISE EXCEPTION 'Cannot transition rejected replacement order to "%"', NEW.order_status;
        -- Replacement Shipped -> Replacement Delivered
        ELSIF OLD.order_status = 'Replacement Shipped' AND NEW.order_status NOT IN ('Replacement Delivered') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Shipped" to "%"', NEW.order_status;
        -- Replacement Delivered is terminal
        ELSIF OLD.order_status = 'Replacement Delivered' THEN
            RAISE EXCEPTION 'Cannot transition delivered replacement order to "%"', NEW.order_status;
        END IF;
    END IF;

    -- 2. Validate Payment Status Transitions (Remediation 7)
    IF OLD.payment_status <> NEW.payment_status THEN
        -- Pending -> Paid, Failed, Refund Pending
        IF OLD.payment_status = 'Pending' AND NEW.payment_status NOT IN ('Paid', 'Failed', 'Refund Pending') THEN
            RAISE EXCEPTION 'Invalid payment transition from "Pending" to "%"', NEW.payment_status;
        -- Paid -> Refund Pending, Refunded
        ELSIF OLD.payment_status = 'Paid' AND NEW.payment_status NOT IN ('Refund Pending', 'Refunded') THEN
            RAISE EXCEPTION 'Paid payment status cannot be changed to "%"', NEW.payment_status;
        -- Refund Pending -> Refunded, Paid (in case refund attempt fails and reverts to Paid)
        ELSIF OLD.payment_status = 'Refund Pending' AND NEW.payment_status NOT IN ('Refunded', 'Paid') THEN
            RAISE EXCEPTION 'Refund Pending payment status cannot be changed to "%"', NEW.payment_status;
        -- Failed -> Pending (Retry), Paid, Refund Pending
        ELSIF OLD.payment_status = 'Failed' AND NEW.payment_status NOT IN ('Pending', 'Paid', 'Refund Pending') THEN
            RAISE EXCEPTION 'Invalid payment transition from "Failed" to "%"', NEW.payment_status;
        -- Refunded is terminal
        ELSIF OLD.payment_status = 'Refunded' THEN
            RAISE EXCEPTION 'Refunded payment status cannot be changed to "%"', NEW.payment_status;
        END IF;
    END IF;

    -- 3. Business rule: Online orders cannot be Confirmed unless payment_status is 'Paid'
    IF NEW.order_status = 'Confirmed' AND NEW.payment_method = 'ONLINE' AND NEW.payment_status <> 'Paid' THEN
        RAISE EXCEPTION 'Online prepaid orders cannot be Confirmed without payment_status "Paid".';
    END IF;

    -- 4. Business rule: Refund amount cannot exceed total_amount
    IF NEW.refund_amount IS NOT NULL AND NEW.refund_amount > NEW.total_amount THEN
        RAISE EXCEPTION 'Refund amount (%) exceeds total order amount (%).', NEW.refund_amount, NEW.total_amount;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_state_transitions ON public.orders;
CREATE TRIGGER trg_validate_order_state_transitions
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_order_state_transitions();
