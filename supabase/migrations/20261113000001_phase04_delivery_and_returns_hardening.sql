-- ==============================================================================
-- PHASE 04: DELIVERY & RETURNS HARDENING
-- Forward-only migration (depends on 20261112000001_phase03_admin_roles_order_management.sql)
--
-- Addresses:
-- 1. Reverse Pickup & Return Lifecycle Integrity (H-4):
--    - Forbid synthetic REV-* AWBs at database level.
--    - Distinguish refund eligibility/pending from confirmed completion (`refund_pending` -> `completed`).
--    - Enforce monotonic return_requests state transitions via BEFORE trigger.
-- 2. COD Collection, Remittance Unification, Cancellation & Refund Guardrails:
--    - Track doorstep COD cash collection explicitly on orders (`cod_collection_status`, `cod_collected_amount`, `cod_collected_at`).
--    - Keep `orders.cod_settled_amount` exclusively for reconciled courier bank remittances.
--    - Prevent duplicate positive COD collections and duplicate remittance references.
--    - Block pre-collection COD cancellations or RTO orders from creating refund records.
--    - Require explicit non-synthetic offline payout confirmation (UTR/UPI/cash ref) via
--      `complete_cod_refund_atomic` before marking a collected COD return refund processed.
-- 3. Delhivery Webhook Idempotency & Out-of-Order / Stale Event Ordering:
--    - Persist Delhivery events in `public.webhook_events` with payload hash & provider timestamps.
--    - Track `shipping_last_webhook_at` and `shipping_last_webhook_status` on `orders` / `shipments`.
--    - Provide atomic `apply_delhivery_webhook_atomic` RPC rejecting stale, duplicate,
--      out-of-order, manual-carrier, and post-cancellation regressions cleanly.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RETURNS & REVERSE PICKUP HARDENING (H-4)
-- ------------------------------------------------------------------------------

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.return_requests'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ~* '\ystatus\M'
    LOOP
        EXECUTE format('ALTER TABLE public.return_requests DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.return_requests
    ADD CONSTRAINT return_requests_status_check
    CHECK (
        status IN (
            'submitted',
            'under_review',
            'info_requested',
            'approved',
            'rejected',
            'pickup_scheduled',
            'pickup_completed',
            'received',
            'refund_pending',
            'completed',
            'cancelled'
        )
    );

CREATE OR REPLACE FUNCTION public.validate_return_request_lifecycle()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.pickup_awb IS NOT NULL AND NEW.pickup_awb ~* '^(REV-|MOCK)' THEN
        RAISE EXCEPTION 'Synthetic reverse pickup AWBs (e.g. REV-*) are prohibited.';
    END IF;

    IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
        IF OLD.status = 'submitted' AND NEW.status NOT IN ('under_review', 'info_requested', 'approved', 'rejected', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid return request status transition from "submitted" to "%".', NEW.status;
        ELSIF OLD.status = 'under_review' AND NEW.status NOT IN ('info_requested', 'approved', 'rejected', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid return request status transition from "under_review" to "%".', NEW.status;
        ELSIF OLD.status = 'info_requested' AND NEW.status NOT IN ('submitted', 'under_review', 'approved', 'rejected', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid return request status transition from "info_requested" to "%".', NEW.status;
        ELSIF OLD.status = 'approved' AND NEW.status NOT IN ('pickup_scheduled', 'received', 'refund_pending', 'completed', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid return request status transition from "approved" to "%".', NEW.status;
        ELSIF OLD.status = 'pickup_scheduled' AND NEW.status NOT IN ('pickup_completed', 'received', 'refund_pending', 'completed', 'cancelled') THEN
            RAISE EXCEPTION 'Invalid return request status transition from "pickup_scheduled" to "%".', NEW.status;
        ELSIF OLD.status = 'pickup_completed' AND NEW.status NOT IN ('received', 'refund_pending', 'completed') THEN
            RAISE EXCEPTION 'Invalid return request status transition from "pickup_completed" to "%".', NEW.status;
        ELSIF OLD.status = 'received' AND NEW.status NOT IN ('refund_pending', 'completed') THEN
            RAISE EXCEPTION 'Invalid return request status transition from "received" to "%".', NEW.status;
        ELSIF OLD.status = 'refund_pending' AND NEW.status NOT IN ('completed') THEN
            RAISE EXCEPTION 'Invalid return request status transition from "refund_pending" to "%".', NEW.status;
        ELSIF OLD.status IN ('rejected', 'completed', 'cancelled') THEN
            RAISE EXCEPTION 'Return request in terminal "%" status cannot transition to "%".', OLD.status, NEW.status;
        END IF;
    END IF;

    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_return_request_lifecycle ON public.return_requests;
CREATE TRIGGER trg_validate_return_request_lifecycle
    BEFORE INSERT OR UPDATE ON public.return_requests
    FOR EACH ROW
    EXECUTE FUNCTION public.validate_return_request_lifecycle();

-- ------------------------------------------------------------------------------
-- 2. ORDERS & REFUND_RECORDS EXTENSIONS FOR COD & WEBHOOK ORDERING
-- ------------------------------------------------------------------------------

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cod_collection_status TEXT NOT NULL DEFAULT 'uncollected';

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cod_collected_amount NUMERIC(10, 2) DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cod_collected_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS cod_refund_reference TEXT DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS shipping_last_webhook_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS shipping_last_webhook_status TEXT DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_cod_collection_status_check'
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_cod_collection_status_check
            CHECK (cod_collection_status IN ('uncollected', 'collected', 'shortfall', 'excess', 'refused'));
    END IF;
END $$;

-- Prevent duplicate positive doorstep COD collections for the same order
CREATE UNIQUE INDEX IF NOT EXISTS idx_cod_collections_positive_unique
    ON public.cod_collections(order_id)
    WHERE collection_status IN ('collected', 'excess');

-- Add offline payout & channel verification columns to refund_records
ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS payment_channel TEXT NOT NULL DEFAULT 'razorpay';

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS payout_reference TEXT DEFAULT NULL;

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS payout_destination_hint TEXT DEFAULT NULL;

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS payout_confirmed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.refund_records
    ADD COLUMN IF NOT EXISTS payout_confirmed_at TIMESTAMPTZ DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'refund_records_payment_channel_check'
    ) THEN
        ALTER TABLE public.refund_records
            ADD CONSTRAINT refund_records_payment_channel_check
            CHECK (payment_channel IN ('razorpay', 'cod_bank_transfer', 'cod_upi', 'cod_offline'));
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_records_payout_reference
    ON public.refund_records(payout_reference)
    WHERE payout_reference IS NOT NULL;

-- Backfill existing ONLINE vs COD refund records safely without altering historical amounts
UPDATE public.refund_records rr
SET payment_channel = CASE
    WHEN COALESCE(o.payment_method, 'ONLINE') = 'COD' THEN 'cod_offline'
    ELSE 'razorpay'
END
FROM public.orders o
WHERE o.id = rr.order_id
  AND rr.payment_channel = 'razorpay'
  AND COALESCE(o.payment_method, 'ONLINE') = 'COD';

-- Guard refund_records against synthetic gateway/COD refund IDs & uncollected COD orders
CREATE OR REPLACE FUNCTION public.guard_refund_records_integrity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_has_cod_payment BOOLEAN := FALSE;
BEGIN
    IF NEW.gateway_refund_id IS NOT NULL AND NEW.gateway_refund_id ~* '^(COD-REFUND-|MOCK|FAKE|TEST-REFUND)' THEN
        RAISE EXCEPTION 'Synthetic gateway refund identifiers (such as COD-REFUND-*) are prohibited.';
    END IF;

    IF NEW.payout_reference IS NOT NULL AND NEW.payout_reference ~* '^(COD-REFUND-|MOCK|FAKE|TEST-REFUND)' THEN
        RAISE EXCEPTION 'Synthetic payout references are prohibited.';
    END IF;

    SELECT id, payment_method, payment_status, is_paid, cod_settlement_status, cod_collection_status
    INTO v_order
    FROM public.orders
    WHERE id = NEW.order_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found for refund record.', NEW.order_id;
    END IF;

    IF upper(COALESCE(v_order.payment_method, '')) = 'COD' THEN
        SELECT (
            v_order.is_paid IS TRUE
            OR v_order.payment_status IN ('Paid', 'Partially Refunded', 'Refund Pending', 'Refunded')
            OR COALESCE(v_order.cod_settlement_status, '') = 'reconciled'
            OR COALESCE(v_order.cod_collection_status, 'uncollected') IN ('collected', 'excess')
            OR EXISTS (
                SELECT 1 FROM public.cod_collections cc
                WHERE cc.order_id = v_order.id
                  AND cc.collection_status IN ('collected', 'excess')
                  AND cc.collected_amount > 0
            )
        ) INTO v_has_cod_payment;

        IF NOT v_has_cod_payment THEN
            RAISE EXCEPTION 'Cannot create or update refund record for uncollected COD order %.', NEW.order_id;
        END IF;

        IF NEW.status = 'processed' AND NULLIF(trim(COALESCE(NEW.payout_reference, '')), '') IS NULL THEN
            RAISE EXCEPTION 'Confirmed offline COD refund completion requires a non-empty payout_reference (UTR / bank / UPI reference).';
        END IF;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_refund_records_integrity ON public.refund_records;
CREATE TRIGGER trg_guard_refund_records_integrity
    BEFORE INSERT OR UPDATE ON public.refund_records
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_refund_records_integrity();

-- ------------------------------------------------------------------------------
-- 3. WEBHOOK_EVENTS & SHIPMENTS SCHEMA EXTENSIONS
-- ------------------------------------------------------------------------------

ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS payload_hash TEXT DEFAULT NULL;

ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS provider_event_timestamp TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS waybill TEXT DEFAULT NULL;

ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL;

ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS processing_outcome TEXT DEFAULT NULL;

ALTER TABLE public.webhook_events
    ADD COLUMN IF NOT EXISTS error_message TEXT DEFAULT NULL;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.webhook_events'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ~* '\ystatus\M'
    LOOP
        EXECUTE format('ALTER TABLE public.webhook_events DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.webhook_events
    ADD CONSTRAINT webhook_events_status_check
    CHECK (status IN ('processing', 'completed', 'failed', 'ignored'));

CREATE INDEX IF NOT EXISTS idx_webhook_events_waybill_time
    ON public.webhook_events(provider, waybill, provider_event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_events_payload_hash
    ON public.webhook_events(provider, payload_hash)
    WHERE payload_hash IS NOT NULL;

ALTER TABLE public.shipments
    ADD COLUMN IF NOT EXISTS last_webhook_event_id TEXT DEFAULT NULL;

ALTER TABLE public.shipments
    ADD COLUMN IF NOT EXISTS last_webhook_event_at TIMESTAMPTZ DEFAULT NULL;

-- ------------------------------------------------------------------------------
-- 4. HARDEN validate_order_state_transitions FOR COD CANCELLATION / RTO / REFUNDS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.validate_order_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_verified_courier_cancel BOOLEAN := (
        COALESCE(current_setting('app.allow_verified_courier_cancellation', true), 'false') = 'true'
    );
    v_has_collected_cod BOOLEAN := FALSE;
BEGIN
    -- Guard sensitive financial settlement columns against direct non-admin RLS updates
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF (
            OLD.payment_status IS DISTINCT FROM NEW.payment_status
            OR OLD.is_paid IS DISTINCT FROM NEW.is_paid
            OR OLD.paid_at IS DISTINCT FROM NEW.paid_at
            OR OLD.cod_settlement_status IS DISTINCT FROM NEW.cod_settlement_status
            OR OLD.cod_settled_amount IS DISTINCT FROM NEW.cod_settled_amount
            OR OLD.cod_settlement_ref IS DISTINCT FROM NEW.cod_settlement_ref
            OR OLD.cod_collection_status IS DISTINCT FROM NEW.cod_collection_status
            OR OLD.cod_collected_amount IS DISTINCT FROM NEW.cod_collected_amount
            OR OLD.cod_collected_at IS DISTINCT FROM NEW.cod_collected_at
            OR OLD.cod_refund_reference IS DISTINCT FROM NEW.cod_refund_reference
            OR OLD.refund_status IS DISTINCT FROM NEW.refund_status
            OR OLD.refund_amount IS DISTINCT FROM NEW.refund_amount
            OR OLD.razorpay_refund_id IS DISTINCT FROM NEW.razorpay_refund_id
        ) THEN
            -- Allow delivery_otps / operational triggers ONLY for COD Delivered -> pending cod_settlement_status
            IF NOT public.is_admin() THEN
                IF NOT (
                    OLD.order_status IS DISTINCT FROM NEW.order_status
                    AND NEW.order_status = 'Delivered'
                    AND NEW.payment_method = 'COD'
                    AND NEW.payment_status = OLD.payment_status
                    AND NEW.is_paid = OLD.is_paid
                    AND NEW.cod_settlement_status = 'pending'
                ) THEN
                    RAISE EXCEPTION 'Unauthorized: Direct modification of payment, refund, or COD settlement fields requires administrator privilege.';
                END IF;
            END IF;
        END IF;
    END IF;

    -- 1. Validate Order Status Transitions (preserving Phase 3 courier-halt rules)
    IF OLD.order_status <> NEW.order_status THEN
        IF OLD.order_status = 'Pending' AND NEW.order_status NOT IN ('Confirmed', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Pending" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Confirmed' AND NEW.order_status NOT IN ('Processing', 'Packed', 'Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Confirmed" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Processing' AND NEW.order_status NOT IN ('Packed', 'Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Processing" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Packed' AND NEW.order_status NOT IN ('Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Packed" to "%"', NEW.order_status;
        ELSIF OLD.order_status = 'Shipped' THEN
            IF NEW.order_status = 'Cancelled' THEN
                IF NOT v_verified_courier_cancel THEN
                    RAISE EXCEPTION 'Direct transition from "Shipped" to "Cancelled" is prohibited. Cancel the shipment via the confirmed courier cancellation workflow first.';
                END IF;
            ELSIF NEW.order_status NOT IN ('Out for Delivery', 'Delivered', 'Returned') THEN
                RAISE EXCEPTION 'Invalid order status transition from "Shipped" to "%"', NEW.order_status;
            END IF;
        ELSIF OLD.order_status = 'Out for Delivery' THEN
            IF NEW.order_status = 'Cancelled' THEN
                IF NOT v_verified_courier_cancel THEN
                    RAISE EXCEPTION 'Direct transition from "Out for Delivery" to "Cancelled" is prohibited. Cancel the shipment via the confirmed courier cancellation workflow first.';
                END IF;
            ELSIF NEW.order_status NOT IN ('Delivered', 'Returned') THEN
                RAISE EXCEPTION 'Invalid order status transition from "Out for Delivery" to "%"', NEW.order_status;
            END IF;
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

        IF NEW.order_status = 'Shipped' THEN
            IF NULLIF(trim(COALESCE(NEW.shipping_courier, '')), '') IS NULL THEN
                RAISE EXCEPTION 'Cannot transition order to "Shipped" without an assigned shipping courier.';
            END IF;
            IF (
                COALESCE(NEW.shipping_booking_mode, '') = 'delhivery'
                OR lower(trim(NEW.shipping_courier)) = 'delhivery'
            ) AND NULLIF(trim(COALESCE(NEW.shipping_awb, '')), '') IS NULL THEN
                RAISE EXCEPTION 'Delhivery shipments require a valid AWB tracking number before transitioning to "Shipped".';
            END IF;
        END IF;
    END IF;

    -- 2. Validate Payment Status Transitions
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

    -- 3. Enforce COD Zero-Refund Invariant When Uncollected
    IF upper(COALESCE(NEW.payment_method, '')) = 'COD' THEN
        v_has_collected_cod := (
            NEW.is_paid IS TRUE
            OR OLD.is_paid IS TRUE
            OR COALESCE(NEW.cod_settlement_status, 'unsettled') = 'reconciled'
            OR COALESCE(NEW.cod_collection_status, 'uncollected') IN ('collected', 'excess')
        );

        IF NOT v_has_collected_cod THEN
            IF COALESCE(NEW.refund_status, 'not_required') IN ('pending', 'processing', 'processed')
               OR COALESCE(NEW.refund_amount, 0) > 0
               OR NEW.payment_status IN ('Refund Pending', 'Partially Refunded', 'Refunded') THEN
                RAISE EXCEPTION 'Uncollected COD order % cannot enter a refund or refunded payment state.', NEW.id;
            END IF;
        END IF;

        IF NEW.order_status = 'Returned' AND NOT v_has_collected_cod THEN
            NEW.refund_status := 'not_required';
            NEW.refund_amount := NULL;
            IF COALESCE(NEW.cod_settlement_status, 'unsettled') = 'pending' THEN
                NEW.cod_settlement_status := 'unsettled';
            END IF;
        END IF;
    END IF;

    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. HARDENED ATOMIC RPCs FOR COD RETURNS, REFUNDS, COLLECTION & REMITTANCE
-- ------------------------------------------------------------------------------

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
    v_return RECORD;
    v_total_refunded NUMERIC(10,2);
    v_pending_refunds NUMERIC(10,2);
    v_collected_cap NUMERIC(10,2);
    v_refundable_balance NUMERIC(10,2);
    v_record_id UUID;
    v_existing RECORD;
    v_caller_role TEXT;
    v_cod_collected_amount NUMERIC(10,2) := 0;
    v_has_cod_payment BOOLEAN := FALSE;
BEGIN
    v_caller_role := COALESCE(auth.role(), '');
    IF v_caller_role <> 'service_role' AND current_user <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: initiate_return_refund_atomic requires service-role credentials.';
    END IF;

    IF public.user_has_staff_permission(p_admin_id, 'orders.refund') IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Caller must specify an active administrator with orders.refund permission.';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be positive.');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF p_return_id IS NOT NULL THEN
        SELECT * INTO v_return
        FROM public.return_requests
        WHERE id = p_return_id
        FOR UPDATE;

        IF NOT FOUND OR v_return.order_id <> p_order_id THEN
            RETURN jsonb_build_object('success', false, 'error', 'Return request not found for this order.');
        END IF;

        IF v_return.status IN ('submitted', 'under_review', 'info_requested', 'rejected', 'cancelled') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Return request must be approved or received before authorizing a refund (current: ' || v_return.status || ').'
            );
        END IF;
    END IF;

    -- Payment collection verification
    IF upper(COALESCE(v_order.payment_method, '')) = 'ONLINE' THEN
        IF v_order.is_paid IS NOT TRUE AND v_order.payment_status NOT IN ('Paid', 'Partially Refunded', 'Refund Pending') THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Prepaid online order payment has not been captured yet.'
            );
        END IF;
        v_collected_cap := v_order.total_amount;
    ELSIF upper(COALESCE(v_order.payment_method, '')) = 'COD' THEN
        SELECT COALESCE(MAX(cc.collected_amount), 0) INTO v_cod_collected_amount
        FROM public.cod_collections cc
        WHERE cc.order_id = p_order_id
          AND cc.collection_status IN ('collected', 'excess')
          AND cc.collected_amount > 0;

        v_has_cod_payment := (
            v_order.is_paid IS TRUE
            OR v_order.payment_status IN ('Paid', 'Partially Refunded', 'Refund Pending')
            OR COALESCE(v_order.cod_settlement_status, '') = 'reconciled'
            OR COALESCE(v_order.cod_collection_status, 'uncollected') IN ('collected', 'excess')
            OR v_cod_collected_amount > 0
        );

        IF NOT v_has_cod_payment THEN
            RETURN jsonb_build_object(
                'success', false,
                'error', 'COD payment collection has not been confirmed for this order; refund cannot be initiated before collection or remittance.'
            );
        END IF;

        v_collected_cap := COALESCE(
            NULLIF(v_cod_collected_amount, 0),
            NULLIF(v_order.cod_collected_amount, 0),
            NULLIF(v_order.cod_settled_amount, 0),
            v_order.total_amount
        );
        v_collected_cap := LEAST(v_order.total_amount, v_collected_cap);
    ELSE
        RETURN jsonb_build_object('success', false, 'error', 'Unsupported order payment method.');
    END IF;

    IF p_amount > v_collected_cap THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund amount ₹' || p_amount || ' exceeds verified collected amount ₹' || v_collected_cap
        );
    END IF;

    IF p_return_id IS NOT NULL THEN
        SELECT id, amount, status, payment_channel INTO v_existing
        FROM public.refund_records
        WHERE return_request_id = p_return_id AND status IN ('pending', 'processing', 'processed')
        FOR UPDATE;

        IF FOUND THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_initiated', true,
                'refund_record_id', v_existing.id,
                'status', v_existing.status,
                'amount', v_existing.amount,
                'payment_channel', v_existing.payment_channel
            );
        END IF;
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
    FROM public.refund_records
    WHERE order_id = p_order_id AND status = 'processed';

    SELECT COALESCE(SUM(amount), 0) INTO v_pending_refunds
    FROM public.refund_records
    WHERE order_id = p_order_id AND status IN ('pending', 'processing');

    v_refundable_balance := GREATEST(0, v_collected_cap - (v_total_refunded + v_pending_refunds));

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
        gateway_status,
        reason,
        authorized_by,
        refund_type,
        payment_channel,
        idempotency_key
    ) VALUES (
        p_order_id,
        p_return_id,
        p_amount,
        'pending',
        CASE WHEN upper(v_order.payment_method) = 'COD' THEN 'awaiting_offline_payout' ELSE 'pending' END,
        p_reason,
        p_admin_id,
        'return',
        CASE WHEN upper(v_order.payment_method) = 'COD' THEN 'cod_offline' ELSE 'razorpay' END,
        CASE WHEN p_return_id IS NOT NULL THEN 'refund:return:' || p_return_id::text ELSE NULL END
    ) RETURNING id INTO v_record_id;

    RETURN jsonb_build_object(
        'success', true,
        'refund_record_id', v_record_id,
        'order_id', p_order_id,
        'amount', p_amount,
        'payment_method', v_order.payment_method,
        'refundable_balance_remaining', v_refundable_balance - p_amount
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) TO postgres, service_role;

-- Explicitly confirm offline COD payout completion (distinguishes eligibility/approval from completion)
CREATE OR REPLACE FUNCTION public.complete_cod_refund_atomic(
    p_refund_record_id UUID,
    p_admin_id UUID,
    p_payout_channel TEXT,
    p_payout_reference TEXT,
    p_destination_hint TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_rec RECORD;
    v_order RECORD;
    v_clean_ref TEXT := trim(COALESCE(p_payout_reference, ''));
    v_now TIMESTAMPTZ := clock_timestamp();
    v_prior_processed NUMERIC(10,2);
    v_total_refunded NUMERIC(10,2);
    v_target_payment_status TEXT;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: complete_cod_refund_atomic requires service-role credentials.';
    END IF;

    IF public.user_has_staff_permission(p_admin_id, 'orders.refund') IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Active administrator with orders.refund permission required.';
    END IF;

    IF p_payout_channel NOT IN ('cod_bank_transfer', 'cod_upi', 'cod_offline') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid COD payout channel.');
    END IF;

    IF char_length(v_clean_ref) < 4 OR v_clean_ref ~* '^(COD-REFUND-|MOCK|FAKE|TEST-REFUND)' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'A valid external payout reference (UTR / UPI transaction ref / signed voucher) is required.'
        );
    END IF;

    SELECT * INTO v_rec
    FROM public.refund_records
    WHERE id = p_refund_record_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund record not found.');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = v_rec.order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF upper(COALESCE(v_order.payment_method, '')) <> 'COD' THEN
        RETURN jsonb_build_object('success', false, 'error', 'complete_cod_refund_atomic is only for COD orders.');
    END IF;

    IF v_rec.status = 'processed' THEN
        IF v_rec.payout_reference = v_clean_ref THEN
            RETURN jsonb_build_object(
                'success', true,
                'already_processed', true,
                'refund_record_id', v_rec.id,
                'payout_reference', v_rec.payout_reference,
                'amount', v_rec.amount
            );
        END IF;
        RETURN jsonb_build_object(
            'success', false,
            'error', 'COD refund has already been completed with reference ' || COALESCE(v_rec.payout_reference, 'unknown')
        );
    END IF;

    SELECT COALESCE(SUM(amount), 0) INTO v_prior_processed
    FROM public.refund_records
    WHERE order_id = v_order.id AND status = 'processed' AND id <> v_rec.id;

    v_total_refunded := v_prior_processed + v_rec.amount;
    IF v_total_refunded > (v_order.total_amount + 0.01) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cumulative COD refund exceeds order total.');
    END IF;

    IF v_total_refunded >= (v_order.total_amount - 0.01) THEN
        v_target_payment_status := 'Refunded';
    ELSE
        v_target_payment_status := 'Partially Refunded';
    END IF;

    UPDATE public.refund_records
    SET
        status = 'processed',
        payment_channel = p_payout_channel,
        gateway_status = 'offline_payout_confirmed',
        payout_reference = v_clean_ref,
        payout_destination_hint = NULLIF(trim(COALESCE(p_destination_hint, '')), ''),
        payout_confirmed_by = p_admin_id,
        payout_confirmed_at = v_now,
        processed_at = v_now,
        raw_response = COALESCE(raw_response, '{}'::jsonb) || jsonb_build_object(
            'payout_channel', p_payout_channel,
            'payout_reference', v_clean_ref,
            'notes', NULLIF(trim(COALESCE(p_notes, '')), ''),
            'confirmed_at', v_now
        ),
        updated_at = v_now
    WHERE id = v_rec.id;

    IF v_rec.return_request_id IS NOT NULL THEN
        UPDATE public.return_requests
        SET
            status = 'completed',
            resolved_by = p_admin_id,
            resolved_at = v_now,
            updated_at = v_now
        WHERE id = v_rec.return_request_id
          AND status <> 'completed';
    END IF;

    PERFORM set_config('app.actor_user_id', p_admin_id::text, true);
    PERFORM set_config('app.transition_source', 'cod_refund_payout', true);

    UPDATE public.orders
    SET
        refund_status = 'processed',
        refund_amount = v_total_refunded,
        cod_refund_reference = v_clean_ref,
        refunded_at = COALESCE(refunded_at, v_now),
        payment_status = v_target_payment_status,
        updated_at = v_now
    WHERE id = v_order.id;

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
        'CONFIRM_COD_REFUND_PAYOUT',
        'orders',
        v_order.id::text,
        jsonb_build_object('payment_status', v_order.payment_status, 'refund_status', v_order.refund_status),
        jsonb_build_object(
            'payment_status', v_target_payment_status,
            'refund_status', 'processed',
            'payout_channel', p_payout_channel,
            'payout_reference', v_clean_ref,
            'refund_amount', v_total_refunded
        ),
        jsonb_build_object('refund_record_id', v_rec.id, 'notes', p_notes),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'status', 'processed',
        'refund_record_id', v_rec.id,
        'order_id', v_order.id,
        'payout_reference', v_clean_ref,
        'amount', v_rec.amount,
        'payment_status', v_target_payment_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.complete_cod_refund_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_cod_refund_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT) TO postgres, service_role;

-- Atomic Doorstep COD Collection RPC (never overwrites cod_settled_amount before bank remittance)
CREATE OR REPLACE FUNCTION public.record_cod_collection_atomic(
    p_order_id UUID,
    p_expected_amount NUMERIC(10,2),
    p_collected_amount NUMERIC(10,2),
    p_collector_id UUID,
    p_collection_status TEXT,
    p_collection_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_collection_id UUID;
    v_next_is_paid BOOLEAN;
    v_next_payment_status TEXT;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: record_cod_collection_atomic requires service-role credentials.';
    END IF;

    IF public.user_has_staff_permission(p_collector_id, 'orders.settle_cod') IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: orders.settle_cod permission required to record COD collection.';
    END IF;

    IF p_collection_status NOT IN ('collected', 'shortfall', 'excess', 'refused') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid COD collection status.');
    END IF;

    IF p_collected_amount IS NULL OR p_collected_amount < 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Collected amount cannot be negative.');
    END IF;

    IF p_collection_status = 'refused' AND p_collected_amount > 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refused COD collection must have collected_amount = 0.');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF upper(COALESCE(v_order.payment_method, '')) <> 'COD' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only COD orders can record cash collections.');
    END IF;

    IF v_order.order_status NOT IN ('Out for Delivery', 'Delivered') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Doorstep COD collection is only allowed when order is Out for Delivery or Delivered (current: ' || v_order.order_status || ').'
        );
    END IF;

    IF v_order.cod_collection_status IN ('collected', 'excess') AND p_collection_status IN ('collected', 'excess') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'COD cash collection has already been recorded for this order.'
        );
    END IF;

    INSERT INTO public.cod_collections (
        order_id,
        expected_amount,
        collected_amount,
        collector_id,
        collection_status,
        collection_reference,
        notes,
        collected_at
    ) VALUES (
        p_order_id,
        p_expected_amount,
        p_collected_amount,
        p_collector_id,
        p_collection_status,
        NULLIF(trim(COALESCE(p_collection_reference, '')), ''),
        NULLIF(trim(COALESCE(p_notes, '')), ''),
        v_now
    ) RETURNING id INTO v_collection_id;

    v_next_is_paid := (
        v_order.is_paid
        OR (p_collection_status IN ('collected', 'excess') AND p_collected_amount >= (v_order.total_amount - 0.01))
    );

    v_next_payment_status := CASE
        WHEN v_next_is_paid AND v_order.payment_status = 'Pending' THEN 'Paid'
        ELSE v_order.payment_status
    END;

    UPDATE public.orders
    SET
        cod_collection_status = p_collection_status,
        cod_collected_amount = p_collected_amount,
        cod_collected_at = v_now,
        is_paid = v_next_is_paid,
        payment_status = v_next_payment_status,
        paid_at = CASE WHEN v_next_is_paid AND paid_at IS NULL THEN v_now ELSE paid_at END,
        cod_settlement_status = CASE
            WHEN cod_settlement_status = 'unsettled' AND p_collection_status IN ('collected', 'excess', 'shortfall') THEN 'pending'
            ELSE cod_settlement_status
        END,
        updated_at = v_now
    WHERE id = p_order_id;

    INSERT INTO public.audit_logs (
        user_id,
        action,
        model_name,
        model_id,
        new_values,
        created_at
    ) VALUES (
        p_collector_id,
        'COD_DOORSTEP_COLLECTION',
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'collection_id', v_collection_id,
            'expected', p_expected_amount,
            'collected', p_collected_amount,
            'status', p_collection_status,
            'reference', p_collection_reference
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'collection_id', v_collection_id,
        'collection_status', p_collection_status,
        'collected_amount', p_collected_amount,
        'is_paid', v_next_is_paid
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_cod_collection_atomic(UUID, NUMERIC, NUMERIC, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cod_collection_atomic(UUID, NUMERIC, NUMERIC, UUID, TEXT, TEXT, TEXT) TO postgres, service_role;

-- Unified Courier Remittance Reconciliation RPC (always records cod_remittances & updates orders atomically)
CREATE OR REPLACE FUNCTION public.reconcile_cod_remittance_atomic(
    p_remittance_ref TEXT,
    p_courier TEXT,
    p_order_id UUID,
    p_expected_amount NUMERIC(10,2),
    p_remitted_amount NUMERIC(10,2),
    p_admin_id UUID,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_ref TEXT := trim(COALESCE(p_remittance_ref, ''));
    v_order RECORD;
    v_expected NUMERIC(10,2);
    v_difference NUMERIC(10,2);
    v_status TEXT;
    v_remittance_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: reconcile_cod_remittance_atomic requires service-role credentials.';
    END IF;

    IF public.user_has_staff_permission(p_admin_id, 'orders.settle_cod') IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: orders.settle_cod permission required.';
    END IF;

    IF char_length(v_clean_ref) = 0 THEN
        RETURN jsonb_build_object('success', false, 'status', 'invalid', 'difference', 0, 'error', 'Remittance reference is required.');
    END IF;

    IF p_remitted_amount IS NULL OR p_remitted_amount < 0 THEN
        RETURN jsonb_build_object('success', false, 'status', 'invalid', 'difference', 0, 'error', 'Remitted amount must be non-negative.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.cod_remittances WHERE remittance_ref = v_clean_ref) THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'duplicate',
            'difference', 0,
            'error', 'Remittance reference ' || v_clean_ref || ' has already been recorded.'
        );
    END IF;

    IF p_order_id IS NOT NULL THEN
        SELECT * INTO v_order
        FROM public.orders
        WHERE id = p_order_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('success', false, 'status', 'unmatched', 'difference', 0, 'error', 'Order not found.');
        END IF;

        IF upper(COALESCE(v_order.payment_method, '')) <> 'COD' THEN
            RETURN jsonb_build_object('success', false, 'status', 'invalid', 'difference', 0, 'error', 'Only COD orders can be reconciled through COD remittance.');
        END IF;

        IF v_order.order_status <> 'Delivered' THEN
            RETURN jsonb_build_object('success', false, 'status', 'invalid', 'difference', 0, 'error', 'Cannot reconcile COD before verified delivery (current: ' || v_order.order_status || ').');
        END IF;

        IF v_order.cod_settlement_status = 'reconciled' THEN
            RETURN jsonb_build_object('success', false, 'status', 'duplicate', 'difference', 0, 'error', 'COD remittance has already been reconciled for this order.');
        END IF;

        v_expected := COALESCE(p_expected_amount, v_order.total_amount);
    ELSE
        v_expected := COALESCE(p_expected_amount, p_remitted_amount);
    END IF;

    v_difference := round((v_expected - p_remitted_amount), 2);
    IF p_order_id IS NULL THEN
        v_status := 'unmatched';
    ELSIF abs(v_difference) <= 0.01 THEN
        v_status := 'matched';
    ELSE
        v_status := 'disputed';
    END IF;

    INSERT INTO public.cod_remittances (
        remittance_ref,
        courier,
        order_id,
        expected_amount,
        remitted_amount,
        difference_amount,
        reconciliation_status,
        reconciled_by,
        reconciled_at,
        notes
    ) VALUES (
        v_clean_ref,
        COALESCE(NULLIF(trim(COALESCE(p_courier, '')), ''), 'Delhivery'),
        p_order_id,
        v_expected,
        p_remitted_amount,
        v_difference,
        v_status,
        p_admin_id,
        v_now,
        NULLIF(trim(COALESCE(p_notes, '')), '')
    ) RETURNING id INTO v_remittance_id;

    IF p_order_id IS NOT NULL THEN
        IF v_status = 'matched' THEN
            UPDATE public.orders
            SET
                cod_settlement_status = 'reconciled',
                cod_settlement_ref = v_clean_ref,
                cod_settled_amount = p_remitted_amount,
                cod_settled_at = v_now,
                cod_collection_status = CASE WHEN cod_collection_status = 'uncollected' THEN 'collected' ELSE cod_collection_status END,
                cod_collected_amount = COALESCE(cod_collected_amount, p_remitted_amount),
                cod_collected_at = COALESCE(cod_collected_at, v_now),
                payment_status = CASE WHEN payment_status IN ('Refund Pending', 'Partially Refunded', 'Refunded') THEN payment_status ELSE 'Paid' END,
                is_paid = TRUE,
                paid_at = COALESCE(paid_at, v_now),
                updated_at = v_now
            WHERE id = p_order_id;
        ELSIF v_status = 'disputed' THEN
            UPDATE public.orders
            SET
                cod_settlement_status = 'disputed',
                cod_settlement_ref = v_clean_ref,
                cod_settled_amount = p_remitted_amount,
                updated_at = v_now
            WHERE id = p_order_id;
        END IF;

        INSERT INTO public.audit_logs (
            user_id,
            action,
            model_name,
            model_id,
            new_values,
            created_at
        ) VALUES (
            p_admin_id,
            CASE WHEN v_status = 'matched' THEN 'COD_SETTLEMENT_RECONCILED' ELSE 'COD_SETTLEMENT_DISPUTE' END,
            'orders',
            p_order_id::text,
            jsonb_build_object(
                'remittance_id', v_remittance_id,
                'remittance_ref', v_clean_ref,
                'expected', v_expected,
                'remitted', p_remitted_amount,
                'difference', v_difference,
                'status', v_status
            ),
            v_now
        );
    END IF;

    RETURN jsonb_build_object(
        'success', v_status <> 'disputed',
        'remittance_id', v_remittance_id,
        'status', v_status,
        'difference', v_difference,
        'error', CASE WHEN v_status = 'disputed' THEN 'Amount mismatch: expected ₹' || v_expected || ', received ₹' || p_remitted_amount || '. Flagged as disputed.' ELSE NULL END
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.reconcile_cod_remittance_atomic(TEXT, TEXT, UUID, NUMERIC, NUMERIC, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_cod_remittance_atomic(TEXT, TEXT, UUID, NUMERIC, NUMERIC, UUID, TEXT) TO postgres, service_role;

-- Update payment report so only verified reconciled remittances count as settled COD
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

-- ------------------------------------------------------------------------------
-- 6. ATOMIC DELHIVERY WEBHOOK IDEMPOTENCY & EVENT ORDERING RPC
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_delhivery_webhook_atomic(
    p_event_id TEXT,
    p_event_type TEXT,
    p_waybill TEXT,
    p_raw_status TEXT,
    p_internal_status TEXT,
    p_event_timestamp TIMESTAMPTZ DEFAULT NULL,
    p_payload_hash TEXT DEFAULT NULL,
    p_payload JSONB DEFAULT '{}'::jsonb
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inserted_evt_id UUID;
    v_existing_evt RECORD;
    v_order RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_has_unverified_otp BOOLEAN := FALSE;
    v_current_rank INTEGER;
    v_incoming_rank INTEGER;
    v_shipment_id UUID;
    v_target_shipment_status TEXT;
    v_next_webhook_at TIMESTAMPTZ;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: apply_delhivery_webhook_atomic requires service-role credentials.';
    END IF;

    -- 1. Durable event deduplication inside transaction (conflict-free claim via RETURNING)
    INSERT INTO public.webhook_events (
        event_id,
        provider,
        event_type,
        status,
        payload,
        payload_hash,
        provider_event_timestamp,
        waybill,
        created_at,
        updated_at
    ) VALUES (
        p_event_id,
        'Delhivery',
        p_event_type,
        'processing',
        COALESCE(p_payload, '{}'::jsonb),
        p_payload_hash,
        p_event_timestamp,
        p_waybill,
        v_now,
        v_now
    )
    ON CONFLICT (event_id) DO NOTHING
    RETURNING id INTO v_inserted_evt_id;

    IF v_inserted_evt_id IS NULL THEN
        SELECT * INTO v_existing_evt
        FROM public.webhook_events
        WHERE event_id = p_event_id
        FOR UPDATE;

        IF v_existing_evt.status IN ('completed', 'ignored') THEN
            RETURN jsonb_build_object(
                'status', 'duplicate_ignored',
                'duplicate', true,
                'event_id', p_event_id,
                'order_id', v_existing_evt.order_id,
                'previous_outcome', v_existing_evt.processing_outcome
            );
        END IF;

        IF v_existing_evt.status = 'processing' AND v_existing_evt.updated_at > (v_now - INTERVAL '120 seconds') THEN
            RETURN jsonb_build_object(
                'status', 'in_flight_duplicate',
                'duplicate', true,
                'event_id', p_event_id
            );
        END IF;

        UPDATE public.webhook_events
        SET status = 'processing',
            payload = COALESCE(p_payload, payload),
            payload_hash = COALESCE(p_payload_hash, payload_hash),
            provider_event_timestamp = COALESCE(p_event_timestamp, provider_event_timestamp),
            updated_at = v_now
        WHERE event_id = p_event_id;
    END IF;

    -- 2. Locate and lock order by AWB
    SELECT * INTO v_order
    FROM public.orders
    WHERE shipping_awb = p_waybill
    FOR UPDATE;

    IF NOT FOUND THEN
        UPDATE public.webhook_events
        SET status = 'ignored', processing_outcome = 'order_not_found', updated_at = v_now
        WHERE event_id = p_event_id;

        RETURN jsonb_build_object('status', 'order_not_found', 'waybill', p_waybill, 'event_id', p_event_id);
    END IF;

    UPDATE public.webhook_events SET order_id = v_order.id WHERE event_id = p_event_id;

    IF v_order.shipping_booking_mode = 'manual' OR (v_order.shipping_courier IS NOT NULL AND lower(trim(v_order.shipping_courier)) <> 'delhivery') THEN
        UPDATE public.webhook_events
        SET status = 'ignored', processing_outcome = 'ignored_non_delhivery_order', updated_at = v_now
        WHERE event_id = p_event_id;

        RETURN jsonb_build_object(
            'status', 'ignored_non_delhivery_order',
            'order_id', v_order.id,
            'courier', v_order.shipping_courier,
            'event_id', p_event_id
        );
    END IF;

    -- 3. Timestamp regression check
    IF p_event_timestamp IS NOT NULL AND v_order.shipping_last_webhook_at IS NOT NULL AND p_event_timestamp < v_order.shipping_last_webhook_at THEN
        INSERT INTO public.shipment_events (
            order_id, event_type, source, previous_status, new_status, carrier_name, awb, note, metadata, created_at
        ) VALUES (
            v_order.id,
            'webhook_stale_ignored',
            'delhivery_webhook',
            v_order.order_status,
            p_internal_status,
            'Delhivery',
            p_waybill,
            'Ignored out-of-order Delhivery webhook predating latest processed event timestamp.',
            jsonb_build_object('event_id', p_event_id, 'event_timestamp', p_event_timestamp, 'last_webhook_at', v_order.shipping_last_webhook_at, 'raw_status', p_raw_status),
            v_now
        );

        UPDATE public.webhook_events
        SET status = 'ignored', processing_outcome = 'stale_timestamp_ignored', updated_at = v_now
        WHERE event_id = p_event_id;

        RETURN jsonb_build_object(
            'status', 'stale_event_ignored',
            'reason', 'Incoming webhook timestamp predates latest processed event.',
            'order_id', v_order.id,
            'current_status', v_order.order_status,
            'attempted_status', p_internal_status,
            'event_id', p_event_id
        );
    END IF;

    -- 4. Current/same status no-op
    IF v_order.order_status = p_internal_status THEN
        UPDATE public.webhook_events
        SET status = 'completed', processing_outcome = 'already_current', updated_at = v_now
        WHERE event_id = p_event_id;

        RETURN jsonb_build_object('status', 'already_current', 'order_id', v_order.id, 'status_value', p_internal_status, 'event_id', p_event_id);
    END IF;

    -- Rank map for stale lower-rank scan detection vs illegal transition
    v_current_rank := CASE v_order.order_status
        WHEN 'Confirmed' THEN 0
        WHEN 'Processing' THEN 0
        WHEN 'Packed' THEN 0
        WHEN 'Shipped' THEN 1
        WHEN 'Out for Delivery' THEN 2
        WHEN 'Delivered' THEN 3
        WHEN 'Returned' THEN 3
        ELSE -1
    END;

    v_incoming_rank := CASE p_internal_status
        WHEN 'Shipped' THEN 1
        WHEN 'Out for Delivery' THEN 2
        WHEN 'Delivered' THEN 3
        WHEN 'Returned' THEN 3
        ELSE -1
    END;

    -- Lower/equal rank courier regression on active/delivered shipment -> treat as stale ignored
    IF v_order.order_status NOT IN ('Cancelled', 'Pending') AND NOT v_order.order_status LIKE 'Replacement%' THEN
        IF (v_current_rank >= 1 AND v_incoming_rank <= v_current_rank) THEN
            INSERT INTO public.shipment_events (
                order_id, event_type, source, previous_status, new_status, carrier_name, awb, note, metadata, created_at
            ) VALUES (
                v_order.id,
                'webhook_stale_ignored',
                'delhivery_webhook',
                v_order.order_status,
                p_internal_status,
                'Delhivery',
                p_waybill,
                'Ignored stale lower-rank courier event (' || p_internal_status || ') because order is already "' || v_order.order_status || '".',
                jsonb_build_object('event_id', p_event_id, 'raw_status', p_raw_status, 'event_timestamp', p_event_timestamp),
                v_now
            );

            UPDATE public.webhook_events
            SET status = 'ignored', processing_outcome = 'stale_rank_ignored', updated_at = v_now
            WHERE event_id = p_event_id;

            RETURN jsonb_build_object(
                'status', 'stale_event_ignored',
                'reason', 'Order already at equal or newer delivery milestone.',
                'order_id', v_order.id,
                'current_status', v_order.order_status,
                'attempted_status', p_internal_status,
                'event_id', p_event_id
            );
        END IF;
    END IF;

    -- Check permitted forward transitions (rejects Cancelled/Pending/Replacement regressions cleanly)
    IF NOT (
        (v_order.order_status IN ('Confirmed', 'Processing', 'Packed') AND p_internal_status IN ('Shipped', 'Returned'))
        OR (v_order.order_status = 'Shipped' AND p_internal_status IN ('Out for Delivery', 'Delivered', 'Returned'))
        OR (v_order.order_status = 'Out for Delivery' AND p_internal_status IN ('Delivered', 'Returned'))
    ) THEN
        INSERT INTO public.shipment_events (
            order_id, event_type, source, previous_status, new_status, carrier_name, awb, note, metadata, created_at
        ) VALUES (
            v_order.id,
            'webhook_rejected_illegal',
            'delhivery_webhook',
            v_order.order_status,
            p_internal_status,
            'Delhivery',
            p_waybill,
            'Rejected illegal courier transition from "' || v_order.order_status || '" to "' || p_internal_status || '".',
            jsonb_build_object('event_id', p_event_id, 'raw_status', p_raw_status),
            v_now
        );

        UPDATE public.webhook_events
        SET status = 'ignored', processing_outcome = 'rejected_illegal_transition', updated_at = v_now
        WHERE event_id = p_event_id;

        RETURN jsonb_build_object(
            'status', 'rejected_illegal_transition',
            'order_id', v_order.id,
            'current_status', v_order.order_status,
            'attempted_status', p_internal_status,
            'event_id', p_event_id
        );
    END IF;

    -- 5. Enforce D-2 OTP gate for Delivered
    IF p_internal_status = 'Delivered' THEN
        SELECT (
            COUNT(*) > 0
            AND COUNT(*) FILTER (WHERE status = 'verified' OR verified_at IS NOT NULL) = 0
        ) INTO v_has_unverified_otp
        FROM public.delivery_otps
        WHERE order_id = v_order.id;

        IF v_has_unverified_otp THEN
            v_next_webhook_at := CASE
                WHEN p_event_timestamp IS NOT NULL THEN GREATEST(COALESCE(v_order.shipping_last_webhook_at, p_event_timestamp), p_event_timestamp)
                ELSE v_order.shipping_last_webhook_at
            END;

            UPDATE public.orders
            SET
                shipping_delivered_at = COALESCE(shipping_delivered_at, v_now),
                shipping_last_webhook_at = v_next_webhook_at,
                shipping_last_webhook_status = p_raw_status,
                updated_at = v_now
            WHERE id = v_order.id;

            INSERT INTO public.shipment_events (
                order_id, event_type, source, previous_status, new_status, carrier_name, awb, note, metadata, created_at
            ) VALUES (
                v_order.id,
                'webhook_received',
                'delhivery_webhook',
                v_order.order_status,
                v_order.order_status,
                'Delhivery',
                p_waybill,
                'Delhivery reported Delivered; awaiting merchant doorstep OTP verification.',
                COALESCE(p_payload, '{}'::jsonb),
                v_now
            );

            UPDATE public.webhook_events
            SET status = 'completed', processing_outcome = 'otp_verification_required', updated_at = v_now
            WHERE event_id = p_event_id;

            RETURN jsonb_build_object(
                'status', 'otp_verification_required',
                'order_id', v_order.id,
                'current_status', v_order.order_status,
                'event_id', p_event_id
            );
        END IF;
    END IF;

    -- 6. Apply validated order status update atomically
    PERFORM set_config('app.transition_source', 'delhivery_webhook', true);
    PERFORM set_config('app.transition_note', 'Delhivery webhook updated status to ' || p_internal_status || ' (' || p_raw_status || ')', true);

    v_next_webhook_at := CASE
        WHEN p_event_timestamp IS NOT NULL THEN GREATEST(COALESCE(v_order.shipping_last_webhook_at, p_event_timestamp), p_event_timestamp)
        ELSE v_order.shipping_last_webhook_at
    END;

    UPDATE public.orders
    SET
        order_status = p_internal_status,
        delivered_at = CASE WHEN p_internal_status = 'Delivered' THEN COALESCE(delivered_at, v_now) ELSE delivered_at END,
        shipping_delivered_at = CASE WHEN p_internal_status = 'Delivered' THEN COALESCE(shipping_delivered_at, v_now) ELSE shipping_delivered_at END,
        cod_settlement_status = CASE
            WHEN p_internal_status = 'Delivered' AND upper(payment_method) = 'COD' AND payment_status <> 'Paid' THEN 'pending'
            WHEN p_internal_status = 'Returned' AND upper(payment_method) = 'COD' AND NOT is_paid AND cod_collection_status IN ('uncollected', 'refused') THEN 'unsettled'
            ELSE cod_settlement_status
        END,
        refund_status = CASE
            WHEN p_internal_status = 'Returned' AND upper(payment_method) = 'COD' AND NOT is_paid AND cod_collection_status IN ('uncollected', 'refused') THEN 'not_required'
            ELSE refund_status
        END,
        shipping_last_webhook_at = v_next_webhook_at,
        shipping_last_webhook_status = p_raw_status,
        updated_at = v_now
    WHERE id = v_order.id;

    v_target_shipment_status := CASE p_internal_status
        WHEN 'Out for Delivery' THEN 'out_for_delivery'
        WHEN 'Delivered' THEN 'delivered'
        WHEN 'Returned' THEN 'returned'
        ELSE 'in_transit'
    END;

    UPDATE public.shipments
    SET
        status = v_target_shipment_status,
        delivered_at = CASE WHEN p_internal_status = 'Delivered' THEN COALESCE(delivered_at, v_now) ELSE delivered_at END,
        last_webhook_event_id = p_event_id,
        last_webhook_event_at = COALESCE(p_event_timestamp, last_webhook_event_at),
        updated_at = v_now
    WHERE order_id = v_order.id
      AND status NOT IN ('cancelled', 'failed')
    RETURNING id INTO v_shipment_id;

    INSERT INTO public.shipment_events (
        shipment_id,
        order_id,
        event_type,
        source,
        previous_status,
        new_status,
        carrier_name,
        awb,
        note,
        metadata,
        created_at
    ) VALUES (
        v_shipment_id,
        v_order.id,
        'webhook_received',
        'delhivery_webhook',
        v_order.order_status,
        p_internal_status,
        'Delhivery',
        p_waybill,
        'Delhivery webhook updated status from ' || v_order.order_status || ' to ' || p_internal_status || ' (' || p_raw_status || ')',
        COALESCE(p_payload, '{}'::jsonb) || jsonb_build_object('event_id', p_event_id, 'event_timestamp', p_event_timestamp),
        v_now
    );

    UPDATE public.webhook_events
    SET status = 'completed', processing_outcome = 'applied', updated_at = v_now
    WHERE event_id = p_event_id;

    RETURN jsonb_build_object(
        'status', 'updated',
        'order_id', v_order.id,
        'new_status', p_internal_status,
        'event_id', p_event_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.apply_delhivery_webhook_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_delhivery_webhook_atomic(TEXT, TEXT, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB) TO postgres, service_role;
