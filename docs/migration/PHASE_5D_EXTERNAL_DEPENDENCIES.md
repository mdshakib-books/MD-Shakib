# PHASE 5D — External Dependencies & Operational Requirements

**Project:** MD Shakib Islamic Books  
**Phase:** 5D — External Service Integrations  
**Date:** 2026-10-29  
**Status:** **DOCUMENTED**

---

## 1. Summary of External Dependencies

Phase 5D connects the application to four third-party service providers. While all integration adapters, schemas, RPCs, signature validators, and idempotent webhooks are verified and function properly with mock/sandbox fallbacks, full live production cutover requires live merchant accounts and API credentials.

The table below catalogs every external dependency, its configuration keys, purpose, and operational requirements.

| Provider | Purpose | Environment Variables | Production Cutover Requirements |
|---|---|---|---|
| **Razorpay** | Online Payments (UPI, Cards, NetBanking, Refunds) | `NEXT_PUBLIC_RAZORPAY_KEY_ID`<br>`RAZORPAY_KEY_SECRET`<br>`RAZORPAY_WEBHOOK_SECRET` | 1. Active Razorpay Merchant Account with KYC approval.<br>2. Generate Live API Key and Secret.<br>3. Configure Webhook URL in Razorpay Dashboard to `https://<domain>/api/webhooks/razorpay` with events: `order.paid`, `payment.captured`, `payment.failed`. |
| **Resend** | Transactional Emails (Order Confirmation, Payment, Cancellation) | `RESEND_API_KEY`<br>`EMAIL_FROM`<br>`ADMIN_EMAIL` | 1. Resend account with verified sending domain (`mdshakib.com`).<br>2. DNS records configured: SPF, DKIM, DMARC on domain DNS.<br>3. Production API Key (`re_...`). |
| **Cloudinary** | Catalog & Cover Image Media Storage | `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`<br>`CLOUDINARY_API_KEY`<br>`CLOUDINARY_API_SECRET` | 1. Cloudinary account with designated cloud name.<br>2. Upload presets or strict signed upload policy configured on folder `mdshakib_books/`. |
| **Delhivery** | Logistics, Pincode Validation, Waybill Booking & Tracking | `DELHIVERY_TOKEN`<br>`DELHIVERY_API_URL`<br>`DELHIVERY_PICKUP_LOCATION` | 1. Active Delhivery Express B2C Merchant Account.<br>2. Registered warehouse pickup location name in Delhivery portal matching `DELHIVERY_PICKUP_LOCATION`.<br>3. Production API Token.<br>4. Configure Delhivery tracking push webhook to `https://<domain>/api/webhooks/delhivery`. |
| **Supabase** | Authoritative Database, Auth, RLS, Edge Proxy | `NEXT_PUBLIC_SUPABASE_URL`<br>`NEXT_PUBLIC_SUPABASE_ANON_KEY`<br>`SUPABASE_SERVICE_ROLE_KEY` | 1. Production Supabase project provisioned in `ap-south-1` (Mumbai).<br>2. Run migration scripts from `supabase/migrations/`.<br>3. Configure SMTP in Supabase Auth to use Resend SMTP credentials. |

---

## 2. Readiness Evaluation

- **Testable Integration Boundary:** **100% Complete & Verified**.
- **Cryptographic Signature Verification:** **Active & Enforced**.
- **Database Schema & Logging:** **Fully Provisioned** (`payments`, `orders`, `email_logs`, `audit_logs`).
- **Live Provider Credentials:** **Pending provision by project administrator before Phase 6 cutover**.

