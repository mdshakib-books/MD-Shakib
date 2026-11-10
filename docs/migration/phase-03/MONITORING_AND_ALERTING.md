# Operational Monitoring & Alerting Strategy
**Project:** MD Shakib Islamic Books  
**Document Code:** `MONITORING_AND_ALERTING.md`  
**Date:** 2026-11-10  
**Scope:** Runtime Exceptions, Health Checks, Webhooks, Financial Failures, PII Redaction  

---

## 1. Monitoring Architecture Overview

The application implements a lightweight, zero-overhead monitoring framework tailored for Next.js App Router on Vercel and Supabase:

1. **Centralized Logger (`apps/web/lib/logger.ts`):**
   - High-performance, structured JSON output in production (`NODE_ENV === "production"`).
   - Recursive PII and credential redaction (passwords, tokens, API keys, OTPs, credit cards, JWTs, signatures).
   - Contextual tracking (`userId`, `orderId`, `endpoint`, `correlationId`).
2. **Operational Alert Dispatcher (`logger.alert`):**
   - Emits structured high-priority events formatted with `[ALERT:CRITICAL]` tags for ingestion by log-based alerting systems (e.g. Vercel Log Drains, Datadog, AWS CloudWatch, or BetterStack).
   - In-memory alert deduplication to prevent alert storms during cascade failures.
3. **Health Check Probing (`/api/health`):**
   - Returns HTTP 200 when database is healthy; HTTP 503 when degraded or unreachable.
   - Measures PostgreSQL query latency in milliseconds.
   - Reports uptime and configuration status of external providers (Supabase, Razorpay, Delhivery, Resend, Cloudinary).

---

## 2. Monitored Operational Failure Events

| Event Category | Monitored Incident | Severity | Action Triggered | Alert Channel / Destination |
|---|---|---|---|---|
| **Payment Integrity** | Razorpay Webhook HMAC Signature Mismatch / Forgery | CRITICAL | Request rejected with 401; incident logged with client IP and raw payload hash. | Structured Operational Alert |
| **Payment Integrity** | Settlement Collisions / Duplicate Payment ID Conflict | HIGH | Handled idempotently by `settle_payment_atomic`; logged if conflict detected. | Application Log (WARN) |
| **Financial / Refund** | Refund Attempt Exceeding Order Total / Invariant Violation | CRITICAL | Transaction rejected atomically; logged with order number and attempted amount. | Structured Operational Alert |
| **Logistics / OTP** | Doorstep Delivery OTP Brute-Force Lockout | HIGH | Lockout triggered after 5 failed attempts; OTP invalidated; requires admin review. | Application Log (WARN) |
| **Logistics / Webhook** | Delhivery Webhook Signature or Auth Token Forgery | HIGH | Webhook call rejected with 401; unauthorized attempt logged. | Structured Operational Alert |
| **Database** | Supabase PostgreSQL Connection Failure / Health Degradation | CRITICAL | Health endpoint returns 503; alert triggered for container/DB restart. | Vercel Health Alert / Uptime Monitor |
| **Communication** | Transactional Email Dispatch Failure (Resend API) | MEDIUM | Error recorded in `public.email_logs`; retry queued without blocking customer order. | Application Log (WARN) |
| **Inventory** | Low Physical Stock Threshold Triggered (Stock <= 5) | MEDIUM | Recorded in `public.stock_alerts`; admin email triggered; deduplicated for 24h. | Admin Notification Email |

---

## 3. Data Redaction & Privacy Assurance

Under Rule 3 of IT (SPDI) Rules and Section 8 of DPDPA 2023, logs must never leak sensitive authentication credentials or financial data.

The logger enforces strict pattern-based redaction:
- **Keys matching sensitive patterns:** `password`, `secret`, `token`, `api_key`, `authorization`, `cookie`, `otp`, `signature`, `service_role`, `credit_card`, `cvv`, `pan`, `ssn` are converted to `[REDACTED]`.
- **JWT tokens:** String values matching base64url JWT regex `eyJ...` are converted to `[REDACTED_JWT]`.
- **Error stacks:** Redacted in production builds to prevent leaking internal directory structures or database function signatures.
