-- ==============================================================================
-- MD Shakib Islamic Books — Supabase Migration 012 (Hardened)
-- Phase 10: Performance, Security, Database Query Indexes & Distributed Rate Limiting
-- Migration: 20261106000001_phase10_performance_security_and_indexes.sql
-- ==============================================================================

-- ==============================================================================
-- 1. EXTENSIONS
-- ==============================================================================

-- Enable trigram extension for accelerated ILIKE text search across book titles and authors
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==============================================================================
-- 2. COMPOSITE PERFORMANCE INDEXES
-- ==============================================================================

-- Accelerate primary catalog listing and home page queries: (is_active = true ORDER BY created_at DESC)
-- Serves apps/web/lib/data/catalog.ts getBooks() and getFeaturedBooks()
CREATE INDEX IF NOT EXISTS idx_books_active_created_at 
    ON public.books (is_active, created_at DESC);

-- Accelerate customer order history and dashboard queries: (user_id ORDER BY created_at DESC)
-- Serves apps/web/lib/commerce/orders.ts getUserOrders() and customer account dashboard
CREATE INDEX IF NOT EXISTS idx_orders_user_created_at 
    ON public.orders (user_id, created_at DESC);

-- NOTE ON CART ITEMS INDEX:
-- The previously proposed 'idx_cart_items_cart_book' ON public.cart_items (cart_id, book_id)
-- is intentionally NOT created here. Migration 001 (20261028000001_core_schema.sql) already
-- provisions 'CONSTRAINT uq_cart_book UNIQUE (cart_id, book_id)'. In PostgreSQL, a UNIQUE
-- constraint automatically generates an underlying unique btree index covering (cart_id, book_id).
-- Adding a duplicate index would cause redundant write amplification without any query benefit.

-- Accelerate search by book title in catalog queries (ILIKE pattern matching)
-- Serves apps/web/lib/data/catalog.ts getBooks() title.ilike filter
CREATE INDEX IF NOT EXISTS idx_books_title_trgm 
    ON public.books USING gin (title gin_trgm_ops);

-- Accelerate search by book author in catalog queries (ILIKE pattern matching)
-- Serves apps/web/lib/data/catalog.ts getBooks() author.ilike filter
CREATE INDEX IF NOT EXISTS idx_books_author_trgm 
    ON public.books USING gin (author gin_trgm_ops);

-- ==============================================================================
-- 3. DISTRIBUTED RATE LIMITING TABLE & HARDENED CONSTRAINTS
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.rate_limits (
    key TEXT NOT NULL,
    window_start TIMESTAMPTZ NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (key, window_start),
    CONSTRAINT chk_rate_limits_key_length CHECK (char_length(key) > 0 AND char_length(key) <= 255),
    CONSTRAINT chk_rate_limits_count_positive CHECK (count > 0)
);

-- Index for maintenance pruning of expired windows
CREATE INDEX IF NOT EXISTS idx_rate_limits_window_start 
    ON public.rate_limits (window_start);

-- Row Level Security
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- Clean up any existing policies
DROP POLICY IF EXISTS "rate_limits_admin_select" ON public.rate_limits;
DROP POLICY IF EXISTS "rate_limits_admin_all" ON public.rate_limits;

-- Only authenticated administrators can inspect or manage rate limit records
-- (Customer and anonymous access is completely blocked)
CREATE POLICY "rate_limits_admin_all" ON public.rate_limits
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- Table-level privileges: Revoke public access, grant strictly to service_role and authenticated admins
REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limits TO service_role;
GRANT SELECT ON TABLE public.rate_limits TO authenticated;

-- ==============================================================================
-- 4. ATOMIC RATE LIMITING PROCEDURE (SECURITY DEFINER)
-- ==============================================================================

-- Implements an atomic, epoch-aligned fixed-window counter in PostgreSQL.
-- Fixed-window provides deterministic O(1) space and time performance per request,
-- eliminating lock contention and table bloat from sliding-log algorithms.
CREATE OR REPLACE FUNCTION public.check_rate_limit(
    p_key TEXT,
    p_max_requests INTEGER,
    p_window_seconds INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_window_start TIMESTAMPTZ;
    v_current_count INTEGER;
    v_allowed BOOLEAN;
    v_reset_epoch BIGINT;
    v_remaining INTEGER;
BEGIN
    -- Strict Input Validation
    IF p_key IS NULL OR char_length(trim(p_key)) = 0 OR char_length(p_key) > 255 THEN
        RAISE EXCEPTION 'check_rate_limit: p_key must be non-empty and <= 255 characters';
    END IF;

    IF p_max_requests IS NULL OR p_max_requests <= 0 OR p_max_requests > 100000 THEN
        RAISE EXCEPTION 'check_rate_limit: p_max_requests must be between 1 and 100000';
    END IF;

    IF p_window_seconds IS NULL OR p_window_seconds <= 0 OR p_window_seconds > 86400 THEN
        RAISE EXCEPTION 'check_rate_limit: p_window_seconds must be between 1 and 86400 (max 24 hours)';
    END IF;

    -- Compute fixed window boundary aligned to epoch
    v_window_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
    v_reset_epoch := extract(epoch from v_window_start)::BIGINT + p_window_seconds;

    -- Upsert atomic counter in public.rate_limits (with overflow protection)
    INSERT INTO public.rate_limits (key, window_start, count)
    VALUES (p_key, v_window_start, 1)
    ON CONFLICT (key, window_start)
    DO UPDATE SET count = LEAST(2147483647, public.rate_limits.count + 1)
    RETURNING count INTO v_current_count;

    v_allowed := (v_current_count <= p_max_requests);
    v_remaining := GREATEST(0, p_max_requests - v_current_count);

    RETURN jsonb_build_object(
        'allowed', v_allowed,
        'limit', p_max_requests,
        'remaining', v_remaining,
        'reset', v_reset_epoch,
        'current', v_current_count
    );
END;
$$;

-- Restrict execution strictly to trusted server-side service_role callers
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- ==============================================================================
-- 5. DEDICATED MAINTENANCE PRUNING PROCEDURE
-- ==============================================================================

-- Decoupled maintenance cleanup procedure. Pruning is removed from the hot user request
-- path to eliminate unexpected transaction latency spikes and table lock contention.
CREATE OR REPLACE FUNCTION public.prune_expired_rate_limits(
    p_retention_interval INTERVAL DEFAULT INTERVAL '2 hours'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM public.rate_limits 
    WHERE window_start < (now() - p_retention_interval);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$;

-- Execution granted strictly to service_role (for pg_cron, scheduled functions, or backend workers)
REVOKE ALL ON FUNCTION public.prune_expired_rate_limits(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_expired_rate_limits(INTERVAL) TO service_role;
