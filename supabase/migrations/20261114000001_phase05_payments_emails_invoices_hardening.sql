-- ==============================================================================
-- PHASE 05 — PAYMENTS, EMAILS, INVOICES & SHIPPING FEES HARDENING
-- MD Shakib Islamic Books Modernization Project
-- Migration: 20261114000001_phase05_payments_emails_invoices_hardening.sql
-- ==============================================================================
-- Hardens:
--   1. Payment settlement uniqueness (orders.razorpay_payment_id & single settled
--      payment per order) and remote capture-state enforcement in SQL.
--   2. Atomic payment failure & refund reconciliation (attempt_count tracking,
--      prevention of false refund_amount on failed refunds, strict capture checks).
--   3. Transactional email suppression, notification preference toggle, bounded
--      retry metadata, and idempotency_key uniqueness in email_logs.
--   4. Indian GSTIN mod-36 checksum & 36-state GST code resolver helpers, strict
--      invoice order/payment eligibility enforcement, platform_fee & customer_gstin
--      accounting reconciliation on invoices.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PAYMENT & ORDER UNIQUENESS CONSTRAINTS
-- ------------------------------------------------------------------------------

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_razorpay_payment_id_unique
    ON public.orders(razorpay_payment_id)
    WHERE razorpay_payment_id IS NOT NULL AND trim(razorpay_payment_id) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_single_settled_per_order
    ON public.payments(order_id)
    WHERE status IN ('Paid', 'Partially Refunded', 'Refund Pending', 'Refunded');

-- ------------------------------------------------------------------------------
-- 2. EMAIL PREFERENCES & EMAIL_LOGS RETRY / SUPPRESSION METADATA
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email_preferences_updated_at TIMESTAMPTZ DEFAULT NULL;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.email_logs'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%status%'
    LOOP
        EXECUTE format('ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.email_logs
    ADD CONSTRAINT email_logs_status_check
    CHECK (status IN ('queued', 'sent', 'failed', 'suppressed'));

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT NULL;

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS attempt_count INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 3;

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS failure_type TEXT DEFAULT NULL;

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS last_error TEXT DEFAULT NULL;

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS next_retry_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS suppressed_reason TEXT DEFAULT NULL;

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS provider_message_id TEXT DEFAULT NULL;

ALTER TABLE public.email_logs
    ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ DEFAULT NULL;

DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT conname
        FROM pg_constraint
        WHERE conrelid = 'public.email_logs'::regclass
          AND contype = 'c'
          AND (
              pg_get_constraintdef(oid) ILIKE '%failure_type%'
              OR pg_get_constraintdef(oid) ILIKE '%attempt_count%'
              OR pg_get_constraintdef(oid) ILIKE '%max_attempts%'
          )
    LOOP
        EXECUTE format('ALTER TABLE public.email_logs DROP CONSTRAINT IF EXISTS %I', r.conname);
    END LOOP;
END $$;

ALTER TABLE public.email_logs
    ADD CONSTRAINT email_logs_failure_type_check
    CHECK (failure_type IS NULL OR failure_type IN ('transient', 'permanent', 'suppressed'));

ALTER TABLE public.email_logs
    ADD CONSTRAINT email_logs_attempt_count_check
    CHECK (attempt_count >= 0);

ALTER TABLE public.email_logs
    ADD CONSTRAINT email_logs_max_attempts_check
    CHECK (max_attempts >= 1);

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_logs_idempotency_key_unique
    ON public.email_logs(idempotency_key)
    WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_logs_status_retry
    ON public.email_logs(status, next_retry_at)
    WHERE status = 'failed';

-- ------------------------------------------------------------------------------
-- 3. INVOICES & ORDERS GST / PLATFORM FEE EXTENSIONS
-- ------------------------------------------------------------------------------

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS customer_gstin TEXT DEFAULT NULL;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS platform_fee NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0);

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS customer_gstin TEXT DEFAULT NULL;

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS seller_state_code VARCHAR(2) NOT NULL DEFAULT '07';

ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS place_of_supply_code VARCHAR(2) NOT NULL DEFAULT '99';

-- ------------------------------------------------------------------------------
-- 4. INDIAN GSTIN MOD-36 CHECKSUM & ALL-36 STATE GST CODE HELPERS
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_valid_gstin(p_gstin TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean TEXT;
    v_state_code TEXT;
    v_charset CONSTANT TEXT := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    v_idx INT;
    v_cp INT;
    v_factor INT;
    v_prod INT;
    v_sum INT := 0;
    v_rem INT;
    v_check_idx INT;
    v_expected_char TEXT;
BEGIN
    v_clean := UPPER(trim(COALESCE(p_gstin, '')));
    IF length(v_clean) <> 15 THEN
        RETURN FALSE;
    END IF;

    IF v_clean = '07AAAAA0000A1Z5' THEN
        RETURN FALSE;
    END IF;

    IF v_clean !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$' THEN
        RETURN FALSE;
    END IF;

    v_state_code := substring(v_clean from 1 for 2);
    IF NOT (
        (v_state_code BETWEEN '01' AND '38')
        OR v_state_code IN ('97', '99')
    ) THEN
        RETURN FALSE;
    END IF;

    FOR v_idx IN 1..14 LOOP
        v_cp := strpos(v_charset, substring(v_clean from v_idx for 1)) - 1;
        IF v_cp < 0 THEN
            RETURN FALSE;
        END IF;

        v_factor := CASE WHEN (v_idx % 2) = 1 THEN 1 ELSE 2 END;
        v_prod := v_cp * v_factor;
        v_sum := v_sum + (v_prod / 36) + (v_prod % 36);
    END LOOP;

    v_rem := v_sum % 36;
    v_check_idx := (36 - v_rem) % 36;
    v_expected_char := substring(v_charset from (v_check_idx + 1) for 1);

    RETURN substring(v_clean from 15 for 1) = v_expected_char;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_indian_state_gst_code(
    p_state TEXT,
    p_pincode TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state TEXT := lower(regexp_replace(trim(COALESCE(p_state, '')), '[^a-z0-9]+', ' ', 'g'));
    v_pin TEXT := trim(COALESCE(p_pincode, ''));
BEGIN
    v_state := trim(v_state);

    IF v_state ~ '^(0[1-9]|[12][0-9]|3[0-8]|97|99)$' THEN
        RETURN v_state;
    END IF;

    CASE v_state
        WHEN 'jammu and kashmir', 'jammu kashmir', 'jk', 'j k' THEN RETURN '01';
        WHEN 'himachal pradesh', 'hp' THEN RETURN '02';
        WHEN 'punjab', 'pb' THEN RETURN '03';
        WHEN 'chandigarh', 'ch' THEN RETURN '04';
        WHEN 'uttarakhand', 'uttaranchal', 'uk', 'ua' THEN RETURN '05';
        WHEN 'haryana', 'hr' THEN RETURN '06';
        WHEN 'delhi', 'dl', 'new delhi', 'nct of delhi', 'delhi ncr' THEN RETURN '07';
        WHEN 'rajasthan', 'rj' THEN RETURN '08';
        WHEN 'uttar pradesh', 'up', 'uttarpradesh' THEN RETURN '09';
        WHEN 'bihar', 'br' THEN RETURN '10';
        WHEN 'sikkim', 'sk' THEN RETURN '11';
        WHEN 'arunachal pradesh', 'ar' THEN RETURN '12';
        WHEN 'nagaland', 'nl' THEN RETURN '13';
        WHEN 'manipur', 'mn' THEN RETURN '14';
        WHEN 'mizoram', 'mz' THEN RETURN '15';
        WHEN 'tripura', 'tr' THEN RETURN '16';
        WHEN 'meghalaya', 'ml' THEN RETURN '17';
        WHEN 'assam', 'as' THEN RETURN '18';
        WHEN 'west bengal', 'wb', 'bengal' THEN RETURN '19';
        WHEN 'jharkhand', 'jh' THEN RETURN '20';
        WHEN 'odisha', 'orissa', 'od', 'or' THEN RETURN '21';
        WHEN 'chhattisgarh', 'chattisgarh', 'cg', 'ct' THEN RETURN '22';
        WHEN 'madhya pradesh', 'mp' THEN RETURN '23';
        WHEN 'gujarat', 'gj' THEN RETURN '24';
        WHEN 'daman and diu', 'daman diu', 'dd' THEN RETURN '25';
        WHEN 'dadra and nagar haveli', 'dadra and nagar haveli and daman and diu', 'dnhdd', 'dn', 'dnh' THEN RETURN '26';
        WHEN 'maharashtra', 'mh' THEN RETURN '27';
        WHEN 'karnataka', 'ka' THEN RETURN '29';
        WHEN 'goa', 'ga' THEN RETURN '30';
        WHEN 'lakshadweep', 'ld' THEN RETURN '31';
        WHEN 'kerala', 'kl' THEN RETURN '32';
        WHEN 'tamil nadu', 'tamilnadu', 'tn' THEN RETURN '33';
        WHEN 'puducherry', 'pondicherry', 'py' THEN RETURN '34';
        WHEN 'andaman and nicobar islands', 'andaman and nicobar', 'andaman nicobar', 'an' THEN RETURN '35';
        WHEN 'telangana', 'ts', 'tg' THEN RETURN '36';
        WHEN 'andhra pradesh', 'ap', 'seemandhra' THEN RETURN '37';
        WHEN 'ladakh', 'la' THEN RETURN '38';
        WHEN 'other territory', 'ot' THEN RETURN '97';
        WHEN 'centre jurisdiction', 'center jurisdiction', 'cj' THEN RETURN '99';
        ELSE NULL;
    END CASE;

    -- Reliable India Post 2-digit/3-digit PIN fallbacks when state string is ambiguous
    IF v_pin ~ '^11\d{4}$' THEN RETURN '07'; END IF;
    IF v_pin ~ '^1[23]\d{4}$' THEN RETURN '06'; END IF;
    IF v_pin ~ '^1[45]\d{4}$' THEN RETURN '03'; END IF;
    IF v_pin ~ '^16\d{4}$' THEN RETURN '04'; END IF;
    IF v_pin ~ '^17\d{4}$' THEN RETURN '02'; END IF;
    IF v_pin ~ '^194\d{3}$' THEN RETURN '38'; END IF;
    IF v_pin ~ '^1[89]\d{4}$' THEN RETURN '01'; END IF;
    IF v_pin ~ '^2[0-8]\d{4}$' THEN RETURN '09'; END IF;
    IF v_pin ~ '^3[0-4]\d{4}$' THEN RETURN '08'; END IF;
    IF v_pin ~ '^3[6-9]\d{4}$' THEN RETURN '24'; END IF;
    IF v_pin ~ '^403\d{3}$' THEN RETURN '30'; END IF;
    IF v_pin ~ '^4[0-4]\d{4}$' THEN RETURN '27'; END IF;
    IF v_pin ~ '^4[5-8]\d{4}$' THEN RETURN '23'; END IF;
    IF v_pin ~ '^49\d{4}$' THEN RETURN '22'; END IF;
    IF v_pin ~ '^50\d{4}$' THEN RETURN '36'; END IF;
    IF v_pin ~ '^5[1-3]\d{4}$' THEN RETURN '37'; END IF;
    IF v_pin ~ '^5[6-9]\d{4}$' THEN RETURN '29'; END IF;
    IF v_pin ~ '^6[0-4]\d{4}$' THEN RETURN '33'; END IF;
    IF v_pin ~ '^6[7-9]\d{4}$' THEN RETURN '32'; END IF;
    IF v_pin ~ '^7[0-4]\d{4}$' THEN RETURN '19'; END IF;
    IF v_pin ~ '^7[5-7]\d{4}$' THEN RETURN '21'; END IF;
    IF v_pin ~ '^78\d{4}$' THEN RETURN '18'; END IF;
    IF v_pin ~ '^8[0-5]\d{4}$' THEN RETURN '10'; END IF;

    RETURN '99';
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. HARDEN settle_payment_atomic (Capture status & cross-order uniqueness)
-- ------------------------------------------------------------------------------

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
    v_raw_status TEXT;
    v_raw_payment_id TEXT;
    v_raw_order_id TEXT;
    v_existing_other_order_id UUID;
    v_items_distinct_count INT := 0;
    v_res_distinct_count INT := 0;
    v_mismatch_count INT := 0;
    v_exact_coverage BOOLEAN := FALSE;
    v_stock_available BOOLEAN := TRUE;
    v_book_stock INT;
    v_needed_qty INT;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Payment settlement requires service-role credentials.';
        END IF;
    END IF;

    IF p_razorpay_order_id IS NULL OR trim(p_razorpay_order_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'status', 'invalid_provider_order_id', 'message', 'Provider order ID cannot be empty');
    END IF;

    IF p_razorpay_payment_id IS NULL OR trim(p_razorpay_payment_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'status', 'invalid_provider_payment_id', 'message', 'Provider payment ID cannot be empty');
    END IF;

    -- Extract optional entity identity and capture state before touching rows
    IF p_raw_response IS NOT NULL THEN
        v_raw_status := lower(COALESCE(
            NULLIF(trim(p_raw_response->>'status'), ''),
            NULLIF(trim(p_raw_response #>> '{payment,entity,status}'), ''),
            NULLIF(trim(p_raw_response #>> '{payment,status}'), ''),
            NULLIF(trim(p_raw_response #>> '{payload,payment,entity,status}'), ''),
            ''
        ));

        v_raw_payment_id := COALESCE(
            NULLIF(trim(p_raw_response->>'id'), ''),
            NULLIF(trim(p_raw_response #>> '{payment,entity,id}'), ''),
            NULLIF(trim(p_raw_response #>> '{payment,id}'), ''),
            NULLIF(trim(p_raw_response #>> '{payload,payment,entity,id}'), '')
        );

        v_raw_order_id := COALESCE(
            NULLIF(trim(p_raw_response->>'order_id'), ''),
            NULLIF(trim(p_raw_response #>> '{payment,entity,order_id}'), ''),
            NULLIF(trim(p_raw_response #>> '{payment,order_id}'), ''),
            NULLIF(trim(p_raw_response #>> '{payload,payment,entity,order_id}'), '')
        );

        IF v_raw_status <> '' AND v_raw_status <> 'captured' THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_not_captured',
                'message', 'Payment settlement rejected: Razorpay payment status is "' || v_raw_status || '", expected "captured".'
            );
        END IF;

        IF v_raw_payment_id IS NOT NULL AND v_raw_payment_id <> p_razorpay_payment_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'provider_payment_id_mismatch',
                'message', 'Payment settlement rejected: Entity payment ID mismatch.'
            );
        END IF;

        IF v_raw_order_id IS NOT NULL AND v_raw_order_id <> p_razorpay_order_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'provider_order_id_mismatch',
                'message', 'Payment settlement rejected: Entity order ID mismatch.'
            );
        END IF;
    END IF;

    -- Lock candidate order row
    SELECT * INTO v_order
    FROM public.orders
    WHERE razorpay_order_id = p_razorpay_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        SELECT o.* INTO v_order
        FROM public.orders o
        JOIN public.payments p ON p.order_id = o.id
        WHERE p.provider_order_id = p_razorpay_order_id
        LIMIT 1
        FOR UPDATE OF o;
    END IF;

    IF v_order.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'order_not_found',
            'message', 'No order associated with Razorpay order ID ' || p_razorpay_order_id
        );
    END IF;

    IF v_order.payment_method = 'COD' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_payment_method',
            'message', 'COD orders cannot be settled via online prepaid webhook'
        );
    END IF;

    -- Reject cross-order payment reuse cleanly before touching unique indexes
    SELECT id INTO v_existing_other_order_id
    FROM public.orders
    WHERE razorpay_payment_id = p_razorpay_payment_id
      AND id <> v_order.id
    LIMIT 1;

    IF v_existing_other_order_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_id_conflict_cross_order',
            'message', 'Razorpay payment ID ' || p_razorpay_payment_id || ' is already bound to another order.'
        );
    END IF;

    SELECT order_id INTO v_existing_other_order_id
    FROM public.payments
    WHERE provider_payment_id = p_razorpay_payment_id
      AND order_id <> v_order.id
    LIMIT 1;

    IF v_existing_other_order_id IS NOT NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_id_conflict_cross_order',
            'message', 'Provider payment ID ' || p_razorpay_payment_id || ' is already bound to another order payment.'
        );
    END IF;

    SELECT * INTO v_payment
    FROM public.payments
    WHERE provider_order_id = p_razorpay_order_id
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

    IF v_payment.provider IS NULL OR v_payment.provider <> 'Razorpay' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_provider_mismatch',
            'message', 'Payment settlement rejected: Expected Razorpay provider.'
        );
    END IF;

    IF v_payment.status IN ('Refunded', 'Refund Pending', 'Partially Refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_status_invalid',
            'message', 'Payment settlement rejected: Payment record has status ' || v_payment.status
        );
    END IF;

    IF v_payment.status = 'Failed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_status_invalid',
            'message', 'Payment settlement rejected: Payment record is marked as Failed.'
        );
    END IF;

    IF (v_order.is_paid IS FALSE AND v_order.payment_status <> 'Paid') AND v_payment.status <> 'Pending' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_status_invalid',
            'message', 'Payment settlement rejected: Unsettled order requires Pending payment record, found ' || v_payment.status
        );
    END IF;

    IF v_payment.amount IS NULL OR ABS(v_payment.amount - v_order.total_amount) > 0.01 OR v_payment.currency IS NULL OR UPPER(v_payment.currency) <> 'INR' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'payment_record_amount_mismatch',
            'message', 'Payment settlement rejected: Payment record amount or currency mismatch with order.'
        );
    END IF;

    -- Extract mandatory currency & amount evidence
    IF p_raw_response IS NOT NULL THEN
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
            BEGIN v_raw_amount := (p_raw_response->>'amount')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{payment,entity,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{payment,entity,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{payment,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{payment,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{payload,payment,entity,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{payload,payment,entity,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{order,entity,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{order,entity,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        ELSIF p_raw_response #> '{payload,order,entity,amount}' IS NOT NULL THEN
            BEGIN v_raw_amount := (p_raw_response #>> '{payload,order,entity,amount}')::NUMERIC; EXCEPTION WHEN OTHERS THEN v_raw_amount := NULL; END;
        END IF;

        IF v_raw_amount IS NOT NULL AND v_raw_amount > (v_order.total_amount * 10) THEN
            v_raw_amount := v_raw_amount / 100.0;
        END IF;
    END IF;

    IF v_raw_currency IS NULL OR trim(v_raw_currency) = '' THEN
        RETURN jsonb_build_object('success', false, 'status', 'missing_provider_currency', 'message', 'Payment settlement rejected: Provider currency evidence is missing.');
    END IF;

    IF v_raw_currency <> 'INR' THEN
        RETURN jsonb_build_object('success', false, 'status', 'currency_mismatch', 'message', 'Payment settlement rejected: Currency mismatch. Expected INR but received ' || v_raw_currency);
    END IF;

    IF v_raw_amount IS NULL OR v_raw_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'status', 'missing_provider_amount', 'message', 'Payment settlement rejected: Provider amount evidence is missing or invalid.');
    END IF;

    IF ABS(v_raw_amount - v_order.total_amount) > 0.01 THEN
        RETURN jsonb_build_object('success', false, 'status', 'amount_mismatch', 'message', 'Payment settlement rejected: Amount mismatch.');
    END IF;

    IF v_payment.provider_payment_id IS NOT NULL AND trim(v_payment.provider_payment_id) <> '' THEN
        IF v_payment.provider_payment_id <> p_razorpay_payment_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_id_conflict',
                'message', 'Payment record identity mismatch: Record already settled under ' || v_payment.provider_payment_id,
                'order_id', v_order.id
            );
        END IF;
    END IF;

    IF v_order.razorpay_payment_id IS NOT NULL AND trim(v_order.razorpay_payment_id) <> '' THEN
        IF v_order.razorpay_payment_id <> p_razorpay_payment_id THEN
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = COALESCE(p_signature, signature),
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;

            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_id_conflict',
                'message', 'Order already settled under payment ID ' || v_order.razorpay_payment_id || '; duplicate capture ' || p_razorpay_payment_id || ' requires refund.',
                'order_id', v_order.id,
                'requires_refund', TRUE,
                'duplicate_payment_id', p_razorpay_payment_id
            );
        END IF;
    END IF;

    IF (v_order.is_paid IS TRUE OR v_order.payment_status = 'Paid') THEN
        IF v_order.razorpay_payment_id IS NULL OR trim(v_order.razorpay_payment_id) = '' THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'missing_payment_identity',
                'message', 'Order marked Paid without stored payment ID.',
                'order_id', v_order.id
            );
        END IF;

        IF v_order.payment_status IN ('Refunded', 'Partially Refunded', 'Refund Pending') THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'order_status_invalid',
                'message', 'Order has status ' || v_order.payment_status || '. Replay settlement is invalid.',
                'order_id', v_order.id
            );
        END IF;

        IF v_payment.status = 'Paid' THEN
            IF v_payment.provider_payment_id IS NULL OR trim(v_payment.provider_payment_id) = '' THEN
                UPDATE public.payments
                SET provider_payment_id = p_razorpay_payment_id,
                    signature = COALESCE(p_signature, signature),
                    raw_response = COALESCE(p_raw_response, raw_response),
                    updated_at = v_now
                WHERE id = v_payment.id;
            END IF;

            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_paid',
                'order_id', v_order.id,
                'user_id', v_order.user_id,
                'settled', false,
                'reconciled', false
            );
        ELSIF v_payment.status = 'Pending' THEN
            UPDATE public.payments
            SET provider_payment_id = p_razorpay_payment_id,
                signature = COALESCE(p_signature, signature),
                status = 'Paid',
                raw_response = COALESCE(p_raw_response, raw_response),
                updated_at = v_now
            WHERE id = v_payment.id;

            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_paid',
                'order_id', v_order.id,
                'user_id', v_order.user_id,
                'settled', false,
                'reconciled', true
            );
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'status', 'payment_record_status_invalid',
                'message', 'Payment record status ' || v_payment.status || ' cannot be reconciled on paid order.',
                'order_id', v_order.id
            );
        END IF;
    END IF;

    SELECT COUNT(DISTINCT book_id) INTO v_items_distinct_count FROM public.order_items WHERE order_id = v_order.id;
    SELECT COUNT(DISTINCT book_id) INTO v_res_distinct_count
    FROM public.inventory_reservations
    WHERE order_id = v_order.id AND status = 'reserved' AND (expires_at IS NULL OR expires_at >= v_now);

    SELECT COUNT(*) INTO v_mismatch_count
    FROM (SELECT book_id, SUM(quantity) AS item_qty FROM public.order_items WHERE order_id = v_order.id GROUP BY book_id) oi
    FULL OUTER JOIN (
        SELECT book_id, SUM(quantity) AS reserved_qty
        FROM public.inventory_reservations
        WHERE order_id = v_order.id AND status = 'reserved' AND (expires_at IS NULL OR expires_at >= v_now)
        GROUP BY book_id
    ) r ON oi.book_id = r.book_id
    WHERE oi.item_qty IS NULL OR r.reserved_qty IS NULL OR oi.item_qty <> r.reserved_qty;

    v_exact_coverage := (v_items_distinct_count > 0 AND v_items_distinct_count = v_res_distinct_count AND v_mismatch_count = 0);

    IF v_exact_coverage IS TRUE AND v_order.order_status = 'Pending' THEN
        UPDATE public.orders
        SET payment_status = 'Paid',
            order_status = 'Confirmed',
            is_paid = TRUE,
            paid_at = v_now,
            coupon_status = CASE WHEN coupon_status = 'reserved' THEN 'consumed' ELSE coupon_status END,
            razorpay_order_id = p_razorpay_order_id,
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

        UPDATE public.payment_attempts
        SET status = CASE WHEN provider_order_id = p_razorpay_order_id THEN 'paid' ELSE 'superseded' END,
            updated_at = v_now
        WHERE order_id = v_order.id AND status IN ('initiated', 'pending');

        UPDATE public.inventory_reservations
        SET status = 'committed',
            expires_at = NULL,
            updated_at = v_now
        WHERE order_id = v_order.id AND status = 'reserved';

        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (v_order.id, 'Confirmed', 'Payment settled and verified via Razorpay (' || p_razorpay_payment_id || ')', v_now);

        RETURN jsonb_build_object(
            'success', true,
            'status', 'settled',
            'order_id', v_order.id,
            'user_id', v_order.user_id,
            'settled', true
        );
    END IF;

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
            razorpay_order_id = p_razorpay_order_id,
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = v_now
        WHERE id = v_order.id;

        INSERT INTO public.refund_records (
            order_id, amount, currency, status, reason, refund_type, idempotency_key, raw_response
        ) VALUES (
            v_order.id, v_order.total_amount, 'INR', 'pending',
            'Late payment captured for cancelled order', 'cancellation',
            'refund:late_capture:' || v_order.id::text || ':' || p_razorpay_payment_id,
            COALESCE(p_raw_response, '{}'::jsonb)
        )
        ON CONFLICT DO NOTHING;

        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (v_order.id, 'Cancelled', 'Payment captured for cancelled order (' || COALESCE(v_order.cancel_reason, 'unspecified') || '). Marked for refund.', v_now);

        RETURN jsonb_build_object(
            'success', false,
            'status', 'cancelled_non_recoverable',
            'message', 'Payment captured for cancelled order; refund required.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

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
            is_paid = TRUE,
            paid_at = COALESCE(paid_at, v_now),
            razorpay_payment_id = COALESCE(razorpay_payment_id, p_razorpay_payment_id),
            refund_status = 'pending',
            refund_amount = v_order.total_amount,
            updated_at = v_now
        WHERE id = v_order.id;

        INSERT INTO public.refund_records (
            order_id, amount, currency, status, reason, refund_type, idempotency_key, raw_response
        ) VALUES (
            v_order.id, v_order.total_amount, 'INR', 'pending',
            'Payment captured in terminal order state ' || v_order.order_status, 'cancellation',
            'refund:late_capture:' || v_order.id::text || ':' || p_razorpay_payment_id,
            COALESCE(p_raw_response, '{}'::jsonb)
        )
        ON CONFLICT DO NOTHING;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'terminal_state_conflict',
            'message', 'Payment arrived for order in terminal status ' || v_order.order_status || '; marked for refund.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

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
            SELECT stock INTO v_book_stock FROM public.books WHERE id = v_item.book_id FOR UPDATE;
            IF v_book_stock IS NULL OR v_book_stock < v_needed_qty THEN
                v_stock_available := FALSE;
                EXIT;
            END IF;
        END IF;
    END LOOP;

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
            ORDER BY book_id, id
            FOR UPDATE
        LOOP
            UPDATE public.books SET stock = stock + v_item.quantity WHERE id = v_item.book_id;
            UPDATE public.inventory_reservations
            SET status = 'released', released_at = v_now, release_reason = 'post_expiry_stock_unavailable', updated_at = v_now
            WHERE id = v_item.id;
        END LOOP;

        IF v_order.coupon_status = 'reserved' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
            UPDATE public.discounts SET used_count = GREATEST(used_count - 1, 0) WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
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
            razorpay_order_id = p_razorpay_order_id,
            razorpay_payment_id = p_razorpay_payment_id,
            updated_at = v_now
        WHERE id = v_order.id;

        INSERT INTO public.refund_records (
            order_id, amount, currency, status, reason, refund_type, idempotency_key, raw_response
        ) VALUES (
            v_order.id, v_order.total_amount, 'INR', 'pending',
            'Payment received after reservation expired; stock out of stock', 'cancellation',
            'refund:late_capture:' || v_order.id::text || ':' || p_razorpay_payment_id,
            COALESCE(p_raw_response, '{}'::jsonb)
        )
        ON CONFLICT DO NOTHING;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'post_expiry_stock_unavailable',
            'message', 'Payment received after reservation expired and stock is exhausted; refund required.',
            'order_id', v_order.id,
            'settled', false,
            'requires_refund', true
        );
    END IF;

    -- Post-expiry stock available -> recover order atomically
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
            UPDATE public.books SET stock = stock - v_needed_qty WHERE id = v_item.book_id;
            INSERT INTO public.inventory_reservations (
                order_id, book_id, quantity, status, payment_method, expires_at
            ) VALUES (
                v_order.id, v_item.book_id, v_needed_qty, 'committed', 'ONLINE', NULL
            );
        END IF;
    END LOOP;

    UPDATE public.inventory_reservations
    SET status = 'committed', expires_at = NULL, updated_at = v_now
    WHERE order_id = v_order.id AND status = 'reserved';

    IF v_order.coupon_status = 'released' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts SET used_count = used_count + 1 WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
    END IF;

    UPDATE public.orders
    SET payment_status = 'Paid',
        order_status = 'Confirmed',
        is_paid = TRUE,
        paid_at = v_now,
        coupon_status = CASE WHEN coupon_status IN ('reserved', 'released') THEN 'consumed' ELSE coupon_status END,
        cancel_reason = NULL,
        expired_at = NULL,
        razorpay_order_id = p_razorpay_order_id,
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

    UPDATE public.payment_attempts
    SET status = CASE WHEN provider_order_id = p_razorpay_order_id THEN 'paid' ELSE 'superseded' END,
        updated_at = v_now
    WHERE order_id = v_order.id AND status IN ('initiated', 'pending');

    INSERT INTO public.order_status_history (order_id, status, note, created_at)
    VALUES (v_order.id, 'Confirmed', 'Payment recovered post-expiry via Razorpay (' || p_razorpay_payment_id || ')', v_now);

    RETURN jsonb_build_object(
        'success', true,
        'status', 'settled_recovered',
        'order_id', v_order.id,
        'user_id', v_order.user_id,
        'settled', true
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_payment_atomic(TEXT, TEXT, TEXT, JSONB) TO postgres, service_role;

-- ------------------------------------------------------------------------------
-- 6. HARDEN record_payment_failure_atomic (Payment attempt sync & COD guard)
-- ------------------------------------------------------------------------------

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
    v_res RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_lingering_res INT := 0;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Recording payment failure requires service-role credentials.';
        END IF;
    END IF;

    IF p_razorpay_order_id IS NULL OR trim(p_razorpay_order_id) = '' THEN
        RETURN jsonb_build_object('success', false, 'status', 'invalid_provider_order_id', 'message', 'Provider order ID cannot be empty');
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE razorpay_order_id = p_razorpay_order_id
    FOR UPDATE;

    IF v_order.id IS NULL THEN
        SELECT o.* INTO v_order
        FROM public.orders o
        JOIN public.payments p ON p.order_id = o.id
        WHERE p.provider_order_id = p_razorpay_order_id
        LIMIT 1
        FOR UPDATE OF o;
    END IF;

    IF v_order.id IS NOT NULL AND v_order.payment_method = 'COD' THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'invalid_payment_method',
            'message', 'COD orders cannot record gateway payment failures'
        );
    END IF;

    IF v_order.id IS NOT NULL AND (v_order.is_paid IS TRUE OR v_order.payment_status IN ('Paid', 'Partially Refunded', 'Refund Pending', 'Refunded')) THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'ignored_already_paid',
            'order_id', v_order.id,
            'message', 'Order is already marked as Paid; failure event safely ignored'
        );
    END IF;

    IF v_order.id IS NOT NULL AND v_order.payment_status = 'Failed' AND v_order.order_status = 'Cancelled' THEN
        SELECT COUNT(*) INTO v_lingering_res
        FROM public.inventory_reservations
        WHERE order_id = v_order.id AND status = 'reserved';

        IF v_lingering_res = 0 THEN
            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_failed',
                'order_id', v_order.id,
                'message', 'Payment failure has already been recorded'
            );
        END IF;
    END IF;

    SELECT * INTO v_payment
    FROM public.payments
    WHERE provider_order_id = p_razorpay_order_id
    FOR UPDATE;

    IF v_payment.id IS NOT NULL AND v_payment.status IN ('Paid', 'Partially Refunded', 'Refund Pending', 'Refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'ignored_already_paid',
            'message', 'Payment record is already Paid; failure event safely ignored'
        );
    END IF;

    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET status = 'Failed',
            raw_response = COALESCE(p_raw_response, raw_response),
            updated_at = v_now
        WHERE id = v_payment.id;
    END IF;

    UPDATE public.payment_attempts
    SET status = 'failed',
        error_message = COALESCE(p_raw_response #>> '{payment,entity,error_description}', 'Payment failed at gateway'),
        updated_at = v_now
    WHERE provider_order_id = p_razorpay_order_id
      AND status IN ('initiated', 'pending');

    IF v_order.id IS NOT NULL THEN
        FOR v_res IN
            SELECT * FROM public.inventory_reservations
            WHERE order_id = v_order.id AND status = 'reserved'
            ORDER BY id
            FOR UPDATE
        LOOP
            UPDATE public.books
            SET stock = stock + v_res.quantity
            WHERE id = v_res.book_id;

            UPDATE public.inventory_reservations
            SET status = 'released',
                released_at = COALESCE(released_at, v_now),
                release_reason = COALESCE(release_reason, 'payment_failed'),
                updated_at = v_now
            WHERE id = v_res.id;
        END LOOP;

        IF v_order.coupon_status = 'reserved' AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
            UPDATE public.discounts
            SET used_count = GREATEST(used_count - 1, 0)
            WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));

            UPDATE public.orders
            SET coupon_status = 'released'
            WHERE id = v_order.id;
        END IF;

        UPDATE public.orders
        SET payment_status = 'Failed',
            order_status = 'Cancelled',
            cancel_reason = 'Payment failed or rejected by payment gateway',
            updated_at = v_now
        WHERE id = v_order.id AND payment_status <> 'Paid';
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', 'recorded_failure',
        'order_id', COALESCE(v_order.id, v_payment.order_id)
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_failure_atomic(TEXT, JSONB) TO postgres, service_role;

-- ------------------------------------------------------------------------------
-- 7. HARDEN record_refund_atomic (Attempt count & failed refund_amount hygiene)
-- ------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.record_refund_atomic(
    p_order_id UUID,
    p_refund_id TEXT,
    p_refund_amount NUMERIC,
    p_refund_status TEXT DEFAULT 'processed',
    p_raw_response JSONB DEFAULT '{}'::jsonb,
    p_idempotency_key TEXT DEFAULT NULL,
    p_refund_type TEXT DEFAULT 'cancellation',
    p_reason TEXT DEFAULT NULL,
    p_authorized_by UUID DEFAULT NULL,
    p_error_message TEXT DEFAULT NULL,
    p_refund_record_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_payment RECORD;
    v_rec RECORD;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_existing_settled NUMERIC := 0;
    v_effective_settled NUMERIC := 0;
    v_target_payment_status TEXT;
    v_refund_rec_id UUID;
    v_clean_refund_id TEXT := NULLIF(trim(COALESCE(p_refund_id, '')), '');
    v_is_real_gateway_id BOOLEAN := FALSE;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        IF auth.uid() IS NULL OR NOT public.is_admin() THEN
            RAISE EXCEPTION 'Unauthorized: Recording refund requires service-role credentials.';
        END IF;
    END IF;

    IF p_refund_status NOT IN ('not_required', 'pending', 'processing', 'processed', 'failed') THEN
        RAISE EXCEPTION 'Invalid refund status: %', p_refund_status;
    END IF;

    IF v_clean_refund_id IS NOT NULL AND v_clean_refund_id NOT LIKE 'rfnd_err_%' THEN
        v_is_real_gateway_id := TRUE;
    ELSE
        v_clean_refund_id := NULL;
    END IF;

    IF p_refund_status <> 'not_required' AND (p_refund_amount IS NULL OR p_refund_amount <= 0) THEN
        RAISE EXCEPTION 'Refund amount must be positive';
    END IF;

    IF p_refund_status IN ('processing', 'processed') AND NOT v_is_real_gateway_id THEN
        RAISE EXCEPTION 'A real gateway refund ID is required when status is "%".', p_refund_status;
    END IF;

    SELECT id, payment_status, payment_method, total_amount, is_paid, razorpay_refund_id, refund_status, refund_amount
    INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    IF p_refund_status = 'not_required' THEN
        UPDATE public.orders
        SET refund_status = 'not_required',
            refund_amount = NULL,
            updated_at = v_now
        WHERE id = p_order_id;

        RETURN jsonb_build_object(
            'success', true,
            'status', 'not_required',
            'order_id', v_order.id,
            'payment_status', v_order.payment_status
        );
    END IF;

    IF p_refund_record_id IS NOT NULL THEN
        SELECT * INTO v_rec FROM public.refund_records WHERE id = p_refund_record_id FOR UPDATE;
    ELSIF v_is_real_gateway_id THEN
        SELECT * INTO v_rec FROM public.refund_records WHERE gateway_refund_id = v_clean_refund_id FOR UPDATE;
    END IF;

    IF v_rec.id IS NULL AND p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        SELECT * INTO v_rec FROM public.refund_records WHERE idempotency_key = trim(p_idempotency_key) FOR UPDATE;
    END IF;

    IF v_rec.id IS NOT NULL AND v_rec.order_id <> p_order_id THEN
        RETURN jsonb_build_object(
            'success', false,
            'status', 'refund_order_mismatch',
            'message', 'Conflict: Refund record ' || v_rec.id || ' belongs to order ' || v_rec.order_id || ', not ' || p_order_id
        );
    END IF;

    IF v_rec.id IS NOT NULL AND v_rec.status = 'processed' THEN
        IF p_refund_status = 'processed' THEN
            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_processed',
                'order_id', v_order.id,
                'refund_id', COALESCE(v_rec.gateway_refund_id, v_clean_refund_id),
                'refund_record_id', v_rec.id,
                'message', 'Refund event has already been recorded'
            );
        END IF;

        RETURN jsonb_build_object(
            'success', false,
            'status', 'cannot_downgrade_processed_refund',
            'message', 'Refund ' || COALESCE(v_rec.gateway_refund_id, v_rec.id::text) || ' is already processed and cannot be downgraded to ' || p_refund_status
        );
    END IF;

    IF v_rec.id IS NULL AND v_order.refund_status = 'processed' AND v_order.payment_status = 'Refunded' THEN
        IF v_is_real_gateway_id AND v_order.razorpay_refund_id = v_clean_refund_id AND p_refund_status = 'processed' THEN
            RETURN jsonb_build_object(
                'success', true,
                'status', 'already_processed',
                'order_id', v_order.id,
                'refund_id', v_clean_refund_id,
                'message', 'Refund event has already been recorded'
            );
        ELSIF p_refund_status <> 'processed' THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'cannot_downgrade_processed_refund',
                'message', 'Order already has a fully processed refund; cannot downgrade to ' || p_refund_status
            );
        ELSIF v_is_real_gateway_id AND v_order.razorpay_refund_id IS NOT NULL AND v_order.razorpay_refund_id <> v_clean_refund_id THEN
            RETURN jsonb_build_object(
                'success', false,
                'status', 'refund_id_conflict',
                'message', 'Conflict: Order already has settled refund ' || v_order.razorpay_refund_id || '; incoming refund ID: ' || v_clean_refund_id
            );
        END IF;
    END IF;

    SELECT COALESCE(SUM(amount), 0)
    INTO v_existing_settled
    FROM public.refund_records
    WHERE order_id = p_order_id
      AND status = 'processed'
      AND (v_rec.id IS NULL OR id <> v_rec.id);

    IF p_refund_status IN ('pending', 'processing', 'processed')
       AND (v_existing_settled + p_refund_amount) > (v_order.total_amount + 0.01) THEN
        RAISE EXCEPTION 'Cumulative refund amount (%) exceeds order total (%)',
            (v_existing_settled + p_refund_amount), v_order.total_amount;
    END IF;

    SELECT id, status, amount, refund_id, refund_status, raw_response
    INTO v_payment
    FROM public.payments
    WHERE order_id = p_order_id
    ORDER BY (CASE WHEN status IN ('Paid', 'Refund Pending', 'Partially Refunded', 'Refunded') THEN 0 ELSE 1 END), created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_rec.id IS NOT NULL THEN
        UPDATE public.refund_records
        SET gateway_refund_id = COALESCE(v_clean_refund_id, gateway_refund_id),
            amount = p_refund_amount,
            status = p_refund_status,
            gateway_status = p_refund_status,
            reason = COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), reason),
            authorized_by = COALESCE(p_authorized_by, authorized_by),
            error_message = CASE WHEN p_refund_status IN ('failed', 'pending') THEN COALESCE(p_error_message, error_message) ELSE NULL END,
            attempt_count = CASE WHEN p_refund_status IN ('pending', 'processing', 'failed') THEN attempt_count + 1 ELSE attempt_count END,
            raw_response = COALESCE(p_raw_response, raw_response),
            processed_at = CASE WHEN p_refund_status = 'processed' THEN COALESCE(processed_at, v_now) ELSE processed_at END,
            updated_at = v_now
        WHERE id = v_rec.id
        RETURNING id INTO v_refund_rec_id;
    ELSE
        INSERT INTO public.refund_records (
            order_id,
            gateway_refund_id,
            amount,
            currency,
            status,
            gateway_status,
            reason,
            authorized_by,
            refund_type,
            idempotency_key,
            error_message,
            raw_response,
            processed_at
        ) VALUES (
            p_order_id,
            v_clean_refund_id,
            p_refund_amount,
            'INR',
            p_refund_status,
            p_refund_status,
            COALESCE(NULLIF(trim(COALESCE(p_reason, '')), ''), 'Order refund'),
            p_authorized_by,
            p_refund_type,
            NULLIF(trim(COALESCE(p_idempotency_key, '')), ''),
            CASE WHEN p_refund_status IN ('failed', 'pending') THEN p_error_message ELSE NULL END,
            COALESCE(p_raw_response, '{}'::jsonb),
            CASE WHEN p_refund_status = 'processed' THEN v_now ELSE NULL END
        )
        RETURNING id INTO v_refund_rec_id;
    END IF;

    v_effective_settled := CASE
        WHEN p_refund_status = 'processed' THEN v_existing_settled + p_refund_amount
        ELSE v_existing_settled
    END;

    IF p_refund_status = 'processed' THEN
        IF v_effective_settled >= (v_order.total_amount - 0.01) THEN
            v_target_payment_status := 'Refunded';
        ELSE
            v_target_payment_status := 'Partially Refunded';
        END IF;
    ELSIF p_refund_status IN ('pending', 'processing') THEN
        v_target_payment_status := 'Refund Pending';
    ELSE
        IF v_existing_settled > 0 THEN
            v_target_payment_status := 'Partially Refunded';
        ELSE
            v_target_payment_status := 'Paid';
        END IF;
    END IF;

    UPDATE public.orders
    SET payment_status = v_target_payment_status,
        razorpay_refund_id = COALESCE(v_clean_refund_id, razorpay_refund_id),
        refund_amount = CASE
            WHEN v_effective_settled > 0 THEN v_effective_settled
            WHEN p_refund_status = 'failed' THEN NULL
            ELSE p_refund_amount
        END,
        refund_status = p_refund_status,
        refunded_at = CASE WHEN p_refund_status = 'processed' THEN COALESCE(refunded_at, v_now) ELSE refunded_at END,
        updated_at = v_now
    WHERE id = p_order_id;

    IF v_payment.id IS NOT NULL THEN
        UPDATE public.payments
        SET status = v_target_payment_status,
            refund_id = COALESCE(v_clean_refund_id, refund_id),
            refund_amount = CASE
                WHEN v_effective_settled > 0 THEN v_effective_settled
                WHEN p_refund_status = 'failed' THEN NULL
                ELSE p_refund_amount
            END,
            refund_status = p_refund_status,
            refunded_at = CASE WHEN p_refund_status = 'processed' THEN COALESCE(refunded_at, v_now) ELSE refunded_at END,
            raw_response = jsonb_set(COALESCE(raw_response, '{}'::jsonb), '{refund}', COALESCE(p_raw_response, '{}'::jsonb)),
            updated_at = v_now
        WHERE id = v_payment.id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'status', p_refund_status,
        'order_id', v_order.id,
        'refund_id', v_clean_refund_id,
        'refund_record_id', v_refund_rec_id,
        'payment_status', v_target_payment_status,
        'cumulative_refunded', v_effective_settled
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_refund_atomic(UUID, TEXT, NUMERIC, TEXT, JSONB, TEXT, TEXT, TEXT, UUID, TEXT, UUID) TO postgres, service_role;

-- ------------------------------------------------------------------------------
-- 8. HARDEN generate_order_invoice_atomic (Eligibility, Checksum, 36 States, Fees)
-- ------------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.generate_order_invoice_atomic(UUID, TEXT);
DROP FUNCTION IF EXISTS public.generate_order_invoice_atomic(UUID, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.generate_order_invoice_atomic(
    p_order_id UUID,
    p_seller_gstin TEXT,
    p_customer_gstin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_existing RECORD;
    v_clean_seller_gstin TEXT := UPPER(trim(COALESCE(p_seller_gstin, '')));
    v_clean_customer_gstin TEXT := NULLIF(UPPER(trim(COALESCE(p_customer_gstin, ''))), '');
    v_invoice_num TEXT;
    v_items JSONB;
    v_subtotal NUMERIC(10,2);
    v_discount NUMERIC(10,2);
    v_platform_fee NUMERIC(10,2);
    v_shipping NUMERIC(10,2);
    v_taxable NUMERIC(10,2);
    v_seller_state TEXT;
    v_dest_state TEXT;
    v_is_interstate BOOLEAN;
    v_cgst_rate NUMERIC(5,2) := 0;
    v_cgst_amt NUMERIC(10,2) := 0;
    v_sgst_rate NUMERIC(5,2) := 0;
    v_sgst_amt NUMERIC(10,2) := 0;
    v_igst_rate NUMERIC(5,2) := 0;
    v_igst_amt NUMERIC(10,2) := 0;
    v_total_shipping_tax NUMERIC(10,2) := 0;
    v_invoice_id UUID;
    v_is_eligible BOOLEAN := FALSE;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' AND NOT public.is_admin() THEN
        RAISE EXCEPTION 'Unauthorized: Administrator privileges required to generate statutory invoices';
    END IF;

    IF v_clean_seller_gstin = '' OR v_clean_seller_gstin = '07AAAAA0000A1Z5' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_SELLER_GSTIN',
            'error', 'Mandatory seller GST configuration is unconfigured or using placeholder value.'
        );
    END IF;

    IF NOT public.is_valid_gstin(v_clean_seller_gstin) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_SELLER_GSTIN',
            'error', 'Invalid seller GSTIN: failed 15-character structure, state code, or mod-36 check digit validation.'
        );
    END IF;

    IF v_clean_customer_gstin IS NOT NULL AND NOT public.is_valid_gstin(v_clean_customer_gstin) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVALID_CUSTOMER_GSTIN',
            'error', 'Invalid customer GSTIN: failed 15-character structure, state code, or mod-36 check digit validation.'
        );
    END IF;

    v_seller_state := substring(v_clean_seller_gstin from 1 for 2);

    -- Lock order first to prevent concurrent generation races and validate eligibility
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error_code', 'ORDER_NOT_FOUND', 'error', 'Order not found');
    END IF;

    -- Idempotency: preserve existing immutable tax invoice without overwriting
    SELECT * INTO v_existing
    FROM public.invoices
    WHERE order_id = p_order_id;

    IF FOUND THEN
        RETURN jsonb_build_object(
            'success', true,
            'invoice_id', v_existing.id,
            'invoice_number', v_existing.invoice_number,
            'already_existed', true,
            'grand_total', v_existing.grand_total
        );
    END IF;

    -- Resolve customer GSTIN from order if caller omitted override
    IF v_clean_customer_gstin IS NULL AND v_order.customer_gstin IS NOT NULL AND trim(v_order.customer_gstin) <> '' THEN
        v_clean_customer_gstin := UPPER(trim(v_order.customer_gstin));
        IF NOT public.is_valid_gstin(v_clean_customer_gstin) THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INVALID_CUSTOMER_GSTIN',
                'error', 'Stored order customer GSTIN failed validation.'
            );
        END IF;
    END IF;

    -- Strict Order & Payment Eligibility Guard for new tax invoice creation
    IF v_order.order_status IN ('Cancelled', 'Returned') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVOICE_ORDER_CANCELLED',
            'error', 'Tax invoices cannot be generated for cancelled or returned orders without an existing invoice.'
        );
    END IF;

    IF v_order.payment_status IN ('Failed', 'Refund Pending', 'Refunded') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVOICE_PAYMENT_INELIGIBLE',
            'error', 'Tax invoice cannot be generated while payment status is "' || v_order.payment_status || '".'
        );
    END IF;

    IF upper(COALESCE(v_order.payment_method, '')) = 'ONLINE' THEN
        v_is_eligible := (v_order.is_paid IS TRUE OR v_order.payment_status IN ('Paid', 'Partially Refunded'));
        IF NOT v_is_eligible THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INVOICE_PAYMENT_UNPAID',
                'error', 'Tax invoice cannot be generated for unpaid online order (status: ' || COALESCE(v_order.payment_status, 'Pending') || ').'
            );
        END IF;
    ELSIF upper(COALESCE(v_order.payment_method, '')) = 'COD' THEN
        v_is_eligible := (
            v_order.order_status IN ('Delivered', 'Replacement Delivered')
            OR v_order.is_paid IS TRUE
            OR v_order.payment_status IN ('Paid', 'Partially Refunded')
            OR COALESCE(v_order.cod_collection_status, 'uncollected') IN ('collected', 'excess')
            OR COALESCE(v_order.cod_settlement_status, 'unsettled') = 'reconciled'
        );
        IF NOT v_is_eligible THEN
            RETURN jsonb_build_object(
                'success', false,
                'error_code', 'INVOICE_COD_NOT_ELIGIBLE',
                'error', 'Tax invoice for Cash on Delivery orders is available only after delivery or confirmed COD payment collection.'
            );
        END IF;
    ELSE
        RETURN jsonb_build_object(
            'success', false,
            'error_code', 'INVOICE_INVALID_PAYMENT_METHOD',
            'error', 'Unsupported payment method for tax invoice.'
        );
    END IF;

    v_invoice_num := 'INV-' || to_char(NOW(), 'YYYYMM') || '-' || lpad(nextval('public.invoice_number_seq')::TEXT, 5, '0');

    SELECT jsonb_agg(jsonb_build_object(
        'book_id', oi.book_id,
        'title', oi.title,
        'quantity', oi.quantity,
        'unit_price', oi.price,
        'total_price', round((oi.price * oi.quantity), 2)
    )) INTO v_items
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id;

    v_discount := COALESCE(v_order.discount_amount, 0);
    v_shipping := COALESCE(v_order.delivery_fee, 0);
    v_platform_fee := COALESCE(v_order.platform_fee, 0);
    v_subtotal := COALESCE(
        v_order.subtotal,
        GREATEST(0, v_order.total_amount + v_discount - v_shipping - v_platform_fee)
    );
    v_taxable := GREATEST(0, ROUND(v_subtotal - v_discount, 2));

    v_dest_state := public.resolve_indian_state_gst_code(
        v_order.address_snapshot->>'state',
        v_order.address_snapshot->>'pincode'
    );
    IF v_dest_state = '99' AND v_order.address_snapshot ? 'state_code' THEN
        IF trim(v_order.address_snapshot->>'state_code') ~ '^(0[1-9]|[12][0-9]|3[0-8]|97|99)$' THEN
            v_dest_state := trim(v_order.address_snapshot->>'state_code');
        END IF;
    END IF;

    v_is_interstate := (v_seller_state <> v_dest_state);

    IF v_shipping > 0 THEN
        v_total_shipping_tax := round((v_shipping * 18.00 / 118.00), 2);
        IF v_is_interstate THEN
            v_igst_rate := 18.00;
            v_igst_amt := v_total_shipping_tax;
        ELSE
            v_cgst_rate := 9.00;
            v_cgst_amt := round((v_total_shipping_tax / 2.0), 2);
            v_sgst_rate := 9.00;
            v_sgst_amt := ROUND(v_total_shipping_tax - v_cgst_amt, 2);
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
        platform_fee,
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
        seller_gstin,
        customer_gstin,
        seller_state_code,
        place_of_supply_code
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
        v_platform_fee,
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
        COALESCE(v_order.razorpay_payment_id, CASE WHEN v_order.payment_method = 'COD' THEN v_order.cod_settlement_ref ELSE NULL END),
        v_clean_seller_gstin,
        v_clean_customer_gstin,
        v_seller_state,
        v_dest_state
    )
    RETURNING id INTO v_invoice_id;

    RETURN jsonb_build_object(
        'success', true,
        'invoice_id', v_invoice_id,
        'invoice_number', v_invoice_num,
        'grand_total', v_order.total_amount,
        'platform_fee', v_platform_fee,
        'seller_state_code', v_seller_state,
        'place_of_supply_code', v_dest_state,
        'is_interstate', v_is_interstate
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.generate_order_invoice_atomic(UUID, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.generate_order_invoice_atomic(UUID, TEXT, TEXT) TO service_role, postgres;
