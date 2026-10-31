-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 010 (Remediation)
-- Forward-Only Security Hardening, Identity Enforcement & Idempotent Policies
-- Migration: 20261031000004_security_and_idempotency_remediation.sql
-- ==============================================================================

-- 1. HARDEN CREATE_ORDER_ATOMIC (Enforce Caller Identity & Search Path Isolation)
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_user_id UUID,
    p_items JSONB,              -- Array of { "book_id": UUID, "quantity": INT, "price": NUMERIC }
    p_address_snapshot JSONB,
    p_payment_method TEXT,
    p_total_amount NUMERIC,
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_order_id UUID;
    v_item JSONB;
    v_book_id UUID;
    v_quantity INT;
    v_price NUMERIC;
    v_book_title TEXT;
    v_book_image TEXT;
    v_current_stock INT;
    v_is_active BOOLEAN;
BEGIN
    -- Strict caller identity validation: anonymous callers are rejected; non-service_role callers must match p_user_id
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot place orders.';
        END IF;
        IF auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity does not match order user ID.';
        END IF;
    END IF;

    -- 0. Check for existing idempotent order
    IF p_idempotency_key IS NOT NULL THEN
        SELECT id INTO v_order_id
        FROM public.orders
        WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

        IF FOUND THEN
            -- Idempotent hit: return the already created order ID without re-executing stock decrements
            RETURN v_order_id;
        END IF;
    END IF;

    -- Validate payment method
    IF p_payment_method NOT IN ('COD', 'ONLINE') THEN
        RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
    END IF;

    -- Validate items array
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order items cannot be empty';
    END IF;

    -- Create Order record with idempotency_key (wrapped in sub-block to handle concurrent race conditions)
    BEGIN
        INSERT INTO public.orders (
            user_id,
            total_amount,
            payment_method,
            payment_status,
            order_status,
            address_snapshot,
            is_paid,
            idempotency_key
        ) VALUES (
            p_user_id,
            p_total_amount,
            p_payment_method,
            'Pending',
            'Pending',
            p_address_snapshot,
            FALSE,
            p_idempotency_key
        ) RETURNING id INTO v_order_id;
    EXCEPTION WHEN unique_violation THEN
        IF p_idempotency_key IS NOT NULL THEN
            SELECT id INTO v_order_id
            FROM public.orders
            WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;

            IF FOUND THEN
                RETURN v_order_id;
            END IF;
        END IF;
        RAISE;
    END;

    -- Process each item atomically with row lock
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_book_id := (v_item->>'book_id')::UUID;
        v_quantity := (v_item->>'quantity')::INT;
        v_price := (v_item->>'price')::NUMERIC;

        IF v_quantity < 1 THEN
            RAISE EXCEPTION 'Item quantity must be at least 1 for book %', v_book_id;
        END IF;

        -- Lock book row for update
        SELECT title, image_url, stock, is_active
        INTO v_book_title, v_book_image, v_current_stock, v_is_active
        FROM public.books
        WHERE id = v_book_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Book % not found', v_book_id;
        END IF;

        IF NOT v_is_active THEN
            RAISE EXCEPTION 'Book "%" is currently inactive', v_book_title;
        END IF;

        IF v_current_stock < v_quantity THEN
            RAISE EXCEPTION 'Insufficient stock for "%" (Requested: %, Available: %)',
                v_book_title, v_quantity, v_current_stock;
        END IF;

        -- Decrement stock
        UPDATE public.books
        SET stock = stock - v_quantity
        WHERE id = v_book_id;

        -- Insert order item snapshot
        INSERT INTO public.order_items (
            order_id,
            book_id,
            title,
            price,
            quantity,
            image_url
        ) VALUES (
            v_order_id,
            v_book_id,
            v_book_title,
            v_price,
            v_quantity,
            v_book_image
        );
    END LOOP;

    -- Clear user's active cart upon successful order placement
    DELETE FROM public.cart_items
    WHERE cart_id IN (SELECT id FROM public.carts WHERE user_id = p_user_id);

    RETURN v_order_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC, TEXT) TO authenticated, service_role;


-- 2. HARDEN MERGE_CART_ATOMIC (Enforce Caller Identity & Search Path Isolation)
CREATE OR REPLACE FUNCTION public.merge_cart_atomic(
    p_user_id UUID,
    p_guest_items JSONB,              -- Array of { "book_id": UUID, "quantity": INT }
    p_merge_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cart_id UUID;
    v_guest_item JSONB;
    v_book_id UUID;
    v_quantity INT;
    v_book RECORD;
    v_effective_price NUMERIC(10, 2);
    v_existing_item RECORD;
    v_combined_qty INT;
    v_last_token TEXT;
    v_merged_count INT := 0;
BEGIN
    -- Strict caller identity validation: anonymous callers are rejected; non-service_role callers must match p_user_id
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot merge user carts.';
        END IF;
        IF auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity does not match target cart user ID.';
        END IF;
    END IF;

    -- 1. Ensure user cart exists
    SELECT id INTO v_cart_id
    FROM public.carts
    WHERE user_id = p_user_id;

    IF NOT FOUND THEN
        INSERT INTO public.carts (user_id)
        VALUES (p_user_id)
        RETURNING id INTO v_cart_id;
    END IF;

    -- 2. Check merge token idempotency if provided
    IF p_merge_token IS NOT NULL THEN
        SELECT last_merge_token INTO v_last_token
        FROM public.carts
        WHERE id = v_cart_id;

        IF v_last_token IS NOT NULL AND v_last_token = p_merge_token THEN
            RETURN jsonb_build_object(
                'success', true,
                'cart_id', v_cart_id,
                'message', 'Cart already merged with this token (idempotent submission)',
                'merged_count', 0
            );
        END IF;
    END IF;

    -- 3. If guest items is empty, return success immediately
    IF p_guest_items IS NULL OR jsonb_array_length(p_guest_items) = 0 THEN
        RETURN jsonb_build_object(
            'success', true,
            'cart_id', v_cart_id,
            'message', 'No guest items to merge',
            'merged_count', 0
        );
    END IF;

    -- 4. Process each guest item inside the atomic transaction
    FOR v_guest_item IN SELECT * FROM jsonb_array_elements(p_guest_items)
    LOOP
        v_book_id := (v_guest_item->>'book_id')::UUID;
        v_quantity := COALESCE((v_guest_item->>'quantity')::INT, 1);

        IF v_quantity < 1 THEN
            v_quantity := 1;
        END IF;

        -- Validate book exists, active, and has stock
        SELECT id, price, discount, stock, is_active
        INTO v_book
        FROM public.books
        WHERE id = v_book_id
        FOR SHARE;

        -- Skip books that are inactive, out of stock, or not found in catalog
        IF NOT FOUND OR NOT v_book.is_active OR v_book.stock <= 0 THEN
            CONTINUE;
        END IF;

        -- Calculate authoritative effective price from database
        IF v_book.discount > 0 THEN
            v_effective_price := ROUND(v_book.price * (1.0 - v_book.discount / 100.0), 2);
        ELSE
            v_effective_price := v_book.price;
        END IF;

        -- Check if item already exists in customer's cart
        SELECT id, quantity INTO v_existing_item
        FROM public.cart_items
        WHERE cart_id = v_cart_id AND book_id = v_book_id;

        IF FOUND THEN
            -- Combine quantities and cap at min(5, stock)
            v_combined_qty := LEAST(v_existing_item.quantity + v_quantity, LEAST(5, v_book.stock));
            UPDATE public.cart_items
            SET quantity = v_combined_qty,
                price = v_effective_price,
                updated_at = NOW()
            WHERE id = v_existing_item.id;
        ELSE
            -- Insert new item capped at min(5, stock)
            v_combined_qty := LEAST(v_quantity, LEAST(5, v_book.stock));
            IF v_combined_qty > 0 THEN
                INSERT INTO public.cart_items (
                    cart_id,
                    book_id,
                    quantity,
                    price
                ) VALUES (
                    v_cart_id,
                    v_book_id,
                    v_combined_qty,
                    v_effective_price
                );
            END IF;
        END IF;

        v_merged_count := v_merged_count + 1;
    END LOOP;

    -- 5. Record the merge token on the cart for retry idempotency
    IF p_merge_token IS NOT NULL THEN
        UPDATE public.carts
        SET last_merge_token = p_merge_token,
            updated_at = NOW()
        WHERE id = v_cart_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'cart_id', v_cart_id,
        'message', 'Cart merged atomically',
        'merged_count', v_merged_count
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.merge_cart_atomic(UUID, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_cart_atomic(UUID, JSONB, TEXT) TO authenticated, service_role;


-- 3. HARDEN ADJUST_INVENTORY_ATOMIC (Fix auth.uid() IS NULL Bypass)
CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
    p_book_id UUID,
    p_admin_id UUID,
    p_type TEXT,            -- 'INCREASE', 'DECREASE', 'SET'
    p_quantity INTEGER,
    p_reason TEXT
)
RETURNS JSONB AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_prev_stock INTEGER;
    v_new_stock INTEGER;
    v_qty_change INTEGER;
    v_book_title TEXT;
BEGIN
    -- Strict caller identity validation: anonymous callers are rejected; non-service_role callers must match p_admin_id
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot adjust inventory.';
        END IF;
        IF auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
        END IF;
    END IF;

    -- Validate administrator credentials in database
    SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
    INTO v_is_admin
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Administrative role required to adjust inventory.';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_inventory_atomic(UUID, UUID, TEXT, INTEGER, TEXT) TO authenticated, service_role;


-- 4. HARDEN MODERATE_REVIEW_ATOMIC (Fix auth.uid() IS NULL Bypass)
CREATE OR REPLACE FUNCTION public.moderate_review_atomic(
    p_review_id UUID,
    p_admin_id UUID,
    p_status TEXT           -- 'approved', 'rejected', 'hidden', 'pending'
)
RETURNS JSONB AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_old_status TEXT;
    v_book_id UUID;
BEGIN
    -- Strict caller identity validation
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot moderate reviews.';
        END IF;
        IF auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
        END IF;
    END IF;

    -- Validate administrator credentials
    SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
    INTO v_is_admin
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Administrative role required to moderate reviews.';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.moderate_review_atomic(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.moderate_review_atomic(UUID, UUID, TEXT) TO authenticated, service_role;


-- 5. HARDEN UPDATE_CUSTOMER_STATUS (Fix auth.uid() IS NULL Bypass)
CREATE OR REPLACE FUNCTION public.update_customer_status(
    p_customer_id UUID,
    p_admin_id UUID,
    p_action TEXT           -- 'BLOCK', 'UNBLOCK', 'SOFT_DELETE', 'RESTORE'
)
RETURNS JSONB AS $$
DECLARE
    v_is_admin BOOLEAN;
    v_customer RECORD;
BEGIN
    -- Strict caller identity validation
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot modify customer status.';
        END IF;
        IF auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
        END IF;
    END IF;

    -- Validate administrator credentials
    SELECT (role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE)
    INTO v_is_admin
    FROM public.profiles
    WHERE id = p_admin_id;

    IF v_is_admin IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Administrative role required to modify customer status.';
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_customer_status(UUID, UUID, TEXT) TO authenticated, service_role;


-- 6. HARDEN CANCEL_ORDER_ATOMIC (Revoke anon privileges and isolate search_path)
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
    -- Strict caller identity validation: anonymous callers are rejected; non-service_role callers must match p_user_id
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot cancel orders.';
        END IF;
        IF auth.uid() <> p_user_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity does not match specified user ID.';
        END IF;
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
    IF v_order_status IN ('Delivered', 'Cancelled', 'Returned') OR v_order_status LIKE 'Replacement%' THEN
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

REVOKE EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) TO authenticated, service_role;


-- 7. RE-APPLY IDEMPOTENT RLS POLICIES FOR CATEGORIES, INVENTORY, REVIEWS, DISCOUNTS
-- Prepend DROP POLICY IF EXISTS to guarantee safe, repeatable execution

-- Categories
DROP POLICY IF EXISTS "categories_select_public" ON public.categories;
CREATE POLICY "categories_select_public" ON public.categories
    FOR SELECT TO public
    USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "categories_admin_all" ON public.categories;
CREATE POLICY "categories_admin_all" ON public.categories
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Inventory Adjustments
DROP POLICY IF EXISTS "inventory_adjustments_select_admin" ON public.inventory_adjustments;
CREATE POLICY "inventory_adjustments_select_admin" ON public.inventory_adjustments
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- Reviews
DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
CREATE POLICY "reviews_select_public" ON public.reviews
    FOR SELECT TO public
    USING (status = 'approved' OR auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "reviews_insert_authenticated" ON public.reviews;
CREATE POLICY "reviews_insert_authenticated" ON public.reviews
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id AND public.is_active_user());

DROP POLICY IF EXISTS "reviews_admin_all" ON public.reviews;
CREATE POLICY "reviews_admin_all" ON public.reviews
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Discounts
DROP POLICY IF EXISTS "discounts_select_active" ON public.discounts;
CREATE POLICY "discounts_select_active" ON public.discounts
    FOR SELECT TO authenticated
    USING (is_active = TRUE OR public.is_admin());

DROP POLICY IF EXISTS "discounts_admin_all" ON public.discounts;
CREATE POLICY "discounts_admin_all" ON public.discounts
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

