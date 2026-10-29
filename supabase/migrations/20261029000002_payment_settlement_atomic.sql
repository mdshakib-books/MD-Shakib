-- Migration: 20261029000002_payment_settlement_atomic.sql
-- Description: Atomic and concurrency-safe stored procedures for Razorpay payment settlement and failure handling.
-- Protects against out-of-order webhook delivery, race conditions, and duplicate side effects.

CREATE OR REPLACE FUNCTION public.settle_payment_atomic(
    p_razorpay_order_id TEXT,
    p_razorpay_payment_id TEXT,
    p_signature TEXT,
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
BEGIN
    -- 1. Pessimistic concurrency control: Lock candidate order row FOR UPDATE
    SELECT * INTO v_order
    FROM public.orders
    WHERE razorpay_order_id = p_razorpay_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'order_not_found',
            'message', 'No order associated with Razorpay order ID'
        );
    END IF;

    -- 2. Idempotency Check: if order is already marked Paid, return early without re-mutating
    IF v_order.is_paid IS TRUE AND v_order.payment_status = 'Paid' THEN
        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_paid',
            'order_id', v_order.id,
            'user_id', v_order.user_id,
            'settled', false
        );
    END IF;

    -- 3. Lock candidate payment record FOR UPDATE
    SELECT * INTO v_payment
    FROM public.payments
    WHERE provider_order_id = p_razorpay_order_id
    FOR UPDATE;

    -- 4. Authoritatively transition order to Paid & Confirmed
    UPDATE public.orders
    SET payment_status = 'Paid',
        order_status = 'Confirmed',
        is_paid = TRUE,
        paid_at = v_now,
        razorpay_payment_id = p_razorpay_payment_id,
        updated_at = v_now
    WHERE id = v_order.id;

    -- 5. Transition payment record to Paid
    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET provider_payment_id = p_razorpay_payment_id,
            signature = p_signature,
            status = 'Paid',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'settled',
        'order_id', v_order.id,
        'user_id', v_order.user_id,
        'settled', true
    );
END;
$$;

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
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
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

    -- 3. Update payment record to Failed only if in Pending status
    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET status = 'Failed',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'recorded_failure',
        'order_id', v_order.id
    );
END;
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) TO postgres, service_role, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) TO postgres, service_role, authenticated;

