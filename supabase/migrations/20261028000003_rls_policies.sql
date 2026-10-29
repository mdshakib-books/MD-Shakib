-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 003
-- Row Level Security (RLS) Policies & Role Authorization
-- ==============================================================================

-- ==============================================================================
-- 1. HELPER FUNCTIONS
-- ==============================================================================
-- Check if current authenticated user is an administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin' AND is_blocked = FALSE AND is_deleted = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current authenticated user is active (not blocked or deleted)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND is_blocked = FALSE AND is_deleted = FALSE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ==============================================================================
-- 2. ENABLE RLS ON ALL PUBLIC TABLES
-- ==============================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 3. PROFILES POLICIES
-- ==============================================================================
-- Users can view their own profile; admins can view all profiles
CREATE POLICY "profiles_select_policy" ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = id OR public.is_admin());

-- Users can update their own profile; admins can update all profiles
CREATE POLICY "profiles_update_policy" ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = id OR public.is_admin())
    WITH CHECK (
        -- Regular users cannot escalate role to admin or unblock themselves
        (auth.uid() = id AND role = 'user' AND is_blocked = FALSE)
        OR public.is_admin()
    );

-- Profile creation via auth trigger or authenticated user self-insert
CREATE POLICY "profiles_insert_policy" ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = id);

-- Profiles cannot be deleted directly via client API (use soft-delete flag)
CREATE POLICY "profiles_delete_policy" ON public.profiles
    FOR DELETE TO authenticated
    USING (public.is_admin());

-- ==============================================================================
-- 4. ADDRESSES POLICIES
-- ==============================================================================
-- Users can view their own addresses; admins can view all
CREATE POLICY "addresses_select_policy" ON public.addresses
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- Users can insert addresses for themselves
CREATE POLICY "addresses_insert_policy" ON public.addresses
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_active_user());

-- Users can update their own addresses
CREATE POLICY "addresses_update_policy" ON public.addresses
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (user_id = auth.uid() OR public.is_admin());

-- Users can delete their own addresses
CREATE POLICY "addresses_delete_policy" ON public.addresses
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- ==============================================================================
-- 5. BOOKS POLICIES
-- ==============================================================================
-- Anyone (including anon/guests) can view active books
CREATE POLICY "books_select_public" ON public.books
    FOR SELECT TO public
    USING (is_active = TRUE OR public.is_admin());

-- Only admins can insert, update, or delete books
CREATE POLICY "books_admin_all" ON public.books
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ==============================================================================
-- 6. CARTS & CART ITEMS POLICIES
-- ==============================================================================
-- Carts
CREATE POLICY "carts_select_policy" ON public.carts
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

CREATE POLICY "carts_insert_policy" ON public.carts
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "carts_delete_policy" ON public.carts
    FOR DELETE TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- Cart Items
CREATE POLICY "cart_items_select_policy" ON public.cart_items
    FOR SELECT TO authenticated
    USING (
        cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "cart_items_insert_policy" ON public.cart_items
    FOR INSERT TO authenticated
    WITH CHECK (
        cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
        AND public.is_active_user()
    );

CREATE POLICY "cart_items_update_policy" ON public.cart_items
    FOR UPDATE TO authenticated
    USING (
        cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
        OR public.is_admin()
    )
    WITH CHECK (
        cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
        OR public.is_admin()
    );

CREATE POLICY "cart_items_delete_policy" ON public.cart_items
    FOR DELETE TO authenticated
    USING (
        cart_id IN (SELECT id FROM public.carts WHERE user_id = auth.uid())
        OR public.is_admin()
    );

-- ==============================================================================
-- 7. ORDERS & ORDER ITEMS POLICIES
-- ==============================================================================
-- Orders
CREATE POLICY "orders_select_policy" ON public.orders
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- Users create orders via RPC create_order_atomic (SECURITY DEFINER), but direct inserts permitted only for own user_id
CREATE POLICY "orders_insert_policy" ON public.orders
    FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_active_user());

-- Users can only update cancellation/replacement requests on own orders; admins can update all order fields
CREATE POLICY "orders_update_policy" ON public.orders
    FOR UPDATE TO authenticated
    USING (user_id = auth.uid() OR public.is_admin())
    WITH CHECK (
        (user_id = auth.uid() AND order_status IN ('Cancelled', 'Replacement Requested'))
        OR public.is_admin()
    );

-- Order Items
CREATE POLICY "order_items_select_policy" ON public.order_items
    FOR SELECT TO authenticated
    USING (
        order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        OR public.is_admin()
    );

-- Order Status History
CREATE POLICY "order_status_history_select_policy" ON public.order_status_history
    FOR SELECT TO authenticated
    USING (
        order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
        OR public.is_admin()
    );

-- ==============================================================================
-- 8. PAYMENTS POLICIES
-- ==============================================================================
-- Users can view their own payment records; admins can view all
CREATE POLICY "payments_select_policy" ON public.payments
    FOR SELECT TO authenticated
    USING (user_id = auth.uid() OR public.is_admin());

-- Payments cannot be created or updated directly from client; only service_role backend
CREATE POLICY "payments_admin_all" ON public.payments
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- ==============================================================================
-- 9. AUDIT & EMAIL LOGS POLICIES
-- ==============================================================================
-- Audit logs: read-only for admins; cannot be written or altered by clients
CREATE POLICY "audit_logs_select_admin" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- Email logs: read-only for admins; cannot be written or altered by clients
CREATE POLICY "email_logs_select_admin" ON public.email_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

