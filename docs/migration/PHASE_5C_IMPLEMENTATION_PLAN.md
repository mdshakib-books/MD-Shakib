# PHASE 5C — Implementation Plan: Persistent Cart, Address Management, Checkout & Atomic Orders

**Project:** MD Shakib Islamic Books  
**Phase:** 5C — Persistent Cart, Addresses, Checkout & Order Lifecycle  
**Framework:** Next.js App Router (16.4.3), React 19, TypeScript 5.9.3, Supabase Auth, PostgreSQL 17.6, RLS  
**Date:** 2026-10-29  

---

## 1. Existing Architecture & Contracts

- Database tables: `carts`, `cart_items`, `addresses`, `orders`, `order_items`, `order_status_history`.
- RLS policies enforce that users can only select, insert, update, or delete their own carts, addresses, and orders (`user_id = auth.uid()`).
- Database RPCs:
  - `public.create_order_atomic(p_user_id, p_items, p_address_snapshot, p_payment_method, p_total_amount)`: Atomically locks stock, validates prices, deducts inventory, creates order and order items, clears the customer's cart, and records initial status history.
  - `public.cancel_order_atomic(p_order_id, p_user_id, p_cancel_reason, p_is_admin)`: Validates order ownership, checks cancellable status, restores stock, and sets status to `Cancelled`.

---

## 2. Server Data Access & Action Modules

Create `apps/web/lib/commerce/`:

1. `apps/web/lib/commerce/cart.ts`:
   - `getOrCreateCart(userId)`: Ensures user has an active cart in `public.carts`.
   - `getCustomerCart()`: Fetches customer's cart with joined `book` items, quantities, and current database pricing.
   - `addToCart(bookId, quantity)`: Inserts or increments `cart_items`.
   - `updateCartQuantity(cartItemId, quantity)`: Updates item quantity (or deletes if quantity <= 0).
   - `removeCartItem(cartItemId)`: Deletes an item from cart.
   - `clearCart()`: Clears all items in customer's cart.
2. `apps/web/lib/commerce/addresses.ts`:
   - `getCustomerAddresses()`: Fetches all addresses belonging to the authenticated customer.
   - `createAddress(formData)`: Server action validating input (full_name, phone, house_no, area, city, state, pincode, is_default) and inserting into `public.addresses`.
   - `updateAddress(addressId, formData)`: Updates existing owned address.
   - `deleteAddress(addressId)`: Deletes owned address.
   - `setDefaultAddress(addressId)`: Designates primary shipping address.
3. `apps/web/lib/commerce/orders.ts`:
   - `createOrderCOD(addressId)`:
     1. Validates user session and address ownership.
     2. Fetches customer's cart from database.
     3. Re-validates active books and recalculates authoritative pricing (`subtotal + 10 + 35`).
     4. Prepares `address_snapshot` and items JSON.
     5. Invokes `create_order_atomic`.
     6. Returns order ID and redirects to `/order-success?orderId=${orderId}`.
   - `getCustomerOrders()`: Fetches customer's order history ordered by `created_at DESC`.
   - `getCustomerOrderById(orderId)`: Fetches specific order and joined items, verifying customer ownership (`user_id = auth.uid()`).
   - `cancelCustomerOrder(orderId, reason)`: Server action calling `cancel_order_atomic`.

---

## 3. Storefront Route Integrations

1. `/cart`:
   - Transformed to fetch live items from `getCustomerCart()`.
   - Connected to server actions for quantity increments, decrements, and removal.
   - Calculates Subtotal, Platform Fee (₹10), Delivery Fee (₹35), and Total Payable.
   - Handles empty cart state with "Browse Books" CTA.
2. `/addresses`:
   - Lists customer's saved addresses.
   - Interactive modal or accordion form to Add, Edit, Set Default, or Delete addresses.
3. `/checkout`:
   - Select shipping address (defaults to `is_default = true` address).
   - Review fee breakdown: Subtotal, Platform Fee (₹10), Delivery (₹35), Total.
   - Payment method selection: Cash on Delivery (COD) enabled; Online Payment labeled as "Online Payment (Razorpay - Phase 5D)".
   - Order placement button triggers `createOrderCOD`.
4. `/order-success`:
   - Reads `orderId` from searchParams; fetches authoritative order details from database.
   - Displays confirmed order ID, delivery estimate, address snapshot, and link to track order.
5. `/orders`:
   - Displays paginated list of past orders with status badges (`Pending`, `Processing`, `Shipped`, `Delivered`, `Cancelled`).
6. `/orders/[id]`:
   - Displays visual order timeline, item breakdown, and shipping address.
   - Provides "Cancel Order" button for orders in `Pending` or `Processing` status.

---

## 4. Verification Plan

1. Automated script `apps/web/scripts/test-commerce.mjs`:
   - Add to cart, update quantity, remove item.
   - Address CRUD and single default address trigger verification.
   - Atomic order placement with stock decrement.
   - Cart auto-clearing upon successful order placement.
   - Concurrent order placement / insufficient stock rollback.
   - Cancellation and stock restoration.
   - Cross-tenant RLS isolation (User A cannot view User B cart or orders).
2. `npm run typecheck`, `npm run lint`, `npm run build` in `apps/web`.
3. Smoke test all commerce HTTP endpoints on live Next.js server.
4. Verify legacy `client/` and `server/` remain 100% untouched.

