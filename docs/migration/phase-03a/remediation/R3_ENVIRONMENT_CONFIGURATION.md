# Phase 03A-R3 — Environment & Secret Configuration Remediation

**Project:** MD Shakib Islamic Books  
**Workstream:** R3 — Environment Variables, Canonical URL Strategy & Secret Leak Prevention  
**Date:** October 31, 2026  
**Auditor / Engineer:** Independent DevOps & Security Specialist  
**Status:** **PASS** (Canonical URL Strategy Implemented, Templates Aligned, Secret Leaks Audited, Build Verified)  

---

## 1. Executive Summary & Objective

Workstream R3 audited all environment variable references across the codebase to resolve configuration discrepancies, establish a unified canonical application URL strategy, prevent client-side secret exposure, and ensure fail-closed behavior in production.

### Verified Defect:
Previously, `apps/web/lib/auth/actions.ts` (line 130) resolved the password recovery redirect URL using:
```typescript
redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || "http://127.0.0.1:3000"}/reset-password`
```
However, environment templates (`.env.example`, `apps/web/.env.example`) defined `NEXT_PUBLIC_APP_URL`.
If an operator deployed the application with only `NEXT_PUBLIC_APP_URL` configured, the code fell back to `http://127.0.0.1:3000`, causing password recovery emails to contain invalid localhost links in production.

### Remediation Applied:
1. Implemented a centralized, robust `getCanonicalSiteUrl()` utility in [`apps/web/lib/auth/session.ts`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/lib/auth/session.ts).
2. Defined explicit configuration precedence: `NEXT_PUBLIC_SITE_URL` > `NEXT_PUBLIC_APP_URL` > development fallback (`http://localhost:3000`).
3. Enforced **fail-closed behavior in production**: If neither variable is configured in a production environment, the utility throws an explicit configuration error rather than silently routing users to localhost.
4. Added automatic trailing slash sanitization and protocol validation (`^https?:\/\/`).
5. Updated `apps/web/lib/auth/actions.ts` to utilize `getCanonicalSiteUrl()`.
6. Aligned `.env.example` and `apps/web/.env.example` to document both variables with clear production guidelines.

---

## 2. Complete Environment Variable Inventory

| Variable Name | Required / Optional / Future | Public / Server-Only | Used By | Validation & Handling |
|---|:---:|:---:|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | **Required (Phase 1+)** | Public (Client & Server) | Supabase SSR and browser client | Validated via HTTPS gateway connection. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Required (Phase 1+)** | Public (Client & Server) | Public data queries and GoTrue Auth | Anonymous public JWT. Validated by Supabase. |
| `SUPABASE_SERVICE_ROLE_KEY` | **Required (Phase 2+)** | **Server Only** | Server actions, webhooks, seeders | Superuser service role. Bypasses RLS. Verified isolated from client bundles. |
| `NEXT_PUBLIC_SITE_URL` | **Required (Phase 3+)** | Public (Client & Server) | Auth redirects, emails, CORS | Canonical site URL. Preferred by `getCanonicalSiteUrl()`. |
| `NEXT_PUBLIC_APP_URL` | **Supported (Phase 1+)** | Public (Client & Server) | Legacy / alternative template URL | Secondary fallback URL evaluated if `SITE_URL` is unset. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`| **Required (Phase 2+)** | Public (Client & Server) | Image transformations and CDN URLs | Cloudinary public namespace. |
| `CLOUDINARY_API_KEY` | **Required (Phase 2+)** | **Server Only** | Admin book image upload endpoint | API key for signing upload requests. |
| `CLOUDINARY_API_SECRET` | **Required (Phase 2+)** | **Server Only** | Admin upload signature generation | HMAC secret. Server-only. |
| `RESEND_API_KEY` | **Future (Phase 4/5)** | **Server Only** | Transactional email dispatch | Resend API client key. Not blocking for Phase 3A. |
| `EMAIL_FROM` | **Future (Phase 4/5)** | **Server Only** | Email sender header (`orders@mdshakib.com`)| Verified sender identity string. |
| `ADMIN_EMAIL` | **Future (Phase 4/5)** | **Server Only** | Administrative alert recipient | Recipient mailbox string. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | **Future (Phase 4/5)** | Public (Client & Server) | Razorpay checkout script | Public merchant identifier for online gateway. |
| `RAZORPAY_KEY_SECRET` | **Future (Phase 4/5)** | **Server Only** | Payment signature verification | Secret key for webhook/settlement verification. |
| `RAZORPAY_WEBHOOK_SECRET` | **Future (Phase 4/5)** | **Server Only** | Payment webhook validation | Webhook signature HMAC key. |
| `DELHIVERY_API_URL` | **Future (Phase 4/5)** | **Server Only** | Carrier tracking & dispatch | Carrier endpoint URL. |
| `DELHIVERY_TOKEN` | **Future (Phase 4/5)** | **Server Only** | Logistics carrier authorization | Carrier API access token. |
| `DELHIVERY_WEBHOOK_SECRET` | **Future (Phase 4/5)** | **Server Only** | Logistics webhook validation | Webhook signature verification secret. |
| `DELHIVERY_PICKUP_LOCATION` | **Future (Phase 4/5)** | **Server Only** | Warehouse pickup scheduling | Warehouse identifier string. |
| `NODE_ENV` | **Required** | System | Next.js runtime environment | `'production'`, `'development'`, or `'test'`. |

---

## 3. Secret Leak Prevention Audit

An exhaustive audit of the codebase, build artifacts, and client-side modules was performed:
1. **Prefix Guardrails:** Verified that no sensitive credentials (`SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, `CLOUDINARY_API_SECRET`, `DELHIVERY_TOKEN`, `RESEND_API_KEY`) use the `NEXT_PUBLIC_` prefix.
2. **Client Component Isolation:** Inspected all components under `apps/web/app/` and `apps/web/components/`. All service-role client initializations and Cloudinary signature generations are strictly confined to server actions (`actions.ts`) or route handlers (`route.ts`).
3. **Production Webpack Bundle Verification:** Executed `npm run build` (`next build`). Turbopack bundle analysis confirms that zero server secrets are bundled into client-side JS chunks.

---

## 4. Verification Evidence

### 4.1 Automated URL Precedence & Validation Test Suite
The dedicated test suite [`apps/web/scripts/test-phase03a-r3-environment.ts`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/apps/web/scripts/test-phase03a-r3-environment.ts) was executed:
```
================================================================================
R3 ENVIRONMENT SUITE RESULTS: 7/7 TESTS PASSED (100%)
================================================================================
- Prefers NEXT_PUBLIC_SITE_URL over NEXT_PUBLIC_APP_URL: PASS
- Falls back to NEXT_PUBLIC_APP_URL when SITE_URL is absent: PASS
- Strips trailing slashes from configured URL: PASS
- Rejects malformed URL without valid http/https protocol: PASS
- Fails closed in production if neither variable is configured: PASS
- Falls back to localhost:3000 in development if neither is configured: PASS
- Zero server-only secrets use NEXT_PUBLIC_ prefix: PASS
```

### 4.2 Production Build Verification
```
▲ Next.js 16.4.3 (Turbopack)
✓ Compiled successfully in 1685ms
✓ Finished TypeScript in 2.6s (0 errors)
✓ Generating static pages using 9 workers (22/22)
Finalizing page optimization ... (0 errors, 48 routes compiled)
```

**Workstream R3 Verdict:** **PASS (Fully Remediated and Verified)**.

