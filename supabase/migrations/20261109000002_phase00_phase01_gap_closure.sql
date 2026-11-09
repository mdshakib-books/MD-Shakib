-- ==============================================================================
-- Migration: 20261109000002_phase00_phase01_gap_closure.sql
-- Description: Phase 0 Security Hardening & Phase 1 Gap Closure
-- ==============================================================================
-- Remediations:
-- 1. Phase 0 Concern 1: cancel_order_atomic NEVER restores inventory to books if
--    order is already 'Shipped' or 'Out for Delivery'.
-- 2. Phase 0 Concern 2 & 3: settle_payment_atomic verifies amount and currency,
--    and rejects conflicting payment IDs on already settled orders.
-- 3. Phase 0 Concern 4: record_refund_atomic validates refund ID, amount boundaries,
--    and prevents downgrade or overwrite of processed refunds.
-- ==============================================================================

-- 1. HARDEN cancel_order_atomic: NEVER RESTORE INVENTORY FOR SHIPPED ORDERS
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

    -- Validate administrative privilege
    IF p_is_admin THEN
        SELECT (role IN ('super_admin', 'admin', 'order_manager') AND is_blocked = FALSE AND is_deleted = FALSE)
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

    -- Customer cancellation is strictly forbidden once shipment is physically in courier hands
    IF NOT v_actual_is_admin AND v_order.order_status IN ('Shipped', 'Out for Delivery') THEN
        RAISE EXCEPTION 'Order has already been dispatched with courier (AWB: %) and cannot be cancelled by customer. Please request return/replacement upon delivery.',
            COALESCE(v_order.shipping_awb, 'N/A');
    END IF;

    -- Terminal states cannot be cancelled
    IF v_order.order_status IN ('Cancelled', 'Delivered', 'Returned') OR v_order.order_status LIKE 'Replacement%' THEN
        RAISE EXCEPTION 'Order cannot be cancelled in % status', v_order.order_status;
    END IF;

    -- INVENTORY RESTORATION SAFETY (Phase 0 Concern 1)
    -- If the order is ALREADY Shipped or Out for Delivery, items have left the warehouse.
    -- Stock must NEVER be restored to warehouse shelves while with courier.
    IF v_order.order_status NOT IN ('Shipped', 'Out for Delivery') THEN
        -- Order is still in warehouse (Pending, Confirmed, Processing, Packed)
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
    ELSE
        -- Order was dispatched with courier: Void/release reservations without restoring shelf stock
        UPDATE public.inventory_reservations
        SET status = 'released',
            updated_at = v_now
        WHERE order_id = p_order_id AND status IN ('reserved', 'committed');
    END IF;

    -- Order-specific coupon accounting
    v_target_coupon_status := v_order.coupon_status;
    IF v_order.coupon_status IN ('reserved', 'consumed') AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts
        SET used_count = GREATEST(used_count - 1, 0)
        WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));

        v_target_coupon_status := 'released';
    END IF;

    -- Paid Order vs Unpaid Order Cancellation Policy
    IF v_order.is_paid IS TRUE OR v_order.payment_status = 'Paid' THEN
        v_target_payment_status := 'Refund Pending';
        v_target_refund_status := 'pending';
        v_target_refund_amount := v_order.total_amount;
    ELSE
        v_target_payment_status := 'Failed';
        v_target_refund_status := NULL;
        v_target_refund_amount := NULL;
    END IF;

    -- Update order to Cancelled (trg_order_status_history automatically records transition)
    UPDATE public.orders
    SET order_status = 'Cancelled',
        cancel_reason = COALESCE(p_cancel_reason, 'Cancelled by customer'),
        payment_status = v_target_payment_status,
        refund_status = v_target_refund_status,
        refund_amount = v_target_refund_amount,
        coupon_status = v_target_coupon_status,
        updated_at = v_now
    WHERE id = p_order_id;

    RETURN TRUE;
END;
$$;


-- 2. HARDEN settle_payment_atomic: PROVIDER EVIDENCE & IDENTITY RECONCILIATION
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

    -- 3. Idempotency Check & Payment ID Conflict Detection (Phase 0 Concern 3)
    IF v_order.is_paid IS TRUE AND v_order.payment_status = 'Paid' THEN
        -- If already settled, verify that the payment ID matches the settled payment ID
        IF v_order.razorpay_payment_id IS NOT NULL AND v_order.razorpay_payment_id <> p_razorpay_payment_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_id_conflict',
                'message', 'Payment identity mismatch: Order already settled under payment ID ' || v_order.razorpay_payment_id || ' but received ' || p_razorpay_payment_id
            );
        END IF;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'already_paid',
            'order_id', v_order.id,
            'user_id', v_order.user_id,
            'settled', false
        );
    END IF;

    -- 4. Verify payment currency matches INR if currency is in raw response (Remediation 6 & Phase 0 Concern 2)
    IF p_raw_response ? 'currency' THEN
        v_raw_currency := UPPER(p_raw_response->>'currency');
    ELSIF p_raw_response #> '{payment,entity,currency}' IS NOT NULL THEN
        v_raw_currency := UPPER(p_raw_response #>> '{payment,entity,currency}');
    ELSIF p_raw_response #> '{order,entity,currency}' IS NOT NULL THEN
        v_raw_currency := UPPER(p_raw_response #>> '{order,entity,currency}');
    END IF;

    IF v_raw_currency IS NOT NULL AND v_raw_currency <> 'INR' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'currency_mismatch',
            'message', 'Payment currency mismatch: Expected INR but received ' || v_raw_currency
        );
    END IF;

    -- 5. Verify payment amount matches order total if amount is in raw response (Remediation 6 & Phase 0 Concern 2)
    IF p_raw_response ? 'amount' THEN
        v_raw_amount := (p_raw_response->>'amount')::NUMERIC / 100.0;
    ELSIF p_raw_response #> '{payment,entity,amount}' IS NOT NULL THEN
        v_raw_amount := (p_raw_response #>> '{payment,entity,amount}')::NUMERIC / 100.0;
    ELSIF p_raw_response #> '{order,entity,amount}' IS NOT NULL THEN
        v_raw_amount := (p_raw_response #>> '{order,entity,amount}')::NUMERIC / 100.0;
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
        IF v_payment.id IS NOT NULL THEN
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = p_signature,
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;
        END IF;

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


-- 3. HARDEN record_refund_atomic: VALIDATE REFUND IDENTITY, AMOUNT & OVERWRITE DEFENSE
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

    -- Validate refund identity (Phase 0 Concern 4)
    IF p_refund_id IS NULL OR trim(p_refund_id) = '' THEN
        RAISE EXCEPTION 'Refund ID cannot be empty';
    END IF;

    -- Validate refund amount positive (Phase 0 Concern 4)
    IF p_refund_amount IS NULL OR p_refund_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be positive';
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

    -- Validate refund amount against order total (Phase 0 Concern 4)
    IF p_refund_amount > v_order.total_amount THEN
        RAISE EXCEPTION 'Refund amount (%) exceeds order total amount (%)', p_refund_amount, v_order.total_amount;
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

    -- Downgrade Prevention (Phase 0 Concern 4): A processed refund cannot be downgraded to pending or failed
    IF v_order.refund_status = 'processed' AND p_refund_status <> 'processed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'cannot_downgrade_processed_refund',
            'message', 'Order already has a processed refund; cannot downgrade to ' || p_refund_status
        );
    END IF;

    -- Overwrite Conflict Prevention (Phase 0 Concern 4): Cannot overwrite an existing processed refund with different refund ID
    IF v_order.refund_status = 'processed' AND v_order.razorpay_refund_id IS NOT NULL AND v_order.razorpay_refund_id <> p_refund_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'refund_id_conflict',
            'message', 'Conflict: Order already has settled refund ' || v_order.razorpay_refund_id || '; incoming refund ID: ' || p_refund_id
        );
    END IF;

    -- Determine target order/payment status
    IF p_refund_status = 'processed' THEN
        v_target_payment_status := 'Refunded';
    ELSIF p_refund_status = 'pending' THEN
        v_target_payment_status := 'Refund Pending';
    ELSE
        -- Failed refund: payment was collected, so order reverts to Paid
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
        'order_id', v_order.id,
        'refund_id', p_refund_id,
        'payment_status', v_target_payment_status
    );
END;
$$;
