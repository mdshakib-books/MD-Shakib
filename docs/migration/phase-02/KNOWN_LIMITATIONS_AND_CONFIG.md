# Phase 2: Known Limitations & Provider Configuration
## MD Shakib Islamic Books Modernization Project — Lean E-Commerce Completion

**Date:** November 10, 2026  
**Scope:** External Provider Activation Requirements, Operational Boundaries & Intentional Scope Constraints

---

## 1. Provider Credentials & Activation Checklist

Before activating the application in a live production environment with real customer transactions, the following provider credentials must be supplied in `.env.production`:

### 1.1 Razorpay Payment Gateway
| Environment Variable | Description | Activation Requirement |
| :--- | :--- | :--- |
| `RAZORPAY_KEY_ID` | Public Key ID | Generated from Razorpay Live Dashboard (`rzp_live_...`). |
| `RAZORPAY_KEY_SECRET` | Secret API Key | Kept strictly server-side. |
| `RAZORPAY_WEBHOOK_SECRET` | Webhook HMAC Secret | Configured in Razorpay Webhooks pointing to `/api/webhooks/razorpay`. |

> [!IMPORTANT]
> Local tests and staging suites operate under test mode. Live payments require completed Razorpay business KYC and active banking activation.

---

### 1.2 Delhivery Courier & Logistics
| Environment Variable | Description | Activation Requirement |
| :--- | :--- | :--- |
| `DELHIVERY_API_TOKEN` | Express API Token | Obtained from Delhivery One B2C portal. |
| `DELHIVERY_CLIENT_NAME` | Registered Merchant Name | Provided during Delhivery onboarding. |
| `DELHIVERY_WAREHOUSE_CODE` | Registered Pickup Location | Physical Delhi warehouse code registered with Delhivery. |

> [!NOTE]
> Delhivery sandbox endpoints are used during local testing. Live consignment booking and label downloads require active credit or postpaid billing on the Delhivery contract.

---

### 1.3 Resend Transactional Email
| Environment Variable | Description | Activation Requirement |
| :--- | :--- | :--- |
| `RESEND_API_KEY` | API Key | Generated from Resend console (`re_...`). |
| `EMAIL_FROM` | Default Sender Address | Configured with verified custom domain (e.g. `orders@mdshakib.com`). |

> [!TIP]
> Before live dispatch, configure SPF, DKIM, and DMARC DNS records for your domain on Cloudflare or your DNS registrar to ensure high inbox deliverability.

---

### 1.4 Cloudinary Media Storage
| Environment Variable | Description | Activation Requirement |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME` | Cloud Name | Provided in Cloudinary Dashboard. |
| `CLOUDINARY_API_KEY` | API Key | Kept server-side for signed uploads. |
| `CLOUDINARY_API_SECRET` | API Secret | Used for signing secure media upload tokens. |

---

## 2. Intentional Architectural Boundaries (Lean Scope)

In accordance with the Lean E-Commerce mandate, the following architectural boundaries are intentionally maintained:

1. **Role Simplicity:**  
   The platform operates with two distinct roles: `user` (Customer) and `admin` (Store Administrator). Multi-tier permissions, fine-grained ACLs, and staff role hierarchies are excluded.
2. **Single-Entry Catalogue Management:**  
   Bulk CSV/Excel catalogue imports and exports have been removed to preserve data integrity and eliminate catalogue desynchronization risks. Books are added and managed through the validated admin UI.
3. **Streamlined Return & Refund Workflow:**  
   The return process supports a 7-day customer request window, customer reason capture, admin review/approval, and atomic Razorpay refund execution. Automated multi-courier reverse pickups, replacement logistics, and warranty claims are excluded.
4. **Focused Reporting:**  
   Admin analytics are aggregated directly on PostgreSQL (Gross Revenue, Total Orders, Low Stock Alerts, and GST breakdowns). Heavy external business intelligence (BI) data warehouses are not required.
5. **Decoupled Delivery OTP:**  
   The merchant doorstep OTP verification system is strictly cryptographically secured (HMAC-SHA256) and operates independently of any proprietary courier-specific OTP mechanisms.
