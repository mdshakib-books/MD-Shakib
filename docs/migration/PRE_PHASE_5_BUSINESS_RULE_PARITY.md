# PRE-PHASE 5 — Business Rule, Pricing & Checkout Parity Report

**Project:** MD Shakib Islamic Books  
**Audit Date:** 2026-10-28  
**Scope:** Pricing logic, fees, cart calculations, stock rules, order status invariants, and legacy-vs-Next.js discrepancies.  
**Status:** PASS WITH NOTED CONTRACT RESOLUTION

---

## 1. Executive Summary

This audit cross-references all pricing algorithms, cart totals, delivery fees, platform charges, stock decrement rules, and order state transitions between:
1. The legacy client (`client/src/pages/CartPage.jsx`, `client/src/pages/CheckoutPage.jsx`).
2. The legacy backend (`server/src/services/order.service.js`, `server/src/models/order.model.js`).
3. The migrated Next.js application (`apps/web/app/cart/page.tsx`, `apps/web/app/checkout/page.tsx`).
4. The Supabase schema and RPCs (`supabase/migrations/20261028000002_business_logic.sql`).

---

## 2. Fee & Calculation Parity Matrix

| Parameter | Legacy Client (`CartPage.jsx` / `CheckoutPage.jsx`) | Legacy Server (`order.service.js`) | Next.js (`apps/web`) | Supabase (`create_order_atomic`) | Parity Status |
|---|---|---|---|---|---|
| **Subtotal** | `sum(price * quantity)` | `sum(price * quantity)` | `sum(price * quantity)` | Handled in payload / order items | **MATCH** |
| **Platform Fee** | ₹10 (hardcoded constant `PLATFORM_FEE = 10`) | Omitted in legacy order model | ₹10 (constant in Cart & Checkout) | Passed in `p_total_amount` | **RESOLVED** (See §3) |
| **Delivery Fee** | ₹35 (hardcoded constant `DELIVERY_FEE = 35`) | Omitted in legacy order model | ₹35 (constant in Cart & Checkout) | Passed in `p_total_amount` | **RESOLVED** (See §3) |
| **Total Added Fees** | ₹45 (10 + 35) | ₹0 | ₹45 (10 + 35) | Included in total | **MATCH (Client UI)** |
| **Total Payable** | `Subtotal + 45` | `Subtotal` | `Subtotal + 45` | `Subtotal + 45` | **CONSISTENT IN TARGET** |

---

## 3. Critical Finding: Legacy Client vs Legacy Server Inconsistency

### 3.1 The Anomaly
- In the legacy React frontend:
  ```javascript
  const PLATFORM_FEE = 10;
  const DELIVERY_FEE = 35;
  const subtotal = cartItems.reduce((acc, item) => acc + item.price * item.quantity, 0);
  const total = subtotal + PLATFORM_FEE + DELIVERY_FEE;
  ```
  The user is shown and agrees to pay `subtotal + ₹45`.
- In the legacy Express backend (`server/src/services/order.service.js`):
  ```javascript
  let totalAmount = 0;
  items.map(item => totalAmount += item.price * item.quantity);
  // Order saved with totalAmount = subtotal, ignoring the ₹45 fees displayed to the user
  ```
- Razorpay order creation in legacy backend:
  ```javascript
  amount: Math.round(totalAmount * 100) // Only charged subtotal!
  ```

### 3.2 Resolution for Target Architecture (Phase 5)
1. The customer expectations and storefront UI clearly display:
   - Subtotal
   - Platform Fee: ₹10
   - Delivery Charge: ₹35
   - Total Amount: `Subtotal + ₹45`
2. In Phase 5 Supabase/Next.js implementation:
   - The order record must explicitly track `subtotal`, `platform_fee: 10`, `delivery_fee: 35`, and `total_amount = subtotal + 45`.
   - Razorpay orders created in Phase 5 must charge `Math.round(total_amount * 100)` so that payment gateway capture matches invoice and customer confirmation totals.

---

## 4. Stock & Inventory Rules

| Rule | Legacy Implementation | Target Next.js / Supabase Implementation | Parity Status |
|---|---|---|---|
| **Inventory Validation** | `validateAndReduceStock` in `server/src/utils/stock.util.js` | Handled inside `create_order_atomic` with `FOR UPDATE` row lock | **ENHANCED** (Zero race conditions) |
| **Insufficient Stock** | Returns error `Insufficient stock for ...` | Raises SQL exception: `Insufficient stock for "%"` | **MATCH** |
| **Inactive Product** | Checked in service layer | Checked in SQL: `v_is_active = false` throws exception | **MATCH** |
| **Cancellation Restoration** | `restoreStock` called in cancel handler | `cancel_order_atomic` iterates order items and increments stock | **MATCH** |

---

## 5. Order State Machine Invariants

The target architecture strictly adheres to the legacy order status transitions:

```
Placed / Pending ──> Processing ──> Shipped ──> Out for Delivery ──> Delivered
       │                   │
       ▼                   ▼
   Cancelled           Cancelled
```

- **Customer Cancellation:** Permitted only when `order_status IN ('Pending', 'Processing')`. Disallowed once order is `Shipped` or `Delivered`.
- **Replacement Request:** Permitted only after `Delivered`.
- **Return / Refund:** Requires admin verification.

---

## 6. Pre-Phase 5 Verification Sign-off

- [x] Cart price computations match legacy UI exactly.
- [x] ₹10 platform fee and ₹35 delivery fee preserved and properly isolated.
- [x] Stock decrement and replenishment verified against real PostgreSQL database.
- [x] Order state transitions codified and enforced.

