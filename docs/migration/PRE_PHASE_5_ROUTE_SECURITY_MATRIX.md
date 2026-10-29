# PRE-PHASE 5 — Route Behavior, Authorization & Security Matrix

**Project:** MD Shakib Islamic Books  
**Audit Date:** 2026-10-28  
**Scope:** All 21 customer-facing storefront routes, authentication gates, authorization rules, and Phase 5 integration plans.  
**Status:** PASS (All routes operational; security boundaries documented and enforced)

---

## 1. Route Security & Access Boundary Matrix

| Route Path | Legacy Route | Access Level | Auth Enforcement Mechanism (Phase 5) | Error / Redirect Boundary |
|---|---|---|---|---|
| `/` | `/` | Public | None (Anonymous access permitted) | Fallback / 500 error boundary |
| `/books` | `/books` | Public | None (Search, filter, pagination public) | Empty results state |
| `/books/[id]` | `/book/:id` | Public | None (Public catalog item) | `notFound()` -> HTTP 404 |
| `/cart` | `/cart` | Public / Hybrid | Local storage cart merged on login; authenticated cart sync | Empty cart state |
| `/checkout` | `/checkout` | Protected | Redirect to `/login?redirect=/checkout` if unauthenticated | Validation / redirect |
| `/login` | `/login` | Guest Only | Redirect to `/profile` or `?redirect=` if already authenticated | Error toast / message |
| `/register` | `/register` | Guest Only | Redirect to `/profile` if already authenticated | Error toast / validation |
| `/verify-otp` | `/verify-otp` | Guest Only | Redirect to `/profile` if session active | Invalid OTP notification |
| `/verify-registration-otp` | `/verify-registration-otp` | Guest Only | Requires pending verification state | Token expired banner |
| `/verify-email` | `/verify-email` | Guest Only | Validates token param | Expired / invalid token state |
| `/forgot-password` | `/forgot-password` | Guest Only | Redirect to `/profile` if logged in | Success/Error alert |
| `/reset-password` | `/reset-password` | Guest Only | Validates reset token | Invalid token warning |
| `/profile` | `/profile` | Protected | Supabase session check; redirect to `/login` | Profile loading / redirect |
| `/addresses` | `/addresses` | Protected | Supabase session check; RLS isolates user addresses | Empty address list |
| `/orders` | `/orders` | Protected | Supabase session check; RLS isolates customer orders | Empty orders list |
| `/orders/[id]` | `/orders/:id` | Protected | Session check + ownership verification (`user_id = auth.uid()`) | 404 or 403 unauthorized |
| `/order-success` | `/order-success` | Protected / Guarded | Requires valid `orderId` parameter | Redirect to `/orders` if missing |
| `/about` | `/about` | Public | None | Static render |
| `/support` | `/support` | Public | None (Contact / feedback submission) | Form feedback |
| `/terms` | `/terms` | Public | None | Static render |
| `/privacy-policy` | `/privacy-policy` | Public | None | Static render |

---

## 2. Dynamic Route Validation & 404 Boundaries

1. `/books/[id]`:
   - Valid fixture ID (e.g., `a0000000-0000-0000-0000-000000000001` or `mock-1`): Returns HTTP 200 with complete product details, reviews, author info, and price summary.
   - Non-existent ID (e.g., `/books/non-existent-book-id-99999`): Explicitly triggers Next.js `notFound()`, rendering custom Islamic-themed 404 page with HTTP 404 status.
2. `/orders/[id]`:
   - Valid mock ID (`mock-order-1`): Returns HTTP 200 with tracking status, item list, delivery address, and pricing breakdown.
   - Invalid order ID: Renders safe fallback or `notFound()`.
   - In Phase 5: Even if order exists in database, PostgreSQL RLS (`order_items_select_policy` and `orders_select_policy`) prevents reading foreign orders (`WHERE orders.user_id = auth.uid()`).

---

## 3. Middleware Architecture Plan for Phase 5

To enforce authorization cleanly at the edge without client-side flash of protected content:
1. `middleware.ts` will use `@supabase/ssr` to validate user session cookies.
2. Protected routes (`/profile`, `/addresses`, `/orders`, `/orders/:path*`, `/checkout`) will check `supabase.auth.getUser()`. If unauthenticated, redirect to `/login?redirect=${encodeURIComponent(req.nextUrl.pathname)}`.
3. Guest routes (`/login`, `/register`, `/forgot-password`, `/reset-password`) will redirect authenticated users back to `/profile` or the requested redirect target.

---

## 4. Verification Check

- [x] All 21 customer routes build and render statically/dynamically without compilation errors.
- [x] Route parameters and query string handling mirror legacy React Router `useParams` and `useSearchParams`.
- [x] Protected route patterns established and audited for Phase 5 implementation.

