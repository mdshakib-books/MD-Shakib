# PHASE 5A — Security Validation Report

**Project:** MD Shakib Islamic Books  
**Phase:** 5A — Supabase Foundation & Read-Only Storefront Integration  
**Date:** 2026-10-29  
**Status:** PASS  

---

## 1. Executive Summary

This security audit verifies that the public catalog integration in Next.js App Router (`apps/web/`) connects securely to the Supabase PostgreSQL database without exposing privileged credentials, bypassing Row-Level Security (RLS), or allowing unauthorized access to customer records.

---

## 2. Credential & Environment Variable Hygiene

1. **Client-Exposed Configuration:**
   - Only `NEXT_PUBLIC_SUPABASE_URL` (`http://127.0.0.1:54321`) and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are exposed to the browser.
   - The anonymous key is restricted by PostgreSQL RLS.
2. **Server Secrets:**
   - No `service_role` key was introduced or utilized in Phase 5A.
   - The `.env.local` file contains only public configuration and is strictly excluded by `.gitignore`.
   - `.env.example` contains only template placeholders.
3. **Bundle Inspection:**
   - Client bundle inspection confirms zero server-side database passwords, secrets, or internal URLs are bundled into client components.

---

## 3. RLS & Negative Security Test Results

All negative tests were executed directly against the local Supabase container via `apps/web/scripts/test-catalog.mjs`:

| Target Table | Request Role | Attempted Operation | Expected Result | Actual Result | Security Status |
|---|---|---|---|---|---|
| `public.books` | `anon` | `SELECT * WHERE is_active = true` | Allowed | Returns 5 active books | **PASS** |
| `public.books` | `anon` | `SELECT * WHERE is_active = false` | Blocked by RLS | 0 rows returned | **PASS** |
| `public.profiles` | `anon` | `SELECT *` | Blocked by RLS | 0 rows returned | **PASS** |
| `public.orders` | `anon` | `SELECT *` | Blocked by RLS | 0 rows returned | **PASS** |
| `public.addresses` | `anon` | `SELECT *` | Blocked by RLS | 0 rows returned | **PASS** |
| `public.cart_items`| `anon` | `SELECT *` | Blocked by RLS | 0 rows returned | **PASS** |

---

## 4. Query Injection & Search Sanitization

1. **Parameterization:**
   - Queries are constructed using the official `@supabase/ssr` / `@supabase/supabase-js` query builder, which uses parameterized queries via PostgREST.
   - User search inputs are sanitized by escaping PostgreSQL `ILIKE` wildcard characters (`%`, `_`, `\`) via `escapeLikePattern()`.
   - Search query strings are truncated to a maximum length of 100 characters to prevent buffer or performance denial of service.
2. **UUID Validation:**
   - Book ID lookups in `getBookById` validate against a strict UUID regex before issuing queries, returning `null` for malformed IDs. This prevents database syntax errors or injection vectors.

---

## 5. Information Disclosure & Error Boundaries

- Database query errors are logged server-side via `console.error` and sanitized generic error messages are presented to the user.
- Internal database error stacks, SQL statements, and host details are never leaked to the client UI.

