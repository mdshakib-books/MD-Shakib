# Phase 2: Database Migration & Schema Summary
## MD Shakib Islamic Books Modernization Project — Lean E-Commerce Completion

**Date:** November 10, 2026  
**Migration File:** `supabase/migrations/20261109000006_phase02_complete_features.sql`  
**Database Target:** Supabase PostgreSQL 17.11  
**Strategy:** Strict Forward-Only Migration (Zero historical rewrites or table drops)

---

## 1. Migration Overview

To support the lean e-commerce completion—including cryptographic delivery OTPs, statutory sequential invoicing, structured return/refund requests, and real-time dashboard aggregation—a comprehensive, forward-only migration was implemented and applied to the database.

---

## 2. New Database Sequences

| Sequence Name | Initial Value | Increment | Purpose |
| :--- | :---: | :---: | :--- |
| `invoice_number_seq` | 10001 | 1 | Generates monotonic sequential invoice numbers: `INV-YYYYMM-XXXXX` |
| `return_number_seq` | 10001 | 1 | Generates monotonic sequential return numbers: `RET-YYYYMM-XXXXX` |

---

## 3. New Tables and Schema Definitions

### 3.1 `delivery_otps`
Stores cryptographically secure salted hashes of delivery OTPs. Plaintext OTPs are never stored.
```sql
CREATE TABLE IF NOT EXISTS public.delivery_otps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    otp_hash TEXT NOT NULL,
    salt TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 5,
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    generated_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_delivery_otps_order ON public.delivery_otps(order_id);
```

### 3.2 `delivery_verifications`
Audit trail of doorstep verification events.
```sql
CREATE TABLE IF NOT EXISTS public.delivery_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    verified_by UUID REFERENCES auth.users(id),
    role TEXT NOT NULL DEFAULT 'customer',
    verification_method TEXT NOT NULL DEFAULT 'otp',
    awb TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
```

### 3.3 `order_invoices`
Immutable financial record of orders with complete GST breakdown and item snapshots.
```sql
CREATE TABLE IF NOT EXISTS public.order_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE UNIQUE,
    invoice_number TEXT NOT NULL UNIQUE,
    invoice_date TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    items_snapshot JSONB NOT NULL DEFAULT '[]'::jsonb,
    subtotal NUMERIC(10, 2) NOT NULL,
    tax_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    cgst NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    sgst NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    igst NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    shipping_fee NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    discount_amount NUMERIC(10, 2) NOT NULL DEFAULT 0.00,
    total_amount NUMERIC(10, 2) NOT NULL,
    pdf_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_order_invoices_order ON public.order_invoices(order_id);
```

### 3.4 `return_requests`
Customer return and refund request records with full lifecycle tracking.
```sql
CREATE TABLE IF NOT EXISTS public.return_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    return_number TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted', 'under_review', 'approved', 'pickup_scheduled', 'completed', 'rejected')),
    reason TEXT NOT NULL,
    description TEXT,
    images TEXT[] DEFAULT ARRAY[]::TEXT[],
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    requested_amount NUMERIC(10, 2),
    refund_id TEXT,
    reverse_awb TEXT,
    admin_notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);
CREATE INDEX IF NOT EXISTS idx_return_requests_order ON public.return_requests(order_id);
CREATE INDEX IF NOT EXISTS idx_return_requests_user ON public.return_requests(user_id);
```

---

## 4. Key Stored Procedures & Atomic RPCs

### 4.1 `verify_delivery_otp_atomic`
- **Signature:** `verify_delivery_otp_atomic(p_order_id UUID, p_candidate_hash TEXT, p_verified_by UUID, p_role TEXT, p_awb TEXT)`
- **Behavior:**
  - Evaluates OTP validity, expiration (`expires_at > now()`), and attempt count (`attempts < max_attempts`).
  - Increments attempt count upon mismatch.
  - Upon valid match, marks OTP as verified, inserts a verification audit log, and authoritatively updates `orders.status` to `'Delivered'`.

### 4.2 `generate_order_invoice_atomic`
- **Signature:** `generate_order_invoice_atomic(p_order_id UUID, p_subtotal NUMERIC, p_tax_amount NUMERIC, p_cgst NUMERIC, p_sgst NUMERIC, p_igst NUMERIC, p_shipping_fee NUMERIC, p_discount_amount NUMERIC, p_total_amount NUMERIC, p_items_snapshot JSONB)`
- **Behavior:**
  - Employs `ON CONFLICT (order_id) DO NOTHING` for idempotency.
  - Draws the next monotonic value from `invoice_number_seq`.
  - Stores complete line-item snapshots to guarantee immutability.

### 4.3 `initiate_return_refund_atomic`
- **Signature:** `initiate_return_refund_atomic(p_order_id UUID, p_return_id UUID, p_amount NUMERIC, p_reason TEXT, p_admin_id UUID)`
- **Behavior:**
  - Validates caller role as admin.
  - Verifies refund amount does not exceed captured order total.
  - Updates return request status to `'completed'` and records the refund.

### 4.4 `get_admin_dashboard_metrics`
- **Signature:** `get_admin_dashboard_metrics(p_date_from TIMESTAMPTZ, p_date_to TIMESTAMPTZ)`
- **Behavior:**
  - Aggregates real-time operational data directly in the database engine: total orders, total revenue, average order value, pending shipments, return requests, and low stock count.

---

## 5. Security & Row-Level Security (RLS)

- **Strict Isolation:** Customers can only `SELECT` their own `order_invoices` and `return_requests` via `auth.uid() = user_id`.
- **Admin Full Access:** Authorized staff with role `'admin'` or `'super_admin'` have full read/write management permissions.
- **Direct INSERT Protection:** Direct public or customer inserts into `order_invoices` and `delivery_otps` are denied; mutations must flow through security-definer RPCs with server validation.
