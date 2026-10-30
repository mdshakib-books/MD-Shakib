-- ==============================================================================
-- MD Shakib Islamic Books — Production Database Read-Only Preflight Package
-- File: docs/sql/production_preflight_readonly.sql
-- Target Project: mhyawpnjhajytetqppam (Supabase Cloud PostgreSQL)
-- Mode: STRICTLY READ-ONLY (SELECT, SHOW, and non-mutating DO notice statements; zero DDL, DML, or state mutations)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. POSTGRESQL VERSION, DATABASE CONTEXT & SERVER SETTINGS
-- ------------------------------------------------------------------------------
SELECT 
    version() AS postgres_version,
    current_database() AS database_name,
    current_user AS session_user,
    inet_server_addr() AS server_address,
    inet_server_port() AS server_port,
    current_setting('server_version_num') AS version_num,
    current_setting('timezone') AS configured_timezone;

-- ------------------------------------------------------------------------------
-- 2. SCHEMAS & ROLE USAGE PRIVILEGES
-- ------------------------------------------------------------------------------
SELECT 
    schema_name, 
    schema_owner, 
    has_schema_privilege('anon', schema_name, 'USAGE') AS anon_usage,
    has_schema_privilege('authenticated', schema_name, 'USAGE') AS auth_usage,
    has_schema_privilege('service_role', schema_name, 'USAGE') AS service_usage,
    has_schema_privilege('postgres', schema_name, 'USAGE') AS postgres_usage
FROM information_schema.schemata 
WHERE schema_name NOT IN ('pg_toast', 'pg_catalog', 'information_schema')
ORDER BY schema_name;

-- ------------------------------------------------------------------------------
-- 3. ALL EXISTING TABLES, VIEWS & MATERIALIZED VIEWS
-- ------------------------------------------------------------------------------
SELECT 
    table_schema, 
    table_name, 
    table_type,
    table_owner
FROM (
    SELECT 
        table_schema, 
        table_name, 
        table_type,
        (SELECT tableowner FROM pg_tables WHERE schemaname = t.table_schema AND tablename = t.table_name) AS table_owner
    FROM information_schema.tables t
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
    UNION ALL
    SELECT 
        schemaname AS table_schema, 
        matviewname AS table_name, 
        'MATERIALIZED VIEW' AS table_type,
        matviewowner AS table_owner
    FROM pg_matviews
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
) all_relations
ORDER BY table_schema, table_name;

-- ------------------------------------------------------------------------------
-- 4. EXISTING COLUMNS, DATA TYPES & NULLABILITY (PUBLIC & SUPABASE_MIGRATIONS)
-- ------------------------------------------------------------------------------
SELECT 
    table_schema,
    table_name,
    column_name,
    ordinal_position,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema IN ('public', 'supabase_migrations')
ORDER BY table_schema, table_name, ordinal_position;

-- ------------------------------------------------------------------------------
-- 5. CONSTRAINTS (PRIMARY KEYS, FOREIGN KEYS, UNIQUE, CHECK)
-- ------------------------------------------------------------------------------
SELECT 
    tc.table_schema,
    tc.table_name,
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name,
    cc.check_clause
FROM information_schema.table_constraints tc
LEFT JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name 
    AND tc.table_schema = kcu.table_schema
    AND tc.table_name = kcu.table_name
LEFT JOIN information_schema.check_constraints cc
    ON tc.constraint_name = cc.constraint_name 
    AND tc.table_schema = cc.constraint_schema
WHERE tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- ------------------------------------------------------------------------------
-- 6. EXISTING INDEXES (PUBLIC SCHEMA)
-- ------------------------------------------------------------------------------
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- ------------------------------------------------------------------------------
-- 7. EXISTING TRIGGERS (PUBLIC & AUTH SCHEMAS)
-- ------------------------------------------------------------------------------
SELECT 
    event_object_schema,
    event_object_table,
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_schema IN ('public', 'auth')
ORDER BY event_object_table, trigger_name;

-- ------------------------------------------------------------------------------
-- 8. EXISTING FUNCTIONS & STORED PROCEDURES (PUBLIC SCHEMA)
-- ------------------------------------------------------------------------------
SELECT 
    routine_name,
    routine_type,
    data_type AS return_type,
    security_type,
    is_deterministic
FROM information_schema.routines
WHERE routine_schema = 'public'
ORDER BY routine_name;

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) STATUS & ACTIVE POLICIES
-- ------------------------------------------------------------------------------
-- 9a. Check whether RLS is enabled on all public tables
SELECT 
    schemaname,
    tablename,
    rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- 9b. Inventory all active RLS policies in public schema
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- 9c. Specific collision check for the 26 expected Migration 3 (table_name, policy_name) pairs
-- Extracts full policy definitions (roles, cmd, qual, with_check) for comparison against migration definitions
SELECT 
    p.schemaname,
    p.tablename,
    p.policyname,
    p.permissive,
    p.roles,
    p.cmd,
    p.qual,
    p.with_check
FROM pg_policies p
WHERE p.schemaname = 'public'
  AND (p.tablename, p.policyname) IN (
    ('profiles', 'profiles_select_policy'),
    ('profiles', 'profiles_update_policy'),
    ('profiles', 'profiles_insert_policy'),
    ('profiles', 'profiles_delete_policy'),
    ('addresses', 'addresses_select_policy'),
    ('addresses', 'addresses_insert_policy'),
    ('addresses', 'addresses_update_policy'),
    ('addresses', 'addresses_delete_policy'),
    ('books', 'books_select_public'),
    ('books', 'books_admin_all'),
    ('carts', 'carts_select_policy'),
    ('carts', 'carts_insert_policy'),
    ('carts', 'carts_delete_policy'),
    ('cart_items', 'cart_items_select_policy'),
    ('cart_items', 'cart_items_insert_policy'),
    ('cart_items', 'cart_items_update_policy'),
    ('cart_items', 'cart_items_delete_policy'),
    ('orders', 'orders_select_policy'),
    ('orders', 'orders_insert_policy'),
    ('orders', 'orders_update_policy'),
    ('order_items', 'order_items_select_policy'),
    ('order_status_history', 'order_status_history_select_policy'),
    ('payments', 'payments_select_policy'),
    ('payments', 'payments_admin_all'),
    ('audit_logs', 'audit_logs_select_admin'),
    ('email_logs', 'email_logs_select_admin')
  )
ORDER BY p.tablename, p.policyname;

-- ------------------------------------------------------------------------------
-- 10. ROLE PRIVILEGES (ANON, AUTHENTICATED, SERVICE_ROLE, POSTGRES, PUBLIC)
-- ------------------------------------------------------------------------------
-- 10a. Table privileges
SELECT 
    table_schema,
    table_name,
    grantee,
    privilege_type
FROM information_schema.table_privileges
WHERE table_schema = 'public'
  AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC')
ORDER BY table_name, grantee, privilege_type;

-- 10b. Routine (function) privileges for sensitive payment & refund RPCs (including PUBLIC pseudo-role)
SELECT 
    routine_schema,
    routine_name,
    grantee,
    privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('settle_payment_atomic', 'record_payment_failure_atomic', 'record_refund_atomic', 'create_order_atomic', 'cancel_order_atomic')
  AND grantee IN ('anon', 'authenticated', 'service_role', 'postgres', 'PUBLIC')
ORDER BY routine_name, grantee;

-- ------------------------------------------------------------------------------
-- 11. SECURITY DEFINER FUNCTIONS, OWNERSHIP & SEARCH_PATH CONFIGURATION
-- ------------------------------------------------------------------------------
SELECT 
    p.proname AS function_name,
    r.rolname AS owner,
    p.prosecdef AS is_security_definer,
    p.proconfig AS search_path_config
FROM pg_proc p
JOIN pg_roles r ON p.proowner = r.oid
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
ORDER BY p.proname;

-- ------------------------------------------------------------------------------
-- 12. CREATE PRIVILEGES ON PUBLIC & SUPABASE_MIGRATIONS SCHEMAS
-- ------------------------------------------------------------------------------
SELECT 
    r.rolname AS role_name,
    n.nspname AS schema_name,
    has_schema_privilege(r.rolname, n.nspname, 'CREATE') AS can_create
FROM pg_roles r
CROSS JOIN pg_namespace n
WHERE r.rolname IN ('postgres', 'anon', 'authenticated', 'service_role')
  AND n.nspname IN ('public', 'supabase_migrations')
ORDER BY n.nspname, r.rolname;

-- ------------------------------------------------------------------------------
-- 13. INSTALLED EXTENSIONS & VERSIONS
-- ------------------------------------------------------------------------------
SELECT 
    extname AS extension_name,
    extversion AS installed_version,
    extnamespace::regnamespace AS schema_name
FROM pg_extension
ORDER BY extname;

-- ------------------------------------------------------------------------------
-- 14. SUPABASE MIGRATION TRACKING TABLE STATUS & HISTORY
-- ------------------------------------------------------------------------------
-- 14a. Safe check for tracking table existence in schema catalog
SELECT 
    table_schema,
    table_name,
    table_type
FROM information_schema.tables
WHERE table_schema = 'supabase_migrations';

-- 14b. Dynamic inspection: safely reads recorded migrations without failing on unmigrated databases
DO $$
DECLARE
    rec RECORD;
    v_found BOOLEAN := FALSE;
BEGIN
    IF to_regclass('supabase_migrations.schema_migrations') IS NOT NULL THEN
        RAISE NOTICE '=== RECORDED SUPABASE MIGRATIONS ===';
        FOR rec IN EXECUTE 'SELECT version, name, array_length(statements, 1) AS stmt_count FROM supabase_migrations.schema_migrations ORDER BY version' LOOP
            RAISE NOTICE 'Version: %, Name: %, Statements: %', rec.version, rec.name, rec.stmt_count;
            v_found := TRUE;
        END LOOP;
        IF NOT v_found THEN
            RAISE NOTICE 'Table supabase_migrations.schema_migrations exists but contains 0 migration rows.';
        END IF;
    ELSE
        RAISE NOTICE 'Table supabase_migrations.schema_migrations does not exist (clean unmigrated database).';
    END IF;
END $$;

-- 14c. Direct query (NOTE: Run in SQL Editor only if 14a/14b confirm table exists):
-- SELECT version, name, array_length(statements, 1) AS statement_count FROM supabase_migrations.schema_migrations ORDER BY version;

-- ------------------------------------------------------------------------------
-- 15. SAFE ESTIMATED ROW COUNTS FOR BUSINESS TABLES
-- ------------------------------------------------------------------------------
-- Safe catalog query: returns 0 rows if public tables do not exist yet
SELECT 
    relname AS table_name,
    n_live_tup AS estimated_row_count
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY relname;
