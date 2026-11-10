-- ==============================================================================
-- Migration: 20261110000002_phase03_checkout_consent.sql
-- Description: Statutory Checkout Consent Auditing & Versioned Record Persistence
-- Phase: 3 (Production Hardening & Compliance)
-- ==============================================================================

-- 1. Create order_consents audit table
CREATE TABLE IF NOT EXISTS public.order_consents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    terms_accepted BOOLEAN NOT NULL CHECK (terms_accepted = TRUE),
    terms_version TEXT NOT NULL DEFAULT '2026.11-v1',
    privacy_version TEXT NOT NULL DEFAULT '2026.11-v1',
    shipping_policy_version TEXT NOT NULL DEFAULT '2026.11-v1',
    returns_policy_version TEXT NOT NULL DEFAULT '2026.11-v1',
    ip_address TEXT,
    user_agent TEXT,
    accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Add inline consent_record to public.orders for fast audit joins
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS consent_record JSONB DEFAULT NULL;

-- 3. Create indexes for consent auditing
CREATE INDEX IF NOT EXISTS idx_order_consents_order_id ON public.order_consents(order_id);
CREATE INDEX IF NOT EXISTS idx_order_consents_user_id ON public.order_consents(user_id);
CREATE INDEX IF NOT EXISTS idx_order_consents_accepted_at ON public.order_consents(accepted_at);

-- 4. Enable Row Level Security on order_consents
ALTER TABLE public.order_consents ENABLE ROW LEVEL SECURITY;

-- Customer can inspect their own consent audit records
DROP POLICY IF EXISTS "Customers can view own order consents" ON public.order_consents;
CREATE POLICY "Customers can view own order consents"
ON public.order_consents
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Staff/Admins can inspect all order consents for statutory proof
DROP POLICY IF EXISTS "Admins can view all order consents" ON public.order_consents;
CREATE POLICY "Admins can view all order consents"
ON public.order_consents
FOR SELECT
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('admin', 'super_admin', 'order_manager')
    )
);

-- Service role has full access
DROP POLICY IF EXISTS "Service role manages order consents" ON public.order_consents;
CREATE POLICY "Service role manages order consents"
ON public.order_consents
FOR ALL
TO service_role
USING (TRUE)
WITH CHECK (TRUE);

-- 5. Stored Procedure: record_order_consent_atomic
CREATE OR REPLACE FUNCTION public.record_order_consent_atomic(
    p_order_id UUID,
    p_user_id UUID,
    p_terms_accepted BOOLEAN,
    p_terms_version TEXT DEFAULT '2026.11-v1',
    p_privacy_version TEXT DEFAULT '2026.11-v1',
    p_shipping_version TEXT DEFAULT '2026.11-v1',
    p_returns_version TEXT DEFAULT '2026.11-v1',
    p_ip_address TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_consent_id UUID;
    v_consent_data JSONB;
BEGIN
    -- Strict server validation: terms must be affirmatively accepted
    IF p_terms_accepted IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'Statutory purchase consent is required.');
    END IF;

    -- Verify order exists and matches user
    SELECT id, user_id, order_status INTO v_order
    FROM public.orders
    WHERE id = p_order_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found.');
    END IF;

    IF v_order.user_id <> p_user_id THEN
        RETURN jsonb_build_object('success', false, 'error', 'Unauthorized: Order belongs to different user.');
    END IF;

    -- Build structured snapshot
    v_consent_data := jsonb_build_object(
        'terms_accepted', TRUE,
        'terms_version', COALESCE(p_terms_version, '2026.11-v1'),
        'privacy_version', COALESCE(p_privacy_version, '2026.11-v1'),
        'shipping_policy_version', COALESCE(p_shipping_version, '2026.11-v1'),
        'returns_policy_version', COALESCE(p_returns_version, '2026.11-v1'),
        'accepted_at', NOW(),
        'ip_address', p_ip_address,
        'user_agent', p_user_agent
    );

    -- Insert immutable audit record
    INSERT INTO public.order_consents (
        order_id,
        user_id,
        terms_accepted,
        terms_version,
        privacy_version,
        shipping_policy_version,
        returns_policy_version,
        ip_address,
        user_agent,
        accepted_at
    ) VALUES (
        p_order_id,
        p_user_id,
        TRUE,
        COALESCE(p_terms_version, '2026.11-v1'),
        COALESCE(p_privacy_version, '2026.11-v1'),
        COALESCE(p_shipping_version, '2026.11-v1'),
        COALESCE(p_returns_version, '2026.11-v1'),
        p_ip_address,
        p_user_agent,
        NOW()
    ) RETURNING id INTO v_consent_id;

    -- Update order with snapshot
    UPDATE public.orders
    SET consent_record = v_consent_data
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'consent_id', v_consent_id,
        'accepted_at', NOW()
    );
END;
$$;

-- Grant execution to authenticated users and service role
GRANT EXECUTE ON FUNCTION public.record_order_consent_atomic TO authenticated, service_role;
