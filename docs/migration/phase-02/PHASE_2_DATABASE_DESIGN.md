# PHASE 2 — COMPLETE DATABASE DESIGN & RELATIONAL SPECIFICATION
**MD Shakib Islamic Books Modernization Project**  
**Document Reference:** `docs/migration/phase-02/PHASE_2_DATABASE_DESIGN.md`  
**Date:** 2026-11-09  
**Status:** Approved Schema Architecture  

---

## 1. SCHEMA OVERVIEW & DEPENDENCY GRAPH

Phase 2 introduces forward-only schema enhancements strictly maintaining historical referential integrity, Supabase Row-Level Security (RLS), and database-level invariants.

```
       ┌───────────────┐           ┌──────────────────┐
       │ public.books  │◄──────────│  book_variants   │
       └───────┬───────┘           └────────┬─────────┘
               │                            │
               ▼                            ▼
      ┌───────────────────────────────────────────────┐
      │           public.inventory_history            │
      └───────────────────────────────────────────────┘
               ▲
               │
       ┌───────┴───────┐           ┌──────────────────┐
       │ public.orders │◄──────────│  delivery_otps   │
       └───────┬───────┘           └────────┬─────────┘
               │                            │
               ├──► invoices                ├──► delivery_verifications
               ├──► cod_collections        │
               ├──► cod_remittances        ├──► support_tickets ◄── ticket_messages
               └──► return_requests        │
                         │                 ├──► wishlists
                         ▼                 │
                 return_request_items      └──► phone_verifications
                         │
                         ▼
                   refund_records
```

---

## 2. RELATIONAL TABLE SPECIFICATIONS

### 2.1 Logistics & Delivery Handover (2A)
1. **`delivery_otps`**: Stores order-specific delivery OTP hashes (HMAC-SHA256), lifecycle status, attempt counts, and expiration.
2. **`delivery_verifications`**: Immutable audit trail recording every delivery verification attempt (successful or failed) with actor, role, and outcome.
3. **`cod_collections`**: Doorstep cash collection records, tracking expected vs. actual collected amounts and collecting staff ID.
4. **`cod_remittances`**: Courier remittance reconciliation records, tracking courier payments against expected COD totals and resolving variances.

### 2.2 Commercial & Financial Documents (2B)
1. **`invoices`**: Immutable historical snapshot of issued tax invoices with sequential numbering (`INV-YYYYMM-XXXXX`), tax breakdowns (CGST, SGST, IGST), customer details, and line item snapshots.
2. **`invoice_number_seq`**: Monotonic sequence guaranteeing collision-free, concurrent-safe invoice numbering.

### 2.3 Returns, Refunds & Replacements (2C)
1. **`return_requests`**: Customer return and replacement claims with sequential numbering (`RET-YYYYMM-XXXXX`), status workflow, reason, evidence URLs, and reverse logistics tracking.
2. **`return_request_items`**: Line-item granularity for return claims, specifying book ID, variant ID, return quantity, and unit price.
3. **`refund_records`**: Granular gateway refund ledger linked to original orders and return claims, tracking Razorpay refund IDs, statuses, and authorized amounts.

### 2.4 Customer Experience & Identity (2D)
1. **`wishlists`**: Customer book wishlists with unique composite key `(user_id, book_id)` and cascade deletion on book removal.
2. **`support_tickets`**: Multi-turn customer support tickets linked optionally to specific orders, tracking category, priority, status, and staff assignment.
3. **`ticket_messages`**: Conversational thread messages under support tickets, distinguishing staff vs. customer messages with attachment support.
4. **`phone_verifications`**: OTP verification ledger for customer mobile phone verification, separate from delivery tokens.

### 2.5 Catalog & Inventory Enhancements (2E)
1. **`books` modifications**:
   - `isbn_10` (`VARCHAR(10) UNIQUE`)
   - `isbn_13` (`VARCHAR(13) UNIQUE`)
   - `sku` (`VARCHAR(64) UNIQUE`)
   - `weight_grams` (`INTEGER CHECK (weight_grams > 0)`)
   - `length_cm` (`NUMERIC(6,2) CHECK (length_cm > 0)`)
   - `width_cm` (`NUMERIC(6,2) CHECK (width_cm > 0)`)
   - `height_cm` (`NUMERIC(6,2) CHECK (height_cm > 0)`)
2. **`book_variants`**: Product variants (format, language, edition) with dedicated SKU, pricing, and variant-specific inventory.
3. **`inventory_history`**: Unified append-only inventory movement ledger auditing all stock additions, deductions, reservations, returns, and write-offs.

---

## 3. ATOMIC RPC FUNCTIONS

1. **`verify_delivery_otp_atomic(p_order_id, p_otp_candidate, p_actor_id, p_actor_role, p_awb)`**
   - Validates state, attempts, expiration, compares HMAC hash, invalidates or verifies, transitions order status to `Delivered`, and inserts audit trail.
2. **`regenerate_delivery_otp_atomic(p_order_id, p_new_hash, p_expires_at)`**
   - Invalidates previous active OTP and atomically stores new hash with reset attempt counter.
3. **`generate_order_invoice_atomic(p_order_id, p_seller_gstin)`**
   - Computes tax breakdown, increments sequence, snapshots addresses and items, and inserts immutable invoice record.
4. **`initiate_return_refund_atomic(p_order_id, p_return_id, p_amount, p_reason, p_admin_id)`**
   - Pessimistically locks order, enforces `sum(refunds) <= order.total_amount`, and inserts pending `refund_records`.
5. **`reserve_replacement_inventory_atomic(p_book_id, p_quantity, p_reason, p_order_id, p_admin_id)`**
   - Atomically decrements shelf stock and logs replacement inventory movement.
6. **`record_inventory_movement_atomic(p_book_id, p_variant_id, p_type, p_delta, p_reason, p_order_id, p_return_id, p_actor_id)`**
   - Updates stock and logs immutable entry into `inventory_history`.
7. **`anonymize_customer_account(p_user_id)`**
   - Redacts PII from profile, purges wishlists/addresses, revokes auth tokens, while retaining anonymized orders for legal/tax compliance.
8. **Aggregation RPCs for Reports (2.36, 2.37, 2.38):**
   - `get_sales_report(start_date, end_date, interval)`
   - `get_payment_report(start_date, end_date)`
   - `get_inventory_report()`

---

## 4. ROW LEVEL SECURITY (RLS) POLICIES

All tables enforce strict RLS:
- **`delivery_otps`**: Customers can SELECT active OTP for own orders when status is `Out for Delivery`. Staff/Admin can view/manage.
- **`delivery_verifications`**: Staff/Admin only; insert-only via verification RPC.
- **`invoices`**: Customers can SELECT invoices for own orders. Staff can SELECT all invoices.
- **`return_requests`**: Customers can SELECT and INSERT return requests for own delivered orders. Staff can SELECT and UPDATE status.
- **`wishlists`**: Customers have complete CRUD over own wishlist records.
- **`support_tickets` & `ticket_messages`**: Customers can view and reply to own tickets. Staff can view and respond to all tickets.
- **`inventory_history`**: Authenticated staff with inventory permissions can SELECT. Direct modifications blocked.
