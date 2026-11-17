-- ==============================================================================
-- PHASE 03 — ADMIN, ROLES & ORDER MANAGEMENT HARDENING
-- ==============================================================================
-- Objectives:
-- 1. Align PostgreSQL RLS & SECURITY DEFINER RPC authorization with the app's
--    granular staff-role permission matrix (super_admin, admin, order_manager,
--    warehouse_staff, support_staff, user).
-- 2. Eliminate implicit 'Delhivery' default on orders.shipping_courier and add
--    normalized public.shipments & public.shipment_events audit tables plus
--    explicit booking mode/status columns on public.orders.
-- 3. Restrict direct Shipped -> Cancelled and Out for Delivery -> Cancelled
--    transitions in validate_order_state_transitions() and cancel_order_atomic(),
--    allowing post-dispatch cancellation ONLY via cancel_dispatched_order_atomic()
--    with verified courier cancellation proof or explicitly authorized manual
--    courier confirmation.
-- 4. Add atomic RPCs for manual shipment entry and permission-checked status
--    updates, plus enrich order_status_history with actor/source metadata.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STAFF PERMISSION & AUTHORIZATION HELPER FUNCTIONS
-- ------------------------------------------------------------------------------

-- Strict Admin/Super Admin helper (retained as admin/super_admin only)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'admin')
          AND is_blocked = FALSE
          AND is_deleted = FALSE
    );
END;
$$;

-- Any active staff role helper
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'admin', 'order_manager', 'warehouse_staff', 'support_staff')
          AND is_blocked = FALSE
          AND is_deleted = FALSE
    );
END;
$$;

-- Canonical role -> permission mapper for PostgreSQL RLS and RPC enforcement
CREATE OR REPLACE FUNCTION public.role_has_staff_permission(
    p_role TEXT,
    p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
    IF p_role = 'super_admin' THEN
        RETURN p_permission IN (
            'dashboard.view',
            'orders.view',
            'orders.manage',
            'orders.cancel',
            'orders.cancel_dispatched',
            'orders.ship',
            'orders.refund',
            'orders.settle_cod',
            'orders.export',
            'customers.export',
            'reports.view',
            'returns.manage',
            'delivery.verify',
            'books.view',
            'books.manage',
            'inventory.view',
            'inventory.manage',
            'discounts.manage',
            'reviews.manage',
            'support.manage',
            'users.view',
            'users.manage',
            'users.manage_roles',
            'audit.view'
        );
    ELSIF p_role = 'admin' THEN
        RETURN p_permission IN (
            'dashboard.view',
            'orders.view',
            'orders.manage',
            'orders.cancel',
            'orders.cancel_dispatched',
            'orders.ship',
            'orders.refund',
            'orders.settle_cod',
            'orders.export',
            'customers.export',
            'reports.view',
            'returns.manage',
            'delivery.verify',
            'books.view',
            'books.manage',
            'inventory.view',
            'inventory.manage',
            'discounts.manage',
            'reviews.manage',
            'support.manage',
            'users.view',
            'users.manage',
            'audit.view'
        );
    ELSIF p_role = 'order_manager' THEN
        RETURN p_permission IN (
            'dashboard.view',
            'orders.view',
            'orders.manage',
            'orders.cancel',
            'orders.export',
            'returns.manage',
            'books.view',
            'inventory.view',
            'support.manage'
        );
    ELSIF p_role = 'warehouse_staff' THEN
        RETURN p_permission IN (
            'dashboard.view',
            'orders.view',
            'orders.manage',
            'orders.ship',
            'returns.manage',
            'delivery.verify',
            'inventory.view',
            'inventory.manage',
            'books.view'
        );
    ELSIF p_role = 'support_staff' THEN
        RETURN p_permission IN (
            'dashboard.view',
            'orders.view',
            'reviews.manage',
            'support.manage'
        );
    END IF;

    RETURN FALSE;
END;
$$;

-- Checks whether an explicit user ID has an active permission in profiles
CREATE OR REPLACE FUNCTION public.user_has_staff_permission(
    p_user_id UUID,
    p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_role TEXT;
BEGIN
    IF p_user_id IS NULL THEN
        RETURN FALSE;
    END IF;

    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = p_user_id
      AND is_blocked = FALSE
      AND is_deleted = FALSE;

    IF v_role IS NULL THEN
        RETURN FALSE;
    END IF;

    RETURN public.role_has_staff_permission(v_role, p_permission);
END;
$$;

-- Checks whether current auth.uid() has an active permission
CREATE OR REPLACE FUNCTION public.has_staff_permission(p_permission TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    RETURN public.user_has_staff_permission(auth.uid(), p_permission);
END;
$$;

CREATE OR REPLACE FUNCTION public.can_manage_orders()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_staff_permission('orders.manage');
$$;

CREATE OR REPLACE FUNCTION public.can_ship_orders()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_staff_permission('orders.ship');
$$;

CREATE OR REPLACE FUNCTION public.can_cancel_orders()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_staff_permission('orders.cancel');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_returns()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_staff_permission('returns.manage');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_inventory()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_staff_permission('inventory.manage');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_support()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_staff_permission('support.manage');
$$;

CREATE OR REPLACE FUNCTION public.can_manage_reviews()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
    SELECT public.has_staff_permission('reviews.manage');
$$;

REVOKE EXECUTE ON FUNCTION public.role_has_staff_permission(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.role_has_staff_permission(TEXT, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.user_has_staff_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_has_staff_permission(UUID, TEXT) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.has_staff_permission(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.has_staff_permission(TEXT) TO authenticated, service_role;

-- ------------------------------------------------------------------------------
-- 2. ALIGN RLS POLICIES ACROSS TABLES WITH STAFF PERMISSIONS
-- ------------------------------------------------------------------------------

-- Orders: all active staff can view orders; operational roles (order_manager, warehouse_staff, admin, super_admin)
-- can update orders; support_staff CANNOT mutate orders via RLS.
DROP POLICY IF EXISTS "orders_select_policy" ON public.orders;
CREATE POLICY "orders_select_policy" ON public.orders
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "orders_update_policy" ON public.orders;
CREATE POLICY "orders_update_policy" ON public.orders
    FOR UPDATE TO authenticated
    USING (public.can_manage_orders())
    WITH CHECK (public.can_manage_orders());

-- Order Items & Status History & Consents: active staff read access
DROP POLICY IF EXISTS "order_items_select_policy" ON public.order_items;
CREATE POLICY "order_items_select_policy" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        OR public.is_staff()
    );

DROP POLICY IF EXISTS "order_status_history_select_policy" ON public.order_status_history;
CREATE POLICY "order_status_history_select_policy" ON public.order_status_history
    FOR SELECT TO authenticated
    USING (
        order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        OR public.is_staff()
    );

DROP POLICY IF EXISTS "Admins can view all order consents" ON public.order_consents;
CREATE POLICY "Admins can view all order consents" ON public.order_consents
    FOR SELECT TO authenticated
    USING (public.is_staff());

-- Profiles: staff with orders.view / support need basic profile lookup while admin/super_admin manage profiles
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id OR public.is_staff());

-- Books & Categories & Variants & Inventory history: read for staff, write scoped properly
DROP POLICY IF EXISTS "books_select_public" ON public.books;
CREATE POLICY "books_select_public" ON public.books
    FOR SELECT TO public
    USING (is_active = TRUE OR public.is_staff());

DROP POLICY IF EXISTS "variants_admin_all" ON public.book_variants;
CREATE POLICY "variants_admin_all" ON public.book_variants
    FOR ALL TO authenticated
    USING (public.is_admin() OR public.can_manage_inventory())
    WITH CHECK (public.is_admin() OR public.can_manage_inventory());

DROP POLICY IF EXISTS "inventory_history_staff_read" ON public.inventory_history;
CREATE POLICY "inventory_history_staff_read" ON public.inventory_history
    FOR SELECT TO authenticated
    USING (public.is_admin() OR public.has_staff_permission('inventory.view'));

DROP POLICY IF EXISTS "inventory_adjustments_select_admin" ON public.inventory_adjustments;
CREATE POLICY "inventory_adjustments_select_admin" ON public.inventory_adjustments
    FOR SELECT TO authenticated
    USING (public.is_admin() OR public.has_staff_permission('inventory.view'));

-- Payments & Refunds & COD: staff can view operational billing info, but ONLY admins can write directly
DROP POLICY IF EXISTS "payments_select_policy" ON public.payments;
CREATE POLICY "payments_select_policy" ON public.payments
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_staff());

DROP POLICY IF EXISTS "refund_records_admin_all" ON public.refund_records;
CREATE POLICY "refund_records_staff_read" ON public.refund_records
    FOR SELECT TO authenticated
    USING (
        order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        OR public.is_staff()
    );
CREATE POLICY "refund_records_admin_write" ON public.refund_records
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cod_collections_admin" ON public.cod_collections;
CREATE POLICY "cod_collections_staff_read" ON public.cod_collections
    FOR SELECT TO authenticated
    USING (public.is_staff());
CREATE POLICY "cod_collections_admin_write" ON public.cod_collections
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cod_remittances_admin" ON public.cod_remittances;
CREATE POLICY "cod_remittances_staff_read" ON public.cod_remittances
    FOR SELECT TO authenticated
    USING (public.is_staff());
CREATE POLICY "cod_remittances_admin_write" ON public.cod_remittances
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Delivery OTPs & Verifications: warehouse_staff + admin manage verification
DROP POLICY IF EXISTS "delivery_otps_admin_all" ON public.delivery_otps;
CREATE POLICY "delivery_otps_staff_manage" ON public.delivery_otps
    FOR ALL TO authenticated
    USING (public.has_staff_permission('delivery.verify'))
    WITH CHECK (public.has_staff_permission('delivery.verify'));

DROP POLICY IF EXISTS "delivery_verifications_admin" ON public.delivery_verifications;
CREATE POLICY "delivery_verifications_admin" ON public.delivery_verifications
    FOR SELECT TO authenticated
    USING (public.is_staff());

-- Invoices: customers see own, staff can read, admins manage
DROP POLICY IF EXISTS "invoices_staff_read" ON public.invoices;
CREATE POLICY "invoices_staff_read" ON public.invoices
    FOR SELECT TO authenticated
    USING (public.is_staff());

-- Return Requests: order_manager / warehouse_staff / admin manage returns; support_staff has read-only view via returns_staff_read
DROP POLICY IF EXISTS "returns_admin_all" ON public.return_requests;
CREATE POLICY "returns_staff_read" ON public.return_requests
    FOR SELECT TO authenticated
    USING (public.is_staff());
CREATE POLICY "returns_manage_write" ON public.return_requests
    FOR ALL TO authenticated
    USING (public.can_manage_returns())
    WITH CHECK (public.can_manage_returns());

DROP POLICY IF EXISTS "return_items_admin_all" ON public.return_request_items;
CREATE POLICY "return_items_staff_read" ON public.return_request_items
    FOR SELECT TO authenticated
    USING (public.is_staff());
CREATE POLICY "return_items_manage_write" ON public.return_request_items
    FOR ALL TO authenticated
    USING (public.can_manage_returns())
    WITH CHECK (public.can_manage_returns());

-- Support Tickets & Messages: support_staff, order_manager, admin, super_admin
DROP POLICY IF EXISTS "tickets_admin_all" ON public.support_tickets;
CREATE POLICY "tickets_staff_manage" ON public.support_tickets
    FOR ALL TO authenticated
    USING (public.can_manage_support())
    WITH CHECK (public.can_manage_support());

DROP POLICY IF EXISTS "messages_admin_all" ON public.ticket_messages;
CREATE POLICY "messages_staff_manage" ON public.ticket_messages
    FOR ALL TO authenticated
    USING (public.can_manage_support())
    WITH CHECK (public.can_manage_support());

-- Reviews: admin, super_admin, support_staff
DROP POLICY IF EXISTS "reviews_select_public" ON public.reviews;
CREATE POLICY "reviews_select_public" ON public.reviews
    FOR SELECT TO authenticated
    USING (status = 'approved' OR auth.uid() = user_id OR public.is_staff());

DROP POLICY IF EXISTS "reviews_admin_all" ON public.reviews;
CREATE POLICY "reviews_admin_all" ON public.reviews
    FOR ALL TO authenticated
    USING (public.can_manage_reviews())
    WITH CHECK (public.can_manage_reviews());

-- ------------------------------------------------------------------------------
-- 3. UPGRADE EXISTING SECURITY DEFINER ADMIN RPCs FOR MULTI-ROLE CONSISTENCY
-- ------------------------------------------------------------------------------

-- Adjust inventory: allow super_admin, admin, and warehouse_staff
CREATE OR REPLACE FUNCTION public.adjust_inventory_atomic(
    p_book_id UUID,
    p_admin_id UUID,
    p_type TEXT,
    p_quantity INTEGER,
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_authorized BOOLEAN;
    v_prev_stock INTEGER;
    v_new_stock INTEGER;
    v_qty_change INTEGER;
    v_book_title TEXT;
BEGIN
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot adjust inventory.';
        END IF;
        IF auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
        END IF;
    END IF;

    v_authorized := public.user_has_staff_permission(p_admin_id, 'inventory.manage');
    IF v_authorized IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Inventory management permission required to adjust stock.';
    END IF;

    IF p_quantity < 0 THEN
        RAISE EXCEPTION 'Adjustment quantity cannot be negative.';
    END IF;

    IF char_length(trim(COALESCE(p_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'A valid adjustment reason is required.';
    END IF;

    SELECT stock, title INTO v_prev_stock, v_book_title
    FROM public.books
    WHERE id = p_book_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Book with ID % not found.', p_book_id;
    END IF;

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

    UPDATE public.books
    SET stock = v_new_stock,
        updated_at = NOW()
    WHERE id = p_book_id;

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
$$;

-- Moderate review: allow super_admin, admin, and support_staff
CREATE OR REPLACE FUNCTION public.moderate_review_atomic(
    p_review_id UUID,
    p_admin_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_authorized BOOLEAN;
    v_old_status TEXT;
    v_book_id UUID;
BEGIN
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot moderate reviews.';
        END IF;
        IF auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
        END IF;
    END IF;

    v_authorized := public.user_has_staff_permission(p_admin_id, 'reviews.manage');
    IF v_authorized IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Review moderation permission required.';
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
$$;

-- Customer account status: allow super_admin and admin
CREATE OR REPLACE FUNCTION public.update_customer_status(
    p_customer_id UUID,
    p_admin_id UUID,
    p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_authorized BOOLEAN;
    v_customer RECORD;
BEGIN
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot modify customer status.';
        END IF;
        IF auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
        END IF;
    END IF;

    v_authorized := public.user_has_staff_permission(p_admin_id, 'users.manage');
    IF v_authorized IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Administrative user management permission required.';
    END IF;

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
        UPDATE public.profiles SET is_blocked = TRUE, updated_at = NOW() WHERE id = p_customer_id;
    ELSIF p_action = 'UNBLOCK' THEN
        UPDATE public.profiles SET is_blocked = FALSE, updated_at = NOW() WHERE id = p_customer_id;
    ELSIF p_action = 'SOFT_DELETE' THEN
        UPDATE public.profiles SET is_deleted = TRUE, deleted_at = NOW(), updated_at = NOW() WHERE id = p_customer_id;
    ELSIF p_action = 'RESTORE' THEN
        UPDATE public.profiles SET is_deleted = FALSE, deleted_at = NULL, updated_at = NOW() WHERE id = p_customer_id;
    ELSE
        RAISE EXCEPTION 'Invalid action: %. Allowed: BLOCK, UNBLOCK, SOFT_DELETE, RESTORE.', p_action;
    END IF;

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
$$;

-- ------------------------------------------------------------------------------
-- 4. FIX ORDERS SHIPPING DEFAULTS, BOOKING METADATA & SHIPMENT TABLES (TASK B & C)
-- ------------------------------------------------------------------------------

-- Remove hardcoded 'Delhivery' default so newly created orders have NULL shipping_courier
ALTER TABLE public.orders
    ALTER COLUMN shipping_courier DROP NOT NULL;

ALTER TABLE public.orders
    ALTER COLUMN shipping_courier SET DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS shipping_booking_mode TEXT DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS shipping_booking_status TEXT NOT NULL DEFAULT 'unbooked';

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS shipping_last_error TEXT DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS shipping_cancelled_at TIMESTAMPTZ DEFAULT NULL;

ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS shipping_provider_response JSONB DEFAULT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_shipping_booking_mode_check'
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_shipping_booking_mode_check
            CHECK (shipping_booking_mode IS NULL OR shipping_booking_mode IN ('delhivery', 'manual'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_shipping_booking_status_check'
    ) THEN
        ALTER TABLE public.orders
            ADD CONSTRAINT orders_shipping_booking_status_check
            CHECK (
                shipping_booking_status IN (
                    'unbooked',
                    'booking_in_progress',
                    'booked',
                    'manual_entered',
                    'booking_failed',
                    'booking_uncertain',
                    'cancelled'
                )
            );
    END IF;
END $$;

-- Clean up existing unshipped orders that inherited DEFAULT 'Delhivery' despite never being shipped
UPDATE public.orders
SET shipping_courier = NULL
WHERE shipping_courier = 'Delhivery'
  AND shipping_awb IS NULL
  AND shipping_shipped_at IS NULL
  AND order_status IN ('Pending', 'Confirmed', 'Processing', 'Packed', 'Cancelled');

-- Backfill mode/status on already-dispatched historical orders cleanly
UPDATE public.orders
SET
    shipping_booking_mode = CASE
        WHEN shipping_tracking_url ILIKE '%delhivery.com%' OR COALESCE(shipping_courier, '') ILIKE 'delhivery'
            THEN 'delhivery'
        ELSE 'manual'
    END,
    shipping_booking_status = CASE
        WHEN order_status = 'Cancelled' THEN 'cancelled'
        WHEN shipping_tracking_url ILIKE '%delhivery.com%' OR COALESCE(shipping_courier, '') ILIKE 'delhivery'
            THEN 'booked'
        ELSE 'manual_entered'
    END
WHERE (shipping_awb IS NOT NULL OR order_status IN ('Shipped', 'Out for Delivery', 'Delivered', 'Returned'))
  AND shipping_booking_mode IS NULL;

-- Dedicated normalized public.shipments table
CREATE TABLE IF NOT EXISTS public.shipments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    booking_mode TEXT NOT NULL CHECK (booking_mode IN ('delhivery', 'manual')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'booked',
            'dispatched',
            'in_transit',
            'out_for_delivery',
            'delivered',
            'returned',
            'cancelled',
            'failed',
            'uncertain'
        )
    ),
    carrier_name TEXT NOT NULL,
    awb TEXT DEFAULT NULL,
    tracking_url TEXT DEFAULT NULL,
    pickup_request_id TEXT DEFAULT NULL,
    pickup_scheduled_at TIMESTAMPTZ DEFAULT NULL,
    label_url TEXT DEFAULT NULL,
    provider_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
    failure_reason TEXT DEFAULT NULL,
    booked_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    booked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    shipped_at TIMESTAMPTZ DEFAULT NULL,
    delivered_at TIMESTAMPTZ DEFAULT NULL,
    cancelled_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ DEFAULT NULL,
    cancel_reason TEXT DEFAULT NULL,
    cancel_provider_response JSONB DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipments_order_id ON public.shipments(order_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_active_order
    ON public.shipments(order_id)
    WHERE status NOT IN ('cancelled', 'failed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_shipments_active_awb
    ON public.shipments(awb)
    WHERE awb IS NOT NULL AND status <> 'cancelled';

ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipments_select_policy" ON public.shipments;
CREATE POLICY "shipments_select_policy" ON public.shipments
    FOR SELECT TO authenticated
    USING (
        order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        OR public.is_staff()
    );

DROP POLICY IF EXISTS "shipments_manage_policy" ON public.shipments;
CREATE POLICY "shipments_manage_policy" ON public.shipments
    FOR ALL TO authenticated
    USING (public.can_ship_orders())
    WITH CHECK (public.can_ship_orders());

-- Immutable shipment & courier lifecycle events log
CREATE TABLE IF NOT EXISTS public.shipment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shipment_id UUID REFERENCES public.shipments(id) ON DELETE CASCADE,
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    source TEXT NOT NULL,
    previous_status TEXT DEFAULT NULL,
    new_status TEXT DEFAULT NULL,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_role TEXT DEFAULT NULL,
    carrier_name TEXT DEFAULT NULL,
    awb TEXT DEFAULT NULL,
    note TEXT NOT NULL DEFAULT '',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_shipment_events_order_id ON public.shipment_events(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shipment_events_shipment_id ON public.shipment_events(shipment_id, created_at DESC);

ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shipment_events_select_policy" ON public.shipment_events;
CREATE POLICY "shipment_events_select_policy" ON public.shipment_events
    FOR SELECT TO authenticated
    USING (
        order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        OR public.is_staff()
    );

DROP POLICY IF EXISTS "shipment_events_insert_staff" ON public.shipment_events;
CREATE POLICY "shipment_events_insert_staff" ON public.shipment_events
    FOR INSERT TO authenticated
    WITH CHECK (public.can_manage_orders());

-- Enhance order_status_history with transition & actor context
ALTER TABLE public.order_status_history
    ADD COLUMN IF NOT EXISTS previous_status TEXT DEFAULT NULL;

ALTER TABLE public.order_status_history
    ADD COLUMN IF NOT EXISTS changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.order_status_history
    ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.record_order_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_actor UUID;
    v_source TEXT;
BEGIN
    BEGIN
        v_actor := COALESCE(
            NULLIF(current_setting('app.actor_user_id', true), '')::UUID,
            auth.uid()
        );
    EXCEPTION WHEN OTHERS THEN
        v_actor := auth.uid();
    END;

    v_source := NULLIF(current_setting('app.transition_source', true), '');

    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.order_status_history (
            order_id, previous_status, status, note, changed_by, source, created_at
        ) VALUES (
            NEW.id,
            NULL,
            NEW.order_status,
            'Order created with initial status',
            v_actor,
            COALESCE(v_source, 'checkout'),
            NOW()
        );
    ELSIF (TG_OP = 'UPDATE' AND OLD.order_status IS DISTINCT FROM NEW.order_status) THEN
        INSERT INTO public.order_status_history (
            order_id, previous_status, status, note, changed_by, source, created_at
        ) VALUES (
            NEW.id,
            OLD.order_status,
            NEW.order_status,
            COALESCE(
                NULLIF(current_setting('app.transition_note', true), ''),
                NULLIF(NEW.replacement_reason, ''),
                NULLIF(NEW.cancel_reason, ''),
                ''
            ),
            v_actor,
            COALESCE(v_source, 'system'),
            NOW()
        );
    END IF;
    RETURN NEW;
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. STRICT TRANSITION VALIDATION & COURIER-AWARE CANCELLATION (TASK D)
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

    -- 1. Validate Order Status Transitions (NO direct Shipped -> Cancelled or Out for Delivery -> Cancelled)
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

        -- Enforce dispatch integrity when moving into Shipped
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

    NEW.updated_at := clock_timestamp();
    RETURN NEW;
END;
$$;

-- Tighten cancel_order_atomic: reject Shipped & Out for Delivery for ALL callers
-- (Dispatched cancellations MUST flow through cancel_dispatched_order_atomic)
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
    v_already_refunded NUMERIC := 0;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: cancel_order_atomic can only be invoked by trusted server actions.';
    END IF;

    IF p_is_admin THEN
        v_actual_is_admin := public.user_has_staff_permission(p_user_id, 'orders.cancel');
        IF v_actual_is_admin IS NOT TRUE THEN
            RAISE EXCEPTION 'Unauthorized: Order cancellation permission (super_admin, admin, or order_manager) required.';
        END IF;
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    IF NOT v_actual_is_admin AND v_order.user_id <> p_user_id THEN
        RAISE EXCEPTION 'Not authorized to cancel order %', p_order_id;
    END IF;

    -- Both customers and admins cannot directly cancel Shipped / Out for Delivery via cancel_order_atomic
    IF v_order.order_status IN ('Shipped', 'Out for Delivery') THEN
        IF v_actual_is_admin THEN
            RAISE EXCEPTION 'Order is in "%" status (AWB: %) and requires confirmed courier cancellation via cancel_dispatched_order_atomic before order cancellation.',
                v_order.order_status, COALESCE(v_order.shipping_awb, 'N/A');
        ELSE
            RAISE EXCEPTION 'Order has already been dispatched with courier (AWB: %) and cannot be cancelled by customer. Please request return/refund upon delivery.',
                COALESCE(v_order.shipping_awb, 'N/A');
        END IF;
    END IF;

    IF v_order.order_status IN ('Cancelled', 'Delivered', 'Returned') OR v_order.order_status LIKE 'Replacement%' THEN
        RAISE EXCEPTION 'Order cannot be cancelled in % status', v_order.order_status;
    END IF;

    -- Restore pre-dispatch inventory deterministically
    FOR v_res IN
        SELECT id, book_id, quantity
        FROM public.inventory_reservations
        WHERE order_id = p_order_id AND status IN ('reserved', 'committed')
        ORDER BY book_id, id
        FOR UPDATE
    LOOP
        UPDATE public.books
        SET stock = stock + v_res.quantity
        WHERE id = v_res.book_id;

        UPDATE public.inventory_reservations
        SET status = 'released',
            released_at = v_now,
            release_reason = 'order_cancelled',
            updated_at = v_now
        WHERE id = v_res.id;
    END LOOP;

    v_target_coupon_status := v_order.coupon_status;
    IF v_order.coupon_status IN ('reserved', 'consumed') AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts
        SET used_count = GREATEST(used_count - 1, 0)
        WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));

        v_target_coupon_status := 'released';
    END IF;

    IF (v_order.is_paid OR v_order.payment_status IN ('Paid', 'Partially Refunded')) AND v_order.payment_method = 'ONLINE' THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_already_refunded
        FROM public.refund_records
        WHERE order_id = p_order_id AND status = 'processed';

        v_target_payment_status := 'Refund Pending';
        v_target_refund_status := 'pending';
        v_target_refund_amount := GREATEST(0, COALESCE(v_order.total_amount, 0) - v_already_refunded);
    ELSE
        v_target_payment_status := CASE
            WHEN v_order.payment_method = 'ONLINE' AND v_order.payment_status = 'Pending' THEN 'Failed'
            ELSE v_order.payment_status
        END;
        v_target_refund_status := 'not_required';
        v_target_refund_amount := NULL;
    END IF;

    PERFORM set_config('app.actor_user_id', p_user_id::text, true);
    PERFORM set_config('app.transition_source', CASE WHEN v_actual_is_admin THEN 'admin_cancel' ELSE 'customer_cancel' END, true);
    PERFORM set_config('app.transition_note', COALESCE(NULLIF(trim(p_cancel_reason), ''), 'Cancelled'), true);

    UPDATE public.orders
    SET
        order_status = 'Cancelled',
        payment_status = v_target_payment_status,
        refund_status = v_target_refund_status,
        refund_amount = v_target_refund_amount,
        cancel_reason = COALESCE(NULLIF(trim(p_cancel_reason), ''), CASE WHEN v_actual_is_admin THEN 'Cancelled by admin' ELSE 'Cancelled by customer' END),
        coupon_status = v_target_coupon_status,
        shipping_booking_status = CASE WHEN shipping_booking_status = 'unbooked' THEN 'unbooked' ELSE 'cancelled' END,
        shipping_cancelled_at = CASE WHEN shipping_awb IS NOT NULL OR shipping_courier IS NOT NULL THEN v_now ELSE shipping_cancelled_at END,
        updated_at = v_now
    WHERE id = p_order_id;

    UPDATE public.payment_attempts
    SET status = 'superseded',
        updated_at = v_now
    WHERE order_id = p_order_id AND status IN ('initiated', 'pending');

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
        'CANCEL_ORDER',
        'orders',
        p_order_id::text,
        jsonb_build_object('order_status', v_order.order_status, 'payment_status', v_order.payment_status),
        jsonb_build_object('order_status', 'Cancelled', 'payment_status', v_target_payment_status, 'refund_status', v_target_refund_status),
        jsonb_build_object('reason', COALESCE(p_cancel_reason, 'Cancelled'), 'is_admin', v_actual_is_admin),
        v_now
    );

    RETURN TRUE;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_order_atomic(UUID, UUID, TEXT, BOOLEAN) TO postgres, service_role;

-- Dispatched order cancellation with courier confirmation proof
CREATE OR REPLACE FUNCTION public.cancel_dispatched_order_atomic(
    p_order_id UUID,
    p_admin_id UUID,
    p_cancel_reason TEXT,
    p_cancellation_mode TEXT,          -- 'delhivery_api' | 'manual_confirmed'
    p_courier_confirmed BOOLEAN,
    p_provider_response JSONB DEFAULT '{}'::jsonb,
    p_manual_confirmation_ref TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_admin_role TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_target_payment_status TEXT;
    v_target_refund_status TEXT;
    v_target_refund_amount NUMERIC;
    v_target_coupon_status TEXT;
    v_already_refunded NUMERIC := 0;
    v_shipment_id UUID;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: cancel_dispatched_order_atomic can only be invoked by trusted server actions.';
    END IF;

    IF public.user_has_staff_permission(p_admin_id, 'orders.cancel_dispatched') IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Dispatched order cancellation requires Super Admin or Admin role.';
    END IF;

    SELECT role INTO v_admin_role FROM public.profiles WHERE id = p_admin_id;

    IF COALESCE(p_courier_confirmed, FALSE) IS NOT TRUE THEN
        RAISE EXCEPTION 'Courier cancellation confirmation is required before cancelling a dispatched order.';
    END IF;

    IF p_cancellation_mode NOT IN ('delhivery_api', 'manual_confirmed') THEN
        RAISE EXCEPTION 'Invalid dispatched cancellation mode: %', p_cancellation_mode;
    END IF;

    IF char_length(trim(COALESCE(p_cancel_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'A cancellation reason is required for dispatched order cancellation.';
    END IF;

    IF p_cancellation_mode = 'manual_confirmed' AND char_length(trim(COALESCE(p_manual_confirmation_ref, ''))) = 0 THEN
        RAISE EXCEPTION 'Manual courier cancellation requires explicit courier confirmation notes/reference.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    IF v_order.order_status NOT IN ('Shipped', 'Out for Delivery') THEN
        RAISE EXCEPTION 'cancel_dispatched_order_atomic only applies to Shipped or Out for Delivery orders (current: %).', v_order.order_status;
    END IF;

    -- Do NOT restock inventory automatically when parcel was physically handed to courier
    UPDATE public.inventory_reservations
    SET status = 'released',
        released_at = v_now,
        release_reason = 'cancelled_post_dispatch_no_restock',
        updated_at = v_now
    WHERE order_id = p_order_id AND status IN ('reserved', 'committed');

    v_target_coupon_status := v_order.coupon_status;
    IF v_order.coupon_status IN ('reserved', 'consumed') AND v_order.coupon_code IS NOT NULL AND trim(v_order.coupon_code) <> '' THEN
        UPDATE public.discounts
        SET used_count = GREATEST(used_count - 1, 0)
        WHERE UPPER(code) = UPPER(trim(v_order.coupon_code));
        v_target_coupon_status := 'released';
    END IF;

    IF (v_order.is_paid OR v_order.payment_status IN ('Paid', 'Partially Refunded')) AND v_order.payment_method = 'ONLINE' THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_already_refunded
        FROM public.refund_records
        WHERE order_id = p_order_id AND status = 'processed';

        v_target_payment_status := 'Refund Pending';
        v_target_refund_status := 'pending';
        v_target_refund_amount := GREATEST(0, COALESCE(v_order.total_amount, 0) - v_already_refunded);
    ELSE
        v_target_payment_status := v_order.payment_status;
        v_target_refund_status := 'not_required';
        v_target_refund_amount := NULL;
    END IF;

    PERFORM set_config('app.allow_verified_courier_cancellation', 'true', true);
    PERFORM set_config('app.actor_user_id', p_admin_id::text, true);
    PERFORM set_config('app.transition_source', CASE WHEN p_cancellation_mode = 'delhivery_api' THEN 'delhivery_cancel_confirmed' ELSE 'manual_courier_cancel_confirmed' END, true);
    PERFORM set_config('app.transition_note', trim(p_cancel_reason), true);

    UPDATE public.orders
    SET
        order_status = 'Cancelled',
        payment_status = v_target_payment_status,
        refund_status = v_target_refund_status,
        refund_amount = v_target_refund_amount,
        cancel_reason = trim(p_cancel_reason),
        coupon_status = v_target_coupon_status,
        shipping_booking_status = 'cancelled',
        shipping_cancelled_at = v_now,
        updated_at = v_now
    WHERE id = p_order_id;

    PERFORM set_config('app.allow_verified_courier_cancellation', 'false', true);

    UPDATE public.shipments
    SET status = 'cancelled',
        cancelled_by = p_admin_id,
        cancelled_at = v_now,
        cancel_reason = trim(p_cancel_reason),
        cancel_provider_response = jsonb_build_object(
            'mode', p_cancellation_mode,
            'manual_ref', p_manual_confirmation_ref,
            'provider_response', COALESCE(p_provider_response, '{}'::jsonb)
        ),
        updated_at = v_now
    WHERE order_id = p_order_id
      AND status NOT IN ('cancelled', 'failed')
    RETURNING id INTO v_shipment_id;

    INSERT INTO public.shipment_events (
        shipment_id,
        order_id,
        event_type,
        source,
        previous_status,
        new_status,
        actor_id,
        actor_role,
        carrier_name,
        awb,
        note,
        metadata,
        created_at
    ) VALUES (
        v_shipment_id,
        p_order_id,
        CASE WHEN p_cancellation_mode = 'delhivery_api' THEN 'courier_cancel_confirmed' ELSE 'manual_cancel_confirmed' END,
        CASE WHEN p_cancellation_mode = 'delhivery_api' THEN 'delhivery_api' ELSE 'admin_action' END,
        v_order.order_status,
        'Cancelled',
        p_admin_id,
        v_admin_role,
        v_order.shipping_courier,
        v_order.shipping_awb,
        trim(p_cancel_reason),
        jsonb_build_object(
            'cancellation_mode', p_cancellation_mode,
            'manual_confirmation_ref', p_manual_confirmation_ref,
            'provider_response', COALESCE(p_provider_response, '{}'::jsonb)
        ),
        v_now
    );

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
        'CANCEL_DISPATCHED_ORDER',
        'orders',
        p_order_id::text,
        jsonb_build_object(
            'order_status', v_order.order_status,
            'shipping_courier', v_order.shipping_courier,
            'shipping_awb', v_order.shipping_awb
        ),
        jsonb_build_object(
            'order_status', 'Cancelled',
            'payment_status', v_target_payment_status,
            'refund_status', v_target_refund_status,
            'shipping_booking_status', 'cancelled'
        ),
        jsonb_build_object(
            'reason', trim(p_cancel_reason),
            'cancellation_mode', p_cancellation_mode,
            'manual_confirmation_ref', p_manual_confirmation_ref,
            'inventory_restocked', false
        ),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'previous_status', v_order.order_status,
        'payment_status', v_target_payment_status,
        'refund_status', v_target_refund_status,
        'shipment_id', v_shipment_id
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cancel_dispatched_order_atomic(UUID, UUID, TEXT, TEXT, BOOLEAN, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_dispatched_order_atomic(UUID, UUID, TEXT, TEXT, BOOLEAN, JSONB, TEXT) TO postgres, service_role;

-- Atomic manual shipment creation & dispatch RPC (Mode 2)
CREATE OR REPLACE FUNCTION public.create_manual_shipment_atomic(
    p_order_id UUID,
    p_actor_id UUID,
    p_carrier_name TEXT,
    p_awb TEXT DEFAULT NULL,
    p_tracking_url TEXT DEFAULT NULL,
    p_mark_as_shipped BOOLEAN DEFAULT TRUE,
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_actor_role TEXT;
    v_clean_carrier TEXT := NULLIF(trim(COALESCE(p_carrier_name, '')), '');
    v_clean_awb TEXT := NULLIF(trim(COALESCE(p_awb, '')), '');
    v_clean_tracking_url TEXT := NULLIF(trim(COALESCE(p_tracking_url, '')), '');
    v_now TIMESTAMPTZ := clock_timestamp();
    v_target_order_status TEXT;
    v_shipment_id UUID;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: create_manual_shipment_atomic must be invoked via trusted server actions.';
    END IF;

    IF public.user_has_staff_permission(p_actor_id, 'orders.ship') IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Shipping permission required to enter manual shipment details.';
    END IF;

    SELECT role INTO v_actor_role FROM public.profiles WHERE id = p_actor_id;

    IF v_clean_carrier IS NULL THEN
        RAISE EXCEPTION 'Carrier / courier name is required for manual shipment entry.';
    END IF;

    IF v_clean_awb IS NOT NULL AND v_clean_awb ~* '^DLH-[0-9A-F]{8}$' THEN
        RAISE EXCEPTION 'Synthetic DLH-* placeholder AWBs are not allowed.';
    END IF;

    IF v_clean_tracking_url IS NOT NULL AND v_clean_tracking_url !~* '^https?://' THEN
        RAISE EXCEPTION 'Tracking URL must be a valid http:// or https:// URL.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    IF v_order.order_status IN ('Cancelled', 'Delivered', 'Returned') OR v_order.order_status LIKE 'Replacement%' THEN
        RAISE EXCEPTION 'Cannot create shipment for order in "%" status.', v_order.order_status;
    END IF;

    IF upper(COALESCE(v_order.payment_method, '')) = 'ONLINE' AND v_order.payment_status <> 'Paid' THEN
        RAISE EXCEPTION 'Online prepaid order must be Paid before dispatch/shipment entry.';
    END IF;

    IF v_order.shipping_booking_status IN ('booked', 'manual_entered') OR v_order.shipping_awb IS NOT NULL THEN
        RAISE EXCEPTION 'Order already has an active shipment record.';
    END IF;

    IF v_order.shipping_booking_status = 'booking_in_progress' THEN
        RAISE EXCEPTION 'A Delhivery booking is currently in progress for this order.';
    END IF;

    IF lower(v_clean_carrier) = 'delhivery' AND v_clean_awb IS NULL THEN
        RAISE EXCEPTION 'Manual Delhivery shipment entry requires an existing Delhivery AWB (use Delhivery API booking to generate one).';
    END IF;

    v_target_order_status := CASE
        WHEN COALESCE(p_mark_as_shipped, TRUE) IS TRUE THEN 'Shipped'
        ELSE v_order.order_status
    END;

    PERFORM set_config('app.actor_user_id', p_actor_id::text, true);
    PERFORM set_config('app.transition_source', 'manual_shipment_entry', true);
    PERFORM set_config('app.transition_note', COALESCE(NULLIF(trim(p_notes), ''), 'Manual shipment entered (' || v_clean_carrier || ')'), true);

    UPDATE public.orders
    SET
        shipping_booking_mode = 'manual',
        shipping_booking_status = 'manual_entered',
        shipping_courier = v_clean_carrier,
        shipping_awb = v_clean_awb,
        shipping_tracking_url = v_clean_tracking_url,
        shipping_last_error = NULL,
        shipping_shipped_at = CASE WHEN v_target_order_status = 'Shipped' AND shipping_shipped_at IS NULL THEN v_now ELSE shipping_shipped_at END,
        order_status = v_target_order_status,
        updated_at = v_now
    WHERE id = p_order_id;

    INSERT INTO public.shipments (
        order_id,
        booking_mode,
        status,
        carrier_name,
        awb,
        tracking_url,
        provider_payload,
        booked_by,
        booked_at,
        shipped_at,
        created_at,
        updated_at
    ) VALUES (
        p_order_id,
        'manual',
        CASE WHEN v_target_order_status = 'Shipped' THEN 'dispatched' ELSE 'booked' END,
        v_clean_carrier,
        v_clean_awb,
        v_clean_tracking_url,
        jsonb_build_object('notes', p_notes, 'manual_entry', true),
        p_actor_id,
        v_now,
        CASE WHEN v_target_order_status = 'Shipped' THEN v_now ELSE NULL END,
        v_now,
        v_now
    )
    RETURNING id INTO v_shipment_id;

    INSERT INTO public.shipment_events (
        shipment_id,
        order_id,
        event_type,
        source,
        previous_status,
        new_status,
        actor_id,
        actor_role,
        carrier_name,
        awb,
        note,
        metadata,
        created_at
    ) VALUES (
        v_shipment_id,
        p_order_id,
        'manual_shipment_created',
        'warehouse_action',
        v_order.order_status,
        v_target_order_status,
        p_actor_id,
        v_actor_role,
        v_clean_carrier,
        v_clean_awb,
        COALESCE(NULLIF(trim(p_notes), ''), 'Manual shipment entered'),
        jsonb_build_object('tracking_url', v_clean_tracking_url, 'marked_as_shipped', v_target_order_status = 'Shipped'),
        v_now
    );

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
        p_actor_id,
        'CREATE_MANUAL_SHIPMENT',
        'orders',
        p_order_id::text,
        jsonb_build_object('order_status', v_order.order_status, 'shipping_courier', v_order.shipping_courier, 'shipping_awb', v_order.shipping_awb),
        jsonb_build_object(
            'order_status', v_target_order_status,
            'shipping_booking_mode', 'manual',
            'shipping_courier', v_clean_carrier,
            'shipping_awb', v_clean_awb,
            'shipping_tracking_url', v_clean_tracking_url
        ),
        jsonb_build_object('shipment_id', v_shipment_id, 'notes', p_notes),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'shipment_id', v_shipment_id,
        'booking_mode', 'manual',
        'carrier_name', v_clean_carrier,
        'awb', v_clean_awb,
        'tracking_url', v_clean_tracking_url,
        'order_status', v_target_order_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_manual_shipment_atomic(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_manual_shipment_atomic(UUID, UUID, TEXT, TEXT, TEXT, BOOLEAN, TEXT) TO postgres, service_role;

-- Atomic permission-verified order status transition RPC
CREATE OR REPLACE FUNCTION public.update_order_status_atomic(
    p_order_id UUID,
    p_actor_id UUID,
    p_next_status TEXT,
    p_notes TEXT DEFAULT NULL,
    p_courier TEXT DEFAULT NULL,
    p_awb TEXT DEFAULT NULL,
    p_tracking_url TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_actor_role TEXT;
    v_required_perm TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_final_courier TEXT;
    v_final_awb TEXT;
    v_final_tracking_url TEXT;
    v_shipment_id UUID;
BEGIN
    IF current_user <> 'service_role' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Unauthorized: update_order_status_atomic requires trusted server credentials.';
    END IF;

    IF p_next_status = 'Cancelled' THEN
        RAISE EXCEPTION 'Use dedicated cancellation workflow rather than status update to cancel orders.';
    END IF;

    IF p_next_status IN ('Shipped', 'Out for Delivery', 'Delivered', 'Returned') THEN
        v_required_perm := 'orders.ship';
    ELSE
        v_required_perm := 'orders.manage';
    END IF;

    IF public.user_has_staff_permission(p_actor_id, v_required_perm) IS NOT TRUE THEN
        RAISE EXCEPTION 'Unauthorized: Missing "%" permission for status "%".', v_required_perm, p_next_status;
    END IF;

    SELECT role INTO v_actor_role FROM public.profiles WHERE id = p_actor_id;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found.', p_order_id;
    END IF;

    IF p_next_status = 'Confirmed' AND upper(COALESCE(v_order.payment_method, '')) = 'ONLINE' AND v_order.payment_status <> 'Paid' THEN
        RAISE EXCEPTION 'Online prepaid orders can be confirmed only after successful payment.';
    END IF;

    v_final_courier := COALESCE(NULLIF(trim(COALESCE(p_courier, '')), ''), v_order.shipping_courier);
    v_final_awb := COALESCE(NULLIF(trim(COALESCE(p_awb, '')), ''), v_order.shipping_awb);
    v_final_tracking_url := COALESCE(NULLIF(trim(COALESCE(p_tracking_url, '')), ''), v_order.shipping_tracking_url);

    IF p_next_status = 'Shipped' THEN
        IF v_final_courier IS NULL THEN
            RAISE EXCEPTION 'Shipping courier is required to mark order as Shipped.';
        END IF;
        IF (
            COALESCE(v_order.shipping_booking_mode, '') = 'delhivery'
            OR lower(v_final_courier) = 'delhivery'
        ) AND v_final_awb IS NULL THEN
            RAISE EXCEPTION 'Delhivery shipments require a valid AWB tracking number.';
        END IF;
        IF v_final_awb IS NOT NULL AND v_final_awb ~* '^DLH-[0-9A-F]{8}$' THEN
            RAISE EXCEPTION 'Synthetic DLH-* placeholder AWBs are not allowed.';
        END IF;
    END IF;

    PERFORM set_config('app.actor_user_id', p_actor_id::text, true);
    PERFORM set_config('app.transition_source', 'admin_status_update', true);
    PERFORM set_config('app.transition_note', COALESCE(NULLIF(trim(p_notes), ''), 'Status updated to ' || p_next_status), true);

    UPDATE public.orders
    SET
        order_status = p_next_status,
        shipping_courier = CASE WHEN p_next_status = 'Shipped' THEN v_final_courier ELSE shipping_courier END,
        shipping_awb = CASE WHEN p_next_status = 'Shipped' THEN v_final_awb ELSE shipping_awb END,
        shipping_tracking_url = CASE
            WHEN p_next_status = 'Shipped' AND v_final_tracking_url IS NOT NULL THEN v_final_tracking_url
            ELSE shipping_tracking_url
        END,
        shipping_booking_mode = CASE
            WHEN p_next_status = 'Shipped' AND shipping_booking_mode IS NULL THEN
                CASE WHEN lower(COALESCE(v_final_courier, '')) = 'delhivery' THEN 'delhivery' ELSE 'manual' END
            ELSE shipping_booking_mode
        END,
        shipping_booking_status = CASE
            WHEN p_next_status = 'Shipped' AND shipping_booking_status IN ('unbooked', 'booking_failed') THEN
                CASE WHEN lower(COALESCE(v_final_courier, '')) = 'delhivery' THEN 'booked' ELSE 'manual_entered' END
            ELSE shipping_booking_status
        END,
        shipping_shipped_at = CASE WHEN p_next_status = 'Shipped' AND shipping_shipped_at IS NULL THEN v_now ELSE shipping_shipped_at END,
        delivered_at = CASE WHEN p_next_status = 'Delivered' THEN COALESCE(delivered_at, v_now) ELSE delivered_at END,
        shipping_delivered_at = CASE WHEN p_next_status = 'Delivered' THEN COALESCE(shipping_delivered_at, v_now) ELSE shipping_delivered_at END,
        cod_settlement_status = CASE
            WHEN p_next_status = 'Delivered' AND upper(COALESCE(payment_method, '')) = 'COD' AND payment_status <> 'Paid' THEN 'pending'
            ELSE cod_settlement_status
        END,
        updated_at = v_now
    WHERE id = p_order_id;

    UPDATE public.shipments
    SET
        status = CASE
            WHEN p_next_status = 'Shipped' THEN 'dispatched'
            WHEN p_next_status = 'Out for Delivery' THEN 'out_for_delivery'
            WHEN p_next_status = 'Delivered' THEN 'delivered'
            WHEN p_next_status = 'Returned' THEN 'returned'
            ELSE status
        END,
        shipped_at = CASE WHEN p_next_status = 'Shipped' THEN COALESCE(shipped_at, v_now) ELSE shipped_at END,
        delivered_at = CASE WHEN p_next_status = 'Delivered' THEN COALESCE(delivered_at, v_now) ELSE delivered_at END,
        updated_at = v_now
    WHERE order_id = p_order_id
      AND status NOT IN ('cancelled', 'failed')
    RETURNING id INTO v_shipment_id;

    INSERT INTO public.shipment_events (
        shipment_id,
        order_id,
        event_type,
        source,
        previous_status,
        new_status,
        actor_id,
        actor_role,
        carrier_name,
        awb,
        note,
        metadata,
        created_at
    ) VALUES (
        v_shipment_id,
        p_order_id,
        'status_updated',
        CASE WHEN v_required_perm = 'orders.ship' THEN 'warehouse_action' ELSE 'admin_action' END,
        v_order.order_status,
        p_next_status,
        p_actor_id,
        v_actor_role,
        COALESCE(v_final_courier, v_order.shipping_courier),
        COALESCE(v_final_awb, v_order.shipping_awb),
        COALESCE(NULLIF(trim(p_notes), ''), 'Order status transitioned to ' || p_next_status),
        jsonb_build_object('notes', p_notes),
        v_now
    );

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
        p_actor_id,
        'UPDATE_ORDER_STATUS',
        'orders',
        p_order_id::text,
        jsonb_build_object('order_status', v_order.order_status, 'payment_status', v_order.payment_status),
        jsonb_build_object('order_status', p_next_status, 'notes', p_notes),
        jsonb_build_object('transition', v_order.order_status || ' -> ' || p_next_status, 'notes', p_notes),
        v_now
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'previous_status', v_order.order_status,
        'new_status', p_next_status
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_order_status_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_status_atomic(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO postgres, service_role;

-- Update permissions verification for get_admin_dashboard_metrics (unchanged for all 5 staff)
-- Ensure search_path and execute permissions remain strictly bounded.
