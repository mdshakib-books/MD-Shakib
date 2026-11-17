-- ==============================================================================
-- Migration: 20261111000001_phase02_checkout_hardening.sql
-- Phase 02: Critical Bug Fixes & Checkout Hardening (C-1, H-1, H-2, H-3, H-8)
-- ==============================================================================
-- Remediations implemented:
-- 1. C-1 (Razorpay Refunds & Cancellations):
--    - Expand orders/payments/refund_records status & refund_status constraints to
--      explicitly support NOT_REQUIRED / PENDING / PROCESSING / PROCESSED / FAILED
--      and 'Partially Refunded' states.
--    - Allow nullable authorized_by on refund_records for customer cancellations
--      and webhook-triggered auto-refunds; add refund_type, idempotency_key,
--      attempt_count, raw_response, processed_at.
--    - Harden cancel_order_atomic and record_refund_atomic (prevent synthetic
--      'rfnd_err_*' ID pollution, track cumulative partial refunds, prevent
--      downgrades of settled refunds, and synchronize orders/payments/refund_records).
-- 2. H-1 (COD Fail-Closed Serviceability) & H-2 (RPC & Pricing Security):
--    - Add address_id & cod_serviceability_verified columns on public.orders.
--    - Harden create_order_atomic: validate profile active status, derive
--      address_snapshot from public.addresses owned by p_user_id when p_address_id
--      is supplied, reject unverified COD creation, ignore client-supplied totals
--      and item prices, aggregate duplicate book_ids, serialize concurrent requests
--      on the same idempotency_key with pg_advisory_xact_lock BEFORE mutating
--      discounts/inventory, and optionally lock public.carts (p_require_cart).
--    - REVOKE EXECUTE on create_order_atomic, cancel_order_atomic,
--      record_order_consent_atomic, settle_payment_atomic,
--      record_payment_failure_atomic, record_refund_atomic,
--      release_expired_reservations_atomic, and initiate_return_refund_atomic from
--      PUBLIC, anon, and authenticated; GRANT strictly to service_role and postgres.
-- 3. H-3 (Expired Online Reservations & Cron Cleanup):
--    - Add audit columns on public.orders and public.inventory_reservations.
--    - Harden release_expired_reservations_atomic with strict ONLINE + unpaid +
--      no-Paid-payment checks, deterministic book lock ordering, and refund_status
--      'not_required'.
-- 4. H-8 (Payment Method Switching & Attempt Tracking):
--    - Create public.payment_attempts table with RLS and indexes.
--    - Create prepare_payment_attempt_atomic RPC for race-safe retry / reuse.
--    - Update settle_payment_atomic to resolve orders via payments fallback and
--      upsert refund_records cleanly whenever late settlement requires refund.
-- ==============================================================================

-- ==============================================================================
-- 1. SCHEMA & CONSTRAINT EXTENSIONS
-- ==============================================================================

-- 1.1 public.orders extensions
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS address_id UUID REFERENCES public.addresses(id) ON DELETE SET NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cod_serviceability_verified BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS reservation_expires_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ DEFAULT NULL;

-- Safely replace payment_status & refund_status CHECK constraints on public.orders
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.orders'::regclass
          AND contype = 'c'
          AND (
              pg_get_constraintdef(oid) ILIKE '%payment_status%'
              OR pg_get_constraintdef(oid) ILIKE '%refund_status%'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.orders
    ADD CONSTRAINT orders_payment_status_check
    CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refund Pending', 'Partially Refunded', 'Refunded'));

ALTER TABLE public.orders
    ADD CONSTRAINT orders_refund_status_check
    CHECK (refund_status IS NULL OR refund_status IN ('not_required', 'pending', 'processing', 'processed', 'failed'));

-- 1.2 public.payments extensions
ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS attempt_number INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.payments
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.payments'::regclass
          AND contype = 'c'
          AND (
              pg_get_constraintdef(oid) ~* '\yCHECK\s*\(\s*\(?\s*status\M'
              OR pg_get_constraintdef(oid) ILIKE '%refund_status%'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.payments
    ADD CONSTRAINT payments_status_check
    CHECK (status IN ('Pending', 'Paid', 'Failed', 'Refund Pending', 'Partially Refunded', 'Refunded'));

ALTER TABLE public.payments
    ADD CONSTRAINT payments_refund_status_check
    CHECK (refund_status IS NULL OR refund_status IN ('not_required', 'pending', 'processing', 'processed', 'failed'));

-- 1.3 public.refund_records extensions (Unified ledger for cancellations, returns, & auto-refunds)
ALTER TABLE public.refund_records
    ALTER COLUMN authorized_by DROP NOT NULL;

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS refund_type TEXT NOT NULL DEFAULT 'cancellation';

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT NULL;

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS raw_response JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ DEFAULT NULL;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.refund_records'::regclass
          AND contype = 'c'
          AND (
              pg_get_constraintdef(oid) ~* '\ystatus\M'
              OR pg_get_constraintdef(oid) ILIKE '%refund_type%'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.refund_records DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.refund_records
    ADD CONSTRAINT refund_records_status_check
    CHECK (status IN ('pending', 'processing', 'processed', 'failed'));

ALTER TABLE public.refund_records
    ADD CONSTRAINT refund_records_refund_type_check
    CHECK (refund_type IN ('cancellation', 'return', 'manual'));

DROP INDEX IF EXISTS public.idx_refund_records_return_active;
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_records_return_active
    ON public.refund_records(return_request_id)
    WHERE return_request_id IS NOT NULL AND status IN ('pending', 'processing', 'processed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_records_idempotency_key
    ON public.refund_records(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 1.4 public.inventory_reservations audit columns
ALTER TABLE public.inventory_reservations
    ADD COLUMN IF NOT EXISTS released_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.inventory_reservations
    ADD COLUMN IF NOT EXISTS expired_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.inventory_reservations
    ADD COLUMN IF NOT EXISTS release_reason TEXT DEFAULT NULL;

-- 1.5 public.payment_attempts table (H-8)
CREATE TABLE IF NOT EXISTS public.payment_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK (attempt_number >= 1),
    payment_method TEXT NOT NULL CHECK (payment_method IN ('COD', 'ONLINE')),
    idempotency_key TEXT DEFAULT NULL,
    provider_order_id TEXT DEFAULT NULL,
    status TEXT NOT NULL DEFAULT 'initiated' CHECK (
        status IN ('initiated', 'pending', 'paid', 'failed', 'superseded', 'expired')
    ),
    error_message TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_order_id
    ON public.payment_attempts(order_id, attempt_number DESC);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_user_id
    ON public.payment_attempts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_attempts_provider_order_id
    ON public.payment_attempts(provider_order_id)
    WHERE provider_order_id IS NOT NULL;

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Customers can view own payment attempts" ON public.payment_attempts;
CREATE POLICY "Customers can view own payment attempts"
    ON public.payment_attempts
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all payment attempts" ON public.payment_attempts;
CREATE POLICY "Admins can view all payment attempts"
    ON public.payment_attempts
    FOR SELECT
    TO authenticated
    USING (public.is_staff());

DROP POLICY IF EXISTS "Service role manages payment attempts" ON public.payment_attempts;
CREATE POLICY "Service role manages payment attempts"
    ON public.payment_attempts
    FOR ALL
    TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

-- ==============================================================================
-- 2. ORDER STATE TRANSITION TRIGGER HARDENING (C-1 Partial/Full Refunds)
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
        IF OLD.order_status = 'Pending' AND NEW.order_status NOT IN ('Confirmed', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Pending" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Confirmed' AND NEW.order_status NOT IN ('Processing', 'Packed', 'Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Confirmed" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Processing' AND NEW.order_status NOT IN ('Packed', 'Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Processing" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Packed' AND NEW.order_status NOT IN ('Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Packed" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Shipped' AND NEW.order_status NOT IN ('Out for Delivery', 'Delivered', 'Cancelled', 'Returned') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Shipped" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Out for Delivery' AND NEW.order_status NOT IN ('Delivered', 'Cancelled', 'Returned') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Out for Delivery" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Delivered' AND NEW.order_status NOT IN ('Replacement Requested', 'Returned') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Delivered" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Cancelled' THEN
            IF NEW.order_status = 'Confirmed' AND OLD.cancel_reason = 'Payment reservation expired' AND NEW.payment_status = 'Paid' THEN
                NULL;
            ELSE
                RAISE EXCEPTION 'Cannot transition cancelled order to "%"', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'Returned' THEN
            RAISE EXCEPTION 'Cannot transition returned order to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Replacement Requested' AND NEW.order_status NOT IN ('Replacement Approved', 'Replacement Rejected') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Requested" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Replacement Approved' AND NEW.order_status NOT IN ('Replacement Shipped') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Approved" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Replacement Rejected' THEN
            RAISE EXCEPTION 'Cannot transition rejected replacement order to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Replacement Shipped' AND NEW.order_status NOT IN ('Replacement Delivered') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Shipped" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Replacement Delivered' THEN
            RAISE EXCEPTION 'Cannot transition delivered replacement to "%"', NEW.order_status;
        END IF;
    END IF;

    -- 2. Validate Payment Status Transitions (supports Partial & Processing Refunds)
    IF OLD.payment_status <> NEW.payment_status THEN
        IF OLD.payment_status = 'Pending' AND NEW.payment_status NOT IN ('Paid', 'Failed', 'Refund Pending') THEN
            RAISE EXCEPTION 'Invalid payment transition from "Pending" to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Paid' AND NEW.payment_status NOT IN ('Refund Pending', 'Partially Refunded', 'Refunded') THEN
            RAISE EXCEPTION 'Paid payment status cannot be changed to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Partially Refunded' AND NEW.payment_status NOT IN ('Refund Pending', 'Partially Refunded', 'Refunded', 'Paid') THEN
            RAISE EXCEPTION 'Partially Refunded payment status cannot be changed to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Refund Pending' AND NEW.payment_status NOT IN ('Refunded', 'Partially Refunded', 'Paid') THEN
            RAISE EXCEPTION 'Refund Pending payment status cannot be changed to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Failed' AND NEW.payment_status NOT IN ('Paid') THEN
            RAISE EXCEPTION 'Failed payment status cannot be changed to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Refunded' THEN
            RAISE EXCEPTION 'Refunded payment status cannot be changed to "%"', NEW.payment_status;
        END IF;
    END IF;

    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

-- ==============================================================================
-- 3. HARDEN create_order_atomic (H-2, H-1, H-8)
-- ==============================================================================

DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT, TEXT, UUID, BOOLEAN, BOOLEAN);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_user_id UUID,
    p_items JSONB,
    p_address_snapshot JSONB DEFAULT NULL,
    p_payment_method TEXT DEFAULT 'ONLINE',
    p_total_amount NUMERIC DEFAULT NULL,
    p_idempotency_key TEXT DEFAULT NULL,
    p_coupon_code TEXT DEFAULT NULL,
    p_address_id UUID DEFAULT NULL,
    p_cod_verified BOOLEAN DEFAULT FALSE,
    p_require_cart BOOLEAN DEFAULT FALSE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_id UUID;
    v_item RECORD;
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
    v_platform_fee NUMERIC := 10.00;
    v_delivery_fee NUMERIC := 35.00;
    v_coupon_discount NUMERIC := 0.00;
    v_authoritative_total NUMERIC := 0.00;
    v_coupon RECORD;
    v_reservation_expires TIMESTAMPTZ := NULL;
    v_cached_items RECORD;
    v_normalized_items JSONB;
    v_cart_items JSONB;
    v_request_fingerprint TEXT;
    v_existing_order_id UUID;
    v_existing_fingerprint TEXT;
    v_existing_payment_method TEXT;
    v_target_coupon_status TEXT := 'none';
    v_profile RECORD;
    v_addr RECORD;
    v_cart_id UUID;
    v_effective_snapshot JSONB;
    v_clean_coupon TEXT := NULLIF(UPPER(trim(COALESCE(p_coupon_code, ''))), '');
    v_clean_idem TEXT := NULLIF(trim(COALESCE(p_idempotency_key, '')), '');
BEGIN
    -- 1. Strict service_role gate (H-2): Prevent direct PostgREST RPC bypass from anon/authenticated
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: create_order_atomic can only be invoked by trusted server actions.';
    END IF;

    -- 2. Verify active customer profile
    SELECT id, is_blocked, is_deleted
    INTO v_profile
    FROM public.profiles
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer profile % not found.', p_user_id;
    END IF;

    IF v_profile.is_blocked IS TRUE OR v_profile.is_deleted IS TRUE THEN
        RAISE EXCEPTION 'Account is restricted or deactivated and cannot place orders.';
    END IF;

    -- 3. Validate payment method
    IF p_payment_method NOT IN ('COD', 'ONLINE') THEN
        RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
    END IF;

    -- 4. Enforce H-1 COD server verification invariant even inside DB transaction
    IF p_payment_method = 'COD' AND COALESCE(p_cod_verified, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'Cash on Delivery serviceability must be verified before creating a COD order.';
    END IF;

    -- 5. Validate non-empty items array and normalize/aggregate by book_id
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order items cannot be empty';
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'book_id', agg.book_id::text,
            'quantity', agg.qty
        ) ORDER BY agg.book_id::text
    )
    INTO v_normalized_items
    FROM (
        SELECT
            (item->>'book_id')::UUID AS book_id,
            SUM(COALESCE((item->>'quantity')::INT, 0))::INT AS qty
        FROM jsonb_array_elements(p_items) item
        GROUP BY (item->>'book_id')::UUID
    ) agg;

    IF v_normalized_items IS NULL OR jsonb_array_length(v_normalized_items) = 0 THEN
        RAISE EXCEPTION 'Order items cannot be empty';
    END IF;

    -- 6. Authoritative Address Derivation (H-2)
    IF p_address_id IS NOT NULL THEN
        SELECT *
        INTO v_addr
        FROM public.addresses
        WHERE id = p_address_id AND user_id = p_user_id;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Delivery address % does not exist or does not belong to user.', p_address_id;
        END IF;

        IF trim(COALESCE(v_addr.pincode, '')) !~ '^\d{6}$' THEN
            RAISE EXCEPTION 'Delivery address has an invalid 6-digit pincode.';
        END IF;

        v_effective_snapshot := jsonb_build_object(
            'full_name', trim(v_addr.full_name),
            'phone', trim(v_addr.phone),
            'house_no', trim(v_addr.house_no),
            'area', trim(v_addr.area),
            'city', trim(v_addr.city),
            'state', trim(v_addr.state),
            'pincode', trim(v_addr.pincode),
            'landmark', v_addr.landmark,
            'address_type', v_addr.address_type
        );
    ELSE
        IF COALESCE(p_require_cart, FALSE) IS TRUE THEN
            RAISE EXCEPTION 'Verified address ID (p_address_id) is required for checkout.';
        END IF;

        IF p_address_snapshot IS NULL OR jsonb_typeof(p_address_snapshot) <> 'object' THEN
            RAISE EXCEPTION 'Delivery address snapshot is required.';
        END IF;

        IF trim(COALESCE(p_address_snapshot->>'pincode', '')) !~ '^\d{6}$'
           OR trim(COALESCE(p_address_snapshot->>'full_name', '')) = ''
           OR trim(COALESCE(p_address_snapshot->>'phone', '')) = ''
           OR trim(COALESCE(p_address_snapshot->>'house_no', '')) = ''
           OR trim(COALESCE(p_address_snapshot->>'area', '')) = ''
           OR trim(COALESCE(p_address_snapshot->>'city', '')) = ''
           OR trim(COALESCE(p_address_snapshot->>'state', '')) = '' THEN
            RAISE EXCEPTION 'Delivery address snapshot is incomplete or contains invalid pincode.';
        END IF;

        v_effective_snapshot := jsonb_build_object(
            'full_name', trim(p_address_snapshot->>'full_name'),
            'phone', trim(p_address_snapshot->>'phone'),
            'house_no', trim(p_address_snapshot->>'house_no'),
            'area', trim(p_address_snapshot->>'area'),
            'city', trim(p_address_snapshot->>'city'),
            'state', trim(p_address_snapshot->>'state'),
            'pincode', trim(p_address_snapshot->>'pincode'),
            'landmark', p_address_snapshot->>'landmark',
            'address_type', COALESCE(p_address_snapshot->>'address_type', 'Home')
        );
    END IF;

    -- 7. Compute Canonical Fingerprint (H-8)
    v_request_fingerprint := encode(
        sha256(
            (
                p_user_id::text || '|' ||
                p_payment_method || '|' ||
                COALESCE(p_address_id::text, '') || '|' ||
                COALESCE(v_clean_coupon, '') || '|' ||
                COALESCE(v_normalized_items::text, '[]') || '|' ||
                v_effective_snapshot::text
            )::bytea
        ),
        'hex'
    );

    -- 8. Serialize & Validate Idempotency BEFORE Mutating Discounts or Inventory (H-8 concurrency fix)
    IF v_clean_idem IS NOT NULL THEN
        PERFORM pg_advisory_xact_lock(
            hashtext('create_order:' || p_user_id::text),
            hashtext(v_clean_idem)
        );

        SELECT ik.order_id, ik.request_fingerprint, o.payment_method
        INTO v_existing_order_id, v_existing_fingerprint, v_existing_payment_method
        FROM public.order_idempotency_keys ik
        LEFT JOIN public.orders o ON o.id = ik.order_id
        WHERE ik.user_id = p_user_id AND ik.idempotency_key = v_clean_idem
        FOR UPDATE OF ik;

        IF FOUND THEN
            IF v_existing_fingerprint <> v_request_fingerprint
               OR (v_existing_payment_method IS NOT NULL AND v_existing_payment_method <> p_payment_method) THEN
                RAISE EXCEPTION 'Idempotency conflict: Key "%" has already been used with a different payment method or checkout payload.', v_clean_idem;
            END IF;
            RETURN v_existing_order_id;
        END IF;

        SELECT id, request_fingerprint, payment_method
        INTO v_existing_order_id, v_existing_fingerprint, v_existing_payment_method
        FROM public.orders
        WHERE user_id = p_user_id AND idempotency_key = v_clean_idem
        FOR UPDATE;

        IF FOUND THEN
            IF (v_existing_fingerprint IS NOT NULL AND v_existing_fingerprint <> v_request_fingerprint)
               OR v_existing_payment_method <> p_payment_method THEN
                RAISE EXCEPTION 'Idempotency conflict: Key "%" has already been used with a different payment method or checkout payload.', v_clean_idem;
            END IF;
            RETURN v_existing_order_id;
        END IF;
    END IF;

    -- 9. Lock Customer Cart & Verify Exact Items when p_require_cart is enabled (prevents multi-tab double ordering)
    IF COALESCE(p_require_cart, FALSE) IS TRUE THEN
        SELECT id INTO v_cart_id
        FROM public.carts
        WHERE user_id = p_user_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Your shopping cart has already been checked out or is empty.';
        END IF;

        SELECT jsonb_agg(
            jsonb_build_object(
                'book_id', ci.book_id::text,
                'quantity', ci.quantity
            ) ORDER BY ci.book_id::text
        )
        INTO v_cart_items
        FROM public.cart_items ci
        WHERE ci.cart_id = v_cart_id;

        IF v_cart_items IS NULL OR jsonb_array_length(v_cart_items) = 0 THEN
            RAISE EXCEPTION 'Your shopping cart has already been checked out or is empty.';
        END IF;

        IF v_cart_items IS DISTINCT FROM v_normalized_items THEN
            RAISE EXCEPTION 'Your shopping cart changed while placing this order. Please review your updated cart and retry.';
        END IF;
    END IF;

    -- 10. Server-Authoritative Pricing & Deadlock-Safe Stock Locking
    DROP TABLE IF EXISTS pg_temp.tmp_order_calc_items;
    CREATE TEMP TABLE tmp_order_calc_items (
        book_id UUID PRIMARY KEY,
        title TEXT,
        image_url TEXT,
        effective_price NUMERIC,
        quantity INT,
        line_total NUMERIC
    ) ON COMMIT DROP;

    FOR v_item IN
        SELECT (elem->>'book_id')::UUID AS book_id,
               (elem->>'quantity')::INT AS quantity
        FROM jsonb_array_elements(v_normalized_items) elem
        ORDER BY (elem->>'book_id')::UUID
    LOOP
        v_book_id := v_item.book_id;
        v_quantity := COALESCE(v_item.quantity, 0);

        IF v_quantity < 1 THEN
            RAISE EXCEPTION 'Quantity must be at least 1 for book %', v_book_id;
        END IF;

        IF v_quantity > 1000 THEN
            RAISE EXCEPTION 'Quantity exceeds maximum limit of 1000 units for book %', v_book_id;
        END IF;

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

        v_effective_price := ROUND(v_db_price * (1.0 - (COALESCE(v_db_discount, 0)::NUMERIC / 100.0)), 2);
        v_line_total := ROUND(v_effective_price * v_quantity, 2);
        v_subtotal := v_subtotal + v_line_total;

        INSERT INTO tmp_order_calc_items (
            book_id, title, image_url, effective_price, quantity, line_total
        ) VALUES (
            v_book_id, v_book_title, v_book_image, v_effective_price, v_quantity, v_line_total
        );
    END LOOP;

    -- 11. Authoritative Coupon Validation & Reservation
    IF v_clean_coupon IS NOT NULL THEN
        SELECT * INTO v_coupon
        FROM public.discounts
        WHERE UPPER(code) = v_clean_coupon
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invalid discount coupon code: %', v_clean_coupon;
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

        v_target_coupon_status := CASE WHEN p_payment_method = 'COD' THEN 'consumed' ELSE 'reserved' END;

        UPDATE public.discounts
        SET used_count = used_count + 1
        WHERE id = v_coupon.id;
    END IF;

    v_authoritative_total := GREATEST(0.00, v_subtotal + v_platform_fee + v_delivery_fee - v_coupon_discount);

    IF p_payment_method = 'ONLINE' THEN
        v_reservation_expires := clock_timestamp() + INTERVAL '15 minutes';
    ELSE
        v_reservation_expires := NULL;
    END IF;

    -- 12. Insert Order Record (ignores any client p_total_amount)
    INSERT INTO public.orders (
        user_id,
        address_id,
        cod_serviceability_verified,
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
        request_fingerprint,
        reservation_expires_at
    ) VALUES (
        p_user_id,
        p_address_id,
        (p_payment_method = 'COD' AND COALESCE(p_cod_verified, FALSE)),
        v_authoritative_total,
        v_subtotal,
        v_platform_fee,
        v_delivery_fee,
        v_coupon_discount,
        v_clean_coupon,
        v_target_coupon_status,
        p_payment_method,
        'Pending',
        'Pending',
        v_effective_snapshot,
        FALSE,
        v_clean_idem,
        v_request_fingerprint,
        v_reservation_expires
    ) RETURNING id INTO v_order_id;

    IF v_clean_idem IS NOT NULL THEN
        INSERT INTO public.order_idempotency_keys (
            idempotency_key,
            user_id,
            request_fingerprint,
            order_id
        ) VALUES (
            v_clean_idem,
            p_user_id,
            v_request_fingerprint,
            v_order_id
        )
        ON CONFLICT (user_id, idempotency_key) DO NOTHING;
    END IF;

    -- 13. Decrement Stock & Create Reservations/Order Items
    FOR v_cached_items IN SELECT * FROM tmp_order_calc_items ORDER BY book_id
    LOOP
        UPDATE public.books
        SET stock = stock - v_cached_items.quantity
        WHERE id = v_cached_items.book_id;

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

    -- 14. Clear customer cart atomically
    DELETE FROM public.cart_items
    WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = p_user_id);

    RETURN v_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT, TEXT, UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT, TEXT, UUID, BOOLEAN, BOOLEAN) TO postgres, service_role;

-- ==============================================================================
-- 4. HARDEN cancel_order_atomic & record_refund_atomic (C-1 & H-2)
-- ==============================================================================

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
    v_already_refunded NUMERIC := 0;
BEGIN
    -- Strict service_role gate (H-2): Prevent direct browser RPC bypass skipping C-1 refund orchestration
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: cancel_order_atomic can only be invoked by trusted server actions.';
    END IF;

    -- Validate administrative privilege against active profile row
    IF p_is_admin THEN
        SELECT (role IN ('super_admin', 'admin', 'order_manager') AND is_blocked = FALSE AND is_deleted = FALSE)
        INTO v_actual_is_admin
        FROM public.profiles
        WHERE id = p_user_id;

        IF v_actual_is_admin IS NOT TRUE THEN
            RAISE EXCEPTION 'Unauthorized: Administrative role required to cancel arbitrary orders.';
        END IF;
    END IF;

    -- Lock order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- Ownership check for non-admin callers
    IF NOT v_actual_is_admin AND v_order.user_id <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to cancel order %', p_order_id;
    END IF;

    -- Customers cannot cancel once physically handed to courier
    IF NOT v_actual_is_admin AND v_order.order_status IN ('Shipped', 'Out for Delivery') THEN
        RAISE EXCEPTION 'Order has already been dispatched with courier (AWB: %) and cannot be cancelled by customer. Please request return/refund upon delivery.',
            COALESCE(v_order.shipping_awb, 'N/A');
    END IF;

    -- Terminal state guard
    IF v_order.order_status IN ('Cancelled', 'Delivered', 'Returned') OR v_order.order_status LIKE 'Replacement%' THEN
        RAISE EXCEPTION 'Order cannot be cancelled in % status', v_order.order_status;
    END IF;

    -- Restore inventory in deterministic book_id order ONLY if not yet physically dispatched
    IF v_order.order_status NOT IN ('Shipped', 'Out for Delivery') THEN
        FOR v_res IN
            SELECT id, book_id, quantity
            FROM public.inventory_reservations
            WHERE order_id = p_order_id AND status IN ('reserved', 'committed')
            ORDER BY book_id, id
            FOR UPDATE
        LOOP
            UPDATE public.books
            SET stock = stock + v_res.quantity
            WHERE id = v_res.book_id;

            UPDATE public.inventory_reservations
            SET status = 'released',
                released_at = v_now,
                release_reason = 'order_cancelled',
                updated_at = v_now
            WHERE id = v_res.id;
        END LOOP;
    ELSE
        UPDATE public.inventory_reservations
        SET status = 'released',
            released_at = v_now,
            release_reason = 'cancelled_post_dispatch_no_restock',
            updated_at = v_now
        WHERE order_id = p_order_id AND status IN ('reserved', 'committed');
    END IF;

    -- Release order-specific coupon usage exactly once
    v_target_coupon_status := v_order.coupon_status;
    IF v_order.coupon_status IN ('reserved', 'consumed') AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts
        SET used_count = GREATEST(used_count - 1, 0)
        WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));

        v_target_coupon_status := 'released';
    END IF;

    -- Determine refund lifecycle state
    IF (v_order.is_paid IS TRUE OR v_order.payment_status IN ('Paid', 'Partially Refunded')) AND v_order.payment_method = 'ONLINE' THEN
        SELECT COALESCE(SUM(amount), 0)
        INTO v_already_refunded
        FROM public.refund_records
        WHERE order_id = p_order_id AND status = 'processed';

        v_target_payment_status := 'Refund Pending';
        v_target_refund_status := 'pending';
        v_target_refund_amount := GREATEST(0, v_order.total_amount - v_already_refunded);
    ELSE
        v_target_payment_status := 'Failed';
        v_target_refund_status := 'not_required';
        v_target_refund_amount := NULL;
    END IF;

    UPDATE public.orders
    SET order_status = 'Cancelled',
        cancel_reason = COALESCE(NULLIF(trim(p_cancel_reason), ''), 'Cancelled by customer'),
        payment_status = v_target_payment_status,
        refund_status = v_target_refund_status,
        refund_amount = v_target_refund_amount,
        coupon_status = v_target_coupon_status,
        updated_at = v_now
    WHERE id = p_order_id;

    -- Mark any pending payment attempts as superseded so no stale checkout proceeds blindly
    UPDATE public.payment_attempts
    SET status = 'superseded',
        updated_at = v_now
    WHERE order_id = p_order_id AND status IN ('initiated', 'pending');

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) TO postgres, service_role;

-- Upgrade record_refund_atomic (preserves 5-arg signature + adds optional 6 trailing params)
DROP FUNCTION IF EXISTS public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TEXT, UUID);

CREATE OR REPLACE FUNCTION public.record_refund_atomic(
    p_order_id UUID,
    p_refund_id TEXT,
    p_refund_amount NUMERIC,
    p_refund_status TEXT,
    p_raw_response JSONB DEFAULT '{}'::jsonb,
    p_idempotency_key TEXT DEFAULT NULL,
    p_refund_type TEXT DEFAULT 'cancellation',
    p_reason TEXT DEFAULT NULL,
    p_authorized_by UUID DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_refund_record_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_payment RECORD;
    v_rec RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_target_payment_status TEXT;
    v_clean_refund_id TEXT := NULLIF(trim(COALESCE(p_refund_id, '')), '');
    v_is_real_gateway_id BOOLEAN := FALSE;
    v_existing_settled NUMERIC := 0.00;
    v_effective_settled NUMERIC := 0.00;
    v_refund_rec_id UUID;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Recording refunds requires service-role or admin credentials.';
        END IF;
    END IF;

    IF p_refund_status NOT IN ('not_required', 'pending', 'processing', 'processed', 'failed') THEN
        RAISE EXCEPTION 'Invalid refund status: %', p_refund_status;
    END IF;

    IF p_refund_type NOT IN ('cancellation', 'return', 'manual') THEN
        RAISE EXCEPTION 'Invalid refund type: %', p_refund_type;
    END IF;

    -- Ignore legacy synthetic error IDs so orders.razorpay_refund_id stays clean
    IF v_clean_refund_id IS NOT NULL AND v_clean_refund_id NOT LIKE 'rfnd_err_%' THEN
        v_is_real_gateway_id := TRUE;
    ELSE
        v_clean_refund_id := NULL;
    END IF;

    IF p_refund_status <> 'not_required' AND (p_refund_amount IS NULL OR p_refund_amount <= 0) THEN
        RAISE EXCEPTION 'Refund amount must be positive';
    END IF;

    IF p_refund_status IN ('processing', 'processed') AND NOT v_is_real_gateway_id THEN
        RAISE EXCEPTION 'A real gateway refund ID is required when status is "%".', p_refund_status;
    END IF;

    -- 1. Lock order
    SELECT id, payment_status, payment_method, total_amount, is_paid, razorpay_refund_id, refund_status, refund_amount
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    IF p_refund_status = 'not_required' THEN
        UPDATE public.orders
        SET refund_status = 'not_required',
            refund_amount = NULL,
            updated_at = v_now
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'not_required',
            'order_id', v_order.id,
            'payment_status', v_order.payment_status
        );
    END IF;

    -- Lock existing refund_records matching refund_record_id, gateway_refund_id, or idempotency_key
    IF p_refund_record_id IS NOT NULL THEN
        SELECT * INTO v_rec FROM public.refund_records WHERE id = p_refund_record_id FOR UPDATE;
    ELSIF v_is_real_gateway_id THEN
        SELECT * INTO v_rec FROM public.refund_records WHERE gateway_refund_id = v_clean_refund_id FOR UPDATE;
    END IF;

    IF v_rec.id IS NULL AND p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        SELECT * INTO v_rec FROM public.refund_records WHERE idempotency_key = trim(p_idempotency_key) FOR UPDATE;
    END IF;

    -- Prevent downgrading an already processed refund_records row
    IF v_rec.id IS NOT NULL AND v_rec.status = 'processed' THEN
        IF p_refund_status = 'processed' THEN
            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_processed',
                'order_id', v_order.id,
                'refund_id', COALESCE(v_rec.gateway_refund_id, v_clean_refund_id),
                'refund_record_id', v_rec.id,
                'message', 'Refund event has already been recorded'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'cannot_downgrade_processed_refund',
            'message', 'Refund ' || COALESCE(v_rec.gateway_refund_id, v_rec.id::text) || ' is already processed and cannot be downgraded to ' || p_refund_status
        );
    END IF;

    -- Legacy single-order downgrade & conflict defense when no multi-partial refund_records match exists
    IF v_rec.id IS NULL AND v_order.refund_status = 'processed' AND v_order.payment_status = 'Refunded' THEN
        IF v_is_real_gateway_id AND v_order.razorpay_refund_id = v_clean_refund_id AND p_refund_status = 'processed' THEN
            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_processed',
                'order_id', v_order.id,
                'refund_id', v_clean_refund_id,
                'message', 'Refund event has already been recorded'
            );
        ELSIF p_refund_status <> 'processed' THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'cannot_downgrade_processed_refund',
                'message', 'Order already has a fully processed refund; cannot downgrade to ' || p_refund_status
            );
        ELSIF v_is_real_gateway_id AND v_order.razorpay_refund_id IS NOT NULL AND v_order.razorpay_refund_id <> v_clean_refund_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'refund_id_conflict',
                'message', 'Conflict: Order already has settled refund ' || v_order.razorpay_refund_id || '; incoming refund ID: ' || v_clean_refund_id
            );
        END IF;
    END IF;

    -- Cumulative refund cap across all processed refunds for this order
    SELECT COALESCE(SUM(amount), 0)
    INTO v_existing_settled
    FROM public.refund_records
    WHERE order_id = p_order_id
      AND status = 'processed'
      AND (v_rec.id IS NULL OR id <> v_rec.id);

    IF p_refund_status IN ('pending', 'processing', 'processed')
       AND (v_existing_settled + p_refund_amount) > (v_order.total_amount + 0.01) THEN
        RAISE EXCEPTION 'Cumulative refund amount (%) exceeds order total (%)',
            (v_existing_settled + p_refund_amount), v_order.total_amount;
    END IF;

    -- Lock latest Paid/Refunded/Pending payment row
    SELECT id, status, amount, refund_id, refund_status, raw_response
    INTO v_payment
    FROM public.payments
    WHERE order_id = p_order_id
    ORDER BY (CASE WHEN status IN ('Paid', 'Refund Pending', 'Partially Refunded', 'Refunded') THEN 0 ELSE 1 END), created_at DESC
    LIMIT 1
    FOR UPDATE;

    -- Insert or update refund_records ledger
    IF v_rec.id IS NOT NULL THEN
        UPDATE public.refund_records
        SET gateway_refund_id = COALESCE(v_clean_refund_id, gateway_refund_id),
            amount = p_refund_amount,
            status = p_refund_status,
            gateway_status = p_refund_status,
            reason = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), reason),
            authorized_by = COALESCE(p_authorized_by, authorized_by),
            error_message = CASE WHEN p_refund_status = 'failed' THEN COALESCE(p_error_message, error_message) ELSE NULL END,
            attempt_count = CASE WHEN p_refund_status IN ('pending', 'processing') THEN attempt_count + 1 ELSE attempt_count END,
            raw_response = COALESCE(p_raw_response, raw_response),
            processed_at = CASE WHEN p_refund_status = 'processed' THEN COALESCE(processed_at, v_now) ELSE processed_at END,
            updated_at = v_now
        WHERE id = v_rec.id
        RETURNING id INTO v_refund_rec_id;
    ELSE
        INSERT INTO public.refund_records (
            order_id,
            gateway_refund_id,
            amount,
            currency,
            status,
            gateway_status,
            reason,
            authorized_by,
            refund_type,
            idempotency_key,
            error_message,
            raw_response,
            processed_at
        ) VALUES (
            p_order_id,
            v_clean_refund_id,
            p_refund_amount,
            'INR',
            p_refund_status,
            p_refund_status,
            COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Order refund'),
            p_authorized_by,
            p_refund_type,
            NULLIF(trim(COALESCE(p_idempotency_key, '')), ''),
            CASE WHEN p_refund_status = 'failed' THEN p_error_message ELSE NULL END,
            COALESCE(p_raw_response, '{}'::jsonb),
            CASE WHEN p_refund_status = 'processed' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_refund_rec_id;
    END IF;

    v_effective_settled := CASE
        WHEN p_refund_status = 'processed' THEN v_existing_settled + p_refund_amount
        ELSE v_existing_settled
    END;

    -- Determine authoritative payment_status on orders & payments
    IF p_refund_status = 'processed' THEN
        IF v_effective_settled >= (v_order.total_amount - 0.01) THEN
            v_target_payment_status := 'Refunded';
        ELSE
            v_target_payment_status := 'Partially Refunded';
        END IF;
    ELSIF p_refund_status IN ('pending', 'processing') THEN
        v_target_payment_status := 'Refund Pending';
    ELSE
        -- Refund attempt failed: payment remains captured (Paid or Partially Refunded)
        IF v_existing_settled > 0 THEN
            v_target_payment_status := 'Partially Refunded';
        ELSE
            v_target_payment_status := 'Paid';
        END IF;
    END IF;

    UPDATE public.orders
    SET payment_status = v_target_payment_status,
        razorpay_refund_id = COALESCE(v_clean_refund_id, razorpay_refund_id),
        refund_amount = CASE
            WHEN v_effective_settled > 0 THEN v_effective_settled
            ELSE p_refund_amount
        END,
        refund_status = p_refund_status,
        refunded_at = CASE WHEN p_refund_status = 'processed' THEN v_now ELSE refunded_at END,
        updated_at = v_now
    WHERE id = p_order_id;

    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET status = v_target_payment_status,
            refund_id = COALESCE(v_clean_refund_id, refund_id),
            refund_amount = CASE
                WHEN v_effective_settled > 0 THEN v_effective_settled
                ELSE p_refund_amount
            END,
            refund_status = p_refund_status,
            refunded_at = CASE WHEN p_refund_status = 'processed' THEN v_now ELSE refunded_at END,
            raw_response = jsonb_set(COALESCE(raw_response, '{}'::jsonb), '{refund}', COALESCE(p_raw_response, '{}'::jsonb)),
            updated_at = v_now
        WHERE id = v_payment.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_refund_status,
        'order_id', v_order.id,
        'refund_id', v_clean_refund_id,
        'refund_record_id', v_refund_rec_id,
        'payment_status', v_target_payment_status,
        'cumulative_refunded', v_effective_settled
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TEXT, UUID) TO postgres, service_role;

-- ==============================================================================
-- 5. HARDEN release_expired_reservations_atomic (H-3)
-- ==============================================================================

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
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Global cleanup requires service-role or administrative privileges.';
        END IF;
    END IF;

    IF p_limit IS NULL OR p_limit < 1 THEN
        v_effective_limit := 50;
    ELSIF p_limit > 500 THEN
        v_effective_limit := 500;
    ELSE
        v_effective_limit := p_limit;
    END IF;

    -- Find eligible expired unpaid ONLINE orders with SKIP LOCKED to stay safe under concurrent workers
    FOR v_order_id IN
        SELECT o.id
        FROM public.orders o
        WHERE o.payment_method = 'ONLINE'
          AND COALESCE(o.is_paid, FALSE) = FALSE
          AND o.payment_status = 'Pending'
          AND o.order_status = 'Pending'
          AND EXISTS (
              SELECT 1
              FROM public.inventory_reservations r
              WHERE r.order_id = o.id
                AND r.status = 'reserved'
                AND r.expires_at IS NOT NULL
                AND r.expires_at < v_now
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.payments p
              WHERE p.order_id = o.id
                AND p.status = 'Paid'
          )
        ORDER BY o.id
        LIMIT v_effective_limit
        FOR UPDATE OF o SKIP LOCKED
    LOOP
        SELECT * INTO v_order_rec FROM public.orders WHERE id = v_order_id FOR UPDATE;

        -- Double-check invariants after row lock
        IF v_order_rec.order_status <> 'Pending'
           OR v_order_rec.payment_status <> 'Pending'
           OR v_order_rec.is_paid IS TRUE THEN
            CONTINUE;
        END IF;

        -- Lock and restore stock in deterministic book_id order
        FOR v_res IN
            SELECT id, book_id, quantity
            FROM public.inventory_reservations
            WHERE order_id = v_order_id AND status = 'reserved'
            ORDER BY book_id, id
            FOR UPDATE
        LOOP
            UPDATE public.books
            SET stock = stock + v_res.quantity
            WHERE id = v_res.book_id;

            UPDATE public.inventory_reservations
            SET status = 'expired',
                expired_at = v_now,
                released_at = v_now,
                release_reason = 'reservation_expired',
                updated_at = v_now
            WHERE id = v_res.id;
        END LOOP;

        -- Release coupon reservation exactly once
        IF v_order_rec.coupon_status = 'reserved' AND v_order_rec.coupon_code IS NOT NULL AND trim(v_order_rec.coupon_code) <> '' THEN
            UPDATE public.discounts
            SET used_count = GREATEST(used_count - 1, 0)
            WHERE UPPER(code) = UPPER(trim(v_order_rec.coupon_code));

            UPDATE public.orders
            SET coupon_status = 'released'
            WHERE id = v_order_id;
        END IF;

        -- Mark order cancelled due to expiration (payments rows remain 'Pending' so late capture can still reconcile/recover)
        UPDATE public.orders
        SET order_status = 'Cancelled',
            payment_status = 'Failed',
            refund_status = 'not_required',
            cancel_reason = 'Payment reservation expired',
            expired_at = v_now,
            updated_at = v_now
        WHERE id = v_order_id;

        UPDATE public.payment_attempts
        SET status = 'expired',
            updated_at = v_now
        WHERE order_id = v_order_id AND status IN ('initiated', 'pending');

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

-- ==============================================================================
-- 6. HARDEN settle_payment_atomic & ADD prepare_payment_attempt_atomic (H-8, H-3, C-1)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prepare_payment_attempt_atomic(
    p_order_id UUID,
    p_user_id UUID,
    p_force_new_attempt BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_existing_payment RECORD;
    v_next_attempt INT;
    v_has_expired BOOLEAN := FALSE;
    v_inactive_count INT := 0;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_new_expiry TIMESTAMPTZ := clock_timestamp() + INTERVAL '15 minutes';
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: prepare_payment_attempt_atomic requires server execution.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF v_order.user_id <> p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Order does not belong to user.');
    END IF;

    IF v_order.payment_method <> 'ONLINE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only ONLINE orders support online payment attempts.');
    END IF;

    IF v_order.is_paid IS TRUE OR v_order.payment_status IN ('Paid', 'Partially Refunded', 'Refund Pending', 'Refunded') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order payment is already settled or refunded.');
    END IF;

    IF v_order.order_status <> 'Pending' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment cannot be initiated in order status ' || v_order.order_status || '.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.payments WHERE order_id = p_order_id AND status = 'Paid') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Payment has already been captured for this order.');
    END IF;

    -- Ensure all items are still active
    SELECT COUNT(*) INTO v_inactive_count
    FROM public.order_items oi
    JOIN public.books b ON b.id = oi.book_id
    WHERE oi.order_id = p_order_id AND b.is_active IS NOT TRUE;

    IF v_inactive_count > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'One or more books in this order are no longer active.');
    END IF;

    -- Check reservation status: if still 'reserved', refresh TTL for 15 minutes so payment attempt doesn't expire mid-checkout
    SELECT EXISTS (
        SELECT 1 FROM public.inventory_reservations
        WHERE order_id = p_order_id AND status IN ('expired', 'released')
    ) INTO v_has_expired;

    IF v_has_expired THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order inventory reservation has already expired or been released. Please place a new order.');
    END IF;

    UPDATE public.inventory_reservations
    SET expires_at = GREATEST(COALESCE(expires_at, v_new_expiry), v_new_expiry),
        updated_at = v_now
    WHERE order_id = p_order_id AND status = 'reserved';

    UPDATE public.orders
    SET reservation_expires_at = v_new_expiry,
        updated_at = v_now
    WHERE id = p_order_id;

    -- Check existing active Pending Razorpay order
    SELECT * INTO v_existing_payment
    FROM public.payments
    WHERE order_id = p_order_id
      AND provider = 'Razorpay'
      AND status = 'Pending'
      AND is_active = TRUE
    ORDER BY attempt_number DESC, created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND AND COALESCE(p_force_new_attempt, FALSE) IS NOT TRUE AND v_existing_payment.provider_order_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', true,
            'action', 'reuse',
            'provider_order_id', v_existing_payment.provider_order_id,
            'attempt_number', v_existing_payment.attempt_number,
            'amount', v_order.total_amount
        );
    END IF;

    -- Mark previous pending attempts superseded when forcing a new attempt
    IF COALESCE(p_force_new_attempt, FALSE) IS TRUE THEN
        UPDATE public.payments
        SET is_active = FALSE,
            updated_at = v_now
        WHERE order_id = p_order_id AND is_active = TRUE AND status = 'Pending';

        UPDATE public.payment_attempts
        SET status = 'superseded',
            updated_at = v_now
        WHERE order_id = p_order_id AND status IN ('initiated', 'pending');
    END IF;

    SELECT COALESCE(MAX(attempt_number), 0) + 1
    INTO v_next_attempt
    FROM public.payments
    WHERE order_id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'action', 'create_new',
        'attempt_number', v_next_attempt,
        'amount', v_order.total_amount
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.prepare_payment_attempt_atomic(UUID, UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_payment_attempt_atomic(UUID, UUID, BOOLEAN) TO postgres, service_role;

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
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Payment settlement requires service-role credentials.';
        END IF;
    END IF;

    IF p_razorpay_order_id IS NULL OR trim(p_razorpay_order_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'status', 'invalid_provider_order_id', 'message', 'Provider order ID cannot be empty');
    END IF;

    IF p_razorpay_payment_id IS NULL OR trim(p_razorpay_payment_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'status', 'invalid_provider_payment_id', 'message', 'Provider payment ID cannot be empty');
    END IF;

    -- Lock candidate order row (direct match on orders.razorpay_order_id OR fallback via payments.provider_order_id for multi-attempt retry safety)
    SELECT * INTO v_order
    FROM public.orders
    WHERE razorpay_order_id = p_razorpay_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        SELECT o.* INTO v_order
        FROM public.orders o
        JOIN public.payments p ON p.order_id = o.id
        WHERE p.provider_order_id = p_razorpay_order_id
        LIMIT 1
        FOR UPDATE OF o;
    END IF;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'order_not_found',
            'message', 'No order associated with Razorpay order ID ' || p_razorpay_order_id
        );
    END IF;

    IF v_order.payment_method = 'COD' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_payment_method',
            'message', 'COD orders cannot be settled via online prepaid webhook'
        );
    END IF;

    SELECT * INTO v_payment
    FROM public.payments
    WHERE provider_order_id = p_razorpay_order_id
    FOR UPDATE;

    IF v_payment.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_not_found',
            'message', 'Payment settlement rejected: No matching payment record found for provider order ' || p_razorpay_order_id
        );
    END IF;

    IF v_payment.order_id <> v_order.id THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_order_mismatch',
            'message', 'Payment settlement rejected: Payment record belongs to order ' || v_payment.order_id || ', expected ' || v_order.id
        );
    END IF;

    IF v_payment.provider IS NULL OR v_payment.provider <> 'Razorpay' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_provider_mismatch',
            'message', 'Payment settlement rejected: Expected Razorpay provider.'
        );
    END IF;

    IF v_payment.status IN ('Refunded', 'Refund Pending', 'Partially Refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_status_invalid',
            'message', 'Payment settlement rejected: Payment record has status ' || v_payment.status
        );
    END IF;

    IF v_payment.status = 'Failed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_status_invalid',
            'message', 'Payment settlement rejected: Payment record is marked as Failed.'
        );
    END IF;

    IF (v_order.is_paid IS FALSE AND v_order.payment_status <> 'Paid') AND v_payment.status <> 'Pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_status_invalid',
            'message', 'Payment settlement rejected: Unsettled order requires Pending payment record, found ' || v_payment.status
        );
    END IF;

    IF v_payment.amount IS NULL OR ABS(v_payment.amount - v_order.total_amount) > 0.01 OR v_payment.currency IS NULL OR UPPER(v_payment.currency) <> 'INR' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_amount_mismatch',
            'message', 'Payment settlement rejected: Payment record amount or currency mismatch with order.'
        );
    END IF;

    -- Extract mandatory currency & amount evidence
    IF p_raw_response IS NOT NULL THEN
        IF p_raw_response ? 'currency' THEN
            v_raw_currency := UPPER(p_raw_response->>'currency');
        ELSIF p_raw_response #> '{payment,entity,currency}' IS NOT NULL THEN
            v_raw_currency := UPPER(p_raw_response #>> '{payment,entity,currency}');
        ELSIF p_raw_response #> '{payment,currency}' IS NOT NULL THEN
            v_raw_currency := UPPER(p_raw_response #>> '{payment,currency}');
        ELSIF p_raw_response #> '{payload,payment,entity,currency}' IS NOT NULL THEN
            v_raw_currency := UPPER(p_raw_response #>> '{payload,payment,entity,currency}');
        ELSIF p_raw_response #> '{order,entity,currency}' IS NOT NULL THEN
            v_raw_currency := UPPER(p_raw_response #>> '{order,entity,currency}');
        ELSIF p_raw_response #> '{payload,order,entity,currency}' IS NOT NULL THEN
            v_raw_currency := UPPER(p_raw_response #>> '{payload,order,entity,currency}');
        END IF;

        IF p_raw_response ? 'amount' THEN
            BEGIN v_raw_amount := (p_raw_response->>'amount')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{payment,entity,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{payment,entity,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{payment,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{payment,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{payload,payment,entity,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{payload,payment,entity,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{order,entity,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{order,entity,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{payload,order,entity,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{payload,order,entity,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        END IF;

        IF v_raw_amount IS NOT NULL AND v_raw_amount > (v_order.total_amount * 10) THEN
            v_raw_amount := v_raw_amount / 100.0;
        END IF;
    END IF;

    IF v_raw_currency IS NULL OR trim(v_raw_currency) = '' THEN
        RETURN jsonb_build_object('success', false, 'status', 'missing_provider_currency', 'message', 'Payment settlement rejected: Provider currency evidence is missing.');
    END IF;

    IF v_raw_currency <> 'INR' THEN
        RETURN jsonb_build_object('success', false, 'status', 'currency_mismatch', 'message', 'Payment settlement rejected: Currency mismatch. Expected INR but received ' || v_raw_currency);
    END IF;

    IF v_raw_amount IS NULL OR v_raw_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'status', 'missing_provider_amount', 'message', 'Payment settlement rejected: Provider amount evidence is missing or invalid.');
    END IF;

    IF ABS(v_raw_amount - v_order.total_amount) > 0.01 THEN
        RETURN jsonb_build_object('success', false, 'status', 'amount_mismatch', 'message', 'Payment settlement rejected: Amount mismatch.');
    END IF;

    -- Payment identity conflict check
    IF v_payment.provider_payment_id IS NOT NULL AND trim(v_payment.provider_payment_id) <> '' THEN
        IF v_payment.provider_payment_id <> p_razorpay_payment_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_id_conflict',
                'message', 'Payment record identity mismatch: Record already settled under ' || v_payment.provider_payment_id,
                'order_id', v_order.id
            );
        END IF;
    END IF;

    IF v_order.razorpay_payment_id IS NOT NULL AND trim(v_order.razorpay_payment_id) <> '' THEN
        IF v_order.razorpay_payment_id <> p_razorpay_payment_id THEN
            -- Duplicate payment attempt captured after order was already paid under another attempt
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = COALESCE(p_signature, signature),
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_id_conflict',
                'message', 'Order already settled under payment ID ' || v_order.razorpay_payment_id || '; duplicate capture ' || p_razorpay_payment_id || ' requires refund.',
                'order_id', v_order.id,
                'requires_refund', TRUE,
                'duplicate_payment_id', p_razorpay_payment_id
            );
        END IF;
    END IF;

    -- Already-Paid Replay / Pending Payment Record Reconciliation
    IF (v_order.is_paid IS TRUE OR v_order.payment_status = 'Paid') THEN
        IF v_order.razorpay_payment_id IS NULL OR trim(v_order.razorpay_payment_id) = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'missing_payment_identity',
                'message', 'Order marked Paid without stored payment ID.',
                'order_id', v_order.id
            );
        END IF;

        IF v_order.payment_status IN ('Refunded', 'Partially Refunded', 'Refund Pending') THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'order_status_invalid',
                'message', 'Order has status ' || v_order.payment_status || '. Replay settlement is invalid.',
                'order_id', v_order.id
            );
        END IF;

        IF v_payment.status = 'Paid' THEN
            IF v_payment.provider_payment_id IS NULL OR trim(v_payment.provider_payment_id) = '' THEN
                UPDATE public.payments
                SET provider_payment_id = p_razorpay_payment_id,
                    signature = COALESCE(p_signature, signature),
                    raw_response = COALESCE(p_raw_response, raw_response),
                    updated_at = v_now
                WHERE id = v_payment.id;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_paid',
                'order_id', v_order.id,
                'user_id', v_order.user_id,
                'settled', false,
                'reconciled', false
            );
        ELSIF v_payment.status = 'Pending' THEN
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = COALESCE(p_signature, signature),
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;

            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_paid',
                'order_id', v_order.id,
                'user_id', v_order.user_id,
                'settled', false,
                'reconciled', true
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_record_status_invalid',
                'message', 'Payment record status ' || v_payment.status || ' cannot be reconciled on paid order.',
                'order_id', v_order.id
            );
        END IF;
    END IF;

    -- Validate Inventory Reservation Coverage
    SELECT COUNT(DISTINCT book_id) INTO v_items_distinct_count FROM public.order_items WHERE order_id = v_order.id;
    SELECT COUNT(DISTINCT book_id) INTO v_res_distinct_count
    FROM public.inventory_reservations
    WHERE order_id = v_order.id AND status = 'reserved' AND (expires_at IS NULL OR expires_at >= v_now);

    SELECT COUNT(*) INTO v_mismatch_count
    FROM (SELECT book_id, SUM(quantity) AS item_qty FROM public.order_items WHERE order_id = v_order.id GROUP BY book_id) oi
    FULL OUTER JOIN (
        SELECT book_id, SUM(quantity) AS reserved_qty
        FROM public.inventory_reservations
        WHERE order_id = v_order.id AND status = 'reserved' AND (expires_at IS NULL OR expires_at >= v_now)
        GROUP BY book_id
    ) r ON oi.book_id = r.book_id
    WHERE oi.item_qty IS NULL OR r.reserved_qty IS NULL OR oi.item_qty <> r.reserved_qty;

    v_exact_coverage := (v_items_distinct_count > 0 AND v_items_distinct_count = v_res_distinct_count AND v_mismatch_count = 0);

    -- Path A: Valid reservation & Pending order
    IF v_exact_coverage IS TRUE AND v_order.order_status = 'Pending' THEN
        UPDATE public.orders
        SET payment_status = 'Paid',
            order_status = 'Confirmed',
            is_paid = TRUE,
            paid_at = v_now,
            coupon_status = CASE WHEN coupon_status = 'reserved' THEN 'consumed' ELSE coupon_status END,
            razorpay_order_id = p_razorpay_order_id,
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = v_now
        WHERE id = v_order.id;

        UPDATE public.payments
        SET provider_payment_id = p_razorpay_payment_id,
            signature = p_signature,
            status = 'Paid',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;

        UPDATE public.payment_attempts
        SET status = CASE WHEN provider_order_id = p_razorpay_order_id THEN 'paid' ELSE 'superseded' END,
            updated_at = v_now
        WHERE order_id = v_order.id AND status IN ('initiated', 'pending');

        UPDATE public.inventory_reservations
        SET status = 'committed',
            expires_at = NULL,
            updated_at = v_now
        WHERE order_id = v_order.id AND status = 'reserved';

        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (v_order.id, 'Confirmed', 'Payment settled and verified via Razorpay (' || p_razorpay_payment_id || ')', v_now);

        RETURN jsonb_build_object(
            'success', true,
            'status', 'settled',
            'order_id', v_order.id,
            'user_id', v_order.user_id,
            'settled', true
        );
    END IF;

    -- Path B1: Non-recoverable Cancelled order -> mark paid & requires refund with tracked refund_record
    IF v_order.order_status = 'Cancelled' AND (v_order.cancel_reason IS NULL OR v_order.cancel_reason <> 'Payment reservation expired') THEN
        UPDATE public.payments
        SET provider_payment_id = p_razorpay_payment_id,
            signature = p_signature,
            status = 'Paid',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;

        UPDATE public.orders
        SET payment_status = 'Paid',
            is_paid = TRUE,
            paid_at = v_now,
            refund_status = 'pending',
            refund_amount = v_order.total_amount,
            razorpay_order_id = p_razorpay_order_id,
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = v_now
        WHERE id = v_order.id;

        INSERT INTO public.refund_records (
            order_id, amount, currency, status, reason, refund_type, idempotency_key, raw_response
        ) VALUES (
            v_order.id, v_order.total_amount, 'INR', 'pending',
            'Late payment captured for cancelled order', 'cancellation',
            'refund:late_capture:' || v_order.id::text || ':' || p_razorpay_payment_id,
            COALESCE(p_raw_response, '{}'::jsonb)
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (v_order.id, 'Cancelled', 'Payment captured for cancelled order (' || COALESCE(v_order.cancel_reason, 'unspecified') || '). Marked for refund.', v_now);

        RETURN jsonb_build_object(
            'success', false,
            'status', 'cancelled_non_recoverable',
            'message', 'Payment captured for cancelled order; refund required.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

    -- Path B2: Unexpected terminal status
    IF v_order.order_status NOT IN ('Pending', 'Cancelled') THEN
        UPDATE public.payments
        SET provider_payment_id = p_razorpay_payment_id,
            signature = p_signature,
            status = 'Paid',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;

        UPDATE public.orders
        SET payment_status = 'Paid',
            is_paid = TRUE,
            paid_at = COALESCE(paid_at, v_now),
            razorpay_payment_id = COALESCE(razorpay_payment_id, p_razorpay_payment_id),
            refund_status = 'pending',
            refund_amount = v_order.total_amount,
            updated_at = v_now
        WHERE id = v_order.id;

        INSERT INTO public.refund_records (
            order_id, amount, currency, status, reason, refund_type, idempotency_key, raw_response
        ) VALUES (
            v_order.id, v_order.total_amount, 'INR', 'pending',
            'Payment captured in terminal order state ' || v_order.order_status, 'cancellation',
            'refund:late_capture:' || v_order.id::text || ':' || p_razorpay_payment_id,
            COALESCE(p_raw_response, '{}'::jsonb)
        )
        ON CONFLICT DO NOTHING;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'terminal_state_conflict',
            'message', 'Payment arrived for order in terminal status ' || v_order.order_status || '; marked for refund.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

    -- Path B3: Post-Expiry Recovery Check
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
            SELECT stock INTO v_book_stock FROM public.books WHERE id = v_item.book_id FOR UPDATE;
            IF v_book_stock IS NULL OR v_book_stock < v_needed_qty THEN
                v_stock_available := FALSE;
                EXIT;
            END IF;
        END IF;
    END LOOP;

    IF NOT v_stock_available THEN
        UPDATE public.payments
        SET provider_payment_id = p_razorpay_payment_id,
            signature = p_signature,
            status = 'Paid',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;

        FOR v_item IN
            SELECT id, book_id, quantity
            FROM public.inventory_reservations
            WHERE order_id = v_order.id AND status = 'reserved'
            ORDER BY book_id, id
            FOR UPDATE
        LOOP
            UPDATE public.books SET stock = stock + v_item.quantity WHERE id = v_item.book_id;
            UPDATE public.inventory_reservations
            SET status = 'released', released_at = v_now, release_reason = 'post_expiry_stock_unavailable', updated_at = v_now
            WHERE id = v_item.id;
        END LOOP;

        IF v_order.coupon_status = 'reserved' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
            UPDATE public.discounts SET used_count = GREATEST(used_count - 1, 0) WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
        END IF;

        UPDATE public.orders
        SET payment_status = 'Paid',
            is_paid = TRUE,
            paid_at = v_now,
            order_status = 'Cancelled',
            coupon_status = CASE WHEN coupon_status = 'reserved' THEN 'released' ELSE coupon_status END,
            cancel_reason = 'Payment received after reservation expired; stock unavailable for fulfillment. Marked for refund.',
            refund_status = 'pending',
            refund_amount = v_order.total_amount,
            razorpay_order_id = p_razorpay_order_id,
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = v_now
        WHERE id = v_order.id;

        INSERT INTO public.refund_records (
            order_id, amount, currency, status, reason, refund_type, idempotency_key, raw_response
        ) VALUES (
            v_order.id, v_order.total_amount, 'INR', 'pending',
            'Payment received after reservation expired; stock out of stock', 'cancellation',
            'refund:late_capture:' || v_order.id::text || ':' || p_razorpay_payment_id,
            COALESCE(p_raw_response, '{}'::jsonb)
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (v_order.id, 'Cancelled', 'Payment captured post-expiry but inventory out of stock. Automatic refund required.', v_now);

        RETURN jsonb_build_object(
            'success', false,
            'status', 'expired_stock_unavailable',
            'message', 'Payment captured after reservation expired, but inventory is no longer available.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

    -- Re-reserve stock & confirm
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
            UPDATE public.books SET stock = stock - v_needed_qty WHERE id = v_item.book_id;
        END IF;
    END LOOP;

    UPDATE public.inventory_reservations
    SET status = 'committed',
        expires_at = NULL,
        updated_at = v_now
    WHERE order_id = v_order.id;

    IF v_order.coupon_status = 'released' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts SET used_count = used_count + 1 WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
    END IF;

    UPDATE public.orders
    SET payment_status = 'Paid',
        order_status = 'Confirmed',
        is_paid = TRUE,
        paid_at = v_now,
        cancel_reason = NULL,
        coupon_status = CASE WHEN v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN 'consumed' ELSE 'none' END,
        razorpay_order_id = p_razorpay_order_id,
        razorpay_payment_id = p_razorpay_payment_id,
        updated_at = v_now
    WHERE id = v_order.id;

    UPDATE public.payments
    SET provider_payment_id = p_razorpay_payment_id,
        signature = p_signature,
        status = 'Paid',
        raw_response = COALESCE(p_raw_response, raw_response),
        updated_at = v_now
    WHERE id = v_payment.id;

    UPDATE public.payment_attempts
    SET status = CASE WHEN provider_order_id = p_razorpay_order_id THEN 'paid' ELSE 'superseded' END,
        updated_at = v_now
    WHERE order_id = v_order.id AND status IN ('initiated', 'pending', 'expired');

    INSERT INTO public.order_status_history (order_id, status, note, created_at)
    VALUES (v_order.id, 'Confirmed', 'Payment settled post-expiry (stock successfully re-reserved and committed)', v_now);

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

-- ==============================================================================
-- 7. HARDEN record_order_consent_atomic & initiate_return_refund_atomic (H-2, search_path)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.record_order_consent_atomic(
    p_order_id UUID,
    p_user_id UUID,
    p_terms_accepted BOOLEAN,
    p_terms_version TEXT DEFAULT '2026.11-v1',
    p_privacy_version TEXT DEFAULT '2026.11-v1',
    p_shipping_version TEXT DEFAULT '2026.11-v1',
    p_returns_version TEXT DEFAULT '2026.11-v1',
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_consent_id UUID;
    v_consent_data JSONB;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: record_order_consent_atomic requires server execution.';
    END IF;

    IF p_terms_accepted IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Statutory purchase consent is required.');
    END IF;

    SELECT id, user_id, order_status INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF v_order.user_id <> p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Order belongs to different user.');
    END IF;

    v_consent_data := jsonb_build_object(
        'terms_accepted', TRUE,
        'terms_version', COALESCE(p_terms_version, '2026.11-v1'),
        'privacy_version', COALESCE(p_privacy_version, '2026.11-v1'),
        'shipping_policy_version', COALESCE(p_shipping_version, '2026.11-v1'),
        'returns_policy_version', COALESCE(p_returns_version, '2026.11-v1'),
        'accepted_at', clock_timestamp(),
        'ip_address', p_ip_address,
        'user_agent', p_user_agent
    );

    INSERT INTO public.order_consents (
        order_id, user_id, terms_accepted, terms_version, privacy_version,
        shipping_policy_version, returns_policy_version, ip_address, user_agent, accepted_at
    ) VALUES (
        p_order_id, p_user_id, TRUE,
        COALESCE(p_terms_version, '2026.11-v1'),
        COALESCE(p_privacy_version, '2026.11-v1'),
        COALESCE(p_shipping_version, '2026.11-v1'),
        COALESCE(p_returns_version, '2026.11-v1'),
        p_ip_address, p_user_agent, clock_timestamp()
    ) RETURNING id INTO v_consent_id;

    UPDATE public.orders
    SET consent_record = v_consent_data
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'consent_id', v_consent_id,
        'accepted_at', clock_timestamp()
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_order_consent_atomic(UUID, UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_order_consent_atomic(UUID, UUID, BOOLEAN, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.initiate_return_refund_atomic(
    p_order_id UUID,
    p_return_id UUID,
    p_amount NUMERIC(10,2),
    p_reason TEXT,
    p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_total_refunded NUMERIC(10,2);
    v_pending_refunds NUMERIC(10,2);
    v_refundable_balance NUMERIC(10,2);
    v_record_id UUID;
    v_existing RECORD;
    v_caller_role TEXT;
BEGIN
    v_caller_role := COALESCE(auth.role(), '');

    IF v_caller_role <> 'service_role' AND current_user <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: initiate_return_refund_atomic requires service-role credentials.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_admin_id
          AND role IN ('super_admin', 'admin')
          AND is_blocked = FALSE
          AND is_deleted = FALSE
    ) THEN
        RAISE EXCEPTION 'Unauthorized: Caller must specify a valid, active administrator identity';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be positive');
    END IF;

    SELECT id, total_amount, payment_status, payment_method INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    IF p_amount > v_order.total_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund amount ₹' || p_amount || ' exceeds order total ₹' || v_order.total_amount
        );
    END IF;

    IF p_return_id IS NOT NULL THEN
        SELECT id, amount, status INTO v_existing
        FROM public.refund_records
        WHERE return_request_id = p_return_id AND status IN ('pending', 'processing', 'processed')
        FOR UPDATE;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_initiated', true,
                'refund_record_id', v_existing.id,
                'status', v_existing.status,
                'amount', v_existing.amount
            );
        END IF;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
    FROM public.refund_records
    WHERE order_id = p_order_id AND status = 'processed';

    SELECT COALESCE(SUM(amount), 0) INTO v_pending_refunds
    FROM public.refund_records
    WHERE order_id = p_order_id AND status IN ('pending', 'processing');

    v_refundable_balance := v_order.total_amount - (v_total_refunded + v_pending_refunds);

    IF p_amount > v_refundable_balance THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund amount ₹' || p_amount || ' exceeds available refundable balance ₹' || v_refundable_balance,
            'refundable_balance', v_refundable_balance
        );
    END IF;

    INSERT INTO public.refund_records (
        order_id,
        return_request_id,
        amount,
        status,
        reason,
        authorized_by,
        refund_type,
        idempotency_key
    ) VALUES (
        p_order_id,
        p_return_id,
        p_amount,
        'pending',
        p_reason,
        p_admin_id,
        'return',
        CASE WHEN p_return_id IS NOT NULL THEN 'refund:return:' || p_return_id::text ELSE NULL END
    ) RETURNING id INTO v_record_id;

    RETURN jsonb_build_object(
        'success', true,
        'refund_record_id', v_record_id,
        'order_id', p_order_id,
        'amount', p_amount,
        'refundable_balance_remaining', v_refundable_balance - p_amount
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) TO postgres, service_role;

-- Reaffirm privilege lock-down on payment & refund RPCs
REVOKE EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) TO postgres, service_role;
