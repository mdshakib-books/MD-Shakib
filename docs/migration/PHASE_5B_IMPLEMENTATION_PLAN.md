# PHASE 5B — Implementation Plan: Customer Authentication & Session Management

**Project:** MD Shakib Islamic Books  
**Phase:** 5B — Customer Authentication & Session Management  
**Framework:** Next.js App Router (16.4.3), React 19, TypeScript 5.9.3, Tailwind CSS v4  
**Authentication Provider:** Supabase Auth (GoTrue), PostgreSQL 17.6  
**Audit Date:** 2026-10-29  

---

## 1. Baseline & Phase 5A Verification

1. **Phase 5A Real Execution Verified:**
   - Pre-flight checks confirmed `apps/web/scripts/test-catalog.mjs` directly queries real local Supabase (`http://127.0.0.1:54321`) using `@supabase/ssr` / `@supabase/supabase-js`.
   - Local Supabase stack is running on Docker with PostgreSQL 17.6 on port 54322, Kong API gateway on port 54321, and Mailpit on port 54324.
2. **Schema & Profile Trigger State:**
   - `public.profiles` schema includes `id`, `name`, `email`, `role`, `phone`, `is_blocked`, `is_deleted`.
   - Initial check revealed no trigger was attached to `auth.users` to automatically create `public.profiles`.
   - Created and applied migration `supabase/migrations/20261029000001_auth_profile_trigger.sql` installing trigger `on_auth_user_created` with function `public.handle_new_user()`.
   - Tested registration with `signUp()`; verified that `public.profiles` row is atomically created with role `user` and `is_blocked = false`.

---

## 2. Authentication Architecture

### 2.1 Core Utilities (`apps/web/lib/auth/`)
- `apps/web/lib/auth/actions.ts`:
  - `signUpCustomer(formData)`: Validates name, email, password; invokes `supabase.auth.signUp({ email, password, options: { data: { name } } })`.
  - `loginCustomer(formData)`: Validates credentials; invokes `supabase.auth.signInWithPassword({ email, password })`. Handles redirects safely.
  - `logoutCustomer()`: Invokes `supabase.auth.signOut()` and redirects to `/`.
  - `sendPasswordReset(formData)`: Invokes `supabase.auth.resetPasswordForEmail(email, { redirectTo })`.
  - `updatePassword(formData)`: Validates password match and invokes `supabase.auth.updateUser({ password })`.
  - `verifyEmailOtp(formData)`: Invokes `supabase.auth.verifyOtp({ email, token, type: 'signup' | 'recovery' })`.
- `apps/web/lib/auth/session.ts`:
  - `getAuthenticatedUser()`: Server-side helper using `supabase.auth.getUser()`. Never trusts client-tamperable state.
  - `getCustomerProfile()`: Fetches the authenticated customer's profile row from `public.profiles`.
  - `sanitizeRedirectUrl(target)`: Validates return URLs to prevent open-redirect vulnerabilities. Only relative paths starting with `/` (and not `//`) are accepted.

### 2.2 Route Protection & Proxy Interception
- `apps/web/proxy.ts` (or Next.js 16 supported middleware/proxy convention):
  - Intercepts incoming requests to refresh Supabase session cookies transparently via `@supabase/ssr`.
  - Protects customer routes: `/profile`, `/addresses`, `/orders`, `/orders/:path*`, `/checkout`.
  - Redirects unauthenticated requests to `/login?redirect=${encodeURIComponent(pathname)}`.
  - Redirects authenticated users away from guest routes (`/login`, `/register`, `/forgot-password`) to `/profile`.

---

## 3. Storefront Route Integrations

1. `/register`: Form submit connected to `signUpCustomer`. Validates name, email, password (min 6 chars), handles duplicate email errors cleanly, redirects to `/verify-email?email=...` or `/profile`.
2. `/login`: Form submit connected to `loginCustomer`. Provides toggleable password visibility, returns field-level error messages, redirects safely to `redirect` param or `/profile`.
3. `/profile`: Fetches verified customer profile (`getCustomerProfile()`). Displays customer name, email (disabled), and phone. Supports updating name and phone via server action.
4. `/forgot-password`: Form submit connected to `sendPasswordReset`. Privacy-preserving success notice.
5. `/reset-password`: Form submit connected to `updatePassword`. Validates matching passwords, sets new password, redirects to `/login`.
6. `/verify-email` & `/verify-otp`: Supports entering 6-digit OTP code sent by Supabase Auth, calling `verifyOtp`, and logging customer into session.

---

## 4. Security Invariants
- Zero service-role keys exposed.
- RLS enforced on `public.profiles` (`(auth.uid() = id) OR is_admin()`).
- Server actions strictly verify `auth.uid()` via `supabase.auth.getUser()`. Users cannot modify `role` or `is_blocked`.
- Open-redirect protection enforced on all login callbacks.
- Passwords, OTPs, and tokens are never logged.

---

## 5. Verification Plan
- `npm run typecheck`, `npm run lint`, `npm run build` in `apps/web`.
- Automated test script `apps/web/scripts/test-auth.mjs` verifying:
  - Sign up with auto-profile creation
  - Duplicate email rejection
  - Login with valid credentials
  - Invalid password rejection
  - Password reset request
  - OTP verification
  - Customer profile isolation (User 1 cannot update User 2)
  - Privilege escalation protection (User cannot set `role = 'admin'`)
- Legacy `client/` Vite build and `server/` syntax checks.

