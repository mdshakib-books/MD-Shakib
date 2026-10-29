# PHASE 5D — Test Results & Evidence

**Project:** MD Shakib Islamic Books  
**Phase:** 5D — External Service Integrations  
**Date:** 2026-10-29  
**Status:** **ALL 10 TESTS PASSED**

---

## 1. Automated Integration Test Suite

Command: `npx tsx --env-file=.env.local scripts/test-integrations.ts`  
Environment: Local Supabase Stack (`http://127.0.0.1:54321`) / Node v20 / PostgreSQL 17.6

```text
=== PHASE 5D: EXTERNAL SERVICE INTEGRATIONS TEST SUITE ===

1. Setting up Test Users (Customer & Admin)
[PASS] Customer and Admin accounts prepared.

2. Setting up Test Catalog Book and Shipping Address
[PASS] Seeded Address 4478efe0-e2fa-4746-9a92-13cf95443c40 and Book The Sealed Nectar (Ar-Raheeq Al-Makhtum) (Price: ₹550)

3. Testing Razorpay HMAC SHA-256 Signature Verification
[PASS] Valid HMAC signature verified and tampered signature rejected.

4. Testing Atomic Online Order Creation
[PASS] Online order created atomically (ID: 40f3582d-26ff-4f24-b570-bad7eb156d4f, Total: ₹595, Payment: Pending)

5. Testing Webhook Signature & Idempotent Order Settlement
[PASS] Webhook processed successfully with verified idempotency (Order Paid & Confirmed).

6. Testing Resend Email Logging Invariant
[PASS] Email logged in email_logs table (Log ID: def8e0c0-86aa-49b1-94b5-101c1a356d47, Status: sent, Recipient: integ_cust_1793269414221@example.com)

7. Testing Cloudinary Signature Generation & File Size Validation
[PASS] Cloudinary upload signatures and strict MIME/size validations enforced.

8. Testing Delhivery Pincode Serviceability & Format Validation
[PASS] Pincode format validated (110025 valid, short pincode rejected).

9. Testing Delhivery Idempotent Shipment Creation
[PASS] Consignment booked idempotently (AWB: DLV40F3582D26F, Status: Shipped, Duplicate call safely returned existing AWB).

10. Testing Delhivery Tracking Webhook Processing
[PASS] Delhivery webhook transitioned order to Delivered (Delivered at: 2026-10-29T10:23:34.464+00:00).

========================================================
>>> ALL 10/10 PHASE 5D INTEGRATION TESTS PASSED <<<
========================================================
```

---

## 2. Regression Test Results (Phase 5C Commerce Suite)

Command: `node scripts/test-commerce.mjs`

```text
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
[PASS] Order successfully created atomically: ID b6570205-2206-4853-ad1b-068e3e389156
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

## 3. Next.js Code Quality & Build Checks

| Quality Check | Command | Result |
|---|---|:---:|
| **TypeScript Compilation** | `tsc --noEmit` in `apps/web` | **0 errors** |
| **ESLint Check** | `eslint .` in `apps/web` | **0 warnings, 0 errors** |
| **Next.js Production Build** | `next build` in `apps/web` | **Compiled successfully in 1144ms** |
| **Legacy Vite Client** | `vite build` in `client` | **Compiled in 1.10s, 0 errors** |
| **Legacy Express Server** | `node -c app.js && node -c server.js` in `server` | **0 syntax errors** |
| **Git Diff Cleanliness** | `git diff --check` | **Clean, no whitespace issues** |

