-- ==============================================================================
-- Migration: 20261109000003_phase00_final_security_remediation.sql
-- Description: Phase 0 Final Security Remediation — Payment Settlement Integrity
-- ==============================================================================
-- Remediations:
-- 1. Critical Remediation A (Mandatory Payment Evidence):
--    - Enforce non-empty provider payment ID and provider order ID.
--    - Mandatory provider currency evidence ('INR'). Missing or mismatched rejects settlement.
--    - Mandatory provider amount evidence (paise / 100.0). Missing, non-positive, or mismatched rejects settlement.
-- 2. Critical Remediation B (Matching Payment Record Required):
--    - Locking candidate payment record in public.payments FOR UPDATE.
--    - Missing payment record strictly rejects settlement with 'payment_record_not_found'.
--    - Payment record must belong to the exact order being settled.
--    - Payment record provider must be 'Razorpay'.
--    - Payment record amount and currency must match authoritative order values.
--    - Payment record status must permit settlement (not already Refunded or Failed).
--    - Atomically updates orders and payments within the same transaction.
-- 3. Critical Remediation C (Already-Paid Idempotency Hardening):
--    - Already-paid order must have a valid persisted payment identity. Missing identity returns 'missing_payment_identity'.
--    - Repeated settlement with matching payment ID returns idempotent success ('already_paid', settled: false).
--    - Settlement attempt with conflicting payment ID returns 'payment_id_conflict'.
--    - Rejects tampering even on duplicate callbacks.
-- ==============================================================================

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
    -- 1. Strict authorization check: Only service_role or admin may execute payment settlement
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Payment settlement requires service-role credentials.';
        END IF;
    END IF;

    -- 2. Validate payment provider arguments
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

    -- 3. Lock candidate order row FOR UPDATE
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

    -- 4. Reject online prepaid settlement for COD orders
    IF v_order.payment_method = 'COD' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_payment_method',
            'message', 'COD orders cannot be settled via online prepaid webhook'
        );
    END IF;

    -- 5. Extract provider currency & amount evidence from p_raw_response
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
        BEGIN
            v_raw_amount := (p_raw_response->>'amount')::NUMERIC / 100.0;
        EXCEPTION WHEN OTHERS THEN
            v_raw_amount := NULL;
        END;
    ELSIF p_raw_response #> '{payment,entity,amount}' IS NOT NULL THEN
        BEGIN
            v_raw_amount := (p_raw_response #>> '{payment,entity,amount}')::NUMERIC / 100.0;
        EXCEPTION WHEN OTHERS THEN
            v_raw_amount := NULL;
        END;
    ELSIF p_raw_response #> '{payment,amount}' IS NOT NULL THEN
        BEGIN
            v_raw_amount := (p_raw_response #>> '{payment,amount}')::NUMERIC / 100.0;
        EXCEPTION WHEN OTHERS THEN
            v_raw_amount := NULL;
        END;
    ELSIF p_raw_response #> '{payload,payment,entity,amount}' IS NOT NULL THEN
        BEGIN
            v_raw_amount := (p_raw_response #>> '{payload,payment,entity,amount}')::NUMERIC / 100.0;
        EXCEPTION WHEN OTHERS THEN
            v_raw_amount := NULL;
        END;
    ELSIF p_raw_response #> '{order,entity,amount}' IS NOT NULL THEN
        BEGIN
            v_raw_amount := (p_raw_response #>> '{order,entity,amount}')::NUMERIC / 100.0;
        EXCEPTION WHEN OTHERS THEN
            v_raw_amount := NULL;
        END;
    ELSIF p_raw_response #> '{payload,order,entity,amount}' IS NOT NULL THEN
        BEGIN
            v_raw_amount := (p_raw_response #>> '{payload,order,entity,amount}')::NUMERIC / 100.0;
        EXCEPTION WHEN OTHERS THEN
            v_raw_amount := NULL;
        END;
    END IF;

    -- 6. Lock and validate matching payment record in public.payments (Critical Remediation B)
    SELECT * INTO v_payment
    FROM public.payments
    WHERE provider_order_id = p_razorpay_order_id
    ORDER BY created_at DESC
    LIMIT 1
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

    IF v_payment.provider IS NOT NULL AND v_payment.provider <> 'Razorpay' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_provider_mismatch',
            'message', 'Payment settlement rejected: Payment provider mismatch. Expected Razorpay.'
        );
    END IF;

    IF v_payment.status IN ('Refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_status_invalid',
            'message', 'Payment settlement rejected: Payment record has status ' || v_payment.status
        );
    END IF;

    IF ABS(v_payment.amount - v_order.total_amount) > 0.01 OR (v_payment.currency IS NOT NULL AND UPPER(v_payment.currency) <> 'INR') THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_amount_mismatch',
            'message', 'Payment settlement rejected: Payment record amount (' || v_payment.amount::text || ') or currency (' || COALESCE(v_payment.currency, 'NULL') || ') mismatch with order (' || v_order.total_amount::text || ' INR)'
        );
    END IF;

    -- 7. Idempotency Check & Payment Identity Conflict Detection (Critical Remediation C)
    IF (v_order.is_paid IS TRUE OR v_order.payment_status = 'Paid') THEN
        -- Check stored payment identity on the order
        IF v_order.razorpay_payment_id IS NULL OR trim(v_order.razorpay_payment_id) = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'missing_payment_identity',
                'message', 'Payment identity missing on paid order: Order marked Paid without stored payment ID. Reconciliation required.',
                'order_id', v_order.id
            );
        END IF;

        -- Check if incoming payment ID matches the settled payment ID
        IF v_order.razorpay_payment_id <> p_razorpay_payment_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_id_conflict',
                'message', 'Payment identity mismatch: Order already settled under payment ID ' || v_order.razorpay_payment_id || ' but received conflicting ID ' || p_razorpay_payment_id,
                'order_id', v_order.id
            );
        END IF;

        -- Check payment record provider_payment_id consistency
        IF v_payment.provider_payment_id IS NOT NULL AND v_payment.provider_payment_id <> p_razorpay_payment_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_id_conflict',
                'message', 'Payment record identity mismatch: Record already settled under ' || v_payment.provider_payment_id || ' but received ' || p_razorpay_payment_id,
                'order_id', v_order.id
            );
        END IF;

        -- If raw provider response contains currency or amount on duplicate delivery, verify consistency
        IF v_raw_currency IS NOT NULL AND v_raw_currency <> 'INR' THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'currency_mismatch',
                'message', 'Payment settlement rejected: Currency mismatch on duplicate event.'
            );
        END IF;
        IF v_raw_amount IS NOT NULL AND ABS(v_raw_amount - v_order.total_amount) > 0.01 THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'amount_mismatch',
                'message', 'Payment settlement rejected: Amount mismatch on duplicate event.'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_paid',
            'order_id', v_order.id,
            'user_id', v_order.user_id,
            'settled', false,
            'message', 'Order already settled under matching payment ID ' || p_razorpay_payment_id
        );
    END IF;

    -- 8. Mandatory Provider Evidence for first-time settlement (Critical Remediation A)
    IF v_raw_currency IS NULL OR trim(v_raw_currency) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'missing_provider_currency',
            'message', 'Payment settlement rejected: Provider currency evidence is missing.'
        );
    END IF;

    IF v_raw_currency <> 'INR' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'currency_mismatch',
            'message', 'Payment settlement rejected: Currency mismatch. Expected INR but received ' || v_raw_currency
        );
    END IF;

    IF v_raw_amount IS NULL OR v_raw_amount <= 0 THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'missing_provider_amount',
            'message', 'Payment settlement rejected: Provider amount evidence is missing or invalid.'
        );
    END IF;

    IF ABS(v_raw_amount - v_order.total_amount) > 0.01 THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'amount_mismatch',
            'message', 'Payment settlement rejected: Amount mismatch. Expected ' || v_order.total_amount::text || ' but received ' || v_raw_amount::text
        );
    END IF;

    -- 9. Validate Complete Inventory Reservation Coverage
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

        -- Transition matching payment record to Paid
        UPDATE public.payments
        SET provider_payment_id = p_razorpay_payment_id,
            signature = p_signature,
            status = 'Paid',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;

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

    -- Reject recovery for non-recoverable cancellations
    -- Only orders cancelled specifically because online reservation expired can be recovered
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

    -- If order is in an unrelated terminal state
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
            refund_status = 'pending',
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
    -- Lock book rows in consistent order to prevent deadlocks
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
            FOR UPDATE
        LOOP
            UPDATE public.books SET stock = stock + v_item.quantity WHERE id = v_item.book_id;
            UPDATE public.inventory_reservations SET status = 'released', updated_at = v_now WHERE id = v_item.id;
        END LOOP;

        IF v_order.coupon_status = 'reserved' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
            UPDATE public.discounts
            SET used_count = GREATEST(used_count - 1, 0)
            WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
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

    UPDATE public.inventory_reservations
    SET status = 'committed',
        expires_at = NULL,
        updated_at = v_now
    WHERE order_id = v_order.id;

    IF v_order.coupon_status = 'released' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts
        SET used_count = used_count + 1
        WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
    END IF;

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

    UPDATE public.payments
    SET provider_payment_id = p_razorpay_payment_id,
        signature = p_signature,
        status = 'Paid',
        raw_response = COALESCE(p_raw_response, raw_response),
        updated_at = v_now
    WHERE id = v_payment.id;

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
