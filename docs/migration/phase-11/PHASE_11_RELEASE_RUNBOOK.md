# Phase 11: Final Release & Production Readiness — Controlled Release Runbook & Post-Deployment Smoke Test Plan
## MD Shakib Islamic Books Modernization & Migration

**Project:** MD Shakib Islamic Books  
**Phase:** 11 — Final Release & Production Readiness  
**Target Environments:** Vercel Production Infrastructure | Supabase PostgreSQL 17  
**Date:** November 6, 2026  
**Auditor / Release Lead:** Senior DevOps Engineer & QA Lead  
**Execution Status:** **RUNBOOK PREPARED — AWAITING CONTROLLED RELEASE TRIGGER**  

---

## 1. Controlled Release Sequence (Phase-Gated)

This runbook outlines the sequential, step-by-step procedure for executing the production release of MD Shakib Islamic Books once explicit approvals have been secured.

```
[Step 1: Pre-Release Gate Verification] 
    │
    ▼
[Step 2: Pre-Release Physical & Logical Database Backup] 
    │
    ▼
[Step 3: Apply Production Database Migrations (Gate A)] 
    │
    ▼
[Step 4: Execute Production Catalog Seeding (Gate B)] 
    │
    ▼
[Step 5: Configure Production Secrets & Edge Variables] 
    │
    ▼
[Step 6: Deploy Production Application on Vercel (Gate D)] 
    │
    ▼
[Step 7: Activate Live Payments & Webhook Endpoints (Gate C)] 
    │
    ▼
[Step 8: Execute Post-Deployment Smoke Test Protocol] 
    │
    ▼
[Step 9: Monitor Telemetry, Error Rates & Release Sign-off]
```

### Detailed Sequence Steps:

#### Step 1: Pre-Release Gate Verification
- Confirm 0 P0/P1 release-blocking defects remain.
- Confirm `npm run typecheck` passes with 0 errors.
- Confirm `npm run lint` passes with 0 errors.
- Confirm `npm run build` succeeds (25/25 routes compiled).
- Verify Client Sign-Off and UAT approvals are signed.

#### Step 2: Database Backup Execution
- In Supabase Dashboard, trigger a physical backup snapshot.
- Execute logical backup using CLI:
  ```bash
  supabase db dump --linked -f backups/prod_backup_pre_release_$(date +%Y%m%d_%H%M%S).sql
  ```
- Store the encrypted backup file in off-site S3 storage.

#### Step 3: Database Migration Execution (Requires Gate A Authorization)
- Link CLI to production Supabase project:
  ```bash
  supabase link --project-ref <prod-project-ref>
  supabase db push
  ```
- Run post-migration validation SQL checking all 15 public tables, composite indexes, and stored procedures.

#### Step 4: Catalog Seeding (Requires Gate B Authorization)
- If initial catalog seed is required, execute idempotent seed script:
  ```bash
  supabase db remote execute -f supabase/seed.sql
  ```
- Confirm active book records exist in `public.books`.

#### Step 5: Production Environment Variables Configuration
- Verify production variables in Vercel Project Settings:
  - `NEXT_PUBLIC_SITE_URL="https://mdshakibbooks.com"`
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY` (Server-side vault)
  - `NEXT_PUBLIC_RAZORPAY_KEY_ID` (Live key)
  - `RAZORPAY_KEY_SECRET` (Live secret in vault)
  - `RAZORPAY_WEBHOOK_SECRET` (Live secret in vault)
  - `CLOUDINARY_API_KEY` & `CLOUDINARY_API_SECRET`
  - `RESEND_API_KEY`
  - `DELHIVERY_TOKEN` & `DELHIVERY_WEBHOOK_SECRET`

#### Step 6: Production Deployment (Requires Gate D Authorization)
- Trigger production deployment from release commit (`015e7ad`):
  ```bash
  git checkout main
  git merge --ff-only new-fix
  git push origin main
  ```
- Monitor Vercel build output and verify deployment status.

#### Step 7: Live Payment & Webhook Activation (Requires Gate C Authorization)
- In Razorpay Dashboard, set Webhook URL to:
  `https://mdshakibbooks.com/api/webhooks/razorpay`
- Configure webhook secret matching `RAZORPAY_WEBHOOK_SECRET`.
- Subscribe to: `payment.captured`, `payment.failed`, `refund.processed`.

#### Step 8: Post-Deployment Smoke Testing
- Immediately execute the Smoke Test Protocol detailed in Section 2.

#### Step 9: Post-Release Monitoring & Standby
- Release team maintains active monitoring for 120 minutes:
  - Vercel runtime logs & error rate.
  - Supabase database CPU, active connections, and query latency.
  - Razorpay payment transaction webhook logs.
  - Order fulfillment state progressions.

---

## 2. Post-Deployment Smoke Test Protocol

This checklist must be executed immediately after production deployment cutover. All tests must be recorded with exact UTC timestamps and actual responses.

> **SAFETY MANDATE:**  
> Use an approved, dedicated administrative test account and the authorized ₹1.00 live test transaction protocol. Do not place unauthorized real orders or trigger real courier pickups.

| Test ID | Verification Item | Target URL / Operation | Expected Response / Behavior | Actual Result | Status |
| :---: | :--- | :--- | :--- | :--- | :---: |
| **ST-01** | Production Homepage | `GET https://mdshakibbooks.com/` | HTTP 200, Hero renders, 0 console errors | [Record live result] | `[ ] PASS` |
| **ST-02** | SEO Sitemap & Robots | `GET /robots.txt`<br>`GET /sitemap.xml` | HTTP 200, valid robots directives & XML sitemap | [Record live result] | `[ ] PASS` |
| **ST-03** | System Health Probe | `GET /api/health` | HTTP 200, `{ status: "healthy", ... }` | [Record live result] | `[ ] PASS` |
| **ST-04** | Books Catalogue | `GET /books` | HTTP 200, active catalog titles display | [Record live result] | `[ ] PASS` |
| **ST-05** | Book Details Page | `GET /books/[valid-slug]` | HTTP 200, cover image, price, metadata | [Record live result] | `[ ] PASS` |
| **ST-06** | Catalog Search | `GET /books?search=Quran` | HTTP 200, filtered books matching query | [Record live result] | `[ ] PASS` |
| **ST-07** | Customer Sign-In | `POST /login` (Test Account) | Session cookie issued, redirected to `/profile` | [Record live result] | `[ ] PASS` |
| **ST-08** | Edge Middleware Guard | `GET /account` (Unauthenticated) | HTTP 307 redirect to `/login?redirect=/account`| [Record live result] | `[ ] PASS` |
| **ST-09** | Cart Persistence | Add book to cart on `/books` | Badge increments, item in `/cart` | [Record live result] | `[ ] PASS` |
| **ST-10** | Checkout Loading | `GET /checkout` (Authenticated) | HTTP 200, address selector and payment radio | [Record live result] | `[ ] PASS` |
| **ST-11** | COD Order Placement | Place test COD order | Order created atomically, redirected to `/order-success` | [Record live result] | `[ ] PASS` |
| **ST-12** | Razorpay Live Probe | Authorized ₹1 test transaction | Signature verified via HMAC SHA-256; captured | [Record live result] | `[ ] PASS` |
| **ST-13** | Webhook Verification | Razorpay webhook ping | HTTP 200, timing-safe verification, order confirmed | [Record live result] | `[ ] PASS` |
| **ST-14** | Admin Access Guard | `GET /admin` (Customer Account) | HTTP 307 redirect / 403 Forbidden | [Record live result] | `[ ] PASS` |
| **ST-15** | Admin Dashboard | `GET /admin` (Admin Account) | HTTP 200, live revenue & order aggregations | [Record live result] | `[ ] PASS` |
| **ST-16** | Admin Order Flow | View test order in `/admin/orders` | Order visible, advance status to `Confirmed` | [Record live result] | `[ ] PASS` |
| **ST-17** | Cloudinary Image CDN | Inspect book cover network URL | Delivered via Cloudinary CDN in WebP/AVIF | [Record live result] | `[ ] PASS` |
| **ST-18** | Transactional Email | Confirm test order email | Delivered via Resend to approved test recipient | [Record live result] | `[ ] PASS` |
| **ST-19** | Shipping Serviceability | Pincode `110001` check | HTTP 200, delivery fee ₹35 or free calculated | [Record live result] | `[ ] PASS` |
| **ST-20** | Secret Leak Audit | Inspect DOM & Network payloads | Zero secrets, service-role keys, or raw JWTs | [Record live result] | `[ ] PASS` |

---

## 3. Post-Deployment Smoke Test Sign-off

- **Environment Evaluated:** Production (`mdshakibbooks.com`)
- **Execution Timestamp (UTC):** ________________________________________
- **Smoke Test Lead:** __________________________________________________
- **Smoke Test Verdict:** `[ ] 100% PASSED   [ ] FAILED (TRIGGER ROLLBACK)`
- **Lead Signature:** __________________________________________________
- **Notes / Incident Log:** _____________________________________________
