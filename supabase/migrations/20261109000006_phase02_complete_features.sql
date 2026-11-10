-- ==============================================================================
-- PHASE 2 — COMPLETE MISSING FEATURES DATABASE MIGRATION
-- MD Shakib Islamic Books Modernization Project
-- Migration: 20261109000006_phase02_complete_features.sql
-- ==============================================================================

-- 1. EXTEND BOOKS TABLE WITH PHYSICAL & IDENTIFIER ATTRIBUTES (2.28, 2.29)
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS isbn_10 VARCHAR(10) UNIQUE;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS isbn_13 VARCHAR(13) UNIQUE;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS sku VARCHAR(64) UNIQUE;
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS weight_grams INTEGER CHECK (weight_grams IS NULL OR weight_grams > 0);
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS length_cm NUMERIC(6,2) CHECK (length_cm IS NULL OR length_cm > 0);
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS width_cm NUMERIC(6,2) CHECK (width_cm IS NULL OR width_cm > 0);
ALTER TABLE public.books ADD COLUMN IF NOT EXISTS height_cm NUMERIC(6,2) CHECK (height_cm IS NULL OR height_cm > 0);

CREATE INDEX IF NOT EXISTS idx_books_sku ON public.books(sku);
CREATE INDEX IF NOT EXISTS idx_books_isbn13 ON public.books(isbn_13);

-- 2. PRODUCT VARIANTS (2.32)
CREATE TABLE IF NOT EXISTS public.book_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    sku VARCHAR(64) NOT NULL UNIQUE,
    variant_type TEXT NOT NULL CHECK (variant_type IN ('format', 'language', 'edition')),
    variant_value TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_book_variant_type_val UNIQUE (book_id, variant_type, variant_value)
);

CREATE INDEX IF NOT EXISTS idx_book_variants_book_id ON public.book_variants(book_id);

-- 3. UNIFIED APPEND-ONLY INVENTORY HISTORY (2.33)
CREATE TABLE IF NOT EXISTS public.inventory_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    variant_id UUID REFERENCES public.book_variants(id) ON DELETE SET NULL,
    movement_type TEXT NOT NULL CHECK (movement_type IN ('PURCHASE', 'SALE', 'RESERVATION', 'RELEASE', 'FULFILLMENT', 'CANCELLATION', 'RETURN', 'REPLACEMENT', 'MANUAL_ADJUSTMENT', 'ADJUSTMENT', 'DAMAGE')),
    quantity_change INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
    new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
    related_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    related_return_id UUID,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_history_book_id ON public.inventory_history(book_id);
CREATE INDEX IF NOT EXISTS idx_inventory_history_created_at ON public.inventory_history(created_at DESC);

-- 4. DELIVERY OTP SYSTEM (2.1, 2.2, 2.3)
CREATE TABLE IF NOT EXISTS public.delivery_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    otp_hash TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'verified', 'expired', 'invalidated')) DEFAULT 'active',
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    verified_at TIMESTAMPTZ,
    verified_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_otps_order_id ON public.delivery_otps(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_delivery_otps_active_order ON public.delivery_otps(order_id) WHERE status = 'active';

-- 5. DELIVERY VERIFICATION AUDIT TRAIL (2.7)
CREATE TABLE IF NOT EXISTS public.delivery_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    delivery_otp_id UUID REFERENCES public.delivery_otps(id) ON DELETE SET NULL,
    actor_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    actor_role TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('SUCCESS', 'FAILED_INVALID_OTP', 'FAILED_EXPIRED', 'FAILED_MAX_ATTEMPTS', 'FAILED_WRONG_STATE', 'FAILED_UNAUTHORIZED')),
    failure_reason TEXT,
    shipment_awb TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_delivery_verifications_order ON public.delivery_verifications(order_id);
CREATE INDEX IF NOT EXISTS idx_delivery_verifications_actor ON public.delivery_verifications(actor_id);

-- 6. COD COLLECTIONS (2.8)
CREATE TABLE IF NOT EXISTS public.cod_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    expected_amount NUMERIC(10,2) NOT NULL CHECK (expected_amount >= 0),
    collected_amount NUMERIC(10,2) NOT NULL CHECK (collected_amount >= 0),
    collector_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    collection_status TEXT NOT NULL CHECK (collection_status IN ('collected', 'shortfall', 'excess', 'refused')),
    collection_reference TEXT,
    notes TEXT,
    collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cod_collections_order ON public.cod_collections(order_id);

-- 7. COD REMITTANCES (2.9)
CREATE TABLE IF NOT EXISTS public.cod_remittances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    remittance_ref TEXT NOT NULL UNIQUE,
    courier TEXT NOT NULL DEFAULT 'Delhivery',
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    expected_amount NUMERIC(10,2) NOT NULL CHECK (expected_amount >= 0),
    remitted_amount NUMERIC(10,2) NOT NULL CHECK (remitted_amount >= 0),
    difference_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
    reconciliation_status TEXT NOT NULL CHECK (reconciliation_status IN ('matched', 'disputed', 'unmatched', 'duplicate')) DEFAULT 'matched',
    remitted_at DATE NOT NULL DEFAULT CURRENT_DATE,
    reconciled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reconciled_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cod_remittances_order ON public.cod_remittances(order_id);

-- 8. COMMERCIAL INVOICES & SEQUENCING (2.10, 2.11)
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT UNIQUE,
    invoice_number TEXT NOT NULL UNIQUE,
    invoice_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    customer_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    billing_name TEXT NOT NULL,
    billing_address JSONB NOT NULL,
    shipping_address JSONB NOT NULL,
    items_snapshot JSONB NOT NULL,
    subtotal NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    discount_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    taxable_value NUMERIC(10,2) NOT NULL CHECK (taxable_value >= 0),
    cgst_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (cgst_rate >= 0),
    cgst_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (cgst_amount >= 0),
    sgst_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (sgst_rate >= 0),
    sgst_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (sgst_amount >= 0),
    igst_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (igst_rate >= 0),
    igst_amount NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (igst_amount >= 0),
    shipping_charges NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (shipping_charges >= 0),
    grand_total NUMERIC(10,2) NOT NULL CHECK (grand_total >= 0),
    payment_method TEXT NOT NULL,
    payment_status TEXT NOT NULL,
    payment_reference TEXT,
    seller_gstin TEXT NOT NULL DEFAULT '07AAAAA0000A1Z5',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_invoices_order_id ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_number ON public.invoices(invoice_number);

-- 9. RETURNS, REPLACEMENTS & REFUNDS (2.15 - 2.21)
CREATE SEQUENCE IF NOT EXISTS public.return_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.return_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_number TEXT NOT NULL UNIQUE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    request_type TEXT NOT NULL CHECK (request_type IN ('return_refund', 'replacement')) DEFAULT 'return_refund',
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
    description TEXT,
    status TEXT NOT NULL CHECK (status IN ('submitted', 'under_review', 'info_requested', 'approved', 'rejected', 'pickup_scheduled', 'pickup_completed', 'received', 'completed', 'cancelled')) DEFAULT 'submitted',
    rejection_reason TEXT,
    admin_notes TEXT,
    evidence_urls TEXT[] NOT NULL DEFAULT '{}',
    pickup_awb TEXT,
    pickup_status TEXT,
    pickup_address JSONB,
    refund_amount NUMERIC(10,2) DEFAULT 0 CHECK (refund_amount >= 0),
    replacement_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    resolved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_requests_order ON public.return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_customer ON public.return_requests(customer_id);

CREATE TABLE IF NOT EXISTS public.return_request_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    return_request_id UUID NOT NULL REFERENCES public.return_requests(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE RESTRICT,
    variant_id UUID REFERENCES public.book_variants(id) ON DELETE SET NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_return_request_items_req ON public.return_request_items(return_request_id);

CREATE TABLE IF NOT EXISTS public.refund_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
    return_request_id UUID REFERENCES public.return_requests(id) ON DELETE SET NULL,
    gateway_refund_id TEXT UNIQUE,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    status TEXT NOT NULL CHECK (status IN ('pending', 'processed', 'failed')) DEFAULT 'pending',
    gateway_status TEXT,
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
    authorized_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_records_order ON public.refund_records(order_id);

-- 10. WISHLIST (2.22)
CREATE TABLE IF NOT EXISTS public.wishlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_wishlists_user_book UNIQUE (user_id, book_id)
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user ON public.wishlists(user_id);

-- 11. CUSTOMER SUPPORT TICKETS & MESSAGES (2.24, 2.27)
CREATE SEQUENCE IF NOT EXISTS public.ticket_number_seq START 1001;

CREATE TABLE IF NOT EXISTS public.support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT NOT NULL UNIQUE,
    customer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
    category TEXT NOT NULL CHECK (category IN ('order', 'payment', 'delivery', 'return', 'product', 'general')),
    subject TEXT NOT NULL CHECK (char_length(trim(subject)) > 0),
    description TEXT NOT NULL CHECK (char_length(trim(description)) > 0),
    priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
    status TEXT NOT NULL CHECK (status IN ('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')) DEFAULT 'open',
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_customer ON public.support_tickets(customer_id);
CREATE INDEX IF NOT EXISTS idx_support_tickets_order ON public.support_tickets(order_id);

CREATE TABLE IF NOT EXISTS public.ticket_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.support_tickets(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    is_staff BOOLEAN NOT NULL DEFAULT FALSE,
    message TEXT NOT NULL CHECK (char_length(trim(message)) > 0),
    attachments TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ticket_messages_ticket ON public.ticket_messages(ticket_id);

-- 12. PHONE VERIFICATION (2.26)
CREATE TABLE IF NOT EXISTS public.phone_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    phone TEXT NOT NULL CHECK (char_length(trim(phone)) >= 10),
    otp_hash TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 5,
    expires_at TIMESTAMPTZ NOT NULL,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_phone_verifications_user ON public.phone_verifications(user_id);

-- ==============================================================================
-- ATOMIC STORED PROCEDURES (SECURITY DEFINER)
-- ==============================================================================

-- A. VERIFY DELIVERY OTP ATOMIC (2.6, 2.7)
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
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_otp RECORD;
    v_now TIMESTAMPTZ := NOW();
BEGIN
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

    -- Insert immutable audit record
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

-- B. REGENERATE DELIVERY OTP ATOMIC (2.3)
CREATE OR REPLACE FUNCTION public.regenerate_delivery_otp_atomic(
    p_order_id UUID,
    p_new_hash TEXT,
    p_expires_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_new_id UUID;
BEGIN
    SELECT id, order_status INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Invalidate any prior active OTPs
    UPDATE public.delivery_otps
    SET status = 'invalidated', updated_at = NOW()
    WHERE order_id = p_order_id AND status = 'active';

    -- Insert new active OTP
    INSERT INTO public.delivery_otps (order_id, otp_hash, status, attempts, max_attempts, expires_at)
    VALUES (p_order_id, p_new_hash, 'active', 0, 5, p_expires_at)
    RETURNING id INTO v_new_id;

    RETURN jsonb_build_object('success', true, 'otp_id', v_new_id, 'expires_at', p_expires_at);
END;
$$;

-- C. GENERATE ORDER INVOICE ATOMIC (2.10, 2.11)
CREATE OR REPLACE FUNCTION public.generate_order_invoice_atomic(
    p_order_id UUID,
    p_seller_gstin TEXT DEFAULT '07AAAAA0000A1Z5'
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
    v_state_code TEXT;
    v_is_interstate BOOLEAN;
    v_cgst_rate NUMERIC(5,2) := 0;
    v_cgst_amt NUMERIC(10,2) := 0;
    v_sgst_rate NUMERIC(5,2) := 0;
    v_sgst_amt NUMERIC(10,2) := 0;
    v_igst_rate NUMERIC(5,2) := 0;
    v_igst_amt NUMERIC(10,2) := 0;
    v_invoice_id UUID;
BEGIN
    -- Check if already generated
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

    -- State check: seller state Delhi ('07' or 'Delhi')
    v_state_code := COALESCE((v_order.address_snapshot->>'state'), '');
    v_is_interstate := NOT (lower(v_state_code) IN ('delhi', 'dl', 'new delhi', '07'));

    -- Books GST in India is predominantly exempt (0%), while logistics/shipping has 18% GST
    -- If interstate shipping: IGST 18% on shipping fee; If intra-state: CGST 9% + SGST 9% on shipping fee.
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
        p_seller_gstin
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

-- D. INITIATE RETURN REFUND ATOMIC (2.19, 2.21)
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
BEGIN
    SELECT id, total_amount, payment_status, payment_method INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
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
        'reserved_amount', p_amount,
        'remaining_balance', v_refundable_balance - p_amount
    );
END;
$$;

-- E. RECORD INVENTORY MOVEMENT ATOMIC (2.33)
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
SET search_path = public
AS $$
DECLARE
    v_curr_stock INTEGER;
    v_new_stock INTEGER;
    v_history_id UUID;
BEGIN
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

-- E2. RESERVE REPLACEMENT INVENTORY ATOMIC (2.20)
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
SET search_path = public
AS $$
BEGIN
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

-- F. ANONYMIZE CUSTOMER ACCOUNT (2.25)
CREATE OR REPLACE FUNCTION public.anonymize_customer_account(
    p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_anon_id TEXT := substr(md5(p_user_id::text || clock_timestamp()::text), 1, 8);
BEGIN
    -- 1. Anonymize user profile
    UPDATE public.profiles
    SET name = 'Deleted User ' || v_anon_id,
        email = 'deleted_' || v_anon_id || '@anonymized.local',
        phone = NULL,
        is_deleted = TRUE,
        deleted_at = NOW(),
        updated_at = NOW()
    WHERE id = p_user_id;

    -- 2. Clear saved addresses
    DELETE FROM public.addresses WHERE user_id = p_user_id;

    -- 3. Clear wishlists
    DELETE FROM public.wishlists WHERE user_id = p_user_id;

    -- 4. Anonymize pending phone verifications
    DELETE FROM public.phone_verifications WHERE user_id = p_user_id;

    -- 5. Record audit event
    INSERT INTO public.audit_logs (user_id, action, model_name, model_id, new_values)
    VALUES (p_user_id, 'ACCOUNT_DELETION_ANONYMIZED', 'profiles', p_user_id, jsonb_build_object('anonymized_tag', v_anon_id, 'anonymized_at', NOW()));

    RETURN jsonb_build_object('success', true, 'anonymized_user_id', p_user_id);
END;
$$;

-- G. REPORTING AGGREGATION RPCS (2.36, 2.37, 2.38)
CREATE OR REPLACE FUNCTION public.get_sales_report(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
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

CREATE OR REPLACE FUNCTION public.get_payment_report(
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT jsonb_build_object(
        'prepaid_count', COUNT(*) FILTER (WHERE payment_method <> 'COD'),
        'prepaid_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_method <> 'COD'), 0),
        'cod_count', COUNT(*) FILTER (WHERE payment_method = 'COD'),
        'cod_amount', COALESCE(SUM(total_amount) FILTER (WHERE payment_method = 'COD'), 0),
        'cod_collected_count', COUNT(*) FILTER (WHERE payment_method = 'COD' AND (cod_settlement_status = 'reconciled' OR payment_status = 'Paid')),
        'cod_collected_amount', COALESCE(SUM(cod_settled_amount) FILTER (WHERE payment_method = 'COD'), 0),
        'cod_pending_count', COUNT(*) FILTER (WHERE payment_method = 'COD' AND (cod_settlement_status IS NULL OR cod_settlement_status = 'pending')),
        'refunded_amount', COALESCE((SELECT SUM(amount) FROM public.refund_records WHERE status = 'processed' AND created_at >= p_start_date AND created_at <= p_end_date), 0)
    ) INTO v_result
    FROM public.orders
    WHERE created_at >= p_start_date AND created_at <= p_end_date;

    RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_inventory_report()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_total_stock BIGINT;
    v_reserved_stock BIGINT;
    v_low_stock_count BIGINT;
    v_out_of_stock_count BIGINT;
BEGIN
    SELECT COALESCE(SUM(stock), 0) INTO v_total_stock FROM public.books;
    SELECT COALESCE(SUM(quantity), 0) INTO v_reserved_stock FROM public.inventory_reservations WHERE status = 'active' AND expires_at > NOW();
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

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.book_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cod_remittances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.return_request_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refund_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_verifications ENABLE ROW LEVEL SECURITY;

-- book_variants: Anyone can read active variants, admin can manage
CREATE POLICY "variants_read_public" ON public.book_variants FOR SELECT USING (true);
CREATE POLICY "variants_admin_all" ON public.book_variants FOR ALL USING (public.is_admin());

-- inventory_history: Staff/Admin read-only
CREATE POLICY "inventory_history_staff_read" ON public.inventory_history FOR SELECT USING (public.is_admin());

-- delivery_otps: Order owner can view OTP when Out for Delivery; Admin can view all
CREATE POLICY "delivery_otps_owner_read" ON public.delivery_otps FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = delivery_otps.order_id
        AND o.user_id = auth.uid()
        AND o.order_status = 'Out for Delivery'
    )
);
CREATE POLICY "delivery_otps_admin_all" ON public.delivery_otps FOR ALL USING (public.is_admin());

-- delivery_verifications: Staff/Admin only
CREATE POLICY "delivery_verifications_admin" ON public.delivery_verifications FOR SELECT USING (public.is_admin());

-- cod_collections & cod_remittances: Staff/Admin only
CREATE POLICY "cod_collections_admin" ON public.cod_collections FOR ALL USING (public.is_admin());
CREATE POLICY "cod_remittances_admin" ON public.cod_remittances FOR ALL USING (public.is_admin());

-- invoices: Customer can read own invoices; Admin can read all
CREATE POLICY "invoices_customer_read" ON public.invoices FOR SELECT USING (
    customer_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = invoices.order_id AND o.user_id = auth.uid())
);
CREATE POLICY "invoices_admin_all" ON public.invoices FOR ALL USING (public.is_admin());

-- return_requests: Customer can read and create for own orders; Admin can manage
CREATE POLICY "returns_customer_read" ON public.return_requests FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "returns_customer_insert" ON public.return_requests FOR INSERT WITH CHECK (
    customer_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.orders o WHERE o.id = return_requests.order_id AND o.user_id = auth.uid() AND o.order_status = 'Delivered')
);
CREATE POLICY "returns_admin_all" ON public.return_requests FOR ALL USING (public.is_admin());

-- return_request_items: Customer can read own items; Admin can manage
CREATE POLICY "return_items_customer_read" ON public.return_request_items FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.return_requests r WHERE r.id = return_request_items.return_request_id AND r.customer_id = auth.uid())
);
CREATE POLICY "return_items_admin_all" ON public.return_request_items FOR ALL USING (public.is_admin());

-- refund_records: Staff/Admin only
CREATE POLICY "refund_records_admin_all" ON public.refund_records FOR ALL USING (public.is_admin());

-- wishlists: Customer full control of own wishlist
CREATE POLICY "wishlists_customer_all" ON public.wishlists FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- support_tickets: Customer can read/insert own tickets; Admin can manage all
CREATE POLICY "tickets_customer_read" ON public.support_tickets FOR SELECT USING (customer_id = auth.uid());
CREATE POLICY "tickets_customer_insert" ON public.support_tickets FOR INSERT WITH CHECK (customer_id = auth.uid());
CREATE POLICY "tickets_admin_all" ON public.support_tickets FOR ALL USING (public.is_admin());

-- ticket_messages: Customer can view/insert in own tickets; Admin can view/insert in all
CREATE POLICY "messages_customer_read" ON public.ticket_messages FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_messages.ticket_id AND t.customer_id = auth.uid())
);
CREATE POLICY "messages_customer_insert" ON public.ticket_messages FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.support_tickets t WHERE t.id = ticket_messages.ticket_id AND t.customer_id = auth.uid())
);
CREATE POLICY "messages_admin_all" ON public.ticket_messages FOR ALL USING (public.is_admin());

-- phone_verifications: Customer can view/insert own phone verification
CREATE POLICY "phone_verifications_customer" ON public.phone_verifications FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
