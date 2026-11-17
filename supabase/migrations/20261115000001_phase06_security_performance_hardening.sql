-- ==============================================================================
-- PHASE 06: SECURITY & PERFORMANCE HARDENING
-- Forward-only migration
-- Baseline: 20261114000001_phase05_payments_emails_invoices_hardening.sql
-- Migration: 20261115000001_phase06_security_performance_hardening.sql
-- ==============================================================================
-- Remediations implemented:
-- 1. Harden all SECURITY DEFINER and SECURITY INVOKER functions with
--    SET search_path = public, pg_temp, closing search_path hijacking gaps.
-- 2. Enforce caller authorization inside Phase 02 atomic RPCs and reporting
--    procedures (verify_delivery_otp_atomic, regenerate_delivery_otp_atomic,
--    record_inventory_movement_atomic, reserve_replacement_inventory_atomic,
--    anonymize_customer_account, get_sales_report, get_payment_report,
--    get_inventory_report).
-- 3. Apply explicit least-privilege REVOKE/GRANT EXECUTE permissions on every
--    SECURITY DEFINER RPC and helper function (removing implicit PUBLIC access).
-- 4. Lock down high-risk RLS policies on phone_verifications, delivery_otps,
--    ticket_messages, book_variants, and invoices.
-- 5. Provision justified composite and partial indexes for catalog filtering,
--    reviews, support tickets, returns, order queries, and expired reservation
--    cleanup workers without duplicating existing indexes.
-- ==============================================================================

-- ==============================================================================
-- 1. HARDEN TRIGGER FUNCTIONS (SET search_path = public, pg_temp)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_default_address()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE public.addresses
        SET is_default = FALSE
        WHERE user_id = NEW.user_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.protect_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Invoices are immutable statutory records and cannot be deleted.';
    ELSIF TG_OP = 'UPDATE' THEN
        -- Comprehensive NULL-safe immutability check covering all columns
        IF OLD IS DISTINCT FROM NEW THEN
            RAISE EXCEPTION 'Invoices are immutable statutory records. Updating invoice data is prohibited.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- ==============================================================================
-- 2. HARDEN DELIVERY OTP, INVENTORY & ACCOUNT ANONYMIZATION RPCs
-- ==============================================================================

-- A. verify_delivery_otp_atomic: enforce pg_temp + delivery.verify / service_role authz
CREATE OR REPLACE FUNCTION public.verify_delivery_otp_atomic(
    p_order_id UUID,
    p_candidate_hash TEXT,
    p_actor_id UUID,
    p_actor_role TEXT,
    p_awb TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_otp RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
    -- Caller authorization guard
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot verify delivery OTP.';
        END IF;
        IF auth.uid() <> p_actor_id THEN
            RAISE EXCEPTION 'Security violation: Actor identity mismatch.';
        END IF;
        IF NOT public.has_staff_permission('delivery.verify') THEN
            RAISE EXCEPTION 'Unauthorized: Delivery verification permission required.';
        END IF;
    END IF;

    -- 1. Lock and validate order
    SELECT id, order_status, payment_method, payment_status, total_amount
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found', 'outcome', 'FAILED_WRONG_STATE');
    END IF;

    -- Validate eligible status: Must be 'Out for Delivery' (or 'Shipped' if direct handover)
    IF v_order.order_status NOT IN ('Out for Delivery', 'Shipped') THEN
        INSERT INTO public.delivery_verifications (order_id, actor_id, actor_role, outcome, failure_reason, shipment_awb)
        VALUES (p_order_id, p_actor_id, p_actor_role, 'FAILED_WRONG_STATE', 'Order is in status: ' || v_order.order_status, p_awb);

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Order is not in delivery status (current: ' || v_order.order_status || ')',
            'outcome', 'FAILED_WRONG_STATE'
        );
    END IF;

    -- 2. Lock active OTP record
    SELECT * INTO v_otp
    FROM public.delivery_otps
    WHERE order_id = p_order_id AND status = 'active'
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.delivery_verifications (order_id, actor_id, actor_role, outcome, failure_reason, shipment_awb)
        VALUES (p_order_id, p_actor_id, p_actor_role, 'FAILED_WRONG_STATE', 'No active OTP found for order', p_awb);

        RETURN jsonb_build_object('success', false, 'error', 'No active delivery OTP found', 'outcome', 'FAILED_WRONG_STATE');
    END IF;

    -- 3. Check expiration
    IF v_now > v_otp.expires_at THEN
        UPDATE public.delivery_otps SET status = 'expired', updated_at = v_now WHERE id = v_otp.id;

        INSERT INTO public.delivery_verifications (order_id, delivery_otp_id, actor_id, actor_role, outcome, failure_reason, shipment_awb)
        VALUES (p_order_id, v_otp.id, p_actor_id, p_actor_role, 'FAILED_EXPIRED', 'Delivery OTP has expired', p_awb);

        RETURN jsonb_build_object('success', false, 'error', 'Delivery OTP has expired', 'outcome', 'FAILED_EXPIRED');
    END IF;

    -- 4. Check max attempts
    IF v_otp.attempts >= v_otp.max_attempts THEN
        UPDATE public.delivery_otps SET status = 'invalidated', updated_at = v_now WHERE id = v_otp.id;

        INSERT INTO public.delivery_verifications (order_id, delivery_otp_id, actor_id, actor_role, outcome, failure_reason, shipment_awb)
        VALUES (p_order_id, v_otp.id, p_actor_id, p_actor_role, 'FAILED_MAX_ATTEMPTS', 'Max OTP verification attempts exceeded', p_awb);

        RETURN jsonb_build_object('success', false, 'error', 'Maximum verification attempts exceeded. Please regenerate OTP.', 'outcome', 'FAILED_MAX_ATTEMPTS');
    END IF;

    -- 5. Compare HMAC-SHA256 Hash
    IF v_otp.otp_hash <> p_candidate_hash THEN
        UPDATE public.delivery_otps
        SET attempts = attempts + 1,
            status = CASE WHEN attempts + 1 >= max_attempts THEN 'invalidated' ELSE 'active' END,
            updated_at = v_now
        WHERE id = v_otp.id;

        INSERT INTO public.delivery_verifications (order_id, delivery_otp_id, actor_id, actor_role, outcome, failure_reason, shipment_awb)
        VALUES (p_order_id, v_otp.id, p_actor_id, p_actor_role, 'FAILED_INVALID_OTP', 'Incorrect OTP entered (attempt ' || (v_otp.attempts + 1) || ')', p_awb);

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Invalid delivery OTP code',
            'attempts_left', GREATEST(0, v_otp.max_attempts - (v_otp.attempts + 1)),
            'outcome', 'FAILED_INVALID_OTP'
        );
    END IF;

    -- 6. Success: Transition OTP and Order atomically
    UPDATE public.delivery_otps
    SET status = 'verified',
        verified_at = v_now,
        verified_by = p_actor_id,
        updated_at = v_now
    WHERE id = v_otp.id;

    UPDATE public.orders
    SET order_status = 'Delivered',
        delivered_at = v_now,
        shipping_delivered_at = v_now,
        cod_settlement_status = CASE
            WHEN payment_method = 'COD' AND payment_status <> 'Paid' THEN 'pending'
            ELSE cod_settlement_status
        END,
        updated_at = v_now
    WHERE id = p_order_id;

    INSERT INTO public.delivery_verifications (order_id, delivery_otp_id, actor_id, actor_role, outcome, failure_reason, shipment_awb)
    VALUES (p_order_id, v_otp.id, p_actor_id, p_actor_role, 'SUCCESS', NULL, p_awb);

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'Delivered',
        'delivered_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.verify_delivery_otp_atomic(UUID, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_delivery_otp_atomic(UUID, TEXT, UUID, TEXT, TEXT) TO postgres, service_role;

-- B. regenerate_delivery_otp_atomic: service_role / delivery staff only + pg_temp
CREATE OR REPLACE FUNCTION public.regenerate_delivery_otp_atomic(
    p_order_id UUID,
    p_new_hash TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_new_id UUID;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: Regenerating delivery OTP requires service-role credentials.';
    END IF;

    SELECT id, order_status INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    UPDATE public.delivery_otps
    SET status = 'invalidated', updated_at = NOW()
    WHERE order_id = p_order_id AND status = 'active';

    INSERT INTO public.delivery_otps (order_id, otp_hash, status, attempts, max_attempts, expires_at)
    VALUES (p_order_id, p_new_hash, 'active', 0, 5, p_expires_at)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'otp_id', v_new_id, 'expires_at', p_expires_at);
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_delivery_otp_atomic(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_delivery_otp_atomic(UUID, TEXT, TIMESTAMPTZ) TO postgres, service_role;

-- C. record_inventory_movement_atomic: pg_temp + inventory.manage / service_role guard
CREATE OR REPLACE FUNCTION public.record_inventory_movement_atomic(
    p_book_id UUID,
    p_variant_id UUID DEFAULT NULL,
    p_movement_type TEXT DEFAULT 'MANUAL_ADJUSTMENT',
    p_quantity_change INTEGER DEFAULT 0,
    p_reason TEXT DEFAULT 'Inventory adjustment',
    p_order_id UUID DEFAULT NULL,
    p_return_id UUID DEFAULT NULL,
    p_actor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_curr_stock INTEGER;
    v_new_stock INTEGER;
    v_history_id UUID;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot modify inventory movements.';
        END IF;
        IF p_actor_id IS NOT NULL AND auth.uid() <> p_actor_id THEN
            RAISE EXCEPTION 'Security violation: Actor identity mismatch.';
        END IF;
        IF NOT public.has_staff_permission('inventory.manage') THEN
            RAISE EXCEPTION 'Unauthorized: Inventory management permission required.';
        END IF;
    END IF;

    IF p_variant_id IS NOT NULL THEN
        SELECT stock INTO v_curr_stock FROM public.book_variants WHERE id = p_variant_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Book variant not found');
        END IF;

        v_new_stock := v_curr_stock + p_quantity_change;
        IF v_new_stock < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient variant stock for reduction');
        END IF;

        UPDATE public.book_variants SET stock = v_new_stock, updated_at = NOW() WHERE id = p_variant_id;
    ELSE
        SELECT stock INTO v_curr_stock FROM public.books WHERE id = p_book_id FOR UPDATE;
        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'error', 'Book not found');
        END IF;

        v_new_stock := v_curr_stock + p_quantity_change;
        IF v_new_stock < 0 THEN
            RETURN jsonb_build_object('success', false, 'error', 'Insufficient book stock for reduction');
        END IF;

        UPDATE public.books SET stock = v_new_stock, updated_at = NOW() WHERE id = p_book_id;
    END IF;

    INSERT INTO public.inventory_history (
        book_id,
        variant_id,
        movement_type,
        quantity_change,
        previous_stock,
        new_stock,
        reason,
        related_order_id,
        related_return_id,
        actor_id
    ) VALUES (
        p_book_id,
        p_variant_id,
        p_movement_type,
        p_quantity_change,
        v_curr_stock,
        v_new_stock,
        p_reason,
        p_order_id,
        p_return_id,
        p_actor_id
    ) RETURNING id INTO v_history_id;

    RETURN jsonb_build_object(
        'success', true,
        'history_id', v_history_id,
        'previous_stock', v_curr_stock,
        'new_stock', v_new_stock
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_inventory_movement_atomic(UUID, UUID, TEXT, INTEGER, TEXT, UUID, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_inventory_movement_atomic(UUID, UUID, TEXT, INTEGER, TEXT, UUID, UUID, UUID) TO postgres, service_role;

-- D. reserve_replacement_inventory_atomic: pg_temp + caller guard + service_role revoke
CREATE OR REPLACE FUNCTION public.reserve_replacement_inventory_atomic(
    p_book_id UUID,
    p_quantity INTEGER,
    p_reason TEXT,
    p_order_id UUID DEFAULT NULL,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot reserve replacement inventory.';
        END IF;
        IF p_admin_id IS NOT NULL AND auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Admin identity mismatch.';
        END IF;
        IF NOT public.has_staff_permission('inventory.manage') THEN
            RAISE EXCEPTION 'Unauthorized: Inventory management permission required.';
        END IF;
    END IF;

    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Replacement quantity must be greater than zero');
    END IF;

    RETURN public.record_inventory_movement_atomic(
        p_book_id := p_book_id,
        p_variant_id := NULL,
        p_movement_type := 'REPLACEMENT',
        p_quantity_change := -p_quantity,
        p_reason := p_reason,
        p_order_id := p_order_id,
        p_return_id := NULL,
        p_actor_id := p_admin_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_replacement_inventory_atomic(UUID, INTEGER, TEXT, UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_replacement_inventory_atomic(UUID, INTEGER, TEXT, UUID, UUID) TO postgres, service_role;

-- E. anonymize_customer_account: pg_temp + self-or-service_role enforcement + service_role revoke
CREATE OR REPLACE FUNCTION public.anonymize_customer_account(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_anon_id TEXT := substr(md5(p_user_id::text || clock_timestamp()::text), 1, 8);
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Unauthorized: Accounts can only be anonymized by the account owner or service-role backend.';
        END IF;
    END IF;

    UPDATE public.profiles
    SET name = 'Deleted User ' || v_anon_id,
        email = 'deleted_' || v_anon_id || '@anonymized.local',
        phone = NULL,
        is_deleted = TRUE,
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    DELETE FROM public.addresses WHERE user_id = p_user_id;
    DELETE FROM public.wishlists WHERE user_id = p_user_id;
    DELETE FROM public.phone_verifications WHERE user_id = p_user_id;

    INSERT INTO public.audit_logs (user_id, action, model_name, model_id, new_values)
    VALUES (p_user_id, 'ACCOUNT_DELETION_ANONYMIZED', 'profiles', p_user_id, jsonb_build_object('anonymized_tag', v_anon_id, 'anonymized_at', NOW()));

    RETURN jsonb_build_object('success', true, 'anonymized_user_id', p_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.anonymize_customer_account(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anonymize_customer_account(UUID) TO postgres, service_role;

-- ==============================================================================
-- 3. HARDEN REPORTING RPCs (pg_temp + authz check + service_role only)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_sales_report(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.has_staff_permission('reports.view') THEN
            RAISE EXCEPTION 'Unauthorized: Reports viewing permission required.';
        END IF;
    END IF;

    SELECT jsonb_build_object(
        'total_orders', COUNT(*),
        'gross_sales', COALESCE(SUM(total_amount), 0),
        'total_discount', COALESCE(SUM(discount_amount), 0),
        'total_shipping', COALESCE(SUM(delivery_fee), 0),
        'net_sales', COALESCE(SUM(total_amount - COALESCE(delivery_fee, 0)), 0),
        'average_order_value', CASE WHEN COUNT(*) > 0 THEN round(AVG(total_amount), 2) ELSE 0 END,
        'delivered_orders', COUNT(*) FILTER (WHERE order_status = 'Delivered'),
        'cancelled_orders', COUNT(*) FILTER (WHERE order_status = 'Cancelled'),
        'refunded_orders', COUNT(*) FILTER (WHERE payment_status = 'Refunded')
    ) INTO v_result
    FROM public.orders
    WHERE created_at >= p_start_date AND created_at <= p_end_date;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_sales_report(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sales_report(TIMESTAMPTZ, TIMESTAMPTZ) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.get_payment_report(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.has_staff_permission('reports.view') THEN
            RAISE EXCEPTION 'Unauthorized: Reports viewing permission required.';
        END IF;
    END IF;

    SELECT jsonb_build_object(
        'prepaid_count', COUNT(*) FILTER (WHERE payment_method <> 'COD'),
        'prepaid_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_method <> 'COD'), 0),
        'cod_count', COUNT(*) FILTER (WHERE payment_method = 'COD'),
        'cod_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'COD'), 0),
        'cod_collected_count', COUNT(*) FILTER (WHERE payment_method = 'COD' AND cod_settlement_status = 'reconciled'),
        'cod_collected_amount', COALESCE(SUM(cod_settled_amount) FILTER (WHERE payment_method = 'COD' AND cod_settlement_status = 'reconciled'), 0),
        'cod_pending_count', COUNT(*) FILTER (
            WHERE payment_method = 'COD'
              AND order_status NOT IN ('Cancelled', 'Returned')
              AND (cod_settlement_status IS NULL OR cod_settlement_status IN ('unsettled', 'pending'))
        ),
        'refunded_amount', COALESCE((
            SELECT SUM(amount)
            FROM public.refund_records
            WHERE status = 'processed'
              AND created_at >= p_start_date
              AND created_at <= p_end_date
        ), 0)
    ) INTO v_result
    FROM public.orders
    WHERE created_at >= p_start_date AND created_at <= p_end_date;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_payment_report(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_payment_report(TIMESTAMPTZ, TIMESTAMPTZ) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.get_inventory_report()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_total_stock BIGINT;
    v_reserved_stock BIGINT;
    v_low_stock_count BIGINT;
    v_out_of_stock_count BIGINT;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.has_staff_permission('reports.view') THEN
            RAISE EXCEPTION 'Unauthorized: Reports viewing permission required.';
        END IF;
    END IF;

    SELECT COALESCE(SUM(stock), 0) INTO v_total_stock FROM public.books;
    -- Count active un-expired inventory reservations accurately using schema's 'reserved' state
    SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_stock
    FROM public.inventory_reservations
    WHERE status = 'reserved' AND (expires_at IS NULL OR expires_at > NOW());
    SELECT COUNT(*) INTO v_low_stock_count FROM public.books WHERE stock > 0 AND stock <= 5;
    SELECT COUNT(*) INTO v_out_of_stock_count FROM public.books WHERE stock = 0;

    RETURN jsonb_build_object(
        'total_stock', v_total_stock,
        'reserved_stock', v_reserved_stock,
        'available_stock', GREATEST(0, v_total_stock - v_reserved_stock),
        'low_stock_count', v_low_stock_count,
        'out_of_stock_count', v_out_of_stock_count
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_inventory_report() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_inventory_report() TO postgres, service_role;

-- ==============================================================================
-- 4. EXPLICIT LEAST-PRIVILEGE GRANTS ON EXISTING AUTHENTICATED RPCs & HELPERS
-- ==============================================================================

REVOKE ALL ON FUNCTION public.adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_update_user_role(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_user_role(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.moderate_review_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_review_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_discount_coupon(TEXT, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.validate_discount_coupon(TEXT, NUMERIC) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_active_user() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_user() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_manage_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_orders() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_ship_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_ship_orders() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_cancel_orders() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_cancel_orders() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_manage_returns() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_returns() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_manage_inventory() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_inventory() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_manage_support() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_support() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.can_manage_reviews() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_reviews() TO authenticated, service_role;

-- Note: is_staff() must remain executable by anon, authenticated, service_role
-- because books_select_public evaluates is_active = TRUE OR public.is_staff() for public catalog browsing.

-- ==============================================================================
-- 5. RLS POLICY HARDENING
-- ==============================================================================

-- 5A. phone_verifications: prevent direct client reads of otp_hash or forged is_verified updates
DROP POLICY IF EXISTS "phone_verifications_customer" ON public.phone_verifications;
DROP POLICY IF EXISTS "phone_verifications_service_only" ON public.phone_verifications;
CREATE POLICY "phone_verifications_service_only" ON public.phone_verifications
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

REVOKE ALL ON TABLE public.phone_verifications FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.phone_verifications TO service_role;

-- 5B. delivery_otps: prevent customers from directly selecting otp_hash via PostgREST
-- (customers fetch plaintext session OTP exclusively through server API /api/delivery/otp -> adminDb)
DROP POLICY IF EXISTS "delivery_otps_owner_read" ON public.delivery_otps;
DROP POLICY IF EXISTS "delivery_otps_service_role_all" ON public.delivery_otps;
CREATE POLICY "delivery_otps_service_role_all" ON public.delivery_otps
    FOR ALL TO service_role
    USING (TRUE)
    WITH CHECK (TRUE);

REVOKE ALL ON TABLE public.delivery_otps FROM PUBLIC, anon;

-- 5C. ticket_messages: block customers from spoofing is_staff = TRUE on insert
DROP POLICY IF EXISTS "messages_customer_read" ON public.ticket_messages;
CREATE POLICY "messages_customer_read" ON public.ticket_messages
    FOR SELECT TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = ticket_messages.ticket_id
              AND t.customer_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "messages_customer_insert" ON public.ticket_messages;
CREATE POLICY "messages_customer_insert" ON public.ticket_messages
    FOR INSERT TO authenticated
    WITH CHECK (
        sender_id = auth.uid()
        AND is_staff = FALSE
        AND EXISTS (
            SELECT 1 FROM public.support_tickets t
            WHERE t.id = ticket_messages.ticket_id
              AND t.customer_id = auth.uid()
        )
    );

-- 5D. book_variants: expose publicly ONLY active variants belonging to active books (or staff)
DROP POLICY IF EXISTS "variants_read_public" ON public.book_variants;
CREATE POLICY "variants_read_public" ON public.book_variants
    FOR SELECT TO public
    USING (
        (
            is_active = TRUE
            AND EXISTS (
                SELECT 1 FROM public.books b
                WHERE b.id = book_variants.book_id
                  AND b.is_active = TRUE
            )
        )
        OR public.is_staff()
    );

-- 5E. invoices: tighten admin/customer policies explicitly to authenticated
DROP POLICY IF EXISTS "invoices_customer_read" ON public.invoices;
CREATE POLICY "invoices_customer_read" ON public.invoices
    FOR SELECT TO authenticated
    USING (
        customer_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.orders o
            WHERE o.id = invoices.order_id
              AND o.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "invoices_admin_all" ON public.invoices;
CREATE POLICY "invoices_admin_all" ON public.invoices
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ==============================================================================
-- 6. COMPOSITE & PARTIAL PERFORMANCE INDEXES
-- ==============================================================================

-- Active catalog category filtering + newest sort
CREATE INDEX IF NOT EXISTS idx_books_active_category_created
    ON public.books (category, created_at DESC)
    WHERE is_active = TRUE;

-- Active catalog price sort + deterministic ID tie-breaker
CREATE INDEX IF NOT EXISTS idx_books_active_price_id
    ON public.books (price ASC, id ASC)
    WHERE is_active = TRUE;

-- Active book variants lookup
CREATE INDEX IF NOT EXISTS idx_book_variants_active_book
    ON public.book_variants (book_id, created_at ASC)
    WHERE is_active = TRUE;

-- Storefront approved product reviews pagination
CREATE INDEX IF NOT EXISTS idx_reviews_book_approved_created
    ON public.reviews (book_id, created_at DESC)
    WHERE status = 'approved';

-- Admin moderation queue by review status
CREATE INDEX IF NOT EXISTS idx_reviews_status_created
    ON public.reviews (status, created_at DESC);

-- Admin return queue by status
CREATE INDEX IF NOT EXISTS idx_return_requests_status_created
    ON public.return_requests (status, created_at DESC);

-- Support tickets customer history and admin SLA queue
CREATE INDEX IF NOT EXISTS idx_support_tickets_customer_updated
    ON public.support_tickets (customer_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_updated
    ON public.support_tickets (status, updated_at DESC);

-- Cron worker lookup for expired unpaid ONLINE inventory reservations
CREATE INDEX IF NOT EXISTS idx_inventory_reservations_expired_reserved
    ON public.inventory_reservations (expires_at, order_id)
    WHERE status = 'reserved' AND expires_at IS NOT NULL;

-- Admin order filtering by order_status / payment_status + newest ordering
CREATE INDEX IF NOT EXISTS idx_orders_order_status_created
    ON public.orders (order_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_payment_status_created
    ON public.orders (payment_status, created_at DESC);

-- Tracking lookup by AWB without full-table scan
CREATE INDEX IF NOT EXISTS idx_orders_shipping_awb_nonnull
    ON public.orders (shipping_awb)
    WHERE shipping_awb IS NOT NULL;
