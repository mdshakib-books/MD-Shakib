-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 007
-- Order Creation Idempotency & Duplicate Prevention
-- ==============================================================================

-- 1. ADD IDEMPOTENCY KEY TO ORDERS TABLE
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS idempotency_key TEXT DEFAULT NULL;

-- 2. CREATE UNIQUE INDEX TO ENFORCE IDEMPOTENCY PER USER
CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_user_idempotency_key
ON public.orders(user_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- 3. UPDATE ATOMIC ORDER CREATION TO SUPPORT IDEMPOTENCY
-- Drop previous 5-arg signature to prevent ambiguity
DROP FUNCTION IF EXISTS public.create_order_atomic(UUID, JSONB, JSONB, TEXT, NUMERIC);

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ==============================================================================
-- 4. ATOMIC GUEST-TO-AUTHENTICATED CART MERGE WITH RETRY SAFETY
-- ==============================================================================

-- Add last_merge_token column to public.carts for retry-safe idempotent cart merges
ALTER TABLE public.carts
ADD COLUMN IF NOT EXISTS last_merge_token TEXT DEFAULT NULL;

CREATE OR REPLACE FUNCTION public.merge_cart_atomic(
    p_user_id UUID,
    p_guest_items JSONB,              -- Array of { "book_id": UUID, "quantity": INT }
    p_merge_token TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
