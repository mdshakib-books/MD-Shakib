# Phase 10: Migration 012 Security Analysis & Threat Model

**Project:** MD Shakib Islamic Books  
**Component:** Database Migration 012 (`20261106000001_phase10_performance_security_and_indexes.sql`)  
**Security Classification:** High (Core Anti-Abuse, Rate Limiting & Query Engine)  
**Date:** November 6, 2026  

---

## 1. Security Architecture & Threat Matrix

Database Migration 012 introduces persistent state (`public.rate_limits`) and privileged procedural logic (`public.check_rate_limit`, `public.prune_expired_rate_limits`). Because rate limiting is the primary safeguard protecting authentication, payment processing, checkout, and webhook routes, the database migration itself must adhere to defense-in-depth principles.

### Threat Modeling Summary

| Threat Vector | Severity | Vulnerability in Original Migration 012 | Hardened Defense Implemented |
| :--- | :--- | :--- | :--- |
| **Unauthenticated Rate Limit Manipulation** | **Critical** | PostgreSQL functions grant execution to `PUBLIC` by default. An attacker could invoke `check_rate_limit` via Supabase client RPC to exhaust quotas of targeted users. | Explicitly revoked execution from `PUBLIC`, `anon`, and `authenticated`. Granted execute strictly to `service_role`. |
| **Search Path Hijacking (Schema Poisoning)** | **High** | Using unqualified object names in `SECURITY DEFINER` functions can allow attackers with table creation rights in schemas to hijack function execution. | Function header enforces `SET search_path = public, pg_temp` and all SQL commands strictly use schema-qualified references (`public.rate_limits`). |
| **Division by Zero / Crash Vector** | **High** | `extract(epoch from now()) / p_window_seconds` crashed the backend transaction if `p_window_seconds <= 0` or NULL. | Strict input validation raises an exception immediately if `p_window_seconds <= 0` or NULL. |
| **Buffer Exhaustion / Key Memory Bloat** | **Medium** | Unbounded `p_key TEXT` allowed an attacker to insert megabyte-sized strings, bloating the btree primary key index and exhausting buffer pools. | Enforced check constraint `chk_rate_limits_key_length` (1–255 characters) and procedural validation `char_length(p_key) <= 255`. |
| **Counter Integer Overflow** | **Medium** | `count = rate_limits.count + 1` on signed 32-bit integer would throw `integer out of range` on exceeding 2,147,483,647. | Clamped counter update using `LEAST(2147483647, public.rate_limits.count + 1)`. |
| **Request-Time Lock Contention & DoS** | **Medium** | Opportunistic `random() < 0.10` inline `DELETE` forced user requests to lock table ranges and execute deletions. | Completely removed `DELETE` from user request path. Decoupled into `public.prune_expired_rate_limits()`. |
| **Information Disclosure via Table Scan** | **Low** | If `rate_limits` table privileges leaked, authenticated customers could inspect IP hashes, email keys, or shopping activity. | Revoked all table privileges from `PUBLIC`, `anon`, and regular `authenticated` users; RLS allows only verified administrators (`public.is_admin()`). |

---

## 2. PostgreSQL Role-Based Access Control (RBAC) Matrix

Supabase defines distinct PostgreSQL database roles:
1. `anon`: Unauthenticated browser clients.
2. `authenticated`: Authenticated customers and staff logged into Supabase Auth.
3. `service_role`: Trusted server-side backend operations (bypasses RLS).

### Explicit Privileges Matrix

| Database Object | Role: `anon` | Role: `authenticated` (Customer) | Role: `authenticated` (Admin) | Role: `service_role` (Backend) |
| :--- | :--- | :--- | :--- | :--- |
| **`public.rate_limits` (Table)** | ❌ None | ❌ None | 🔍 `SELECT` (guarded by RLS) | ⚡ `ALL` (Bypasses RLS) |
| **`public.check_rate_limit` (Function)** | ❌ No Execute | ❌ No Execute | ❌ No Execute | ⚡ `EXECUTE` |
| **`public.prune_expired_rate_limits` (Function)** | ❌ No Execute | ❌ No Execute | ❌ No Execute | ⚡ `EXECUTE` |
| **`public.books` (Table)** | 🔍 `SELECT` (active books) | 🔍 `SELECT` (active books) | ⚡ `ALL` | ⚡ `ALL` |
| **`public.orders` (Table)** | ❌ None | 🔍 `SELECT`, `INSERT` (own user_id) | ⚡ `ALL` | ⚡ `ALL` |

### Code Implementation in Migration 012
```sql
-- Table level isolation
REVOKE ALL ON TABLE public.rate_limits FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.rate_limits TO service_role;
GRANT SELECT ON TABLE public.rate_limits TO authenticated;

-- Function level isolation
REVOKE ALL ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.prune_expired_rate_limits(INTERVAL) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_expired_rate_limits(INTERVAL) TO service_role;
```

---

## 3. SECURITY DEFINER Deep Dive & Defenses

### 3.1. What is SECURITY DEFINER?
A PostgreSQL function declared with `SECURITY DEFINER` executes with the privileges of the user that owns the function (in Supabase, the `postgres` superuser/administrative role), rather than the privileges of the calling user.

### 3.2. Risks of SECURITY DEFINER & Mitigations
1. **Search Path Poisoning:**
   - *Risk:* If `search_path` is mutable, an attacker could create an object (e.g. `rate_limits` or an operator) in a temporary schema or public schema, tricking the superuser function into running untrusted code.
   - *Mitigation:* Pin the execution path explicitly:
     ```sql
     SET search_path = public, pg_temp
     ```
     `pg_temp` is placed last to prevent temporary table shadowing. All schema objects referenced in the query are explicitly schema-qualified as `public.rate_limits`.

2. **Privilege Leakage to Browser Code:**
   - *Risk:* PostgREST exposes all database functions in the `public` schema as RPC endpoints at `/rest/v1/rpc/<function_name>`. If execute permissions are granted to `anon` or `authenticated`, any browser client can invoke the function directly.
   - *Mitigation:* Explicit `REVOKE ALL ... FROM PUBLIC, anon, authenticated;` immediately drops execute privileges. PostgREST rejects external calls from browser clients with HTTP 403 Forbidden.

3. **Input Sanitization & Invariants:**
   - *Risk:* Malicious or malformed inputs passed through backend services could corrupt rate limiting tables or cause database exceptions.
   - *Mitigation:*
     - `p_key` must be non-null, non-empty, and `<= 255` characters.
     - `p_max_requests` bounded to `1 .. 100,000`.
     - `p_window_seconds` bounded to `1 .. 86,400`.

---

## 4. Row Level Security (RLS) Policy Consolidation

Migration 012 enables RLS on `public.rate_limits`.

### Redundancy Remediation
The original migration created two policies:
1. `rate_limits_admin_select` (`FOR SELECT TO authenticated USING (public.is_admin())`)
2. `rate_limits_admin_all` (`FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())`)

In PostgreSQL RLS, multiple policies for the same command are combined with `OR`. Because `FOR ALL` includes `SELECT`, having both caused PostgreSQL to evaluate `public.is_admin()` twice for every select statement.

### Hardened Implementation
```sql
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "rate_limits_admin_select" ON public.rate_limits;
DROP POLICY IF EXISTS "rate_limits_admin_all" ON public.rate_limits;

CREATE POLICY "rate_limits_admin_all" ON public.rate_limits
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());
```
- Customers and anonymous visitors have zero row visibility or modification rights.
- Verified administrators (`public.is_admin() = true`) can inspect rate limit counters in administrative dashboards.
- Backend processes (`service_role`) bypass RLS, ensuring zero performance overhead for user request verification.

---

## 5. Storage Growth & Database Sanitization

### Disk Space Calculation
Each record in `public.rate_limits` consists of:
- `key`: ~30–60 bytes average (e.g. `rl:auth:login:user@example.com`).
- `window_start`: 8 bytes (`TIMESTAMPTZ`).
- `count`: 4 bytes (`INTEGER`).
- Row overhead + Tuple header: 24 bytes.
- Total per active key: ~75–100 bytes.

For 100,000 active keys in a 2-hour window:
$$\text{Total Table Footprint} \approx 100,000 \times 100 \text{ bytes} \approx 10 \text{ MB}$$

With the secondary index on `window_start` (`idx_rate_limits_window_start`), periodic execution of `public.prune_expired_rate_limits(INTERVAL '2 hours')` deletes expired windows in constant time, allowing PostgreSQL autovacuum to reclaim space efficiently and preventing table bloat.

