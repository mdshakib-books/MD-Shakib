# PHASE 5C — Test Results & Evidence

**Project:** MD Shakib Islamic Books  
**Phase:** 5C — Cart, Addresses, Checkout & Order Lifecycle  
**Date:** 2026-10-29  
**Status:** **ALL 10 TESTS PASSED**  

---

## 1. Automated Commerce, Atomicity & RLS Test Suite

Command: `node apps/web/scripts/test-commerce.mjs`  
Database: Local Supabase Stack (`http://127.0.0.1:54321` / PostgreSQL 17.6)

```
=== PHASE 5C: PERSISTENT CART, ADDRESSES & ATOMIC ORDER SUITE ===

1. Registering Customer A & Customer B
[PASS] Customers created and authenticated.

2. Testing Address CRUD & handle_default_address() trigger
[PASS] Inserted Address 1 (Default: true)
[PASS] Single default address invariant verified by database trigger

3. Testing Address Cross-Tenant Isolation
[PASS] Customer B cannot read Customer A addresses (RLS enforced)

4. Testing Persistent Cart Operations (Add, Update, Remove)
[PASS] Added book to cart (Qty: 2)
[PASS] Cart item quantity successfully updated to 3

5. Testing Cart Cross-Tenant Isolation
[PASS] Customer B cannot view Customer A cart items (RLS enforced)

6. Testing Atomic Order Creation (create_order_atomic)
[PASS] Order successfully created atomically: ID 3a40949f-07ab-4a8e-9f56-f44ee472c786
[PASS] Inventory decremented atomically from 45 to 43
[PASS] Customer cart automatically cleared after order placement

7. Testing Insufficient Stock Rollback
[PASS] Insufficient stock rejected with error: "Insufficient stock for "The Noble Quran (English Translation & Commentary)" (Requested: 145, Available: 43)"
[PASS] Transaction rolled back safely with zero stock alteration

8. Testing Order Cross-Tenant Read Isolation
[PASS] Customer B cannot read Customer A order records (RLS enforced)

9. Testing Order Cancellation & Stock Restoration (cancel_order_atomic)
[PASS] Inventory restored back to 45 upon order cancellation

10. Testing Repeated Cancellation Replay Protection
[PASS] Replay cancellation rejected with error: "Order cannot be cancelled in Cancelled status"
[PASS] Exact-once inventory restoration invariant verified

>>> ALL 10 PHASE 5C COMMERCE & ATOMICITY TESTS PASSED <<<
```

---

## 2. Next.js App Router Verification Checks

### 2.1 TypeScript Check (`npm run typecheck`)
- Command: `tsc --noEmit`
- Result: **0 errors**

### 2.2 ESLint (`npm run lint`)
- Command: `eslint .`
- Result: **0 errors, 0 warnings**

### 2.3 Production Build (`npm run build`)
- Command: `next build`
- Result: **Compiled successfully (14 static + 7 dynamic routes + Edge Proxy)**

---

## 3. HTTP Smoke Test Evidence

Executed against `next start -p 3007`:

| Route Path | Unauthenticated Status | Verified Behavior |
|---|---|---|
| `GET /cart` | `HTTP 200` | Displays empty/sign-in guidance |
| `GET /checkout` | `HTTP 307` | Redirects to `/login?redirect=%2Fcheckout` |
| `GET /addresses` | `HTTP 307` | Redirects to `/login?redirect=%2Faddresses` |
| `GET /orders` | `HTTP 307` | Redirects to `/login?redirect=%2Forders` |
| `GET /order-success` | `HTTP 307` | Redirects to `/login?redirect=%2Forder-success` |
| `GET /orders/[id]` | `HTTP 307` | Redirects to `/login?redirect=%2Forders%2F...` |

---

## 4. Legacy Codebase Integrity Evidence

1. **Legacy Vite Build (`client/`):**
   - Command: `cd client && npm run build`
   - Result: Compiled in 1.11s with 0 modifications to legacy files.
2. **Legacy Node Server (`server/`):**
   - Command: `node -c server/app.js && node -c server/server.js`
   - Result: 0 syntax errors.
3. **Git Cleanliness:**
   - Command: `git diff --check`
   - Result: Clean. Zero whitespace issues or conflict markers.

---

## 5. Independent Verification Gate Re-Test (Post-Step 1227 Audit)

Executed during the independent verification gate prior to Phase 5D:
- **Suite Command:** `cd apps/web && node scripts/test-commerce.mjs`
- **Result:** 10/10 tests passed under real authenticated JWT contexts.
- **Direct DB Atomic RPC Trace:** Executed via `psql` to test `create_order_atomic`, `cancel_order_atomic`, and oversell rollback directly on PostgreSQL 17.6.
- **Root Cause Confirmed:** Step 1227 failure was a manual duplicate insert into `public.profiles` colliding with the `on_auth_user_created` trigger. Zero bugs in the application or database RPCs.
- **Full Report:** See [PHASE_5C_INDEPENDENT_VERIFICATION.md](./PHASE_5C_INDEPENDENT_VERIFICATION.md).


