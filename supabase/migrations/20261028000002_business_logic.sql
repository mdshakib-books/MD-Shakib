-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 002
-- Business Logic, Invariants & Atomic Functions
-- ==============================================================================

-- ==============================================================================
-- 1. AUTOMATIC UPDATED_AT TIMESTAMP TRIGGER
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_addresses_updated_at ON public.addresses;
CREATE TRIGGER trg_addresses_updated_at BEFORE UPDATE ON public.addresses
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_books_updated_at ON public.books;
CREATE TRIGGER trg_books_updated_at BEFORE UPDATE ON public.books
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_carts_updated_at ON public.carts;
CREATE TRIGGER trg_carts_updated_at BEFORE UPDATE ON public.carts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_cart_items_updated_at ON public.cart_items;
CREATE TRIGGER trg_cart_items_updated_at BEFORE UPDATE ON public.cart_items
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS trg_email_logs_updated_at ON public.email_logs;
CREATE TRIGGER trg_email_logs_updated_at BEFORE UPDATE ON public.email_logs
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==============================================================================
-- 2. AUTOMATIC ORDER STATUS HISTORY RECORDER
-- Matches legacy orderSchema.pre('save') which pushed initial and status changes
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.record_order_status_history()
RETURNS TRIGGER AS $$
BEGIN
    IF (TG_OP = 'INSERT') THEN
        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (NEW.id, NEW.order_status, 'Order created with initial status', NOW());
    ELSIF (TG_OP = 'UPDATE' AND OLD.order_status IS DISTINCT FROM NEW.order_status) THEN
        INSERT INTO public.order_status_history (order_id, status, note, created_at)
        VALUES (NEW.id, NEW.order_status, COALESCE(NEW.cancel_reason, ''), NOW());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_order_status_history ON public.orders;
CREATE TRIGGER trg_order_status_history AFTER INSERT OR UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.record_order_status_history();

-- ==============================================================================
-- 3. ENSURE SINGLE DEFAULT ADDRESS PER USER
-- Automatically unsets default flag on previous address when a new default is set
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.handle_default_address()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_default THEN
        UPDATE public.addresses
        SET is_default = FALSE
        WHERE user_id = NEW.user_id AND id <> NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_default_address ON public.addresses;
CREATE TRIGGER trg_default_address BEFORE INSERT OR UPDATE ON public.addresses
    FOR EACH ROW EXECUTE FUNCTION public.handle_default_address();

-- ==============================================================================
-- 4. ATOMIC ORDER CREATION & STOCK DECREMENT
-- Replaces server/src/utils/stock.util.js validateAndReduceStock + Order creation
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_user_id UUID,
    p_items JSONB,              -- Array of { "book_id": UUID, "quantity": INT, "price": NUMERIC }
    p_address_snapshot JSONB,
    p_payment_method TEXT,
    p_total_amount NUMERIC
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
    -- Validate payment method
    IF p_payment_method NOT IN ('COD', 'ONLINE') THEN
        RAISE EXCEPTION 'Invalid payment method: %', p_payment_method;
    END IF;

    -- Validate items array
    IF jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Order items cannot be empty';
    END IF;

    -- Create Order record
    INSERT INTO public.orders (
        user_id,
        total_amount,
        payment_method,
        payment_status,
        order_status,
        address_snapshot,
        is_paid
    ) VALUES (
        p_user_id,
        p_total_amount,
        p_payment_method,
        'Pending',
        'Pending',
        p_address_snapshot,
        FALSE
    ) RETURNING id INTO v_order_id;

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- 5. ATOMIC ORDER CANCELLATION & STOCK RESTORATION
-- Replaces server/src/utils/stock.util.js restoreStock + Order cancel
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
    v_item RECORD;
BEGIN
    -- Fetch and lock order
    SELECT order_status, user_id INTO v_order_status, v_order_user_id
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % not found', p_order_id;
    END IF;

    -- Authorization check (User can only cancel own order, Admin can cancel any)
    IF NOT p_is_admin AND v_order_user_id <> p_user_id THEN
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
        cancel_reason = COALESCE(p_cancel_reason, 'Cancelled by user')
    WHERE id = p_order_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

