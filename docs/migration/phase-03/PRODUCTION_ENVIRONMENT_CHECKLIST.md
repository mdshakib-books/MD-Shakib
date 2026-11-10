# Production Environment Configuration Checklist
**Project:** MD Shakib Islamic Books  
**Document Code:** `PRODUCTION_ENVIRONMENT_CHECKLIST.md`  
**Date:** 2026-11-10  
**Harness:** `apps/web/scripts/test-phase03-production-config.ts`  
**Status:** AUDITED (Strict Client/Server Secret Isolation Verified)  

---

## 1. Environment Variable Audit & Activation Runbook

Under no circumstances shall live secrets or production credentials be committed to version control. The table below documents every required environment variable, its scope, staging status, and exact activation instructions for production deployment on Vercel:

| Variable Name | Required Scope | Secret? | Staging Status | Production Activation Instructions |
|---|---|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Public (Client + Server) | No | MISSING | Set to canonical production domain (e.g. `https://mdshakibbooks.com`). Configures canonical tags, metadata, and callback redirects. |
| `NEXT_PUBLIC_SUPABASE_URL` | Public (Client + Server) | No | CONFIGURED | Update to production Supabase project URL (`https://<project-ref>.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public (Client + Server) | No | CONFIGURED | Copy public anonymous key from production Supabase dashboard. |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-Only | **YES** | CONFIGURED | Copy privileged service-role key from production Supabase dashboard. Must **never** be prefixed with `NEXT_PUBLIC_`. |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Public (Client + Server) | No | STAGING_DEFAULT | Switch from test key (`rzp_test_...`) to live mode key (`rzp_live_...`) in Razorpay Dashboard. |
| `RAZORPAY_KEY_SECRET` | Server-Only | **YES** | STAGING_DEFAULT | Generate Live Mode Key Secret in Razorpay Dashboard -> API Keys. |
| `RAZORPAY_WEBHOOK_SECRET` | Server-Only | **YES** | STAGING_DEFAULT | Enter a strong random secret in Razorpay Dashboard -> Webhooks -> Add Webhook (`https://your-domain.com/api/webhooks/razorpay`) subscribing to `payment.captured`, `payment.failed`, `refund.processed`. |
| `DELHIVERY_TOKEN` | Server-Only | **YES** | CONFIGURED | Enter production Delhivery B2C Client Token provided by Delhivery One enterprise team. |
| `DELHIVERY_WEBHOOK_SECRET` | Server-Only | **YES** | STAGING_DEFAULT | Set custom authorization token agreed with Delhivery carrier integration team for incoming shipment status callbacks. |
| `RESEND_API_KEY` | Server-Only | **YES** | CONFIGURED | Generate production API key with full sending access from Resend Dashboard. |
| `EMAIL_FROM` | Server-Only | No | CONFIGURED | Set to authoritative sender format (e.g. `MD Shakib Book Store <orders@mdshakibbooks.com>`). Requires verified sending domain with SPF, DKIM, and DMARC DNS records. |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Public (Client + Server) | No | CONFIGURED | Production Cloudinary cloud name. |
| `CLOUDINARY_API_KEY` | Server-Only | **YES** | CONFIGURED | Production Cloudinary API Key. |
| `CLOUDINARY_API_SECRET` | Server-Only | **YES** | CONFIGURED | Production Cloudinary API Secret. |
| `BUSINESS_GSTIN` | Server-Only | No | MISSING | Enter 15-character statutory GSTIN registered under the business entity. Invoicing fails closed in production if absent. |
| `BUSINESS_LEGAL_NAME` | Server-Only | No | MISSING | Full registered legal entity name for statutory disclosures and tax invoices. |
| `BUSINESS_REGISTERED_ADDRESS` | Server-Only | No | MISSING | Physical registered office address of the business entity. |
| `GRIEVANCE_OFFICER_NAME` | Server-Only | No | MISSING | Designated Grievance Officer name resident in India. |
| `GRIEVANCE_OFFICER_EMAIL` | Server-Only | No | MISSING | Dedicated grievance contact mailbox (e.g. `grievance@mdshakibbooks.com`). |
| `GRIEVANCE_OFFICER_PHONE` | Server-Only | No | MISSING | Official grievance helpline telephone number. |

---

## 2. Security & Fail-Closed Guardrails

1. **Zero Client Secret Exposure:**
   - Static analysis verified that no server secret (`RAZORPAY_KEY_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, `DELHIVERY_TOKEN`, `CLOUDINARY_API_SECRET`, `RESEND_API_KEY`) is prefixed with `NEXT_PUBLIC_` or bundled in client JS.
2. **Statutory GSTIN Fail-Closed:**
   - `apps/web/lib/commerce/invoices.ts` strictly forbids placeholder GSTINs (`07AAAAA0000A1Z5`) in production (`NODE_ENV === "production"`), halting invoice generation if a legitimate 15-character GSTIN is not provided.
3. **Webhook HMAC Fail-Closed:**
   - Razorpay webhook verification rejects any payload that does not match the HMAC-SHA256 signature calculated from the raw request body using `RAZORPAY_WEBHOOK_SECRET`.
