-- ==============================================================================
-- Migration: 20261031000003_customer_account_and_commerce.sql
-- Description:
--   1. Implements atomic, server-validated replacement request procedure
--      enforcing the strict 7-day post-delivery eligibility rule.
--   2. Enforces caller identity checks and optimistic locking.
--   3. Explicitly assigns execution privileges to authenticated and service_role.
-- ==============================================================================

-- 1. ATOMIC CUSTOMER REPLACEMENT REQUEST PROCEDURE
CREATE OR REPLACE FUNCTION public.request_replacement_atomic(
    p_order_id UUID,
    p_user_id UUID,
    p_reason TEXT
)
RETURNS JSONB AS $$
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

    -- Atomic mutation of order state
    UPDATE public.orders
    SET replacement_requested = TRUE,
        replacement_status = 'Requested',
        replacement_reason = trim(p_reason),
        replacement_requested_at = v_now,
        order_status = 'Replacement Requested',
        updated_at = v_now
    WHERE id = p_order_id;

    -- Record order status transition history
    INSERT INTO public.order_status_history (
        order_id,
        status,
        notes,
        created_at
    ) VALUES (
        p_order_id,
        'Replacement Requested',
        'Customer requested replacement: ' || trim(p_reason),
        v_now
    );

    -- Record audit log
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- 2. SECURITY HARDENING: EXPLICIT RPC PERMISSIONS
REVOKE EXECUTE ON FUNCTION public.request_replacement_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_replacement_atomic(UUID, UUID, TEXT) TO authenticated, service_role;
