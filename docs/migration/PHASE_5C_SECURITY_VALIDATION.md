# PHASE 5C — Security Validation Report

**Project:** MD Shakib Islamic Books  
**Phase:** 5C — Cart, Addresses, Checkout & Order Lifecycle  
**Date:** 2026-10-29  
**Status:** **PASS** (Zero RLS leaks, atomic transactions verified, stock concurrency protected)

---

## 1. Executive Summary

Phase 5C integrated the persistent shopping cart, customer address book, checkout workflow, and atomic order creation into the Supabase PostgreSQL backend.

All transactions and security invariants were verified against the real local Supabase stack under authenticated customer JWT contexts:
- Customers cannot view, modify, or delete another customer's cart, addresses, or orders.
- Anonymous clients are blocked by RLS from accessing private customer data.
- Inventory is protected by PostgreSQL row locks (`FOR UPDATE`) within `create_order_atomic`, preventing overselling and concurrency race conditions.
- Cancellation is idempotent and replay-protected, ensuring stock cannot be restored more than once.
- Authoritative order totals are calculated exclusively from trusted database values (`subtotal + ₹10 + ₹35`), neutralizing client payload tampering.

---

## 2. Row-Level Security & Multi-Tenant Isolation Evidence

Validated via `apps/web/scripts/test-commerce.mjs`:

| Table | Operation | Test Context | Expected Outcome | Actual Result | Security Verdict |
|---|---|---|---|---|---|
| `carts` | `SELECT` | Customer B queries Customer A cart | Blocked by RLS | 0 rows returned | **PASS** |
| `cart_items` | `SELECT` | Customer B queries Customer A items | Blocked by RLS | 0 rows returned | **PASS** |
| `cart_items` | `UPDATE/DELETE` | Customer B attempts to modify Customer A cart item | Blocked by RLS | 0 rows affected | **PASS** |
| `addresses` | `SELECT` | Customer B queries Customer A address | Blocked by RLS | 0 rows returned | **PASS** |
| `addresses` | `UPDATE/DELETE` | Customer B attempts to modify Customer A address | Blocked by RLS | 0 rows affected | **PASS** |
| `orders` | `SELECT` | Customer B queries Customer A order | Blocked by RLS | 0 rows returned | **PASS** |
| `order_items` | `SELECT` | Customer B queries Customer A order line items | Blocked by RLS | 0 rows returned | **PASS** |
| `orders` | Direct `UPDATE` | Customer attempts to mark order `Paid` | Blocked by RLS `WITH CHECK` | Rejected | **PASS** |

---

## 3. Stock Atomicity & Concurrency Protection

1. **Transaction Integrity:**
   - In `create_order_atomic`, books are locked (`FOR UPDATE`).
   - If stock is insufficient, the procedure raises an exception:
     `Insufficient stock for "%" (Requested: %, Available: %)`.
   - The entire transaction rolls back; no partial order records or decrements occur.
2. **Replay & Double-Restoration Defense:**
   - In `cancel_order_atomic`, the procedure checks:
     `IF v_order_status IN ('Delivered', 'Cancelled', 'Returned') THEN RAISE EXCEPTION ...`.
   - Attempting to replay cancellation against an already cancelled order throws an exception and alters zero inventory.

