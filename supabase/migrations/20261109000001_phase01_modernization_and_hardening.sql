-- ==============================================================================
-- PHASE 1: MODERNIZATION, INTEGRATION & HARDENING MIGRATION
-- MD Shakib Islamic Books
-- Timestamp: 20261109000001
-- ==============================================================================

-- 1. ORDER NUMBER SEQUENCE & HUMAN-READABLE ORDER NUMBERS (Feature 1.3)
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq
    START WITH 100001
    INCREMENT BY 1
    MINVALUE 100001
    NO MAXVALUE
    CACHE 1;

-- Add order_number column to public.orders
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS order_number TEXT;

-- Create function to auto-assign order number
CREATE OR REPLACE FUNCTION public.set_order_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NEW.order_number IS NULL OR trim(NEW.order_number) = '' THEN
        NEW.order_number := 'MDS-' || nextval('public.order_number_seq')::TEXT;
    END IF;
    RETURN NEW;
END;
$$;

-- Trigger before insert to assign unique order_number
DROP TRIGGER IF EXISTS trg_set_order_number ON public.orders;
CREATE TRIGGER trg_set_order_number
    BEFORE INSERT ON public.orders
    FOR EACH ROW
    EXECUTE FUNCTION public.set_order_number();

-- Backfill any existing orders lacking order_number
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN SELECT id FROM public.orders WHERE order_number IS NULL OR order_number = '' ORDER BY created_at ASC LOOP
        UPDATE public.orders
        SET order_number = 'MDS-' || nextval('public.order_number_seq')::TEXT
        WHERE id = r.id;
    END LOOP;
END $$;

-- Enforce UNIQUE and NOT NULL constraints
ALTER TABLE public.orders
ALTER COLUMN order_number SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'orders_order_number_key'
    ) THEN
        ALTER TABLE public.orders ADD CONSTRAINT orders_order_number_key UNIQUE (order_number);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_orders_order_number ON public.orders(order_number);


-- 2. SHIPPING & COD RECONCILIATION EXTENSIONS (Features 1.10 - 1.15)
-- ------------------------------------------------------------------------------
-- Add COD settlement lifecycle and logistics persistence columns
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS cod_settlement_status TEXT NOT NULL DEFAULT 'unsettled'
CHECK (cod_settlement_status IN ('unsettled', 'pending', 'remitted', 'reconciled', 'disputed')),
ADD COLUMN IF NOT EXISTS cod_settlement_ref TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cod_settled_amount NUMERIC(10, 2) DEFAULT NULL,
ADD COLUMN IF NOT EXISTS cod_settled_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shipping_pickup_request_id TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shipping_pickup_scheduled_at TIMESTAMPTZ DEFAULT NULL,
ADD COLUMN IF NOT EXISTS shipping_label_url TEXT DEFAULT NULL;

-- Unique constraint on shipping_awb to prevent duplicate booking across orders
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_shipping_awb_unique
ON public.orders(shipping_awb)
WHERE shipping_awb IS NOT NULL;


-- 3. STAFF ROLES & PERMISSIONS SYSTEM (Feature 1.17)
-- ------------------------------------------------------------------------------
-- Drop existing binary role check and expand to multi-role staff model
ALTER TABLE public.profiles
DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
ADD CONSTRAINT profiles_role_check
CHECK (role IN ('user', 'super_admin', 'admin', 'order_manager', 'warehouse_staff', 'support_staff'));

-- Upgrade is_admin() function to support super_admin and admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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

-- Function to check if user is any active staff member
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
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

-- Upgrade admin_update_user_role to enforce least-privilege role assignment
CREATE OR REPLACE FUNCTION public.admin_update_user_role(
    p_admin_id UUID,
    p_target_user_id UUID,
    p_new_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_old_role TEXT;
BEGIN
    -- Caller authentication validation
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        IF auth.uid() IS NULL THEN
            RAISE EXCEPTION 'Authentication required: Anonymous callers cannot modify roles.';
        END IF;
        IF auth.uid() <> p_admin_id THEN
            RAISE EXCEPTION 'Security violation: Caller identity must match administrative credentials.';
        END IF;
    END IF;

    -- Caller role check: Must be super_admin or admin
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = p_admin_id AND is_blocked = FALSE AND is_deleted = FALSE;

    IF v_caller_role NOT IN ('super_admin', 'admin') THEN
        RAISE EXCEPTION 'Unauthorized: Administrative role required to assign roles.';
    END IF;

    -- Super Admin assignment can only be performed by a super_admin
    IF p_new_role = 'super_admin' AND v_caller_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only a Super Admin can promote a user to Super Admin.';
    END IF;

    -- Self-lockout / self-demotion prevention
    IF p_admin_id = p_target_user_id THEN
        RAISE EXCEPTION 'Safety invariant: Administrators cannot modify their own active role.';
    END IF;

    -- Validate new role
    IF p_new_role NOT IN ('user', 'super_admin', 'admin', 'order_manager', 'warehouse_staff', 'support_staff') THEN
        RAISE EXCEPTION 'Invalid role: %. Allowed roles are: user, super_admin, admin, order_manager, warehouse_staff, support_staff.', p_new_role;
    END IF;

    SELECT role INTO v_old_role
    FROM public.profiles
    WHERE id = p_target_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target user % not found.', p_target_user_id;
    END IF;

    -- Only super_admin can modify an existing super_admin
    IF v_old_role = 'super_admin' AND v_caller_role <> 'super_admin' THEN
        RAISE EXCEPTION 'Unauthorized: Only a Super Admin can alter another Super Admin account.';
    END IF;

    UPDATE public.profiles
    SET role = p_new_role,
        updated_at = NOW()
    WHERE id = p_target_user_id;

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
        'UPDATE_ROLE',
        'profiles',
        p_target_user_id::text,
        jsonb_build_object('role', v_old_role),
        jsonb_build_object('role', p_new_role),
        jsonb_build_object('role', p_new_role, 'assigned_by', p_admin_id::text),
        NOW()
    );

    RETURN TRUE;
END;
$$;


-- 4. ORDER STATUS TRANSITIONS & CANCELLATION HARDENING (Feature 1.4)
-- ------------------------------------------------------------------------------
-- Update validate_order_state_transitions trigger function
CREATE OR REPLACE FUNCTION public.validate_order_state_transitions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    -- 1. Validate Order Status Transitions
    IF OLD.order_status <> NEW.order_status THEN
        -- Pending -> Confirmed, Cancelled
        IF OLD.order_status = 'Pending' AND NEW.order_status NOT IN ('Confirmed', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Pending" to "%"', NEW.order_status;
        -- Confirmed -> Processing, Packed, Shipped, Cancelled
        ELSIF OLD.order_status = 'Confirmed' AND NEW.order_status NOT IN ('Processing', 'Packed', 'Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Confirmed" to "%"', NEW.order_status;
        -- Processing -> Packed, Shipped, Cancelled
        ELSIF OLD.order_status = 'Processing' AND NEW.order_status NOT IN ('Packed', 'Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Processing" to "%"', NEW.order_status;
        -- Packed -> Shipped, Cancelled
        ELSIF OLD.order_status = 'Packed' AND NEW.order_status NOT IN ('Shipped', 'Cancelled') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Packed" to "%"', NEW.order_status;
        -- Shipped -> Out for Delivery, Delivered, Cancelled, Returned
        ELSIF OLD.order_status = 'Shipped' AND NEW.order_status NOT IN ('Out for Delivery', 'Delivered', 'Cancelled', 'Returned') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Shipped" to "%"', NEW.order_status;
        -- Out for Delivery -> Delivered, Cancelled, Returned
        ELSIF OLD.order_status = 'Out for Delivery' AND NEW.order_status NOT IN ('Delivered', 'Cancelled', 'Returned') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Out for Delivery" to "%"', NEW.order_status;
        -- Delivered -> Replacement Requested
        ELSIF OLD.order_status = 'Delivered' AND NEW.order_status NOT IN ('Replacement Requested') THEN
            RAISE EXCEPTION 'Invalid order status transition from "Delivered" to "%"', NEW.order_status;
        -- Cancelled is terminal, EXCEPT recovery of expired reservation upon successful payment settlement
        ELSIF OLD.order_status = 'Cancelled' THEN
            IF NEW.order_status = 'Confirmed' AND OLD.cancel_reason = 'Payment reservation expired' AND NEW.payment_status = 'Paid' THEN
                NULL;
            ELSE
                RAISE EXCEPTION 'Cannot transition cancelled order to "%"', NEW.order_status;
            END IF;
        -- Returned is terminal
        ELSIF OLD.order_status = 'Returned' THEN
            RAISE EXCEPTION 'Cannot transition returned order to "%"', NEW.order_status;
        -- Replacement Requested -> Replacement Approved, Replacement Rejected
        ELSIF OLD.order_status = 'Replacement Requested' AND NEW.order_status NOT IN ('Replacement Approved', 'Replacement Rejected') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Requested" to "%"', NEW.order_status;
        -- Replacement Approved -> Replacement Shipped
        ELSIF OLD.order_status = 'Replacement Approved' AND NEW.order_status NOT IN ('Replacement Shipped') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Approved" to "%"', NEW.order_status;
        -- Replacement Rejected is terminal
        ELSIF OLD.order_status = 'Replacement Rejected' THEN
            RAISE EXCEPTION 'Cannot transition rejected replacement order to "%"', NEW.order_status;
        -- Replacement Shipped -> Replacement Delivered
        ELSIF OLD.order_status = 'Replacement Shipped' AND NEW.order_status NOT IN ('Replacement Delivered') THEN
            RAISE EXCEPTION 'Invalid transition from "Replacement Shipped" to "%"', NEW.order_status;
        -- Replacement Delivered is terminal
        ELSIF OLD.order_status = 'Replacement Delivered' THEN
            RAISE EXCEPTION 'Cannot transition delivered replacement to "%"', NEW.order_status;
        END IF;
    END IF;

    -- 2. Validate Payment Status Transitions
    IF OLD.payment_status <> NEW.payment_status THEN
        IF OLD.payment_status = 'Pending' AND NEW.payment_status NOT IN ('Paid', 'Failed', 'Refund Pending') THEN
            RAISE EXCEPTION 'Invalid payment transition from "Pending" to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Paid' AND NEW.payment_status NOT IN ('Refund Pending', 'Refunded') THEN
            RAISE EXCEPTION 'Paid payment status cannot be changed to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Refund Pending' AND NEW.payment_status NOT IN ('Refunded', 'Paid') THEN
            RAISE EXCEPTION 'Refund Pending payment status cannot be changed to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Failed' AND NEW.payment_status NOT IN ('Paid') THEN
            RAISE EXCEPTION 'Failed payment status cannot be changed to "%"', NEW.payment_status;
        ELSIF OLD.payment_status = 'Refunded' THEN
            RAISE EXCEPTION 'Refunded payment status cannot be changed to "%"', NEW.payment_status;
        END IF;
    END IF;

    -- Auto-set updated_at timestamp
    NEW.updated_at := clock_timestamp();

    RETURN NEW;
END;
$$;

-- Upgrade cancel_order_atomic to forbid customer cancellation once physically dispatched (Shipped/Out for Delivery)
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

    -- Release inventory reservations and restore stock (executed safely in order)
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


-- 5. DATABASE-SIDE ADMIN DASHBOARD ANALYTICS (Feature 1.16)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_admin_dashboard_metrics(
    p_date_from TIMESTAMPTZ DEFAULT NULL,
    p_date_to TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_role TEXT;
    v_total_revenue NUMERIC(12, 2) := 0.00;
    v_gross_order_value NUMERIC(12, 2) := 0.00;
    v_total_orders INT := 0;
    v_pending_orders INT := 0;
    v_delivered_orders INT := 0;
    v_cancelled_orders INT := 0;
    v_paid_orders INT := 0;
    v_unpaid_orders INT := 0;
    v_total_books INT := 0;
    v_low_stock_count INT := 0;
    v_out_of_stock_count INT := 0;
    v_inactive_books INT := 0;
    v_total_customers INT := 0;
    v_active_discounts INT := 0;
    v_orders_by_status JSONB := '{}'::jsonb;
    v_orders_by_payment JSONB := '{}'::jsonb;
    v_recent_orders JSONB := '[]'::jsonb;
BEGIN
    -- Authorization check
    IF current_user <> 'service_role' AND (auth.role() IS NULL OR auth.role() <> 'service_role') THEN
        SELECT role INTO v_caller_role FROM public.profiles WHERE id = auth.uid() AND is_blocked = FALSE AND is_deleted = FALSE;
        IF v_caller_role NOT IN ('super_admin', 'admin', 'order_manager', 'warehouse_staff', 'support_staff') THEN
            RAISE EXCEPTION 'Unauthorized: Administrative role required to access dashboard analytics.';
        END IF;
    END IF;

    -- Aggregate Orders (bounded by optional date filters)
    SELECT
        COALESCE(SUM(CASE WHEN payment_status = 'Paid' THEN total_amount ELSE 0 END), 0.00),
        COALESCE(SUM(total_amount), 0.00),
        COUNT(*),
        COUNT(*) FILTER (WHERE order_status = 'Pending'),
        COUNT(*) FILTER (WHERE order_status = 'Delivered'),
        COUNT(*) FILTER (WHERE order_status = 'Cancelled'),
        COUNT(*) FILTER (WHERE payment_status = 'Paid'),
        COUNT(*) FILTER (WHERE payment_status <> 'Paid')
    INTO
        v_total_revenue,
        v_gross_order_value,
        v_total_orders,
        v_pending_orders,
        v_delivered_orders,
        v_cancelled_orders,
        v_paid_orders,
        v_unpaid_orders
    FROM public.orders
    WHERE (p_date_from IS NULL OR created_at >= p_date_from)
      AND (p_date_to IS NULL OR created_at <= p_date_to);

    -- Status Distributions
    SELECT jsonb_object_agg(order_status, count)
    INTO v_orders_by_status
    FROM (
        SELECT order_status, COUNT(*) as count
        FROM public.orders
        WHERE (p_date_from IS NULL OR created_at >= p_date_from)
          AND (p_date_to IS NULL OR created_at <= p_date_to)
        GROUP BY order_status
    ) s;

    SELECT jsonb_object_agg(payment_status, count)
    INTO v_orders_by_payment
    FROM (
        SELECT payment_status, COUNT(*) as count
        FROM public.orders
        WHERE (p_date_from IS NULL OR created_at >= p_date_from)
          AND (p_date_to IS NULL OR created_at <= p_date_to)
        GROUP BY payment_status
    ) p;

    -- Books & Inventory aggregations
    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE stock <= 5 AND stock > 0),
        COUNT(*) FILTER (WHERE stock = 0),
        COUNT(*) FILTER (WHERE is_active = FALSE)
    INTO
        v_total_books,
        v_low_stock_count,
        v_out_of_stock_count,
        v_inactive_books
    FROM public.books;

    -- Profiles & Discounts aggregations
    SELECT COUNT(*) INTO v_total_customers FROM public.profiles WHERE role = 'user' AND is_deleted = FALSE;
    SELECT COUNT(*) INTO v_active_discounts FROM public.discounts WHERE is_active = TRUE AND (valid_until IS NULL OR valid_until >= NOW());

    -- Recent 5 Orders (lightweight join)
    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'order_number', o.order_number,
            'customer_name', COALESCE(p.name, o.address_snapshot->>'full_name', 'Customer'),
            'customer_email', COALESCE(p.email, ''),
            'created_at', o.created_at,
            'total_amount', o.total_amount,
            'order_status', o.order_status,
            'payment_status', o.payment_status,
            'payment_method', o.payment_method
        )
    ), '[]'::jsonb)
    INTO v_recent_orders
    FROM (
        SELECT id, order_number, user_id, address_snapshot, created_at, total_amount, order_status, payment_status, payment_method
        FROM public.orders
        ORDER BY created_at DESC
        LIMIT 5
    ) o
    LEFT JOIN public.profiles p ON p.id = o.user_id;

    RETURN jsonb_build_object(
        'success', true,
        'metrics', jsonb_build_object(
            'total_revenue', v_total_revenue,
            'gross_order_value', v_gross_order_value,
            'total_orders', v_total_orders,
            'pending_orders', v_pending_orders,
            'delivered_orders', v_delivered_orders,
            'cancelled_orders', v_cancelled_orders,
            'paid_orders', v_paid_orders,
            'unpaid_orders', v_unpaid_orders,
            'total_books', v_total_books,
            'low_stock_count', v_low_stock_count,
            'out_of_stock_count', v_out_of_stock_count,
            'inactive_books_count', v_inactive_books,
            'total_customers', v_total_customers,
            'active_discounts_count', v_active_discounts,
            'orders_by_status', COALESCE(v_orders_by_status, '{}'::jsonb),
            'orders_by_payment_status', COALESCE(v_orders_by_payment, '{}'::jsonb),
            'recent_orders', v_recent_orders
        )
    );
END;
$$;


-- 6. CONTACT FORM SUBMISSIONS TABLE (Feature 1.20)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contact_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(trim(name)) > 0),
    email TEXT NOT NULL CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    subject TEXT NOT NULL CHECK (char_length(trim(subject)) > 0),
    message TEXT NOT NULL CHECK (char_length(trim(message)) > 0),
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'resolved', 'closed')),
    ip_address TEXT DEFAULT NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    admin_notes TEXT DEFAULT NULL,
    responded_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_status ON public.contact_submissions(status);
CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at ON public.contact_submissions(created_at DESC);

ALTER TABLE public.contact_submissions ENABLE ROW LEVEL SECURITY;

-- Anonymous and authenticated visitors may submit contact requests
DROP POLICY IF EXISTS contact_submissions_insert_policy ON public.contact_submissions;
CREATE POLICY contact_submissions_insert_policy
    ON public.contact_submissions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

-- Only staff members can view contact submissions
DROP POLICY IF EXISTS contact_submissions_select_policy ON public.contact_submissions;
CREATE POLICY contact_submissions_select_policy
    ON public.contact_submissions
    FOR SELECT
    TO authenticated
    USING (public.is_staff());

-- Only staff members can update contact submissions
DROP POLICY IF EXISTS contact_submissions_update_policy ON public.contact_submissions;
CREATE POLICY contact_submissions_update_policy
    ON public.contact_submissions
    FOR UPDATE
    TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());


-- 7. STOCK ALERTS TABLE (Feature 1.19)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    book_id UUID NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
    stock_level INT NOT NULL,
    threshold INT NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'resolved', 'dismissed')),
    notified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stock_alerts_book_status ON public.stock_alerts(book_id, status);
CREATE INDEX IF NOT EXISTS idx_stock_alerts_notified_at ON public.stock_alerts(notified_at DESC);

ALTER TABLE public.stock_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stock_alerts_staff_policy ON public.stock_alerts;
CREATE POLICY stock_alerts_staff_policy
    ON public.stock_alerts
    FOR ALL
    TO authenticated
    USING (public.is_staff())
    WITH CHECK (public.is_staff());


-- 8. GRANT RPC EXECUTION PERMISSIONS
-- ------------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_dashboard_metrics(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.is_staff() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;
