# Transaction Boundaries, Concurrency & Idempotency Report
**Project:** MD Shakib Islamic Books  
**Phase:** 04 — Backend & Database Integrity  
**Repository:** `MD-Shakib`  
**Status:** COMPLETE & VERIFIED  

---

## 1. Executive Summary

This report analyzes transaction boundaries, pessimistic locking mechanisms, race condition defenses, and idempotency guarantees across all stateful and multi-table operations in MD Shakib Islamic Books.

Every write operation involving financial state or inventory stock executes within explicit ACID transaction boundaries inside PostgreSQL stored procedures or Next.js server actions.

---

## 2. Order Lifecycle Transition Matrix

The table below defines every permissible order state transition supported by the application. Transitions outside this matrix are rejected authoritatively by both the application layer and database invariants.

| Current Status | Allowed Next Statuses | Terminal State? | Cancellation Eligible? | Stock Impact |
|---|---|---|---|---|
| `Pending` | `Confirmed`, `Cancelled` | NO | YES | Retains reserved stock; released on `Cancelled` |
| `Confirmed` | `Packed`, `Cancelled` | NO | YES | Retains reserved stock; released on `Cancelled` |
| `Packed` | `Shipped`, `Cancelled` | NO | YES | Retains reserved stock; released on `Cancelled` |
| `Shipped` | `Out for Delivery`, `Cancelled`, `Returned` | NO | YES (Admin override) | Retains reserved stock; released on `Cancelled` |
| `Out for Delivery` | `Delivered`, `Cancelled`, `Returned` | NO | YES (Admin override) | Retains reserved stock; released on `Cancelled` |
| `Delivered` | `Replacement Requested` | NO | NO | Permanent inventory consumption; replacement can be requested within 7 days |
| `Cancelled` | NONE | YES | NO (Already cancelled) | Stock already restored back to catalog |
| `Returned` | NONE | YES | NO | Returned goods processed via manual inventory adjustment |
| `Replacement Requested` | `Replacement Approved`, `Replacement Rejected` | NO | NO | Awaiting administrative review |
| `Replacement Approved` | `Replacement Shipped` | NO | NO | Replacement consignment booked |
| `Replacement Rejected` | NONE | YES | NO | Final rejection |
| `Replacement Shipped` | `Replacement Delivered` | NO | NO | In transit |
| `Replacement Delivered` | NONE | YES | NO | Final replacement delivery |

---

## 3. Atomic Multi-Table Transaction Boundaries

### 3.1 Order Placement (`create_order_atomic`)
The checkout operation spans 4 dependent tables:
1. `public.orders` (Header insertion with address snapshot and idempotency key).
2. `public.books` (Inventory stock decrement with pessimistic row locks).
3. `public.order_items` (Line items snapshot insertion).
4. `public.cart_items` (Automatic deletion of customer's active cart).

**Pessimistic Lock & Rollback Guarantee:**
Inside `create_order_atomic`:
```sql
SELECT title, image_url, stock, is_active
INTO v_book_title, v_book_image, v_current_stock, v_is_active
FROM public.books
WHERE id = v_book_id
FOR UPDATE;

IF v_current_stock < v_quantity THEN
    RAISE EXCEPTION 'Insufficient stock for "%" (Requested: %, Available: %)',
        v_book_title, v_quantity, v_current_stock;
END IF;
```
If any item in the order exceeds available stock, the stored procedure raises an unhandled exception. In PostgreSQL, this aborts the transaction immediately, automatically rolling back the inserted `orders` row and leaving all book stock completely untouched.

### 3.2 Payment Settlement (`settle_payment_atomic`)
Spans 2 tables: `public.orders` and `public.payments`.
- Acquires `FOR UPDATE` on `orders` matching `razorpay_order_id`.
- Acquires `FOR UPDATE` on `payments` matching `provider_order_id`.
- Mutates `orders.payment_status = 'Paid'`, `orders.order_status = 'Confirmed'`, and `payments.status = 'Paid'`.
- Returns `{ settled: true }` on the initial settlement.
- Returns `{ settled: false, status: 'already_paid' }` on all duplicate attempts, preventing duplicate email dispatches.

### 3.3 Order Cancellation (`cancel_order_atomic`)
Spans 3 tables: `public.orders`, `public.books`, and `public.audit_logs`.
- Acquires `FOR UPDATE` on `public.orders`.
- Loops through `public.order_items` and executes:
  ```sql
  UPDATE public.books SET stock = stock + v_item.quantity WHERE id = v_item.book_id;
  ```
- Mutates `orders.order_status = 'Cancelled'`.
- Inserts audit record into `public.audit_logs`.

---

## 4. Race Condition & Concurrency Defense

### 4.1 Purchasing the Final Available Item
- **Threat:** Two customers attempt to purchase the last remaining copy of a book simultaneously.
- **Defense:** `SELECT ... FROM public.books WHERE id = v_book_id FOR UPDATE;` locks the row at the PostgreSQL storage engine level.
  - Transaction 1 acquires the lock, sees `stock = 1`, decrements to `0`, commits.
  - Transaction 2 blocks until Transaction 1 commits, reads the updated `stock = 0`, evaluates `v_current_stock < v_quantity`, and raises an exception.
  - Zero overselling occurs. Verified in `test-phase04-backend-integrity.ts` (Pass 13 & 15).

### 4.2 Duplicate Checkout Submissions (Double-Clicking)
- **Threat:** A user double-clicks the "Place Order" button, firing two identical checkout requests within milliseconds.
- **Defense:**
  1. The client generates a unique `idempotencyKey` per checkout session.
  2. `create_order_atomic` has a unique partial index on `orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.
  3. When Request 2 attempts to insert the same `(user_id, idempotency_key)`, PostgreSQL detects the duplicate and routes through the sub-block:
     ```sql
     EXCEPTION WHEN unique_violation THEN
         SELECT id INTO v_order_id FROM public.orders
         WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key;
         IF FOUND THEN RETURN v_order_id; END IF;
     ```
  4. Request 2 returns the existing `orderId` without re-executing stock decrements or creating duplicate order items. Verified in `test-phase04-backend-integrity.ts` (Pass 14).

### 4.3 Simultaneous Payment Verification & Webhook Delivery
- **Threat:** The browser redirects to `/api/payments/verify` at the exact same moment Razorpay delivers the `payment.captured` webhook to `/api/webhooks/razorpay`.
- **Defense:** Both pathways delegate to `settle_payment_atomic`, which locks the target order row with `FOR UPDATE`.
  - Whichever process acquires the lock first sets `is_paid = TRUE` and `payment_status = 'Paid'`.
  - The second process reads the committed `is_paid = TRUE` and exits cleanly with `{ status: 'already_paid', settled: false }`.
  - Exactly one confirmation email is dispatched. Verified in `test-phase04-backend-integrity.ts` (Pass 18) and `test-integrations.ts` (Pass 05).

### 4.4 Out-of-Order Webhook Delivery (`payment.failed` after `payment.captured`)
- **Threat:** Network lag causes a transient `payment.failed` webhook to arrive after the user successfully retried and paid the order.
- **Defense:** `record_payment_failure_atomic` checks:
  ```sql
  IF v_order.id IS NOT NULL AND (v_order.is_paid IS TRUE OR v_order.payment_status = 'Paid') THEN
      RETURN jsonb_build_object('success', false, 'status', 'ignored_already_paid');
  END IF;
  ```
  The late failure event is safely ignored, preventing corrupting the paid status. Verified in `test-phase04-backend-integrity.ts` (Pass 19).

---

## 5. Idempotency Matrix Across External Workflows

| Operation | Idempotency Key / Anchor | Replay Outcome | Verification |
|---|---|---|---|
| **Checkout Placement** | `orders.idempotency_key` | Returns existing order ID; zero stock mutation | Pass 14 |
| **Razorpay Payment Order** | `orders.razorpay_order_id` | Returns existing `razorpayOrderId` without calling gateway again | Pass 04 (Integrations) |
| **Payment Verification** | HMAC signature + `settle_payment_atomic` | Returns `{ alreadySettled: true }`; zero duplicate emails | Pass 18 |
| **Razorpay Webhooks** | `settle_payment_atomic` row lock | Returns `{ status: 'already_paid' }` | Pass 18 |
| **Delhivery Consignment** | `orders.shipping_awb` | Returns existing AWB and tracking URL; does not book duplicate shipment | Pass 09 (Integrations) |
| **Delhivery Tracking Webhook** | `orders.shipping_awb` + current status | If status matches, returns `already_current`; if illegal transition, rejects | Pass 10 (Remediation) |
| **Order Cancellation** | `cancel_order_atomic` | Repeated attempt throws `Order cannot be cancelled in Cancelled status` | Pass 16 |
| **Replacement Request** | `orders.replacement_requested` | Repeated attempt throws `A replacement has already been requested` | Pass 21 |
| **Customer Review Submission** | `uq_reviews_book_user` unique index | Throws `Duplicate review: You have already submitted a review` | Pass 24 |

---

## 6. Audit Trail Immutability & Completeness
- Every state change on `orders`, `inventory`, `reviews`, `profiles`, and `discounts` records a snapshot in `public.audit_logs`.
- The `audit_logs` table has RLS enabled with `SELECT` access strictly restricted to verified administrators (`is_admin() = true`).
- Ordinary customers cannot read, modify, or delete audit records.
- Payment secrets, API tokens, and customer passwords are never stored in audit logs.

---

## 7. Conclusion
Transaction boundaries, locking semantics, and idempotency guarantees are fully verified. Concurrency hazards such as overselling, duplicate billing, and status regressions are completely mitigated.

