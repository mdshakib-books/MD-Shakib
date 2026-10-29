-- ==============================================================================
-- Migration: 20261029000003_payment_security_and_refunds.sql
-- Description: 
--   1. Revoke public/authenticated execution privileges on atomic payment RPCs.
--   2. Extend orders and payments schema to support 'Refund Pending' and refund metadata.
--   3. Create record_refund_atomic procedure with pessimistic locking and idempotency.
-- ==============================================================================

-- 1. SECURITY HARDENING: REVOKE UNPRIVILEGED ACCESS TO PAYMENT RPCS
REVOKE EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) TO postgres, service_role;

REVOKE EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) TO postgres, service_role;

-- 2. SCHEMA EXTENSIONS FOR ORDERS & PAYMENTS REFUND LIFECYCLE
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_payment_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_payment_status_check 
    CHECK (payment_status IN ('Pending', 'Paid', 'Failed', 'Refund Pending', 'Refunded'));

ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS razorpay_refund_id TEXT DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) DEFAULT NULL;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT NULL 
    CHECK (refund_status IS NULL OR refund_status IN ('pending', 'processed', 'failed'));
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_status_check;
ALTER TABLE public.payments ADD CONSTRAINT payments_status_check 
    CHECK (status IN ('Pending', 'Paid', 'Failed', 'Refund Pending', 'Refunded'));

ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_id TEXT DEFAULT NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_amount NUMERIC(10, 2) DEFAULT NULL;
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refund_status TEXT DEFAULT NULL 
    CHECK (refund_status IS NULL OR refund_status IN ('pending', 'processed', 'failed'));
ALTER TABLE public.payments ADD COLUMN IF NOT EXISTS refunded_at TIMESTAMPTZ DEFAULT NULL;

-- 3. ATOMIC RECORD REFUND STORED PROCEDURE
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
    v_now TIMESTAMPTZ := NOW();
    v_target_payment_status TEXT;
BEGIN
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
        -- Failed refund: payment was collected, so order remains Paid, but refund marked failed
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

-- Grant execution strictly to trusted roles
REVOKE EXECUTE ON FUNCTION public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB) TO postgres, service_role;

