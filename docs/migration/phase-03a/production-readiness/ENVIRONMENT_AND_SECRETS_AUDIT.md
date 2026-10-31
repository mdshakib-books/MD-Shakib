# Phase 03A — Production Environment & Secrets Audit

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Production Migration Readiness Audit  
**Audit Scope:** Environment Variable References, Client/Server Isolation, Secret Leak Prevention, Deployment Configuration Contract  
**Audit Date:** October 31, 2026  
**Auditor:** Independent Security & Database Migration Architect  
**Environment Audit Status:** **DEFECT IDENTIFIED (SITE_URL MISMATCH & MISSING CLOUDINARY CONFIG)**  

---

## 1. Executive Summary

This audit reviewed all environment variable references across the codebase (`apps/web`, `server`), contrasted them with configuration templates (`.env.example`, `apps/web/.env.example`), and verified that sensitive server-only secrets are strictly isolated from client-side JavaScript bundles.

### Critical Audit Findings:
1. **Zero Secret Exposure in Client Bundles:** Verified that no server-side secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `CLOUDINARY_API_SECRET`, `DELHIVERY_TOKEN`, `RESEND_API_KEY`) are prefixed with `NEXT_PUBLIC_`. Next.js webpack compilation guarantees these secrets are not bundled into the client runtime.
2. **Environment Variable Naming Mismatch (`NEXT_PUBLIC_SITE_URL` vs `NEXT_PUBLIC_APP_URL`):** 
   - In `apps/web/lib/auth/actions.ts` (line 130), the password reset redirect URL reads:
     ```typescript
     redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000"}/reset-password`
     ```
   - However, both `.env.example` and `apps/web/.env.example` define `NEXT_PUBLIC_APP_URL`.
   - **Impact:** If `NEXT_PUBLIC_SITE_URL` is not explicitly set in the production hosting provider (e.g. Vercel), password recovery emails will contain redirect links pointing to `http://127.0.0.1:3000/reset-password`, preventing production users from completing password recovery.
3. **Cloudinary Configuration Gap:** Book creation and updates in the Admin Management System (`apps/web/app/admin/books`) require Cloudinary credentials to sign upload requests. If `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, and `CLOUDINARY_CLOUD_NAME` are omitted in production, book cover uploads fail.

---

## 2. Environment Configuration Matrix

The following matrix documents every environment variable referenced in the application, its lifecycle requirement, target environment, and validation status:

| Variable Name | Required / Optional / Future | Used By | Runtime Target | Description & Validation Status |
|---|:---:|---|:---:|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Required (Phase 1+)** | `@supabase/ssr`, client & server clients | Client & Server | Base HTTPS URL for Supabase API gateway. Must match production project URL. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required (Phase 1+)** | Supabase client auth & public data fetching | Client & Server | Public anonymous JWT. Safe for browser exposure. Validated by Supabase gateway. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required (Phase 2+)** | Server-only admin routines, seeders, webhooks | **Server Only** | Superuser service key. Bypasses RLS. **NEVER expose to client.** |
| `NEXT_PUBLIC_SITE_URL` | **Required (Phase 3+)** | Auth password recovery redirect | Client & Server | Canonical site URL for Auth email links. **DEFECT:** Omitted from `.env.example`. |
| `NEXT_PUBLIC_APP_URL` | **Optional / Legacy** | `.env.example` template reference | Client & Server | Defined in `.env.example`; superseded in code by `NEXT_PUBLIC_SITE_URL`. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`| **Required (Phase 2+)** | Image optimization & public CDN URLs | Client & Server | Public cloud name used for rendering optimized book images. |
| `CLOUDINARY_API_KEY` | **Required (Phase 2+)** | Admin book image upload endpoint | **Server Only** | API Key for signing Cloudinary upload requests. |
| `CLOUDINARY_API_SECRET` | **Required (Phase 2+)** | Admin book image upload signature generation | **Server Only** | API Secret. Server-side only. |
| `RESEND_API_KEY` | **Future (Phase 4/5)** | Transactional email delivery service | **Server Only** | API key for Resend dispatch. Not blocking for Phase 3A local ops. |
| `EMAIL_FROM` | **Future (Phase 4/5)** | Resend sender header (`orders@mdshakib.com`)| **Server Only** | Verified sender identity. |
| `ADMIN_EMAIL` | **Future (Phase 4/5)** | System alert and escalation dispatch | **Server Only** | Administrative recipient mailbox. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | **Future (Phase 4/5)** | Razorpay Standard Checkout SDK | Client & Server | Public merchant key ID for online gateway payments. |
| `RAZORPAY_KEY_SECRET` | **Future (Phase 4/5)** | Server-side signature verification & settlement | **Server Only** | HMAC key secret. Required for online payment settlement. |
| `RAZORPAY_WEBHOOK_SECRET` | **Future (Phase 4/5)** | Razorpay webhook validation endpoint | **Server Only** | Webhook signature verification secret. |
| `DELHIVERY_API_URL` | **Future (Phase 4/5)** | Logistics shipment tracking & dispatch | **Server Only** | Delhivery carrier API base endpoint. |
| `DELHIVERY_TOKEN` | **Future (Phase 4/5)** | Logistics carrier authorization | **Server Only** | Carrier API access token. |
| `DELHIVERY_WEBHOOK_SECRET` | **Future (Phase 4/5)** | Logistics webhook verification endpoint | **Server Only** | Webhook signature verification secret. |
| `DELHIVERY_PICKUP_LOCATION` | **Future (Phase 4/5)** | Warehouse pickup scheduling | **Server Only** | Authoritative warehouse location string. |
| `NODE_ENV` | **Required** | Next.js runtime environment | System | `'production'`, `'development'`, or `'test'`. Controls caching and error details. |

---

## 3. Secret Exposure Prevention & Guardrails

### 3.1 Client-Side Leak Scan
An exhaustive scan of client-facing components under `apps/web/app/` and `apps/web/components/` was executed:
- Zero references to `SUPABASE_SERVICE_ROLE_KEY` exist in any file containing `"use client"`.
- Zero private keys or database passwords exist in source code or committed artifacts.
- All service-role client instantiations are confined to server actions (`actions.ts`), API route handlers (`route.ts`), or administrative scripts (`apps/web/scripts/`).

### 3.2 Hosting Platform Environment Check
Before promoting code to production hosting:
1. Verify that `NEXT_PUBLIC_SITE_URL` is set to the production domain (e.g., `https://mdshakibbooks.com`).
2. Verify that `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` point to the production Supabase instance (`https://mhyawpnjhajytetqppam.supabase.co`).
3. Verify that `SUPABASE_SERVICE_ROLE_KEY` is configured in production environment variables and marked as **Encrypted / Sensitive**.
4. Align `.env.example` templates by renaming `NEXT_PUBLIC_APP_URL` to `NEXT_PUBLIC_SITE_URL` or supporting both via fallback:
   ```typescript
   const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "http://127.0.0.1:3000";
   ```

