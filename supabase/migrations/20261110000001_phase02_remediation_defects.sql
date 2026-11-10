-- ==============================================================================
-- PHASE 02 REMEDIATION ITERATION: SECURITY, INTEGRITY & GST STABILIZATION
-- Forward-only migration addressing D-3, D-4, D-6, D-7, D-8
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- D-7: PRESERVE DELIVERY VERIFICATION AUDIT HISTORY
-- Change foreign key on delivery_verifications from ON DELETE CASCADE to ON DELETE RESTRICT
-- ------------------------------------------------------------------------------
ALTER TABLE public.delivery_verifications
    DROP CONSTRAINT IF EXISTS delivery_verifications_order_id_fkey;

ALTER TABLE public.delivery_verifications
    ADD CONSTRAINT delivery_verifications_order_id_fkey
    FOREIGN KEY (order_id) REFERENCES public.orders(id)
    ON DELETE RESTRICT;

-- ------------------------------------------------------------------------------
-- D-6: PROTECT INVOICE IMMUTABILITY
-- Prevent unauthorized UPDATE and DELETE operations on public.invoices
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_invoice_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP TRIGGER IF EXISTS trg_protect_invoice_immutability ON public.invoices;
CREATE TRIGGER trg_protect_invoice_immutability
BEFORE UPDATE OR DELETE ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.protect_invoice_immutability();

-- Drop default placeholder GSTIN on invoices
ALTER TABLE public.invoices ALTER COLUMN seller_gstin DROP DEFAULT;

-- ------------------------------------------------------------------------------
-- D-4: REFUND IDEMPOTENCY PARTIAL UNIQUE INDEX
-- Prevent multiple active or processed refund records for the same return request
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_records_return_active
ON public.refund_records(return_request_id)
WHERE status IN ('pending', 'processed');

-- ------------------------------------------------------------------------------
-- D-3 & D-4: SECURE & IDEMPOTENT initiate_return_refund_atomic
-- Enforce admin authorization, prevent arbitrary caller admin identity,
-- and handle idempotent retries
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
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_total_refunded NUMERIC(10,2);
    v_pending_refunds NUMERIC(10,2);
    v_refundable_balance NUMERIC(10,2);
    v_record_id UUID;
    v_existing RECORD;
    v_caller_role TEXT;
    v_caller_uid UUID;
BEGIN
    -- 1. Authorization check
    v_caller_role := COALESCE(auth.role(), '');
    v_caller_uid := auth.uid();

    -- Allow service_role (used by server actions / admin client)
    IF v_caller_role <> 'service_role' THEN
        -- If not service_role, must be authenticated administrator
        IF NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Administrator privileges required to initiate refunds';
        END IF;

        -- Prevent spoofing admin ID if authenticated caller ID exists
        IF v_caller_uid IS NOT NULL AND v_caller_uid <> p_admin_id THEN
            RAISE EXCEPTION 'Forbidden: Admin identity mismatch with authenticated caller context';
        END IF;
    ELSE
        -- Under service_role execution, ensure p_admin_id represents an active administrator in profiles
        IF NOT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = p_admin_id
              AND role IN ('super_admin', 'admin')
              AND is_blocked = FALSE
              AND is_deleted = FALSE
        ) THEN
            RAISE EXCEPTION 'Unauthorized: Caller must specify a valid, active administrator identity';
        END IF;
    END IF;

    -- Validate amount
    IF p_amount IS NULL OR p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Refund amount must be positive');
    END IF;

    -- 2. Lock and validate order
    SELECT id, total_amount, payment_status, payment_method INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Strict over-refund defense: refund amount cannot exceed order total amount
    IF p_amount > v_order.total_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Refund amount ₹' || p_amount || ' exceeds order total ₹' || v_order.total_amount
        );
    END IF;

    -- 3. Idempotency check: if refund already initiated or processed for this return request
    IF p_return_id IS NOT NULL THEN
        SELECT id, amount, status INTO v_existing
        FROM public.refund_records
        WHERE return_request_id = p_return_id AND status IN ('pending', 'processed');

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

    -- Sum existing processed refunds
    SELECT COALESCE(SUM(amount), 0) INTO v_total_refunded
    FROM public.refund_records
    WHERE order_id = p_order_id AND status = 'processed';

    -- Sum pending refund reservations
    SELECT COALESCE(SUM(amount), 0) INTO v_pending_refunds
    FROM public.refund_records
    WHERE order_id = p_order_id AND status = 'pending';

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
        authorized_by
    ) VALUES (
        p_order_id,
        p_return_id,
        p_amount,
        'pending',
        p_reason,
        p_admin_id
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

-- Revoke execute from public/anon/authenticated and grant strictly to service_role and postgres
REVOKE EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.initiate_return_refund_atomic(UUID, UUID, NUMERIC, TEXT, UUID) TO postgres;

-- ------------------------------------------------------------------------------
-- D-8: SECURE generate_order_invoice_atomic
-- Require valid non-placeholder seller GSTIN and validate state codes
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.generate_order_invoice_atomic(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.generate_order_invoice_atomic(
    p_order_id UUID,
    p_seller_gstin TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_existing RECORD;
    v_invoice_num TEXT;
    v_items JSONB;
    v_subtotal NUMERIC(10,2);
    v_discount NUMERIC(10,2);
    v_shipping NUMERIC(10,2);
    v_taxable NUMERIC(10,2);
    v_seller_state TEXT;
    v_dest_state TEXT;
    v_customer_state TEXT;
    v_customer_pin TEXT;
    v_is_interstate BOOLEAN;
    v_cgst_rate NUMERIC(5,2) := 0;
    v_cgst_amt NUMERIC(10,2) := 0;
    v_sgst_rate NUMERIC(5,2) := 0;
    v_sgst_amt NUMERIC(10,2) := 0;
    v_igst_rate NUMERIC(5,2) := 0;
    v_igst_amt NUMERIC(10,2) := 0;
    v_invoice_id UUID;
BEGIN
    -- Authorization check: must be service_role or admin
    IF COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to generate statutory invoices';
    END IF;

    -- Validate seller GSTIN: must not be null, empty, or placeholder '07AAAAA0000A1Z5', and must be 15 chars
    IF p_seller_gstin IS NULL OR trim(p_seller_gstin) = '' OR trim(p_seller_gstin) = '07AAAAA0000A1Z5' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Mandatory seller GST configuration is unconfigured or using placeholder value.');
    END IF;

    IF length(trim(p_seller_gstin)) <> 15 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid seller GSTIN: must be exactly 15 characters.');
    END IF;

    -- Extract 2-digit state code from first 2 digits of seller GSTIN
    v_seller_state := substring(trim(p_seller_gstin) from 1 for 2);

    -- Check if already generated (Idempotency)
    SELECT * INTO v_existing FROM public.invoices WHERE order_id = p_order_id;
    IF FOUND THEN
        RETURN jsonb_build_object('success', true, 'invoice_id', v_existing.id, 'invoice_number', v_existing.invoice_number, 'already_existed', true);
    END IF;

    -- Lock order
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Sequence number: INV-YYYYMM-XXXXX
    v_invoice_num := 'INV-' || to_char(NOW(), 'YYYYMM') || '-' || lpad(nextval('public.invoice_number_seq')::TEXT, 5, '0');

    -- Aggregate line items snapshot
    SELECT jsonb_agg(jsonb_build_object(
        'book_id', oi.book_id,
        'title', oi.title,
        'quantity', oi.quantity,
        'unit_price', oi.price,
        'total_price', round((oi.price * oi.quantity), 2)
    )) INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id;

    v_subtotal := COALESCE(v_order.subtotal, v_order.total_amount);
    v_discount := COALESCE(v_order.discount_amount, 0);
    v_shipping := COALESCE(v_order.delivery_fee, 0);
    v_taxable := GREATEST(0, v_subtotal - v_discount);

    -- Normalize destination state
    v_customer_state := lower(trim(COALESCE(v_order.address_snapshot->>'state', '')));
    v_customer_pin := trim(COALESCE(v_order.address_snapshot->>'pincode', ''));

    IF v_customer_state IN ('delhi', 'dl', 'new delhi', 'nct of delhi', '07') OR v_customer_pin ~ '^11\d{4}$' THEN
        v_dest_state := '07';
    ELSIF v_customer_state IN ('uttar pradesh', 'up', '09') OR v_customer_pin ~ '^(20|24|28)\d{4}$' THEN
        v_dest_state := '09';
    ELSIF v_customer_state IN ('haryana', 'hr', '06') OR v_customer_pin ~ '^1[23]\d{4}$' THEN
        v_dest_state := '06';
    ELSIF v_customer_state IN ('maharashtra', 'mh', '27') OR v_customer_pin ~ '^4[0-4]\d{4}$' THEN
        v_dest_state := '27';
    ELSIF v_customer_state IN ('bihar', 'br', '10') OR v_customer_pin ~ '^8[0-5]\d{4}$' THEN
        v_dest_state := '10';
    ELSIF v_customer_state IN ('west bengal', 'wb', '19') OR v_customer_pin ~ '^7[0-4]\d{4}$' THEN
        v_dest_state := '19';
    ELSE
        v_dest_state := COALESCE(v_order.address_snapshot->>'state_code', '99');
    END IF;

    -- Interstate is true when seller state differs from destination state
    v_is_interstate := (v_seller_state <> v_dest_state);

    -- Shipping fee tax calculation (18% tax-inclusive reverse calculation)
    IF v_shipping > 0 THEN
        IF v_is_interstate THEN
            v_igst_rate := 18.00;
            v_igst_amt := round((v_shipping * 18.00 / 118.00), 2);
        ELSE
            v_cgst_rate := 9.00;
            v_cgst_amt := round((v_shipping * 9.00 / 118.00), 2);
            v_sgst_rate := 9.00;
            v_sgst_amt := round((v_shipping * 9.00 / 118.00), 2);
        END IF;
    END IF;

    INSERT INTO public.invoices (
        order_id,
        invoice_number,
        invoice_date,
        customer_id,
        billing_name,
        billing_address,
        shipping_address,
        items_snapshot,
        subtotal,
        discount_amount,
        taxable_value,
        cgst_rate,
        cgst_amount,
        sgst_rate,
        sgst_amount,
        igst_rate,
        igst_amount,
        shipping_charges,
        grand_total,
        payment_method,
        payment_status,
        payment_reference,
        seller_gstin
    ) VALUES (
        v_order.id,
        v_invoice_num,
        NOW(),
        v_order.user_id,
        COALESCE(v_order.address_snapshot->>'full_name', 'Customer'),
        v_order.address_snapshot,
        v_order.address_snapshot,
        COALESCE(v_items, '[]'::jsonb),
        v_subtotal,
        v_discount,
        v_taxable,
        v_cgst_rate,
        v_cgst_amt,
        v_sgst_rate,
        v_sgst_amt,
        v_igst_rate,
        v_igst_amt,
        v_shipping,
        v_order.total_amount,
        v_order.payment_method,
        v_order.payment_status,
        v_order.razorpay_payment_id,
        trim(p_seller_gstin)
    )
    RETURNING id INTO v_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'grand_total', v_order.total_amount
    );
END;
$$;

-- Restrict execute on generate_order_invoice_atomic exclusively to service_role and postgres
REVOKE EXECUTE ON FUNCTION public.generate_order_invoice_atomic(UUID, TEXT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_order_invoice_atomic(UUID, TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_order_invoice_atomic(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_invoice_atomic(UUID, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.generate_order_invoice_atomic(UUID, TEXT) TO postgres;
