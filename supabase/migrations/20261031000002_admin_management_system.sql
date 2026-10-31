-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 005 (Phase 02)
-- Admin Management System Schema & Atomic Procedures
-- ==============================================================================

-- ==============================================================================
-- 1. CATEGORIES TABLE
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE CHECK (char_length(trim(name)) > 0),
    slug TEXT NOT NULL UNIQUE CHECK (char_length(trim(slug)) > 0),
    description TEXT DEFAULT '',
    image_url TEXT DEFAULT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_categories_slug ON public.categories(slug);
CREATE INDEX IF NOT EXISTS idx_categories_is_active ON public.categories(is_active);
CREATE INDEX IF NOT EXISTS idx_categories_display_order ON public.categories(display_order);

-- Automatic updated_at trigger for categories
DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Seed initial default categories if empty
INSERT INTO public.categories (name, slug, description, display_order)
VALUES
    ('Quran', 'quran', 'Holy Quran translations, tafseer, and recitation guides', 1),
    ('Hadith', 'hadith', 'Prophetic traditions, Sahih collections, and commentaries', 2),
    ('Fiqh', 'fiqh', 'Islamic jurisprudence, rulings, and practical guides', 3),
    ('History', 'history', 'Islamic history, classical civilizations, and heritage', 4),
    ('Biography', 'biography', 'Seerah of the Prophet and biographies of the Companions and scholars', 5),
    ('Other', 'other', 'Contemporary Islamic literature, ethics, and spirituality', 6)
ON CONFLICT (name) DO NOTHING;

-- RLS for Categories
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "categories_select_public" ON public.categories
    FOR SELECT TO public
    USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "categories_admin_all" ON public.categories
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());


-- ==============================================================================
-- 2. INVENTORY ADJUSTMENTS & ATOMIC ADJUSTMENT RPC
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.inventory_adjustments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    adjustment_type TEXT NOT NULL CHECK (adjustment_type IN ('INCREASE', 'DECREASE', 'SET')),
    quantity_change INTEGER NOT NULL,
    previous_stock INTEGER NOT NULL CHECK (previous_stock >= 0),
    new_stock INTEGER NOT NULL CHECK (new_stock >= 0),
    reason TEXT NOT NULL CHECK (char_length(trim(reason)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_book_id ON public.inventory_adjustments(book_id);
CREATE INDEX IF NOT EXISTS idx_inventory_adjustments_created_at ON public.inventory_adjustments(created_at DESC);

ALTER TABLE public.inventory_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inventory_adjustments_select_admin" ON public.inventory_adjustments
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- Atomic Inventory Adjustment RPC
CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
    p_book_id UUID,
    p_admin_id UUID,
    p_type TEXT,
    p_quantity INTEGER,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_prev_stock INTEGER;
    v_new_stock INTEGER;
    v_qty_change INTEGER;
    v_book_title TEXT;
    v_is_admin BOOLEAN;
BEGIN
    -- Verify administrator authorization
    SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
    INTO v_is_admin
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Administrative role required to adjust inventory.';
    END IF;

    -- Caller identity verification (prevent privilege spoofing via RPC)
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_id THEN
        RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
    END IF;

    -- Validate adjustment parameters
    IF p_quantity < 0 THEN
        RAISE EXCEPTION 'Adjustment quantity cannot be negative.';
    END IF;

    IF char_length(trim(COALESCE(p_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'A valid adjustment reason is required.';
    END IF;

    -- Lock book row for update
    SELECT stock, title INTO v_prev_stock, v_book_title
    FROM public.books
    WHERE id = p_book_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Book with ID % not found.', p_book_id;
    END IF;

    -- Calculate new stock
    IF p_type = 'INCREASE' THEN
        v_qty_change := p_quantity;
        v_new_stock := v_prev_stock + p_quantity;
    ELSIF p_type = 'DECREASE' THEN
        IF p_quantity > v_prev_stock THEN
            RAISE EXCEPTION 'Cannot decrease stock by %: only % available.', p_quantity, v_prev_stock;
        END IF;
        v_qty_change := -p_quantity;
        v_new_stock := v_prev_stock - p_quantity;
    ELSIF p_type = 'SET' THEN
        v_qty_change := p_quantity - v_prev_stock;
        v_new_stock := p_quantity;
    ELSE
        RAISE EXCEPTION 'Invalid adjustment type: %. Allowed: INCREASE, DECREASE, SET.', p_type;
    END IF;

    -- Apply new stock
    UPDATE public.books
    SET stock = v_new_stock,
        updated_at = NOW()
    WHERE id = p_book_id;

    -- Log to inventory adjustments table
    INSERT INTO public.inventory_adjustments (
        book_id,
        admin_id,
        adjustment_type,
        quantity_change,
        previous_stock,
        new_stock,
        reason,
        created_at
    ) VALUES (
        p_book_id,
        p_admin_id,
        p_type,
        v_qty_change,
        v_prev_stock,
        v_new_stock,
        trim(p_reason),
        NOW()
    );

    -- Log to audit_logs
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
        'UPDATE',
        'inventory',
        p_book_id::text,
        jsonb_build_object('stock', v_prev_stock),
        jsonb_build_object('stock', v_new_stock),
        jsonb_build_object(
            'book_title', v_book_title,
            'type', p_type,
            'quantity_change', v_qty_change,
            'reason', trim(p_reason)
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'book_id', p_book_id,
        'previous_stock', v_prev_stock,
        'new_stock', v_new_stock,
        'quantity_change', v_qty_change
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ==============================================================================
-- 3. REVIEWS & RATINGS TABLE & MODERATION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title TEXT NOT NULL CHECK (char_length(trim(title)) > 0),
    comment TEXT NOT NULL CHECK (char_length(trim(comment)) > 0),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'hidden')),
    moderated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_book_id ON public.reviews(book_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON public.reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON public.reviews(status);

DROP TRIGGER IF EXISTS trg_reviews_updated_at ON public.reviews;
CREATE TRIGGER trg_reviews_updated_at BEFORE UPDATE ON public.reviews
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reviews_select_public" ON public.reviews
    FOR SELECT TO public
    USING (status = 'approved' OR (auth.uid() = user_id) OR public.is_admin());

CREATE POLICY "reviews_insert_authenticated" ON public.reviews
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "reviews_admin_all" ON public.reviews
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Atomic Review Moderation RPC
CREATE OR REPLACE FUNCTION public.moderate_review_atomic(
    p_review_id UUID,
    p_admin_id UUID,
    p_status TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_old_status TEXT;
    v_book_id UUID;
BEGIN
    SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
    INTO v_is_admin
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Administrative role required to moderate reviews.';
    END IF;

    -- Caller identity verification (prevent privilege spoofing via RPC)
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_id THEN
        RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
    END IF;

    IF p_status NOT IN ('approved', 'rejected', 'hidden', 'pending') THEN
        RAISE EXCEPTION 'Invalid review status: %. Allowed: approved, rejected, hidden, pending.', p_status;
    END IF;

    SELECT status, book_id INTO v_old_status, v_book_id
    FROM public.reviews
    WHERE id = p_review_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Review with ID % not found.', p_review_id;
    END IF;

    UPDATE public.reviews
    SET status = p_status,
        moderated_by = p_admin_id,
        moderated_at = NOW(),
        updated_at = NOW()
    WHERE id = p_review_id;

    -- Audit log
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
        'UPDATE',
        'reviews',
        p_review_id::text,
        jsonb_build_object('status', v_old_status),
        jsonb_build_object('status', p_status),
        jsonb_build_object('book_id', v_book_id::text, 'moderated_by', p_admin_id::text),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'review_id', p_review_id,
        'old_status', v_old_status,
        'new_status', p_status
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- ==============================================================================
-- 4. DISCOUNTS & PROMOTIONS (COUPONS) TABLE & VALIDATION
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.discounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE CHECK (char_length(trim(code)) > 0),
    discount_type TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10, 2) NOT NULL CHECK (discount_value > 0),
    min_order_amount NUMERIC(10, 2) NOT NULL DEFAULT 0 CHECK (min_order_amount >= 0),
    max_discount_amount NUMERIC(10, 2) DEFAULT NULL CHECK (max_discount_amount IS NULL OR max_discount_amount > 0),
    usage_limit INTEGER DEFAULT NULL CHECK (usage_limit IS NULL OR usage_limit > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    valid_until TIMESTAMPTZ DEFAULT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_discounts_code ON public.discounts(code);
CREATE INDEX IF NOT EXISTS idx_discounts_is_active ON public.discounts(is_active);

DROP TRIGGER IF EXISTS trg_discounts_updated_at ON public.discounts;
CREATE TRIGGER trg_discounts_updated_at BEFORE UPDATE ON public.discounts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.discounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "discounts_select_active" ON public.discounts
    FOR SELECT TO authenticated
    USING (is_active = TRUE OR public.is_admin());

CREATE POLICY "discounts_admin_all" ON public.discounts
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Coupon Validation RPC
CREATE OR REPLACE FUNCTION public.validate_discount_coupon(
    p_code TEXT,
    p_subtotal NUMERIC
)
RETURNS JSONB AS $$
DECLARE
    v_discount RECORD;
    v_calc_discount NUMERIC;
BEGIN
    SELECT * INTO v_discount
    FROM public.discounts
    WHERE UPPER(code) = UPPER(trim(p_code));

    IF NOT FOUND THEN
        RETURN jsonb_build_object('valid', false, 'error', 'Invalid discount coupon code.');
    END IF;

    IF NOT v_discount.is_active THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon is no longer active.');
    END IF;

    IF v_discount.valid_from > NOW() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon has not started yet.');
    END IF;

    IF v_discount.valid_until IS NOT NULL AND v_discount.valid_until < NOW() THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon has expired.');
    END IF;

    IF v_discount.usage_limit IS NOT NULL AND v_discount.used_count >= v_discount.usage_limit THEN
        RETURN jsonb_build_object('valid', false, 'error', 'This coupon has reached its maximum usage limit.');
    END IF;

    IF p_subtotal < v_discount.min_order_amount THEN
        RETURN jsonb_build_object(
            'valid', false,
            'error', 'Minimum order amount for this coupon is ₹' || v_discount.min_order_amount
        );
    END IF;

    -- Calculate discount amount
    IF v_discount.discount_type = 'percentage' THEN
        v_calc_discount := ROUND((p_subtotal * (v_discount.discount_value / 100.0)), 2);
        IF v_discount.max_discount_amount IS NOT NULL AND v_calc_discount > v_discount.max_discount_amount THEN
            v_calc_discount := v_discount.max_discount_amount;
        END IF;
    ELSE
        v_calc_discount := LEAST(v_discount.discount_value, p_subtotal);
    END IF;

    RETURN jsonb_build_object(
        'valid', true,
        'discount_id', v_discount.id,
        'code', v_discount.code,
        'discount_type', v_discount.discount_type,
        'discount_value', v_discount.discount_value,
        'calculated_discount', v_calc_discount
    );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;


-- ==============================================================================
-- 5. CUSTOMER STATUS MANAGEMENT RPC (BLOCK / UNBLOCK / SOFT-DELETE)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.update_customer_status(
    p_customer_id UUID,
    p_admin_id UUID,
    p_action TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_customer RECORD;
BEGIN
    SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
    INTO v_is_admin
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Administrative role required to modify customer status.';
    END IF;

    -- Caller identity verification (prevent privilege spoofing via RPC)
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_admin_id THEN
        RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
    END IF;

    -- Prevent self-modification
    IF p_customer_id = p_admin_id THEN
        RAISE EXCEPTION 'Safety invariant: Administrators cannot modify their own active account status.';
    END IF;

    SELECT * INTO v_customer
    FROM public.profiles
    WHERE id = p_customer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Customer with ID % not found.', p_customer_id;
    END IF;

    IF p_action = 'BLOCK' THEN
        UPDATE public.profiles
        SET is_blocked = TRUE, updated_at = NOW()
        WHERE id = p_customer_id;
    ELSIF p_action = 'UNBLOCK' THEN
        UPDATE public.profiles
        SET is_blocked = FALSE, updated_at = NOW()
        WHERE id = p_customer_id;
    ELSIF p_action = 'SOFT_DELETE' THEN
        UPDATE public.profiles
        SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW()
        WHERE id = p_customer_id;
    ELSIF p_action = 'RESTORE' THEN
        UPDATE public.profiles
        SET is_deleted = FALSE, deleted_at = NULL, updated_at = NOW()
        WHERE id = p_customer_id;
    ELSE
        RAISE EXCEPTION 'Invalid action: %. Allowed: BLOCK, UNBLOCK, SOFT_DELETE, RESTORE.', p_action;
    END IF;

    -- Audit log
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
        CASE WHEN p_action = 'SOFT_DELETE' THEN 'SOFT_DELETE'
             WHEN p_action = 'RESTORE' THEN 'RESTORE'
             ELSE 'UPDATE' END,
        'profiles',
        p_customer_id::text,
        jsonb_build_object('is_blocked', v_customer.is_blocked, 'is_deleted', v_customer.is_deleted),
        jsonb_build_object(
            'is_blocked', CASE WHEN p_action = 'BLOCK' THEN true WHEN p_action = 'UNBLOCK' THEN false ELSE v_customer.is_blocked END,
            'is_deleted', CASE WHEN p_action = 'SOFT_DELETE' THEN true WHEN p_action = 'RESTORE' THEN false ELSE v_customer.is_deleted END
        ),
        jsonb_build_object('action', p_action, 'modified_by', p_admin_id::text),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'customer_id', p_customer_id,
        'action', p_action
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 6. HARDEN CANCEL_ORDER_ATOMIC WITH SEARCH_PATH, AUDIT LOGGING & RBAC ENFORCEMENT
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.cancel_order_atomic(
    p_order_id UUID,
    p_user_id UUID,
    p_cancel_reason TEXT,
    p_is_admin BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN AS $$
DECLARE
    v_order_status TEXT;
    v_order_user_id UUID;
    v_actual_is_admin BOOLEAN := FALSE;
    v_item RECORD;
BEGIN
    -- Verify caller identity if auth.uid() is present (prevent user spoofing)
    IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
        RAISE EXCEPTION 'Security violation: Caller identity does not match specified user ID.';
    END IF;

    -- Validate admin claim against actual database role
    IF p_is_admin THEN
        SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
        INTO v_actual_is_admin
        FROM public.profiles
        WHERE id = p_user_id;

        IF v_actual_is_admin IS NOT TRUE THEN
            RAISE EXCEPTION 'Unauthorized: Administrative role required to cancel arbitrary orders.';
        END IF;
    END IF;

    -- Fetch and lock order
    SELECT order_status, user_id INTO v_order_status, v_order_user_id
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- Authorization check (User can only cancel own order, verified Admin can cancel any)
    IF NOT v_actual_is_admin AND v_order_user_id <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to cancel order %', p_order_id;
    END IF;

    -- Invariant check based on ORDER_STATUS_TRANSITIONS: only pre-delivery orders can be cancelled
    IF v_order_status IN ('Delivered', 'Cancelled', 'Returned') THEN
        RAISE EXCEPTION 'Order cannot be cancelled in % status', v_order_status;
    END IF;

    -- Restore stock for each item
    FOR v_item IN
        SELECT book_id, quantity FROM public.order_items WHERE order_id = p_order_id
    LOOP
        UPDATE public.books
        SET stock = stock + v_item.quantity
        WHERE id = v_item.book_id;
    END LOOP;

    -- Update order status
    UPDATE public.orders
    SET order_status = 'Cancelled',
        cancel_reason = COALESCE(p_cancel_reason, 'Cancelled by user'),
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Audit log
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
        'CANCEL',
        'orders',
        p_order_id::text,
        jsonb_build_object('order_status', v_order_status),
        jsonb_build_object('order_status', 'Cancelled'),
        jsonb_build_object('reason', COALESCE(p_cancel_reason, 'Cancelled by user'), 'is_admin', v_actual_is_admin),
        NOW()
    );

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop restrictive audit_logs action check constraint to allow descriptive admin action names
ALTER TABLE public.audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;

-- ==============================================================================
-- 7. SECURITY HARDENING: EXPLICIT RPC PERMISSIONS
-- ==============================================================================
REVOKE EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.moderate_review_atomic(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.moderate_review_atomic(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.validate_discount_coupon(TEXT, NUMERIC) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_discount_coupon(TEXT, NUMERIC) TO anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;
