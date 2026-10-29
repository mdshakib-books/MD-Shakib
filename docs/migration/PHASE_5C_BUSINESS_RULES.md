# PHASE 5C — Business Rules, Pricing & Fee Policies

**Project:** MD Shakib Islamic Books  
**Phase:** 5C — Persistent Cart, Address Management, Checkout & Atomic Orders  
**Date:** 2026-10-29  
**Status:** **AUTHORITATIVE SPECIFICATION**

---

## 1. Fee Architecture & Calculation Rules

The storefront checkout, order record, and invoicing adhere strictly to the customer-facing contract established in the legacy frontend and reconciled in Pre-Phase 5:

1. **Item Price:**
   - Evaluated directly from `public.books.price` and `public.books.discount`.
   - `effective_item_price = discount > 0 ? round(price * (1 - discount / 100)) : price`.
   - Client-submitted prices are treated as informational estimates; the server recalculates and enforces authoritative database catalog prices.
2. **Subtotal:**
   - `subtotal = sum(item.effective_price * item.quantity)` across all items in cart.
3. **Platform Fee:**
   - Fixed fee of **₹10.00** applied to every order to cover packaging and digital platform maintenance.
4. **Delivery Fee:**
   - Standard delivery charge of **₹35.00** applied across all serviceable Indian pincodes.
5. **Total Payable:**
   - `total_amount = subtotal + platform_fee + delivery_fee` (i.e. `subtotal + ₹45.00`).
   - This exact amount is passed into `create_order_atomic(p_total_amount)`.
   - In Phase 5D, Razorpay online payments will charge `Math.round(total_amount * 100)` in paise.

---

## 2. Inventory & Stock Rules

1. **Stock Concurrency Protection:**
   - In `create_order_atomic`, each product row is locked for update (`SELECT ... FROM public.books WHERE id = v_book_id FOR UPDATE`).
   - If `current_stock < requested_quantity`, the transaction immediately throws an exception (`Insufficient stock for "%"`), aborting the entire order without partial writes.
2. **Atomic Inventory Decrement:**
   - `UPDATE public.books SET stock = stock - quantity WHERE id = book_id`.
3. **Cancellation & Inventory Restoration:**
   - Handled exclusively via `cancel_order_atomic(order_id, user_id, reason)`.
   - Validates that `order_status NOT IN ('Delivered', 'Cancelled', 'Returned')`.
   - Restores each item's quantity back to `public.books.stock`:
     `UPDATE public.books SET stock = stock + item.quantity WHERE id = item.book_id`.
   - Marks order status as `Cancelled` and appends cancellation record to `order_status_history`.

---

## 3. Order Lifecycle Invariants

The permitted state transitions for customer orders are strictly enforced:

```
[Pending] (COD / Initial) ──> [Processing] ──> [Shipped] ──> [Out for Delivery] ──> [Delivered]
       │                            │
       ▼                            ▼
  [Cancelled]                  [Cancelled]
```

- **Customer Cancellation:** Permitted only when `order_status` is `Pending` or `Processing`. Once marked `Shipped` or `Delivered`, the customer cannot cancel directly and must initiate return/replacement.
- **Refund Policy for Cancelled Orders:** COD orders require no financial refund. Online paid orders require manual administrator refund processing via Razorpay dashboard (deferred to Phase 5D).

---

## 4. Address Ownership Invariants

1. Addresses belong strictly to the authenticated `user_id` (`auth.uid() = user_id`).
2. Only one address can be marked `is_default = true` per customer. Setting a new default address triggers `trg_default_address` (`public.handle_default_address()`), automatically resetting the flag on all other addresses belonging to that user.
3. When an order is placed, an immutable snapshot of the chosen address is created and stored in `public.orders.address_snapshot` as JSONB. Subsequent edits or deletions of the user's address book do not mutate past order invoices.

