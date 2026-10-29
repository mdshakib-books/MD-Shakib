# PHASE 5D — External Service Integrations Implementation Plan

**Project:** MD Shakib Islamic Books  
**Repository:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`  
**Stack:** Next.js App Router, Supabase, PostgreSQL, Cloudinary, Resend, Razorpay, Delhivery  
**Date:** 2026-10-29  
**Status:** In Progress

---

## 1. Objectives & Principles

Phase 5D integrates four key third-party service providers into the verified Next.js App Router storefront and Supabase database foundation:
1. **Razorpay:** Server-orchestrated order payment creation, client checkout integration, cryptographic HMAC signature verification, and idempotent webhook processing.
2. **Resend:** Transactional email delivery with responsive Islamic bookstore branding (Order Confirmation, Payment Received, Order Cancellation) and persistent audit logging in `public.email_logs`.
3. **Cloudinary:** Secure, admin-restricted media management with signed upload authorization, file validation, and existing image preservation.
4. **Delhivery:** Logistics and fulfillment integration supporting 6-digit pincode serviceability validation, idempotent consignment/shipment booking, package tracking, and webhook event processing.

### Core Architectural Principles
- **Server-Side Secrets:** Secret keys (`RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `CLOUDINARY_API_SECRET`, `DELHIVERY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) are restricted exclusively to server execution contexts.
- **Untrusted Client Inputs:** Amounts, status codes, and signatures received from browser bundles are never accepted as authoritative. Totals are derived from database records and payments verified with cryptographic signatures.
- **Idempotency & Concurrency:** Webhooks and status callbacks handle duplicates, retries, and out-of-order events gracefully without duplicate stock movements or duplicate records.
- **Graceful Boundary Testing:** Where live sandbox/production provider credentials are absent, adapter boundaries safely validate schemas, log structured diagnostic events, and prevent false positive claims.
- **Zero Legacy Regression:** Zero changes to legacy `client/` and `server/` codebases.

---

## 2. Architecture & File Layout

```text
apps/web/
├── lib/
│   ├── integrations/
│   │   ├── config.ts               # Centralized, validated environment configuration
│   │   ├── razorpay/
│   │   │   ├── client.ts           # Razorpay instance factory & key validation
│   │   │   ├── service.ts          # Order creation & signature verification
│   │   │   └── webhook.ts          # Webhook event parser & idempotent order updater
│   │   ├── resend/
│   │   │   ├── client.ts           # Resend SDK adapter & dispatch logic
│   │   │   ├── templates.ts        # Branded HTML email templates
│   │   │   └── service.ts          # Non-blocking email sender with DB logging
│   │   ├── cloudinary/
│   │   │   ├── client.ts           # Cloudinary SDK adapter & signature generation
│   │   │   └── service.ts          # Admin-authorized image upload & validation
│   │   └── delhivery/
│   │       ├── client.ts           # Delhivery REST API client
│   │       └── service.ts          # Pincode serviceability, shipment booking, tracking
│   └── supabase/
│       └── admin.ts                # Service-role Supabase client for webhooks & background ops
├── app/
│   └── api/
│       ├── payments/
│       │   ├── create-order/route.ts   # Authenticated route to create Razorpay order
│       │   └── verify/route.ts         # Authenticated route to verify payment signature
│       ├── webhooks/
│       │   ├── razorpay/route.ts       # Public HMAC-authenticated webhook handler
│       │   └── delhivery/route.ts      # Public tracking webhook handler
│       ├── shipping/
│       │   ├── serviceability/route.ts # Public/Customer pincode verification route
│       │   └── track/route.ts          # Customer package tracking route
│       └── admin/
│           └── media/
│               ├── sign/route.ts       # Admin-only signed upload parameter endpoint
│               └── upload/route.ts     # Admin-only server-mediated upload endpoint
```

---

## 3. Sub-Phase Execution Details

### Phase 5D-A: Architecture & Infrastructure Setup
- Install official packages: `razorpay`, `resend`, `cloudinary`.
- Implement `apps/web/lib/supabase/admin.ts` using `SUPABASE_SERVICE_ROLE_KEY`.
- Implement centralized environment validator `apps/web/lib/integrations/config.ts`.
- Update `.env.example` with documented configuration parameters.

### Phase 5D-B: Razorpay Online Payment Flow
1. **Order Creation (`/api/payments/create-order`):**
   - Validates authenticated user session.
   - Fetches target order from `public.orders`. Verifies ownership and `payment_status = 'Pending'`.
   - Computes amount in smallest currency unit (`amount_in_paise = Math.round(order.total_amount * 100)`).
   - Invokes `razorpay.orders.create(...)`.
   - Inserts record into `public.payments` (`provider_order_id = rzpOrder.id`, `status = 'Pending'`).
   - Returns `orderId`, `amount`, `currency`, `keyId` to frontend.
2. **Signature Verification (`/api/payments/verify`):**
   - Receives `{ razorpay_order_id, razorpay_payment_id, razorpay_signature }`.
   - Verifies HMAC SHA-256 signature using `crypto.timingSafeEqual`:
     `hmac = crypto.createHmac('sha256', secret).update(razorpay_order_id + '|' + razorpay_payment_id).digest('hex')`.
   - Updates `public.payments` to `status = 'Paid'`.
   - Updates `public.orders`: `payment_status = 'Paid'`, `order_status = 'Confirmed'`, `is_paid = true`, `paid_at = now()`.
   - Dispatches order confirmation & payment received emails.
3. **Webhook Processing (`/api/webhooks/razorpay`):**
   - Validates `x-razorpay-signature` against raw request body with `RAZORPAY_WEBHOOK_SECRET`.
   - Idempotently processes `order.paid` and `payment.captured`.
   - If order is already `Paid`, avoids duplicate mutations or notifications.

### Phase 5D-C: Resend Transactional Email
1. **Email Templates:**
   - Order Confirmation: Summary of purchased items, prices, delivery address snapshot, and order ID.
   - Payment Confirmation: Details of Razorpay payment transaction.
   - Cancellation Notice: Confirmation of order cancellation and stock release.
2. **Non-blocking Execution:**
   - Emails sent in non-blocking fashion so mail delivery timeouts never fail an order.
3. **Audit Logging:**
   - Every email attempt logged to `public.email_logs` with status (`queued`, `sent`, `failed`).

### Phase 5D-D: Cloudinary Media Integration
1. **Admin Authorization:**
   - Endpoints require verified `role = 'admin'` from `public.profiles`.
2. **Upload Parameters:**
   - Generates signed parameters using `cloudinary.utils.api_sign_request`.
   - Server-mediated upload route enforces 5MB limit and allowed MIME types (`image/jpeg`, `image/png`, `image/webp`).

### Phase 5D-E: Delhivery Logistics Integration
1. **Serviceability Check:**
   - Validates 6-digit postal code.
   - Queries Delhivery pin-code API or falls back to standard domestic delivery matrix.
2. **Shipment Creation:**
   - Idempotent creation for eligible orders (`order_status = 'Confirmed'` or `'Paid'`).
   - Persists `shipping_awb`, `shipping_tracking_url`, updates order status to `'Shipped'`.
3. **Tracking Updates & Webhook:**
   - Parses Delhivery tracking webhooks and maps courier scan events to internal order statuses.

---

## 4. Verification & Testing Strategy

A dedicated test suite `apps/web/scripts/test-integrations.mjs` will cover:
1. Valid and invalid Razorpay HMAC signatures.
2. Duplicate and out-of-order webhook events (idempotency verification).
3. Resend email rendering and persistent database logging in `email_logs`.
4. Cloudinary signature generation and unauthorized upload rejection.
5. Delhivery pincode format validation and shipment creation idempotency.
6. Non-regression of customer cart, checkout, COD orders, and RLS policies.
7. Next.js App Router `typecheck`, `lint`, and `build`.
8. Legacy `client/` and `server/` build checks.

