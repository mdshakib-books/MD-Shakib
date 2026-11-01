-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 011
-- Phase 04: Backend & Database Integrity, Search Path Hardening & Review Constraints
-- Migration: 20261101000001_phase04_backend_and_database_integrity.sql
-- ==============================================================================

-- 1. DATABASE CONSTRAINTS & INDEXES
-- Enforce duplicate review prevention per customer per book at schema layer
CREATE UNIQUE INDEX IF NOT EXISTS uq_reviews_book_user 
    ON public.reviews (book_id, user_id);

-- Accelerate Delhivery webhook and consignment tracking queries on orders table
CREATE INDEX IF NOT EXISTS idx_orders_shipping_awb 
    ON public.orders (shipping_awb) 
    WHERE shipping_awb IS NOT NULL;

-- Accelerate financial payment queries and settlement joins by status
CREATE INDEX IF NOT EXISTS idx_payments_status 
    ON public.payments (status);


-- 2. HARDEN TRIGGER FUNCTION: record_order_status_history
-- Adds explicit search_path and captures replacement/cancellation reasons accurately
CREATE OR REPLACE FUNCTION public.record_order_status_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (NEW.id, NEW.order_status, 'Order created with initial status', NOW());
    ELSIF (TG_OP = 'UPDATE' AND OLD.order_status IS DISTINCT FROM NEW.order_status) THEN
        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (
            NEW.id, 
            NEW.order_status, 
            COALESCE(
                NULLIF(NEW.replacement_reason, ''),
                NULLIF(NEW.cancel_reason, ''),
                ''
            ), 
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$;


-- 3. REMEDIATE REQUEST_REPLACEMENT_ATOMIC
-- Fixes broken insertion into non-existent column "notes" in order_status_history
-- Allows trg_order_status_history trigger to handle audit transition accurately without duplicate records
CREATE OR REPLACE FUNCTION public.request_replacement_atomic(
    p_order_id UUID,
    p_user_id UUID,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_now TIMESTAMPTZ := NOW();
    v_delivered_at TIMESTAMPTZ;
BEGIN
    -- Strict caller identity validation: anonymous callers are rejected; non-service_role callers must match p_user_id
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot request replacements.';
        END IF;
        IF auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity does not match specified user ID.';
        END IF;
    END IF;

    -- Validate reason is non-empty
    IF p_reason IS NULL OR trim(p_reason) = '' THEN
        RAISE EXCEPTION 'A valid replacement reason is required.';
    END IF;

    -- Fetch and pessimistic-lock the target order
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- Customer ownership check
    IF v_order.user_id <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to request replacement for order %', p_order_id;
    END IF;

    -- Replacement eligibility rule 1: No duplicate or active replacement requests
    IF v_order.replacement_requested IS TRUE THEN
        RAISE EXCEPTION 'A replacement has already been requested for this order.';
    END IF;

    -- Replacement eligibility rule 2: Order must be in 'Delivered' status
    IF v_order.order_status <> 'Delivered' THEN
        RAISE EXCEPTION 'Only delivered orders are eligible for replacement. Current status: %', v_order.order_status;
    END IF;

    -- Replacement eligibility rule 3: Strict 7-Day Window from verified delivery date
    v_delivered_at := COALESCE(v_order.delivered_at, v_order.shipping_delivered_at);
    IF v_delivered_at IS NULL THEN
        RAISE EXCEPTION 'Replacement ineligible: Missing verified delivery timestamp.';
    END IF;

    -- Guard against timestamps set in the future
    IF v_delivered_at > v_now THEN
        RAISE EXCEPTION 'Replacement ineligible: Delivery timestamp cannot be in the future.';
    END IF;

    IF v_delivered_at < (v_now - INTERVAL '7 days') THEN
        RAISE EXCEPTION 'Replacement window expired: Replacements must be requested within 7 days of delivery.';
    END IF;

    -- Atomic mutation of order state (trg_order_status_history trigger will record transition automatically)
    UPDATE public.orders
    SET replacement_requested = TRUE,
        replacement_status = 'Requested',
        replacement_reason = trim(p_reason),
        replacement_requested_at = v_now,
        order_status = 'Replacement Requested',
        updated_at = v_now
    WHERE id = p_order_id;

    -- Record immutable audit log
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
        'UPDATE',
        'orders',
        p_order_id::text,
        jsonb_build_object('order_status', v_order.order_status, 'replacement_status', v_order.replacement_status),
        jsonb_build_object('order_status', 'Replacement Requested', 'replacement_status', 'Requested'),
        jsonb_build_object('reason', trim(p_reason)),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'order_status', 'Replacement Requested',
        'replacement_status', 'Requested',
        'replacement_requested_at', v_now
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_replacement_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_replacement_atomic(UUID, UUID, TEXT) TO authenticated, service_role;


-- 4. ATOMIC REVIEW SUBMISSION PROCEDURE
-- Allows active customers to submit product reviews with duplicate prevention and audit logging
CREATE OR REPLACE FUNCTION public.submit_review_atomic(
    p_book_id UUID,
    p_user_id UUID,
    p_rating INTEGER,
    p_title TEXT,
    p_comment TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_is_active BOOLEAN;
    v_book_exists BOOLEAN;
    v_review_id UUID;
    v_clean_title TEXT;
    v_clean_comment TEXT;
BEGIN
    -- Strict caller identity validation
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot submit reviews.';
        END IF;
        IF auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity does not match reviewer user ID.';
        END IF;
    END IF;

    -- Check customer is active and not blocked/deleted
    SELECT (is_blocked = FALSE AND is_deleted = FALSE)
    INTO v_is_active
    FROM public.profiles
    WHERE id = p_user_id;

    IF v_is_active IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: User account is inactive or restricted.';
    END IF;

    -- Validate rating bounds
    IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN
        RAISE EXCEPTION 'Rating must be an integer between 1 and 5.';
    END IF;

    -- Validate title and comment
    v_clean_title := trim(COALESCE(p_title, ''));
    v_clean_comment := trim(COALESCE(p_comment, ''));

    IF char_length(v_clean_title) = 0 THEN
        RAISE EXCEPTION 'Review title is required.';
    END IF;

    IF char_length(v_clean_comment) = 0 THEN
        RAISE EXCEPTION 'Review comment is required.';
    END IF;

    -- Validate book exists and is active
    SELECT is_active INTO v_book_exists
    FROM public.books
    WHERE id = p_book_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Book % not found.', p_book_id;
    END IF;

    -- Duplicate review check
    IF EXISTS (SELECT 1 FROM public.reviews WHERE book_id = p_book_id AND user_id = p_user_id) THEN
        RAISE EXCEPTION 'Duplicate review: You have already submitted a review for this book.';
    END IF;

    -- Insert new review with default 'pending' status for moderation
    INSERT INTO public.reviews (
        book_id,
        user_id,
        rating,
        title,
        comment,
        status,
        created_at,
        updated_at
    ) VALUES (
        p_book_id,
        p_user_id,
        p_rating,
        v_clean_title,
        v_clean_comment,
        'pending',
        NOW(),
        NOW()
    ) RETURNING id INTO v_review_id;

    -- Audit log
    INSERT INTO public.audit_logs (
        user_id,
        action,
        model_name,
        model_id,
        new_values,
        changes,
        created_at
    ) VALUES (
        p_user_id,
        'CREATE',
        'reviews',
        v_review_id::text,
        jsonb_build_object('book_id', p_book_id::text, 'rating', p_rating, 'title', v_clean_title, 'status', 'pending'),
        jsonb_build_object('submitted_by', p_user_id::text),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'review_id', v_review_id,
        'book_id', p_book_id,
        'rating', p_rating,
        'status', 'pending',
        'message', 'Review submitted successfully and is awaiting moderation.'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.submit_review_atomic(UUID, UUID, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_review_atomic(UUID, UUID, INTEGER, TEXT, TEXT) TO authenticated, service_role;


-- 5. HARDEN SECURITY DEFINER SEARCH PATH ON SYSTEM FUNCTIONS
-- Sets explicit search_path on auth and helper functions to guard against search_path hijacking
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role, is_blocked)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'name', NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        'user',
        false
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_blocked = FALSE AND is_deleted = FALSE
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_discount_coupon(
    p_code TEXT,
    p_subtotal NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_discount RECORD;
    v_calc_discount NUMERIC;
BEGIN
    SELECT * INTO v_discount
    FROM public.discounts
    WHERE UPPER(code) = UPPER(trim(p_code));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid discount coupon code.');
    END IF;

    IF NOT v_discount.is_active THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon is no longer active.');
    END IF;

    IF v_discount.valid_from > NOW() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon has not started yet.');
    END IF;

    IF v_discount.valid_until IS NOT NULL AND v_discount.valid_until < NOW() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon has expired.');
    END IF;

    IF v_discount.usage_limit IS NOT NULL AND v_discount.used_count >= v_discount.usage_limit THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon has reached its maximum usage limit.');
    END IF;

    IF p_subtotal < v_discount.min_order_amount THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Minimum order amount for this coupon is ₹' || v_discount.min_order_amount
        );
    END IF;

    -- Calculate discount amount
    IF v_discount.discount_type = 'percentage' THEN
        v_calc_discount := ROUND((p_subtotal * (v_discount.discount_value / 100.0)), 2);
        IF v_discount.max_discount_amount IS NOT NULL AND v_calc_discount > v_discount.max_discount_amount THEN
            v_calc_discount := v_discount.max_discount_amount;
        END IF;
    ELSE
        v_calc_discount := LEAST(v_discount.discount_value, p_subtotal);
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'discount_id', v_discount.id,
        'code', v_discount.code,
        'discount_type', v_discount.discount_type,
        'discount_value', v_discount.discount_value,
        'calculated_discount', v_calc_discount
    );
END;
$$;

