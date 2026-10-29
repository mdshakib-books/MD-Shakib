# Integration Mapping: Third-Party Services & Webhooks

This document details the migration plan for all external service integrations, mapping existing libraries, credentials, API endpoints, webhooks, and error recovery strategies to the target Next.js + Supabase platform.

---

## 1. Cloudinary (Image Storage & Optimization)

- **Existing Implementation:** Configured in `server/src/config/cloudinary.config.js` and uploaded via `server/src/utils/cloudinary.util.js` with Multer writing to `./public/temp`.
- **Target Implementation:**
  - Integrated via `cloudinary` v2 Node.js SDK inside Next.js Server Actions and Route Handlers.
  - Multi-image uploads streamed or uploaded via buffer without creating permanent un-cleaned temp files on serverless disk.
  - Automatic Cloudinary transformations used in product grids: `f_auto,q_auto,w_400,h_500,c_fill`.
- **Environment Variables Required:**
  - `CLOUDINARY_CLOUD_NAME`
  - `CLOUDINARY_API_KEY`
  - `CLOUDINARY_API_SECRET`
- **Security & Validation:**
  - Server-side validation of file size ($\le 5\text{MB}$ per image, max 5 images).
  - Explicit MIME type whitelist: `image/jpeg`, `image/png`, `image/webp`.

---

## 2. Resend (Transactional Email Delivery)

- **Existing Implementation:** `server/src/utils/mail.js` uses Google OAuth2 Client (`googleapis`) to send Base64-encoded RFC 2822 emails through Gmail API v1 to bypass Render's outbound SMTP blocks.
- **Target Implementation:**
  - Modern API-first email delivery using `@resend/node` (or `resend`).
  - Branded responsive React/HTML email templates replicating exact luxury black/gold styling (`#0B0B0B`, `#C9A24A`, `#F5F5F5`):
    1. **Registration OTP Template:** 6-digit verification code with 5-minute expiry notice.
    2. **Password Reset OTP Template:** 6-digit recovery code.
    3. **Order Confirmation Template:** Full order summary, itemized table with book titles, quantities, prices, delivery estimate (3–5 days), and link to `/orders/[id]`.
    4. **Delivery OTP Template:** (Legacy delivery confirmation OTP).
- **Environment Variables Required:**
  - `RESEND_API_KEY`
  - `EMAIL_FROM` (e.g. `MD Shakib Books <orders@mdshakibbooks.com>` or verified domain)
- **Reliability & Idempotency:**
  - Every email dispatch writes to `public.email_logs` (`recipient`, `event_type`, `status`, `provider_response`).
  - Webhook retries check `email_logs` to prevent duplicate emails from being sent to customers.

---

## 3. Razorpay (Payment Gateway)

- **Existing Implementation:** Handled in `server/src/services/payment.service.js` and `server/src/controllers/payment.controller.js`.
- **Target Implementation:**
  - **Payment Intent:** Route Handler `app/api/payments/create-intent/route.ts` creates Razorpay Order with authoritative server-calculated amount in paise ($1\text{ INR} = 100\text{ paise}$).
  - **Client Checkout:** Next.js script loading `https://checkout.razorpay.com/v1/checkout.js` in Client Component; opens checkout modal with user email, name, and phone prefilled.
  - **Payment Verification:** Route Handler `app/api/payments/verify/route.ts` verifies HMAC-SHA256 signature using `crypto.timingSafeEqual`:
    $$\text{Expected Signature} = \text{HMAC-SHA256}(\text{razorpay\_order\_id} \mid \text{razorpay\_payment\_id}, \text{RAZORPAY\_KEY\_SECRET})$$
  - **Webhook Processing:** Route Handler `app/api/payments/webhook/route.ts` consumes `req.text()` (raw body) and verifies `x-razorpay-signature` against `RAZORPAY_WEBHOOK_SECRET`. Handles `payment.captured`, `payment.failed`, and `order.paid` idempotently.
- **Environment Variables Required:**
  - `RAZORPAY_KEY_ID`
  - `RAZORPAY_KEY_SECRET`
  - `RAZORPAY_WEBHOOK_SECRET`
  - `NEXT_PUBLIC_RAZORPAY_KEY_ID` (client-safe public key)

---

## 4. Delhivery (Logistics & Shipment)

- **Existing Implementation:** `server/src/services/delhivery.service.js` with hardcoded store pickup address.
- **Target Implementation:**
  - **Serviceability Check:** `app/api/delhivery/serviceability/route.ts` checks customer PIN-code availability (`cod` and `pre_paid` flags) against Delhivery API.
  - **Shipment Creation:** Executed in Admin Order management (`app/api/admin/orders/[id]/shipment/route.ts`). Generates consignment, retrieves AWB (Air Waybill) and Delhivery tracking URL. Pickup location configured from environment variables.
  - **Webhook Updates:** `app/api/delhivery/webhook/route.ts` parses shipment status (`In Transit`, `Out for Delivery`, `Delivered`). Automatically records timestamps, appends to `order_status_history`, and transitions COD payment status to `Paid` upon delivery.
  - **Tracking Proxy:** `app/api/delhivery/track/[awb]/route.ts` proxies live tracking details to client.
- **Environment Variables Required:**
  - `DELHIVERY_TOKEN`
  - `DELHIVERY_BASE_URL` (default: `https://track.delhivery.com`)
  - `DELHIVERY_PICKUP_NAME`
  - `DELHIVERY_PICKUP_ADDRESS`
  - `DELHIVERY_PICKUP_CITY`
  - `DELHIVERY_PICKUP_PINCODE`
  - `DELHIVERY_PICKUP_PHONE`

---

## 5. Realtime Notifications (Supabase Realtime)

- **Existing Implementation:** Socket.io server with unauthenticated `join_user_room` and `join_admin_room` events.
- **Target Implementation:**
  - Replaced with **Supabase Realtime**:
    1. **Customer Channel:** `orders:user_id=eq.{auth.uid()}` listening to `postgres_changes` on `public.orders`. Enforces RLS so users only receive their own updates.
    2. **Admin Channel:** `admin:orders` listening to `INSERT` and `UPDATE` on `public.orders`, guarded by admin RLS policy.
  - Broadcasts live events: `orderStatusUpdated`, `paymentUpdated`, `replacementUpdated`.

---

## 6. Complete Environment Variable Inventory

### Server-Side Only Secrets (Never exposed to client)
```ini
# Supabase
SUPABASE_SERVICE_ROLE_KEY=ey...

# Razorpay
RAZORPAY_KEY_ID=rzp_...
RAZORPAY_KEY_SECRET=...
RAZORPAY_WEBHOOK_SECRET=...

# Resend
RESEND_API_KEY=re_...
EMAIL_FROM=MD Shakib Books <orders@yourdomain.com>

# Cloudinary
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...

# Delhivery
DELHIVERY_TOKEN=...
DELHIVERY_BASE_URL=https://track.delhivery.com
DELHIVERY_PICKUP_NAME=MD Shakib Islamic Books
DELHIVERY_PICKUP_ADDRESS=Store Street Address
DELHIVERY_PICKUP_CITY=City
DELHIVERY_PICKUP_PINCODE=110001
DELHIVERY_PICKUP_PHONE=9876543210
```

### Public / Client-Safe Variables
```ini
NEXT_PUBLIC_SUPABASE_URL=https://xyzcompany.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=ey...
NEXT_PUBLIC_RAZORPAY_KEY_ID=rzp_...
NEXT_PUBLIC_SITE_URL=https://mdshakibbooks.com
```

