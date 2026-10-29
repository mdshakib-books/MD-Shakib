# PHASE 5D — Security Validation & Threat Model

**Project:** MD Shakib Islamic Books  
**Phase:** 5D — External Service Integrations  
**Date:** 2026-10-29  
**Status:** **VERIFIED SECURE**

---

## 1. Security Architecture & Threat Vectors

### 1.1 Payment Tampering & Amount Alteration
- **Threat:** Malicious client manipulates the request body to pay ₹1 for a ₹595 book.
- **Mitigation:** The client is never allowed to specify the payment amount. `/api/payments/create-order` queries `public.orders` using the authenticated customer's session and derives the exact amount (`total_amount * 100`) directly from the database record.
- **Verification:** Unit and integration tests confirm that client-supplied amounts are ignored and authoritative totals are strictly enforced.

### 1.2 Signature Forgery & Fake Payment Confirmations
- **Threat:** Attacker sends fake `razorpay_signature` to `/api/payments/verify` to mark orders as `Paid`.
- **Mitigation:** The server computes `HMAC_SHA256(order_id + '|' + payment_id, secret)` using the server-side `RAZORPAY_KEY_SECRET`. Signatures are evaluated using constant-time comparison (`crypto.timingSafeEqual`) to prevent timing side-channel attacks.
- **Verification:** Tampered signatures were tested against `/api/payments/verify` and were rejected with exit code 1.

### 1.3 Webhook Replay & Duplicate Settlements
- **Threat:** Duplicate or delayed webhooks trigger duplicate stock restorations or double order updates.
- **Mitigation:** 
  1. `x-razorpay-signature` is verified against the raw request text using `RAZORPAY_WEBHOOK_SECRET`.
  2. Idempotency checks query `orders.is_paid`. If the order is already in status `Paid`, the handler terminates safely without performing additional database mutations.
- **Verification:** Verified by sending identical webhook payloads back-to-back. The first returned `settled`, while the second returned `idempotent_ok`.

### 1.4 Cross-Tenant Order Hijacking
- **Threat:** Customer B attempts to initialize or verify a payment on Customer A's order.
- **Mitigation:** Both `/api/payments/create-order` and `/api/payments/verify` verify that `order.user_id === user.id`. Unauthorized requests receive `HTTP 400/401 Unauthorized`.
- **Verification:** Verified in integration tests with Customer A and Customer B identities.

### 1.5 Media Upload Exploits & Remote Code Execution
- **Threat:** Attacker uploads executable PHP, SVG, HTML or oversized files to overwrite book covers.
- **Mitigation:**
  1. Administrative authorization is strictly enforced: `role === 'admin'` from `public.profiles`. Non-admins receive `HTTP 403 Forbidden`.
  2. Strict MIME type whitelist: only `image/jpeg`, `image/png`, and `image/webp` are permitted.
  3. Strict file size cap: 5MB maximum limit.
- **Verification:** Oversized buffers (6MB) and unauthorized MIME types (`text/html`) were tested and successfully rejected.

### 1.6 Secret Exposure & Client Leaks
- **Threat:** Private API secrets accidentally exposed in browser bundles, git history, or logs.
- **Mitigation:**
  1. Client bundles only receive public identifiers prefixed with `NEXT_PUBLIC_` (`NEXT_PUBLIC_RAZORPAY_KEY_ID`, `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`).
  2. Secret variables (`RAZORPAY_KEY_SECRET`, `RESEND_API_KEY`, `CLOUDINARY_API_SECRET`, `DELHIVERY_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`) are restricted to server execution contexts.
  3. No secrets or authorization tokens are logged in console output or database error fields.
- **Verification:** `git diff --check` and codebase inspection confirm zero secret leaks.

---

## 2. Row-Level Security (RLS) Policy Status

| Table | Policy | Scope | Status |
|---|---|---|:---:|
| `public.orders` | `orders_select_policy` | Customer read own orders; Admin reads all | **ENFORCED** |
| `public.orders` | `orders_update_policy` | Customer cancel own pending; Admin updates all | **ENFORCED** |
| `public.payments` | `payments_select_policy` | Customer read own payments; Admin reads all | **ENFORCED** |
| `public.payments` | `payments_admin_all` | Admin / Service Role write | **ENFORCED** |
| `public.email_logs` | `email_logs_select_admin` | Admin / Service Role read & write | **ENFORCED** |
| `public.audit_logs` | `audit_logs_select_admin` | Admin / Service Role read & write | **ENFORCED** |

