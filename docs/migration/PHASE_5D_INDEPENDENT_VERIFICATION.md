# PHASE 5D — Independent Security & Integration Audit

**Project:** MD Shakib Islamic Books  
**Repository:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`  
**Phase:** 5D — External Service Integrations Audit  
**Audit Date:** 2026-10-29  
**Gate Status:** **BLOCKED**

---

## 1. Executive Summary

An independent security, atomicity, and integration audit was conducted on the Phase 5D external service implementations (Razorpay, Resend, Cloudinary, and Delhivery). 

While the core payment cryptography, atomic order RPCs, admin media permissions, and email logging invariants are well-engineered, the audit has identified a **critical security vulnerability in the Delhivery webhook endpoint** (`/api/webhooks/delhivery`) that allows unauthenticated external callers to force arbitrary order delivery state transitions. In accordance with the audit instructions (*"Do not approve production webhook use until authenticity verification is demonstrated. If authenticity cannot be verified, untrusted requests cannot change order or delivery statuses."*), the gate status is **BLOCKED** pending implementation of webhook authenticity controls and concurrency hardening.

---

## 2. Investigation of Previous Test Failures

Two command failures were recorded during Phase 5D implementation:

### 2.1 Failure 1: Standalone Script Environment Loading (`Exited with code 1`)
- **Command:** `npx tsx scripts/test-integrations.ts`
- **Output:** `Missing Supabase keys in environment.`
- **Root Cause:** Next.js automatically injects `.env.local` into its server runtime, but standalone execution via `tsx` or Node does not load `.env.local` unless instructed.
- **Resolution:** Passing `--env-file=.env.local` (`npx tsx --env-file=.env.local scripts/test-integrations.ts`) loaded all required keys into `process.env`. No application code was altered.

### 2.2 Failure 2: TypeScript Strict Null Checks (`Exited with code 2`)
- **Command:** `npm run typecheck && npm run lint && npm run build`
- **Output:** 6 compiler errors in `scripts/test-integrations.ts` (`TS18047: 'addr' is possibly 'null'`, `'shippedOrder' is possibly 'null'`, `'deliveredOrder' is possibly 'null'`).
- **Root Cause:** TypeScript strict mode required explicit null guards on the return types of Supabase `.single()` database queries.
- **Resolution:** Added explicit assertions (`if (!addr) throw ...`, `if (!shippedOrder) throw ...`). All 10 test assertions remained 100% identical. The subsequent typecheck passed with 0 errors.

---

## 3. Razorpay Payment Security & Concurrency Audit

### 3.1 Verified Security Controls
- **Authoritative Database Totals:** In `createRazorpayOrder`, the payment amount is strictly queried from `public.orders` using `order.total_amount` and converted to paise (`Math.round(order.total_amount * 100)`). Any client-submitted amount is ignored.
- **Ownership Verification:** Validates `order.user_id === userId` before creating or settling payments.
- **HMAC SHA-256 Cryptography:** In `validateRazorpaySignature`, the signature is computed via `crypto.createHmac('sha256', secret).update(`${order_id}|${payment_id}`).digest('hex')` and verified using constant-time comparison `crypto.timingSafeEqual` to defeat timing side-channel attacks.
- **Tamper Rejection:** Testing with an invalid signature (`"tampered_signature_hack"`) confirmed immediate rejection.

### 3.2 Findings & Vulnerability Risks
1. **Out-of-Order Payment Failure Overwrite:** In `apps/web/lib/integrations/razorpay/webhook.ts` (lines 124–140), a `payment.failed` event updates `public.payments` to `status = 'Failed'` without verifying that `status` is not already `'Paid'`. If a delayed or out-of-order `payment.failed` event arrives after `order.paid`, it will overwrite the payment record's status to `Failed`.
   - **Recommended Fix:** Add `.neq("status", "Paid")` to the `payment.failed` update query.
2. **Webhook Race Conditions:** Checking `order.is_paid` in application memory is not atomic under concurrent webhook requests. Two concurrent webhook deliveries arriving simultaneously can both read `is_paid = false`, perform duplicate updates to `public.orders`, and trigger duplicate confirmation emails.
   - **Recommended Fix:** Execute the update with an atomic database condition: `.eq("id", order.id).eq("is_paid", false)` and only dispatch emails if the update affected 1 row.

---

## 4. Resend Transactional Email Audit

### 4.1 Real vs. Simulated Provider Execution
- **Audit Finding:** The integration test suite executed against a **local mock stub**, NOT live Resend servers.
- **Reason:** Real production credentials (`RESEND_API_KEY`) were not present in the local environment (placeholder `re_mock_test_key_resend` was configured).
- **Semantics:** Tests confirmed HTML template generation, itemization, and audit record insertion into `public.email_logs` (`status = 'sent'`, provider response recorded). However, **actual network delivery, inbox reception, and SMTP transit were NOT tested and cannot be claimed as verified.**

### 4.2 Non-Blocking Architecture
- Verified that all email dispatches in checkout and cancellation workflows are wrapped in `.catch()` blocks. Email provider downtime or timeouts will never roll back or fail a customer's order.

---

## 5. Cloudinary Media Security Audit

### 5.1 Verified Controls
- **Server-Side Admin Check:** Both `/api/admin/media/sign` and `/api/admin/media/upload` authenticate the caller and query `public.profiles` for `role === 'admin'`. Non-admins and anonymous callers receive `HTTP 403 Forbidden`.
- **Upload Path Size Cap:** The 5MB limit is enforced on the raw server buffer (`buffer.length > MAX_IMAGE_SIZE_BYTES`), not merely client form metadata.
- **Folder Scoping:** Signed upload parameters are cryptographically restricted to `folder = 'mdshakib_books'`.

### 5.2 Hardening Observation
- File type validation in `/api/admin/media/upload` relies on `file.type` (client-provided MIME string) rather than inspecting file magic bytes. While Cloudinary validates binary contents on ingest, adding binary magic-byte checks (`image/png`: `89 50 4E 47`, `image/jpeg`: `FF D8 FF`) is recommended before production.

---

## 6. Delhivery Logistics & Webhook Authenticity — CRITICAL GATE

### 6.1 Critical Vulnerability: Unauthenticated Webhook Endpoint
- **Endpoint:** `/api/webhooks/delhivery/route.ts`
- **Vulnerability:** The route accepts unauthenticated HTTP POST requests from the public internet without verifying any bearer token, signature, or shared secret:
  ```typescript
  export async function POST(req: Request) {
    const payload = await req.json();
    const result = await processDelhiveryWebhook(payload);
    return NextResponse.json(result);
  }
  ```
- **Impact:** Any attacker on the public internet can send a spoofed POST request containing an arbitrary AWB and `status: "Delivered"`. The system will automatically transition that order to `Delivered` and record `delivered_at = now()`. This represents an unauthenticated remote state transition vulnerability.

### 6.2 Provider Webhook Authentication Mechanism
- In Delhivery's official B2C Express API specification:
  - Delhivery push webhooks do NOT use HMAC signatures like Razorpay.
  - Instead, Delhivery supports:
    1. A pre-shared Webhook Secret / Bearer Token passed in the `Authorization: Token <secret>` header or custom header configured during merchant webhook registration.
    2. Static IP whitelisting restricting inbound webhook traffic to Delhivery's production gateway IP ranges.
- **Gate Requirement:** Production webhook processing cannot be approved until a shared secret token check (e.g. `DELHIVERY_WEBHOOK_SECRET`) or IP validation is implemented and demonstrated.

### 6.3 Serviceability & Concurrency Findings
- **Pincode Format vs. Live Serviceability:** `checkPincodeServiceability` enforces the 6-digit regex format, but in mock mode it returns `serviceable: true` for all valid numbers. Actual geographic serviceability can only be verified against live Delhivery pin-code endpoints.
- **Shipment Concurrency:** Sequential duplicate calls were verified (`alreadyBooked = true`), but concurrent booking requests require a PostgreSQL lock or atomic conditional update on `shipping_awb` to prevent race conditions.

---

## 7. Real Provider vs. Local Simulation Matrix

| Service | Tested Feature | Mode Observed | Live Provider Contact? |
|---|---|:---:|:---:|
| **Razorpay** | HMAC SHA-256 Signatures | Deterministic Cryptographic Fixture | NO (Cryptographic algorithm verified locally) |
| **Razorpay** | Webhook Processing | Local Webhook Payload + Real DB | NO (Simulated webhook payload) |
| **Resend** | Email Template & Logging | Local Mock Stub (`email_logs` DB) | NO (Simulated dispatch, no SMTP/API contact) |
| **Cloudinary** | Signatures & Size Limits | Local Binary Buffer & SDK Utility | NO (Local mock URL generated) |
| **Delhivery** | Pincode Format Validation | Local Regex Engine | NO (Offline mock fallback) |
| **Delhivery** | Shipment & Webhook Mapping | Local Database Transitions | NO (Simulated tracking payload) |

---

## 8. Empirical Test Suite Evidence

### 8.1 Next.js App Router Verification
- `npm run typecheck`: **0 errors**
- `npm run lint`: **0 errors, 0 warnings**
- `npm run build`: **Compiled 22 routes in 1392ms**

### 8.2 Automated Test Suites
- Phase 5D Integration Suite (`scripts/test-integrations.ts`): **10/10 PASS**
- Phase 5C Commerce Suite (`scripts/test-commerce.mjs`): **10/10 PASS**

### 8.3 Legacy Non-Regression
- Legacy Vite Client (`client`): **Compiled in 1.09s, 0 errors**
- Legacy Express Server (`server`): **0 syntax errors**
- Git Status: Only untracked new phase directories (`apps/`, `docs/`, `supabase/`, `.env.example`). **Zero modifications to legacy `client/` or `server/`.**

---

## 9. Final Gate Authorization

| Audit Criterion | Finding | Status |
|---|---|:---:|
| **Investigation of Test Failures** | Identified as environment flag & TypeScript strict null checks | ✅ VERIFIED |
| **Razorpay Authoritative Totals** | Derived strictly from database records in paise | ✅ VERIFIED |
| **Razorpay Cryptographic Signatures** | Constant-time HMAC SHA-256 verification active | ✅ VERIFIED |
| **Resend Email Persistence** | Recorded in `email_logs`; acknowledged as local stub | ✅ VERIFIED |
| **Cloudinary Role Authorization** | Admin-only access verified on server-side | ✅ VERIFIED |
| **Cloudinary 5MB Size Cap** | Enforced on actual server-side upload path | ✅ VERIFIED |
| **Delhivery Webhook Authenticity** | **NO authentication header/secret check on `/api/webhooks/delhivery`** | ❌ **CRITICAL FLAW** |
| **Razorpay Out-of-Order Settlement** | `payment.failed` event can overwrite verified `Paid` record | ⚠️ **DEFECT** |

---

### FINAL GATE STATUS: **BLOCKED**

**Blocking Issues:**
1. **Delhivery Webhook Authentication:** The route `/api/webhooks/delhivery` has no authenticity verification, allowing any unauthenticated internet user to spoof delivery events.
2. **Razorpay Out-of-Order Webhook Protection:** Late-arriving `payment.failed` webhooks can overwrite a verified `Paid` payment status.
3. **Webhook Concurrency Safety:** Webhook settlement lacks atomic `WHERE is_paid = false` mutual exclusion, leaving a race window under simultaneous deliveries.

Per the audit guidelines, no code modifications were made during this audit. Awaiting explicit user approval on remediating these findings before proceeding to Phase 6.

