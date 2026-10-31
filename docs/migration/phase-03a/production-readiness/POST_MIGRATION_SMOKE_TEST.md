# Phase 03A — Post-Migration Production Smoke-Test Plan

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Production Migration Readiness Audit  
**Execution Context:** Production Deployment Verification (To be executed ONLY after authorized deployment)  
**Audit Date:** October 31, 2026  
**Auditor:** Independent Security & Quality Assurance Architect  
**Smoke-Test Readiness Status:** **READY FOR PRODUCTION VERIFICATION**  

---

## 1. Safety Rules & Operational Restrictions for Production Smoke Testing

When executing post-migration smoke tests on a live production deployment:
1. **No Destructive Operations:** Do not drop tables, purge catalogs, or wipe test users without explicit protocol.
2. **No Real Financial Charges:** Use Cash on Delivery (COD) test orders with dummy amounts or test accounts. Do not process live credit cards or UPI charges without authorization.
3. **Ledger vs External Gateway Distinction:** Clearly distinguish between database ledger records (`public.payments`, `public.orders.is_paid`) and live external payment provider transactions (Razorpay API charges/refunds).
4. **Designated Test Accounts:** All tests must be executed using dedicated, clearly designated test accounts (e.g. `smoke-test-customer@mdshakibbooks.internal` and `smoke-test-admin@mdshakibbooks.internal`).
5. **Immediate Cleanup:** Test orders placed during smoke testing must be transitioned to `Cancelled` using the official cancellation workflow to restore catalog inventory.

---

## 2. Post-Migration Verification Checklist

```
┌────────────────────────────────────────────────────────────────────────┐
│                   PRODUCTION SMOKE-TEST MATRIX                         │
├─────────┬──────────────────────────────────────────┬───────────────────┤
│ Section │ Verification Domain                      │ Target Result     │
├─────────┼──────────────────────────────────────────┼───────────────────┤
│ 2.1     │ Authentication & Session Lifecycles      │ 5 / 5 Passing     │
│ 2.2     │ Customer Account & Address Book          │ 3 / 3 Passing     │
│ 2.3     │ Commerce, Catalog, Cart & Stock Lifecycle│ 8 / 8 Passing     │
│ 2.4     │ 7-Day Replacement Policy & Boundaries    │ 5 / 5 Passing     │
│ 2.5     │ Administrative Moderation & Ledgers      │ 6 / 6 Passing     │
│ 2.6     │ Database Security & RLS Enforcement      │ 5 / 5 Passing     │
│ 2.7     │ External Integrations (Cloudinary/Email) │ 3 / 3 Passing     │
└─────────┴──────────────────────────────────────────┴───────────────────┘
```

---

### 2.1 Authentication & Session Lifecycles

| Check ID | Verification Action | Expected Behavior | Verification Status |
|:---:|---|---|:---:|
| **AUTH-01** | Log in with test customer credentials via `/login`. | Successful login; redirect to `/profile`; SSR cookie session established. | [ ] PENDING DEPLOY |
| **AUTH-02** | Log out via Navbar / Account menu. | Session cookie cleared; redirected to `/login`; protected routes return redirect. | [ ] PENDING DEPLOY |
| **AUTH-03** | Browser reload on `/profile` and navigation across tabs. | Session remains authenticated without requiring re-login. | [ ] PENDING DEPLOY |
| **AUTH-04** | Request password reset email on `/forgot-password`. | Reset link generated with correct canonical production base URL (not `127.0.0.1`). | [ ] PENDING DEPLOY |
| **AUTH-05** | Attempt to access `/admin` with customer account. | Access rejected; redirected to `/login` or 403 Forbidden. | [ ] PENDING DEPLOY |

---

### 2.2 Customer Account & Address Book

| Check ID | Verification Action | Expected Behavior | Verification Status |
|:---:|---|---|:---:|
| **ACCT-01** | Fetch and update phone number in `/profile`. | Updated phone number persists in `public.profiles` across page refresh. | [ ] PENDING DEPLOY |
| **ACCT-02** | Add, edit, and delete addresses in `/addresses`. Set new default address. | Single default badge invariant strictly maintained; older default automatically cleared. | [ ] PENDING DEPLOY |
| **ACCT-03** | Attempt to query Customer A's address ID while logged in as Customer B. | PostgREST / Supabase client returns empty set / 404; data strictly isolated. | [ ] PENDING DEPLOY |

---

### 2.3 Commerce, Catalog, Cart & Stock Lifecycle

| Check ID | Verification Action | Expected Behavior | Verification Status |
|:---:|---|---|:---:|
| **COMM-01** | Browse `/catalog` and book detail pages (`/books/[id]`). | Active books rendered with correct pricing, discounts, and real-time stock levels. | [ ] PENDING DEPLOY |
| **COMM-02** | Add items to cart as guest, reload page. | Cart items persist in client local storage / guest session. | [ ] PENDING DEPLOY |
| **COMM-03** | Log in with active cart items. | `merge_cart_atomic` merges guest items into customer's server cart; items capped at stock. | [ ] PENDING DEPLOY |
| **COMM-04** | Proceed to `/checkout`; verify address pre-selection. | Default address is automatically selected in checkout selector. | [ ] PENDING DEPLOY |
| **COMM-05** | Place Cash on Delivery order via `/checkout`. | `create_order_atomic` returns UUID; order created in `Pending` status. | [ ] PENDING DEPLOY |
| **COMM-06** | Inspect book stock immediately after order placement. | Catalog stock for purchased book decremented by exact order quantity. | [ ] PENDING DEPLOY |
| **COMM-07** | View `/orders` and `/orders/[id]`. | Order rendered with items snapshot, visual tracking timeline, and delivery address. | [ ] PENDING DEPLOY |
| **COMM-08** | Click `Cancel Order` on pending order. | `cancel_order_atomic` transitions order to `Cancelled`; book stock restored exactly once. | [ ] PENDING DEPLOY |

---

### 2.4 7-Day Replacement Policy & Boundaries

| Check ID | Verification Action | Expected Behavior | Verification Status |
|:---:|---|---|:---:|
| **REPL-01** | Submit replacement for delivered order within 168 hours of `delivered_at`. | `request_replacement_atomic` succeeds; status transitions to `Replacement Requested`. | [ ] PENDING DEPLOY |
| **REPL-02** | Attempt replacement on order delivered > 168 hours ago. | Rejected with `Replacement window expired: Replacements must be requested within 7 days`. | [ ] PENDING DEPLOY |
| **REPL-03** | Attempt replacement on order with future `delivered_at`. | Rejected with `Replacement ineligible: Delivery timestamp cannot be in the future`. | [ ] PENDING DEPLOY |
| **REPL-04** | Attempt duplicate replacement on already requested order. | Rejected with `A replacement has already been requested for this order`. | [ ] PENDING DEPLOY |
| **REPL-05** | Admin reviews and approves replacement in `/admin/orders`. | Status transitions to `Replacement Approved`; audit log and status history recorded. | [ ] PENDING DEPLOY |

---

### 2.5 Administrative Moderation & Ledgers

| Check ID | Verification Action | Expected Behavior | Verification Status |
|:---:|---|---|:---:|
| **ADMN-01** | Log in with administrative account on `/admin`. | Access granted to admin dashboard, order management, and catalog controls. | [ ] PENDING DEPLOY |
| **ADMN-02** | Filter, search, and update order status in `/admin/orders`. | Status updates persist; order status history records each transition. | [ ] PENDING DEPLOY |
| **ADMN-03** | Execute inventory adjustment via `/admin/inventory`. | Stock updated in `public.books`; ledger entry created in `public.inventory_adjustments`. | [ ] PENDING DEPLOY |
| **ADMN-04** | Moderate customer review (Approve / Reject) in `/admin/reviews`. | Review status updated; approved reviews appear on public book detail page. | [ ] PENDING DEPLOY |
| **ADMN-05** | Evaluate promotional discount coupon code in cart. | `validate_discount_coupon` validates active window and computes correct discount amount. | [ ] PENDING DEPLOY |
| **ADMN-06** | Inspect `public.audit_logs`. | Admin actions (`CANCEL`, `UPDATE`, `SOFT_DELETE`) logged with actor ID and JSON changes. | [ ] PENDING DEPLOY |

---

### 2.6 Database Security & RLS Enforcement

| Check ID | Verification Action | Expected Behavior | Verification Status |
|:---:|---|---|:---:|
| **SECR-01** | Attempt anonymous direct call to mutating RPCs via cURL. | PostgREST rejects with 401 Unauthorized or procedure exception. | [ ] PENDING DEPLOY |
| **SECR-02** | Attempt to read Customer A's orders using Customer B's token. | Zero records returned; cross-customer access strictly blocked by RLS. | [ ] PENDING DEPLOY |
| **SECR-03** | Attempt to update user role to `'admin'` via direct PostgREST PATCH. | Rejected by `profiles_update_policy` WITH CHECK restriction. | [ ] PENDING DEPLOY |
| **SECR-04** | Inspect `pg_tables` in production catalog. | All 15 public tables show `rowsecurity = true`. | [ ] PENDING DEPLOY |
| **SECR-05** | Verify `SUPABASE_SERVICE_ROLE_KEY` is absent from browser client. | DevTools network & source inspect confirms key is not bundled or transmitted. | [ ] PENDING DEPLOY |

---

### 2.7 External Integrations

| Check ID | Verification Action | Expected Behavior | Verification Status |
|:---:|---|---|:---:|
| **INTG-01** | Upload book cover image in `/admin/books/new`. | Image uploaded to Cloudinary; optimized CDN URL saved in `books.image_url`. | [ ] PENDING DEPLOY |
| **INTG-02** | Inspect email dispatch on order creation. | If Resend configured, confirmation email received; if unconfigured, error handled gracefully. | [ ] PENDING DEPLOY |
| **INTG-03** | Verify payment ledger queries on `/account/payments`. | Truthful customer payment and refund history rendered from `public.payments`. | [ ] PENDING DEPLOY |

