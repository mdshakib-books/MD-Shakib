# MD Shakib Islamic Books — Delhivery Integration & Admin Workflow Audit

**Audit Date:** 2026-11-10  
**Scope:** Strictly read-only technical audit of customer order lifecycle, admin order management, Delhivery logistics integration, tracking, AWB persistence, pickup scheduling, shipping labels, delivery OTP verification, COD remittance reconciliation, database schema/RPCs/RLS, and missing-credential behavior.  
**Target Integration Goal:** Complete a simple, reliable Delhivery One–inspired B2C Forward Order workflow within the existing Admin Dashboard without breaking existing design or commerce guarantees.

---

## 1. Executive Summary

The repository already contains a foundational Delhivery integration (`apps/web/lib/integrations/delhivery/service.ts`), customer-facing serviceability/tracking routes, admin shipment/pickup/label/COD-reconciliation UI controls on the order detail page, a separate Delivery OTP handover terminal, and a comprehensive PostgreSQL schema (`orders`, `delivery_otps`, `delivery_verifications`, `cod_collections`, `cod_remittances`, `webhook_events`).

However, tracing the end-to-end execution across UI, server actions, API routes, and SQL migrations reveals **several critical defects, broken paths, and production safety gaps** that prevent reliable live Delhivery operations:

1. **Simulated/Stubbed Production Behavior Without Fail-Closed Guards:** When `DELHIVERY_TOKEN` is missing or starts with `"mock"` (even in `NODE_ENV=production`), `createShipmentForOrder`, `checkPincodeServiceability`, `trackShipment`, `scheduleDelhiveryPickup`, and `getShippingLabel` silently fall back to synthetic mock behavior (`DLV...` AWBs, always-serviceable pincodes, fake `PKP-...` pickup IDs). Meanwhile, reverse pickup (`scheduleReturnPickup` in `apps/web/lib/commerce/returns.ts`) is hardcoded to `REV-${Date.now()}` even when `DELHIVERY_TOKEN` is configured.
2. **Dangerous Shipment Eligibility & Concurrency Bugs in `createShipmentForOrder`:**
   - The eligibility check uses `|| order.payment_method === "COD"`, which allows `Cancelled`, `Delivered`, or `Returned` COD orders to pass validation and book live shipments.
   - No row lock or in-flight lock guards `createShipmentForOrder` before calling Delhivery `/api/cmu/create.json`; double-clicks can create duplicate Delhivery consignments.
   - `cmu/create.json` response body `success` / `packages[0].status` fields are not inspected; DB update errors on `orders` are silently ignored; and `shipping_pickup_scheduled` is prematurely set to `true` before any pickup request is made.
   - Duplicate `"shipped"` emails are triggered concurrently by both `createShipmentForOrder` and `bookAdminOrderShipment`.
3. **Incomplete Delhivery B2C Forward Order Payload:** `createShipmentForOrder` omits standard Delhivery One B2C fields already modeled elsewhere in the database (such as `books.weight_grams`, `length_cm`, `width_cm`, `height_cm`, `products_desc`, `quantity`, `hsn_code`, `shipping_mode`, `seller_gst_tin`, `seller_add`, and `return_*` details) and has no pre-booking review step in the Admin UI.
4. **Order Status State-Machine vs. DB Constraint Mismatch (`Processing`):** `ORDER_STATUS_TRANSITIONS` (`lib/admin/constants.ts`), `AdminOrdersClient.tsx`, and trigger `validate_order_state_transitions()` (`20261109000001`) include `"Processing"`, and `AdminOrdersClient` offers `→ Processing` as the primary button for `"Confirmed"` orders—yet the table constraint `orders_order_status_check` (`20261028000001`) was never updated to allow `"Processing"`, causing any transition to `"Processing"` to fail at PostgreSQL `CHECK` validation.
5. **Fake-AWB Shortcut in Admin Order Listing:** In `AdminOrdersClient.tsx`, clicking `→ Shipped` on an unbooked order opens a manual override modal pre-filled with a fabricated local AWB (`DLH-${order.id.slice(0, 8)}`) instead of invoking Delhivery shipment creation.
6. **Delivery OTP vs. Delhivery Delivered Webhook Contradiction & Broken Lookup Endpoint:**
   - `DeliveryVerificationClient.tsx` queries `GET /api/admin/orders?search=...`, which **does not exist** (404).
   - `getCustomerOrderDeliveryOtp` regenerates and invalidates the active OTP on **every** customer page load/refresh.
   - `processDelhiveryWebhook` only blocks `"Delivered"` if a row already exists in `delivery_otps` (`otps.length > 0`). Because OTPs are only created lazily when a customer opens `/orders/[id]`, any order whose customer never opened the detail page bypasses OTP verification automatically when Delhivery fires `DL`. Conversely, orders that *do* have an active OTP become permanently stuck in `"Out for Delivery"` upon Delhivery `DL` unless an admin manually completes OTP verification or bypasses it via `updateAdminOrderStatus`.
7. **Split COD Reconciliation & Silent `audit_logs` RLS Failures:**
   - `AdminOrderDetailClient` calls `reconcileDelhiveryCODRemittance`, which updates `orders` directly and **never writes to `cod_remittances`**, whereas `reconcileCourierRemittance` (`lib/delivery/cod.ts`) writes to `cod_remittances` and is completely unused by the app.
   - `lib/admin/orders.ts` inserts into `audit_logs` via the user-scoped `createClient()`, which silently fails because `audit_logs` has RLS enabled with **no `INSERT` policy** for `authenticated`.
   - `orders`, `delivery_otps`, `cod_collections`, `cod_remittances`, and `return_requests` RLS policies check `public.is_admin()` (`super_admin`, `admin`) rather than `public.is_staff()`, blocking `order_manager` and `warehouse_staff` when `lib/admin/orders.ts` uses `createClient()`.

---

## 2. Existing Functionality Overview

| Capability | Current State | Entrypoint / Mechanism |
|---|---|---|
| Checkout pincode serviceability | Implemented (with fail-open fallback) | `CheckoutClient.tsx` → `GET /api/shipping/serviceability` → `checkPincodeServiceability()` |
| Server-side checkout pincode guard | Implemented (warns & continues on exception) | `placeOrderCOD()` & `placeOrderOnline()` in `lib/commerce/orders.ts` |
| Delhivery forward shipment creation | Implemented (basic payload, missing B2C fields & locks) | `AdminOrderDetailClient.tsx` → `bookAdminOrderShipment()` → `createShipmentForOrder()` |
| Manual courier/AWB override | Implemented in order list; dead modal code in order detail | `AdminOrdersClient.tsx` → `updateAdminOrderStatus()` / `PATCH /api/admin/orders/[id]/status` |
| AWB uniqueness enforcement | Enforced at DB via partial unique index | `idx_orders_shipping_awb_unique` on `orders(shipping_awb)` |
| Shipping label download | Implemented (Delhivery `packing_slip` + local HTML slip) | `AdminOrderDetailClient.tsx` → `getAdminShippingLabel()` → `getShippingLabel()`; internal `/api/documents/packing-slip/[orderId]` |
| Pickup request scheduling | Implemented (single-order UI, broken reschedule, premature flag) | `AdminOrderDetailClient.tsx` → `scheduleAdminPickup()` → `scheduleDelhiveryPickup()` |
| Live shipment tracking | Customer UI only (unauthenticated endpoint) | `OrderDetailClient.tsx` → `GET /api/shipping/track` → `trackShipment()` |
| Delhivery inbound webhook | Implemented (static header auth, partial status map, no `webhook_events`) | `POST /api/webhooks/delhivery` → `verifyDelhiveryWebhookAuth()` + `processDelhiveryWebhook()` |
| Delivery OTP handover | Implemented (HMAC-SHA256 + atomic RPC; broken UI search & refresh rotation) | Customer `DeliveryOtpCard.tsx` (`GET /api/delivery/otp`); Admin `DeliveryVerificationClient.tsx` (`POST /api/admin/delivery/verify-otp`) |
| Doorstep COD collection | Implemented (no status guard, overwrites `cod_settled_amount`) | `DeliveryVerificationClient.tsx` → `POST /api/admin/delivery/cod-collect` → `recordDoorstepCodCollection()` |
| COD remittance reconciliation | Split across two disconnected paths | Admin UI uses `reconcileDelhiveryCODRemittance()` (skips `cod_remittances`); `reconcileCourierRemittance()` is unused |
| Return reverse pickup | Stubbed (`REV-...` timestamp string even in production) | `AdminReturnsClient.tsx` → `POST /api/admin/returns/pickup` → `scheduleReturnPickup()` |

---

## 3. Existing Admin Workflow (Routes, Components & Server Actions)

### 3.1 Admin Navigation & Access Control
- **Sidebar / Nav:** `apps/web/app/admin/AdminNavClient.tsx` exposes:
  - Dashboard (`/admin`)
  - Orders (`/admin/orders`)
  - Delivery OTP (`/admin/delivery-verification`)
  - Returns (`/admin/returns`)
  - Reports (`/admin/reports`)
  - Books, Inventory, Categories, Customers, Reviews, Discounts, Audit Logs, Profile & Settings
- **Layout Guard:** `apps/web/app/admin/layout.tsx` enforces `requireAdmin()` (`apps/web/lib/admin/auth.ts`), which permits any non-blocked, non-deleted user with `isStaffRole(profile.role)` (`super_admin`, `admin`, `order_manager`, `warehouse_staff`, `support_staff`).
- **Edge Middleware:** `apps/web/middleware.ts` redirects unauthenticated requests to `/admin*` to `/login?redirect=...`.

### 3.2 Admin Order Listing (`/admin/orders`)
- **Server Page:** `apps/web/app/admin/orders/page.tsx` reads `status`, `paymentStatus`, `paymentMethod`, `search`, `page` query params and calls `getAdminOrders()` (`apps/web/lib/admin/orders.ts`).
- **Client Component:** `apps/web/app/admin/orders/AdminOrdersClient.tsx`:
  - Renders filter bar for search text, `order_status` (includes `"Processing"`), and `payment_status` (note: `paymentMethodFilter` state exists but no `<select>` control is rendered for it).
  - **Pagination/Search Defect:** `getAdminOrders()` applies SQL `.range(offset, offset + limit - 1)` **before** applying `params.search` in JS memory (`formatted.filter(...)`), so search only filters the current 20-order page rather than all matching orders.
  - Displays Order Number/UUID, Date, Customer, Total & Item Count, Payment Badge + Method, Order Status Badge + `shipping_awb`, and Lifecycle Actions:
    - Primary button `→ <primaryNext>` using `ORDER_STATUS_TRANSITIONS[order.order_status].find(s => s !== "Cancelled")`.
    - When `primaryNext === "Shipped"` and `!order.shipping_awb`, clicking it opens a **"Fulfill & Ship Order"** modal pre-filled with a synthetic AWB `DLH-${order.id.slice(0, 8).toUpperCase()}` and calls `updateAdminOrderStatus()` directly—bypassing Delhivery shipment booking entirely.
    - `Cancel` button opens cancellation modal calling `cancelAdminOrder()`.
    - `Inspect` link navigates to `/admin/orders/[id]`.

### 3.3 Admin Order Details (`/admin/orders/[id]`)
- **Server Page:** `apps/web/app/admin/orders/[id]/page.tsx` resolves UUID or `order_number` (e.g., `MDS-100001`) via `getAdminOrderById()`.
- **Client Component:** `apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx`:
  - **Top Action Bar:**
    - `Book Delhivery Shipment` (shown when `canShip && !order.shipping_awb`): calls `bookAdminOrderShipment(order.id)`.
    - `Advance to <status>` buttons for `allowedTransitions.filter(s => !["Cancelled", "Shipped"].includes(s))`.
    - `Reconcile COD Remittance` (shown when `payment_method === "COD" && order_status === "Delivered" && cod_settlement_status !== "reconciled"`): opens modal calling `reconcileAdminCODSettlement()`.
    - Document links: `Invoice` (`/api/documents/invoice/[orderId]`), `Packing Slip` (`/api/documents/packing-slip/[orderId]`), `Receipt` (`/api/documents/receipt/[orderId]`).
    - `Cancel Order` (when `canCancel` is true): opens modal calling `cancelAdminOrder()`.
    - *(Dead code)* `shipModalOpen` and `handleConfirmManualShipment` exist in `AdminOrderDetailClient.tsx` (lines 32–34, 194–224) with no JSX modal or trigger button.
  - **Overview Cards:** Customer Information, Delivery Address (`address_snapshot`), Payment & Settlement (shows `cod_settlement_status`, `cod_settlement_ref`, `cod_settled_amount`, Razorpay IDs).
  - **Delhivery Shipping & Logistics Panel:** Displays `shipping_courier`, `shipping_awb`, `shipping_pickup_scheduled_at`, and `delivered_at`. When `shipping_awb` exists, renders:
    - `Download Label` → `getAdminShippingLabel(order.shipping_awb)` → `window.open(res.labelUrl, "_blank")`.
    - `Schedule Pickup` / `Reschedule Pickup` → opens modal (`pickupDate`, `pickupTime` in `10:00:00` / `14:00:00` / `18:00:00`, `expectedPackageCount` defaulting to `order.items.length`) → `scheduleAdminPickup()`.
  - **Line Items & Status Audit Trail:** Displays `order_items` and `order_status_history`. Does **not** display live Delhivery tracking scans, pincode serviceability, or book weight/dimensions.

### 3.4 Admin Delivery Verification (`/admin/delivery-verification`)
- **Server Page:** `apps/web/app/admin/delivery-verification/page.tsx` guarded by `requireStaffPermission("orders.ship")`.
- **Client Component:** `apps/web/app/admin/delivery-verification/DeliveryVerificationClient.tsx`:
  - **Broken Lookup:** Form submits `fetch('/api/admin/orders?search=...&limit=1')`. No `/api/admin/orders/route.ts` exists in `apps/web/app/api/admin/orders/`, so all lookups fail with HTTP 404.
  - **Panel 1 (Delivery OTP Handover):** Submits 6-digit OTP to `POST /api/admin/delivery/verify-otp`.
  - **Panel 2 (Doorstep Cash Collection for COD):** Submits amount & pouch ref to `POST /api/admin/delivery/cod-collect`.

### 3.5 Admin Returns & Reports
- `/admin/returns` (`AdminReturnsPage` / `AdminReturnsClient.tsx`): Allows approving/rejecting return claims (`POST /api/admin/returns/review`), scheduling reverse pickup (`POST /api/admin/returns/pickup`), and issuing refunds (`POST /api/admin/returns/refund`).
- `/admin/reports` (`AdminReportsClient.tsx` / `lib/admin/reports.ts`): Displays `get_sales_report`, `get_payment_report`, and `get_inventory_report` RPC outputs, including Delhivery COD reconciliation summaries.
- `/api/admin/orders/export` (`exportOrdersToCsv` in `lib/admin/reports.ts`): Exports CSV including `shipping_courier` and `shipping_awb`.

---

## 4. Current Customer Order Lifecycle

### 4.1 Order Creation & Payment
1. **Checkout (`apps/web/app/checkout/CheckoutClient.tsx`):**
   - When customer selects an address, client calls `GET /api/shipping/serviceability?pincode=<pincode>`. If `!svc.cod`, UI auto-switches `paymentMethod` to `"ONLINE"` and disables the COD radio button. Note: Even when `svc.serviceable === false`, the UI shows `"Limited courier coverage for this pincode"` but does **not** disable the `"Confirm Order"` button.
   - Customer must check statutory Terms/Shipping/Returns consent (`termsAccepted`) and submits with a client-generated `idempotencyKey`.
2. **COD Order (`placeOrderCOD` in `lib/commerce/orders.ts`):**
   - Verifies consent, auth, rate limit (`checkout` tier: 15/60s), idempotency key, and address ownership.
   - Runs server-side `checkPincodeServiceability(address.pincode)` and rejects if `!pinCheck.serviceable || !pinCheck.cod` (ignores exceptions via `try/catch` + `console.warn`).
   - Calls `create_order_atomic` RPC: locks books in deterministic `book_id` order, computes server-authoritative pricing (`subtotal + ₹10 platform_fee + ₹35 delivery_fee - coupon_discount`), decrements `books.stock`, creates `inventory_reservations` (`status = 'reserved'`, `expires_at = NULL`), marks coupon `'consumed'`, inserts `orders` (`order_status = 'Pending'`, `payment_status = 'Pending'`, `order_number = 'MDS-...'`), snapshots `order_items`, and clears cart.
   - Calls `record_order_consent_atomic` RPC and fires `sendOrderEmails(..., "order_confirmation")` + `sendAdminNewOrderNotification`.
   - **Important:** A newly placed COD order starts and stays in `order_status = 'Pending'` until an admin manually confirms it.
3. **Online Order (`placeOrderOnline` in `lib/commerce/orders.ts`):**
   - Server-side `checkPincodeServiceability(address.pincode)` rejects if `!pinCheck.serviceable || !pinCheck.prepaid` (again ignoring exceptions).
   - Calls `create_order_atomic` with `payment_method = 'ONLINE'` (`inventory_reservations.expires_at = NOW() + 15 minutes`, `coupon_status = 'reserved'`).
   - Calls `createRazorpayOrder(orderId, user.id)` → inserts `payments` (`status = 'Pending'`) and updates `orders.razorpay_order_id`.
   - **Payment Settlement (`POST /api/payments/verify` or `POST /api/webhooks/razorpay`):**
     - Both verify Razorpay HMAC-SHA256 signatures and invoke `settle_payment_atomic` RPC.
     - `settle_payment_atomic` transitions `orders` from `'Pending'` → `'Confirmed'`, sets `payment_status = 'Paid'`, `is_paid = true`, `paid_at`, commits `inventory_reservations` (`'committed'`), consumes coupon, and inserts `'Confirmed'` into `order_status_history`.
     - If unpaid after 15 minutes, `release_expired_reservations_atomic` (`lib/commerce/orders.ts` `releaseExpiredReservations`) restores stock, expires reservations, releases coupons, and cancels order with `cancel_reason = 'Payment reservation expired'`. (Late payment webhooks can recover such expired cancellations back to `'Confirmed'` if stock remains available.)

### 4.2 Permitted Statuses & State Machine Discrepancies

| Layer | Statuses / Transitions Defined | Discrepancies Found |
|---|---|---|
| **DB Column Constraint** (`orders_order_status_check` in `20261028000001`) | `'Pending'`, `'Confirmed'`, `'Packed'`, `'Shipped'`, `'Out for Delivery'`, `'Delivered'`, `'Cancelled'`, `'Replacement Requested'`, `'Replacement Approved'`, `'Replacement Rejected'`, `'Replacement Shipped'`, `'Replacement Delivered'`, `'Returned'` | **Missing `'Processing'`**! |
| **DB Trigger** (`validate_order_state_transitions` in `20261109000001`) | `Pending -> Confirmed, Cancelled`<br>`Confirmed -> Processing, Packed, Shipped, Cancelled`<br>`Processing -> Packed, Shipped, Cancelled`<br>`Packed -> Shipped, Cancelled`<br>`Shipped -> Out for Delivery, Delivered, Cancelled, Returned`<br>`Out for Delivery -> Delivered, Cancelled, Returned`<br>`Delivered -> Replacement Requested`<br>`Cancelled -> Confirmed` (expired-reservation recovery only)<br>`Returned ->` *(terminal)* | Allows `'Processing'`, which the table `CHECK` constraint rejects. Also `20261109000001` replaced `20261107000001` and accidentally **dropped** the DB-level trigger guards forbidding unpaid `ONLINE` orders from entering `Confirmed` and forbidding `refund_amount > total_amount`. |
| **App Constants** (`ORDER_STATUS_TRANSITIONS` in `lib/admin/constants.ts`) | Matches `20261109000001` trigger (`Confirmed` lists `["Processing", "Packed", "Shipped", "Cancelled"]`) | Because `"Processing"` is first in `Confirmed`'s array, `AdminOrdersClient` renders `→ Processing` as the primary action, which crashes at DB `CHECK` constraint. |
| **Delhivery Webhook** (`isAllowedStatusTransition` in `delhivery/service.ts`) | `Pending, Confirmed, Packed -> Shipped, Returned`<br>`Shipped -> Out for Delivery, Delivered, Returned`<br>`Out for Delivery -> Delivered, Returned` | **Missing `"Processing"`** as a source state! Also does not allow `Shipped -> Cancelled` or `Replacement Shipped -> Replacement Delivered`. |

### 4.3 Customer Tracking, Cancellation & Returns
- **Order Views:** `/orders` (`account/orders` re-exports `/orders`) and `/orders/[id]` (`account/orders/[id]` re-exports `/orders/[id]`).
- **Cancellation (`cancelOrder` → `cancel_order_atomic`):** Customers can cancel only before dispatch (`Pending`, `Confirmed`, `Processing`, `Packed`). `cancel_order_atomic` explicitly forbids customer cancellation in `'Shipped'` or `'Out for Delivery'` (`20261109000002`). For pre-dispatch cancellations, stock is restored and reservations released; for post-dispatch admin cancellations (`Shipped`/`Out for Delivery`), `20261109000002` explicitly **does NOT restore shelf stock** (because items are with courier). Note: Paid cancellations via `cancelOrder` (customer) set `payment_status = 'Refund Pending'` but do **not** call `initiateRazorpayRefund()` automatically (unlike `cancelAdminOrder()`).
- **Tracking UI:** `OrderDetailClient.tsx` displays a 7-step progress bar (`Pending` through `Delivered`), mounts `<DeliveryOtpCard>` when `order_status === "Out for Delivery"`, and fetches `GET /api/shipping/track?awb=...` when `order.shipping_awb` is set.
- **Returns:** Within 7 days of `delivered_at` / `shipping_delivered_at`, customers can request a return (`POST /api/returns/create`). Direct replacements are deprecated/blocked (D-1 remediation); all claims are forced to `request_type = 'return_refund'`.

---

## 5. Current Shipment Lifecycle

### 5.1 Forward Shipment Booking (`createShipmentForOrder`)
1. Admin opens `/admin/orders/[id]` and clicks **Book Delhivery Shipment** (`bookAdminOrderShipment` → `createShipmentForOrder`).
2. **Idempotency check:** If `order.shipping_awb` is already populated, returns existing AWB with `alreadyBooked: true`. *(Race condition: read-then-call-API without row lock).*
3. **Eligibility check (`service.ts:146-156`):**
   ```ts
   const isEligible =
     order.order_status === "Confirmed" ||
     order.order_status === "Packed" ||
     order.payment_status === "Paid" ||
     order.payment_method === "COD";
   ```
   *(Defect: `|| order.payment_method === "COD"` makes `Cancelled`, `Delivered`, `Returned`, and `Pending` COD orders eligible!)*
4. **Provider Call (`!config.isConfigured` vs live):**
   - If not configured: generates `DLV${order.id.replace(/-/g, "").slice(0, 11).toUpperCase()}`.
   - If configured: sends `POST ${apiUrl}/api/cmu/create.json` (`x-www-form-urlencoded`: `format=json`, `data={ shipments: [...], pickup_location: { name } }`) and reads `resData?.packages?.[0]?.waybill || pkg?.upload_wbn`.
5. **Persistence:** Updates `orders` with `shipping_awb`, `shipping_tracking_url`, `shipping_courier: "Delhivery"`, `shipping_shipped_at`, `shipping_pickup_scheduled: true`, `order_status: "Shipped"`. *(Defect: DB `.update()` error is not checked; `shipping_pickup_scheduled` is falsely set `true` before pickup is scheduled).*
6. **Notifications & Audit:** Both `createShipmentForOrder` and `bookAdminOrderShipment` call `sendShipmentNotification(orderId, "shipped")`; `bookAdminOrderShipment` attempts `audit_logs` insert via `createClient()` (silently fails RLS).

### 5.2 Pickup Request (`scheduleDelhiveryPickup`)
- Triggered from `AdminOrderDetailClient.tsx` ("Schedule Pickup" / "Reschedule Pickup" modal).
- Checks `order.shipping_awb` exists; if `order.shipping_pickup_request_id` already exists, returns immediately **without calling Delhivery** (breaking the "Reschedule Pickup" action).
- Live call: `POST ${apiUrl}/fm/request/new/` with `{ pickup_location, expected_package_count, pickup_date, pickup_time }`.
- Persists `shipping_pickup_request_id`, `shipping_pickup_scheduled: true`, `shipping_pickup_scheduled_at`.

### 5.3 Label Download & Packing Slip
- **Delhivery Label:** `getAdminShippingLabel(awb)` → `getShippingLabel(awb)` calls `GET ${apiUrl}/api/p/packing_slip?wbns=${cleanAwb}&pdf=true` and extracts `pdf_download_link || label_url` (falling back to `https://track.delhivery.com/p/${cleanAwb}`). `orders.shipping_label_url` is never populated. `getAdminShippingLabel` masks `result.success === false` errors.
- **Internal Packing Slip:** `GET /api/documents/packing-slip/[orderId]` renders an HTML warehouse slip with item SKUs and monospace AWB text (no barcode image).

### 5.4 Tracking & Webhook Updates
- **Pull Tracking:** `GET /api/shipping/track?awb=...` → `trackShipment(awb)` calls `GET ${apiUrl}/api/v1/packages/json/?waybill=${cleanAwb}` and normalizes scans.
- **Push Webhook:** `POST /api/webhooks/delhivery` authenticates shared secret (`verifyDelhiveryWebhookAuth`) and runs `processDelhiveryWebhook(payload)`:
  - Extracts `waybill` (`payload?.waybill || payload?.awb || payload?.Shipment?.AWB`) and `rawStatus` (`payload?.status || payload?.Shipment?.Status?.Status`).
  - Maps `DL`/`DELIVERED` → `Delivered`, `UD`/`OUT FOR DELIVERY` → `Out for Delivery`, `IT`/`IN TRANSIT` → `Shipped`, `RT`/`RTO`/`RETURNED` → `Returned`.
  - Validates transition via `isAllowedStatusTransition()`.
  - If `internalStatus === "Delivered"` and `delivery_otps` has unverified rows for `order.id`, writes only `shipping_delivered_at` and returns `otp_verification_required`. Otherwise sets `order_status`, `delivered_at`, `shipping_delivered_at`, and `cod_settlement_status = "pending"` (for unpaid COD), then fires `sendShipmentNotification`.

### 5.5 Delivery OTP & Doorstep Verification
- `getCustomerOrderDeliveryOtp(orderId, userId)` reveals a 6-digit OTP **only when `order_status === "Out for Delivery"`**, storing HMAC-SHA256 hash in `delivery_otps` via `regenerate_delivery_otp_atomic` (max 5 attempts, 24h expiry).
- Staff verifies OTP via `POST /api/admin/delivery/verify-otp` → `verifyDeliveryOtp()` → `verify_delivery_otp_atomic` RPC (permits `Out for Delivery` or `Shipped`), which marks OTP `'verified'`, transitions order to `'Delivered'`, sets `delivered_at`/`shipping_delivered_at`/`cod_settlement_status = 'pending'`, and logs an immutable row in `delivery_verifications`.

### 5.6 COD Collection & Remittance Reconciliation
- **Doorstep Collection (optional):** `POST /api/admin/delivery/cod-collect` → `recordDoorstepCodCollection()` inserts into `cod_collections` and sets `orders.cod_settled_amount`.
- **Remittance Reconciliation (Admin UI):** `AdminOrderDetailClient` → `reconcileAdminCODSettlement()` → `reconcileDelhiveryCODRemittance()`:
  - Requires `payment_method === "COD"` and `order_status === "Delivered"`.
  - Exact match (`|remitted - total_amount| <= 0.01`): sets `cod_settlement_status = "reconciled"`, `cod_settlement_ref`, `cod_settled_amount`, `cod_settled_at`, `payment_status = "Paid"`, `is_paid = true`, `paid_at`.
  - Mismatch: sets `cod_settlement_status = "disputed"` and keeps `payment_status = "Pending"`.
  - *(Note: `reconcileCourierRemittance()` in `lib/delivery/cod.ts` writes to `cod_remittances`, checks duplicate `remittance_ref`, and computes `difference_amount`, but is never called outside test scripts.)*

---

## 6. Database Schema, Migrations, RPCs & RLS Policies

### 6.1 Key Tables & Columns

| Table | Key Logistics / Order / Settlement Columns | Constraints & Indexes |
|---|---|---|
| `public.orders` | `id`, `order_number` (`NOT NULL UNIQUE`, `MDS-100001+`), `user_id`, `total_amount`, `subtotal`, `platform_fee`, `delivery_fee`, `discount_amount`, `coupon_code`, `coupon_status`, `payment_method` (`COD`/`ONLINE`), `payment_status` (`Pending`/`Paid`/`Failed`/`Refund Pending`/`Refunded`), `order_status`, `is_paid`, `paid_at`, `delivered_at`, `cancel_reason`, `razorpay_order_id`, `razorpay_payment_id`, `razorpay_refund_id`, `refund_amount`, `refund_status`, `refunded_at`, `shipping_courier` (default `'Delhivery'`), `shipping_awb`, `shipping_tracking_url`, `shipping_pickup_scheduled` (bool), `shipping_pickup_request_id`, `shipping_pickup_scheduled_at`, `shipping_label_url`, `shipping_shipped_at`, `shipping_delivered_at`, `cod_settlement_status` (`unsettled`/`pending`/`remitted`/`reconciled`/`disputed`), `cod_settlement_ref`, `cod_settled_amount`, `cod_settled_at`, `address_snapshot` (JSONB), `idempotency_key`, `request_fingerprint`, `consent_record` | `orders_order_status_check` (**excludes `'Processing'`**); `idx_orders_shipping_awb_unique` (`UNIQUE WHERE shipping_awb IS NOT NULL`); `idx_orders_shipping_awb`; `idx_orders_user_idempotency_key`; `idx_orders_order_number` |
| `public.order_items` | `id`, `order_id`, `book_id`, `title`, `price`, `quantity`, `image_url` | `idx_order_items_order_id` |
| `public.order_status_history` | `id`, `order_id`, `status`, `note`, `created_at` | `idx_order_status_history_order_id` |
| `public.books` | `id`, `title`, `price`, `stock`, `sku` (UNIQUE), `isbn_10`, `isbn_13`, `weight_grams`, `length_cm`, `width_cm`, `height_cm` | `weight_grams > 0`, dimensions `> 0` (`20261109000006`) |
| `public.addresses` | `id`, `user_id`, `full_name`, `phone` (len >= 10), `pincode` (len = 6), `state`, `city`, `house_no`, `area`, `landmark`, `address_type` (`Home`/`Office`/`Other`), `is_default` | `idx_addresses_user_id`, `trg_default_address` |
| `public.delivery_otps` | `id`, `order_id`, `otp_hash`, `status` (`active`/`verified`/`expired`/`invalidated`), `attempts`, `max_attempts` (5), `expires_at`, `verified_at`, `verified_by` | `idx_delivery_otps_active_order` (`UNIQUE (order_id) WHERE status = 'active'`) |
| `public.delivery_verifications` | `id`, `order_id` (`ON DELETE RESTRICT` per `20261110000001`), `delivery_otp_id`, `actor_id`, `actor_role`, `outcome` (`SUCCESS`, `FAILED_*`), `failure_reason`, `shipment_awb`, `metadata`, `attempted_at` | `idx_delivery_verifications_order` |
| `public.cod_collections` | `id`, `order_id`, `expected_amount`, `collected_amount`, `collector_id`, `collection_status` (`collected`/`shortfall`/`excess`/`refused`), `collection_reference`, `notes`, `collected_at` | `idx_cod_collections_order` |
| `public.cod_remittances` | `id`, `remittance_ref` (UNIQUE), `courier`, `order_id`, `expected_amount`, `remitted_amount`, `difference_amount`, `reconciliation_status` (`matched`/`disputed`/`unmatched`/`duplicate`), `remitted_at`, `reconciled_by`, `reconciled_at`, `notes` | `idx_cod_remittances_order` |
| `public.return_requests` & `return_request_items` | `return_number` (UNIQUE), `order_id`, `customer_id`, `request_type` (`return_refund`/`replacement`), `status`, `pickup_awb`, `pickup_status`, `pickup_address`, `refund_amount`, `evidence_urls` | `idx_return_requests_order`, `idx_return_requests_customer` |
| `public.webhook_events` | `id`, `event_id` (UNIQUE), `provider` (`'Razorpay'` / `'Delhivery'`), `event_type`, `status` (`processing`/`completed`/`failed`), `payload` | `idx_webhook_events_provider_type`, `idx_webhook_events_id_status` |
| `public.audit_logs` | `id`, `user_id`, `action`, `model_name`, `model_id`, `changes`, `old_values`, `new_values`, `created_at` | `audit_logs_action_check` dropped in `20261031000002` |

### 6.2 Relevant Triggers & Stored Procedures (RPCs)
- **Triggers on `public.orders`:**
  - `trg_set_order_number` (`BEFORE INSERT`): assigns `'MDS-' || nextval('order_number_seq')` (`20261109000001`).
  - `trg_validate_order_state_transitions` (`BEFORE UPDATE`): enforces status/payment transitions (`20261109000001` latest).
  - `trg_order_status_history` (`AFTER INSERT OR UPDATE`): inserts row into `order_status_history` on insert or `order_status` change (`20261101000001`).
  - `trg_orders_updated_at` (`BEFORE UPDATE`): sets `updated_at = NOW()`.
- **Key RPCs (`SECURITY DEFINER`):**
  - `create_order_atomic`, `cancel_order_atomic`, `settle_payment_atomic`, `record_payment_failure_atomic`, `record_refund_atomic`, `release_expired_reservations_atomic`
  - `regenerate_delivery_otp_atomic(p_order_id, p_new_hash, p_expires_at)`
  - `verify_delivery_otp_atomic(p_order_id, p_candidate_hash, p_actor_id, p_actor_role, p_awb)`
  - `get_admin_dashboard_metrics`, `get_sales_report`, `get_payment_report`, `get_inventory_report`
  - `generate_order_invoice_atomic`, `initiate_return_refund_atomic`
  - `is_admin()` (`role IN ('super_admin', 'admin')`), `is_staff()` (`role IN ('super_admin', 'admin', 'order_manager', 'warehouse_staff', 'support_staff')`)

### 6.3 RLS Policies & Staff Role Gaps
- **`orders` (`20261028000003`, `20261107000001`):**
  - `SELECT`: `user_id = auth.uid() OR public.is_admin()`
  - `INSERT` / `UPDATE`: `public.is_admin()`
  - **Gap:** Non-admin staff roles (`order_manager`, `warehouse_staff`, `support_staff`) fail `is_admin()`, breaking `getAdminOrders()`, `getAdminOrderById()`, and `updateAdminOrderStatus()`, all of which use `createClient()`.
- **`audit_logs` (`20261028000003`):**
  - Only `audit_logs_select_admin` (`FOR SELECT USING (public.is_admin())`) exists. **No `INSERT` policy exists for `authenticated`**, causing `supabase.from("audit_logs").insert(...)` in `lib/admin/orders.ts` to fail silently.
- **`delivery_otps`, `delivery_verifications`, `cod_collections`, `cod_remittances`, `return_requests`, `webhook_events` (`20261109000006`, `20261107000001`):**
  - Admin policies all use `public.is_admin()` instead of `public.is_staff()` (worked around in API routes only because those routes use `createAdminClient()`).
  - `delivery_otps_owner_read` allows order owner `SELECT` when `order_status = 'Out for Delivery'`.

---

## 7. API Endpoints & Provider Operations

### 7.1 Internal Next.js API Routes (Shipping / Orders / Delivery)

| Route | Auth / Rate Limit | Operation & Provider Call |
|---|---|---|
| `GET /api/shipping/serviceability?pincode=` | Public; rate-limited (`api`: 30/60s per IP) | Calls `checkPincodeServiceability()` |
| `GET /api/shipping/track?awb=` | **Unauthenticated**; rate-limited (`api`: 30/60s per IP) | Calls `trackShipment()` |
| `POST /api/webhooks/delhivery` | Shared-secret header (`DELHIVERY_WEBHOOK_SECRET`); **no rate limit** | Calls `verifyDelhiveryWebhookAuth()` + `processDelhiveryWebhook()` |
| `PATCH /api/admin/orders/[id]/status` | `verifyAdminApi()` (any staff role, ignores granular perms) | Calls `updateAdminOrderStatus()` |
| `GET /api/admin/orders/export` | `orders.export` permission | Calls `exportOrdersToCsv()` |
| `GET /api/admin/orders` | **MISSING ROUTE** | Referenced by `DeliveryVerificationClient.tsx:43` (404) |
| `GET /api/delivery/otp?orderId=` | Authenticated owner (`getAuthenticatedUser()`) | Calls `getCustomerOrderDeliveryOtp()` |
| `POST /api/admin/delivery/verify-otp` | `verifyAdminApi()` + `orders.ship` or `orders.manage` | Calls `verifyDeliveryOtp()` |
| `POST /api/admin/delivery/cod-collect` | `verifyAdminApi()` + `orders.settle_cod` or `orders.manage` | Calls `recordDoorstepCodCollection()` |
| `POST /api/admin/returns/pickup` | `verifyAdminApi()` + `orders.ship` or `orders.manage` | Calls `scheduleReturnPickup()` (stubbed) |
| `GET /api/documents/packing-slip/[orderId]` | Authenticated staff (`isStaffRole`) | Calls `getOrderPackingSlip()` |
| `GET /api/health` | Public | Reports `delhivery: Boolean(process.env.DELHIVERY_TOKEN)` |

### 7.2 Delhivery Provider Endpoints Called

| Feature | Method & Delhivery Endpoint | Request Format | Response Fields Parsed |
|---|---|---|---|
| Pincode Serviceability | `GET ${apiUrl}/c/api/pin-codes/json/?filter_codes=${pincode}` | `Authorization: Token ${token}` | `delivery_codes[0].postal_code` (`is_serviceable`, `pre_paid`, `cod`, `city`, `state_code`) |
| Consignment Manifest / Booking | `POST ${apiUrl}/api/cmu/create.json` | Form-urlencoded: `format=json`, `data={ shipments: [...], pickup_location: { name } }` | `packages[0].waybill \|\| packages[0].upload_wbn` |
| Shipment Tracking | `GET ${apiUrl}/api/v1/packages/json/?waybill=${awb}` | `Authorization: Token ${token}` | `ShipmentData[0].Shipment \|\| packages[0]` (`Status.Status`, `Scans`, `PickUpLocation`, `DeliveryLocation`) |
| Pickup Request | `POST ${apiUrl}/fm/request/new/` | JSON: `{ pickup_location, expected_package_count, pickup_date, pickup_time }` | `pr_id \|\| pickup_id \|\| request_id` |
| Shipping Label / Packing Slip | `GET ${apiUrl}/api/p/packing_slip?wbns=${awb}&pdf=true` | `Authorization: Token ${token}` | `packages_found[0] \|\| packages[0]` (`pdf_download_link \|\| label_url`) |
| Reverse Pickup | **Not implemented** | N/A | Hardcoded `REV-${Date.now()}` in `lib/commerce/returns.ts` |
| Bulk Waybill Fetch / Edit / Cancel | **Not implemented** | N/A | N/A |

---

## 8. Implementation Status Matrix

### Implemented
- Pincode format validation + Delhivery serviceability API query (`checkPincodeServiceability`).
- Checkout UI live serviceability indicator + automatic disabling of COD radio when `cod === false`.
- Basic forward consignment creation via `/api/cmu/create.json` (`createShipmentForOrder`, `bookAdminOrderShipment`).
- Unique AWB constraint at PostgreSQL layer (`idx_orders_shipping_awb_unique`).
- Pickup request creation via `/fm/request/new/` (`scheduleDelhiveryPickup`, `scheduleAdminPickup`).
- Label URL fetch via `/api/p/packing_slip` (`getShippingLabel`, `getAdminShippingLabel`) + internal HTML packing slip (`/api/documents/packing-slip/[orderId]`).
- Normalized shipment tracking (`trackShipment`, `/api/shipping/track`) + customer tracking timeline UI.
- Inbound Delhivery webhook endpoint with timing-safe shared secret check (`POST /api/webhooks/delhivery`).
- Cryptographic HMAC-SHA256 Delivery OTP generation, customer reveal (`Out for Delivery`), atomic verification RPC (`verify_delivery_otp_atomic`), and `ON DELETE RESTRICT` verification audit table (`delivery_verifications`).
- Doorstep COD collection logging (`cod_collections`, `recordDoorstepCodCollection`) and admin order-detail COD remittance reconciliation (`reconcileDelhiveryCODRemittance`).

### Partially Implemented
- **Admin Order Status State Machine:** `"Processing"` is present in UI, constants, and trigger, but missing from `orders_order_status_check` and Delhivery `isAllowedStatusTransition()`.
- **Delivery Verification Terminal (`/admin/delivery-verification`):** Verification and COD endpoints work, but order search fails 404 because `/api/admin/orders` route does not exist.
- **Delivery OTP Enforcement vs. Courier Webhook:** D-2 gate in `processDelhiveryWebhook` is bypassed whenever `delivery_otps` has 0 rows (customer never viewed `/orders/[id]`), and causes orders to hang when an OTP row *does* exist.
- **COD Remittance Ledger:** `cod_remittances` table and `reconcileCourierRemittance()` exist and work in tests, but Admin UI calls `reconcileDelhiveryCODRemittance()` which skips `cod_remittances`.
- **Role-Based Staff Permissions (RBAC):** `permissions.ts` defines granular permissions (`orders.ship`, `orders.settle_cod`, `orders.manage`, `orders.cancel`), but `lib/admin/orders.ts` only checks `requireAdmin()` and fails RLS for non-admin staff roles.
- **Webhook Idempotency & Audit:** `webhook_events` table explicitly permits `provider = 'Delhivery'`, but only Razorpay writes to it; `lib/admin/orders.ts` writes to `audit_logs` via RLS-blocked `createClient()`.
- **Book Physical Dimensions:** `books` table & `lib/admin/books.ts` / `catalog-io.ts` support `weight_grams`, `length_cm`, `width_cm`, `height_cm`, but Admin Books UI doesn't expose inputs for them and `createShipmentForOrder` ignores them.

### Missing
- **Delhivery One–style Pre-Booking Form / Modal in Admin:** Weight/dimension calculation or override, shipping mode (`Surface`/`Express`), item summary/HSN, pickup warehouse selection, seller/return details, and pincode/address pre-check before calling `/api/cmu/create.json`.
- **Delhivery Response Validation & Error Surfacing:** Checking `resData.success` and `packages[0].status === "Success"` / `remarks` from `/api/cmu/create.json` instead of relying solely on HTTP 200 and `waybill` presence.
- **Fail-Closed Credential Guard in Production:** Preventing mock AWBs/serviceability/pickups when `NODE_ENV === "production"` and Delhivery credentials are absent or mocked.
- **Row Locking / Concurrency Lock on Shipment Booking:** Preventing duplicate Delhivery manifests on concurrent admin clicks.
- **Shipment Cancellation / Edit Sync (`/api/p/edit`):** Cancelling a booked Delhivery waybill when an admin cancels a `Shipped` order before courier pickup.
- **Reschedule Pickup / Warehouse Batch Pickup:** `scheduleDelhiveryPickup` blocks repeat calls when `shipping_pickup_request_id` is already set.
- **Real Reverse Pickup API Integration:** `scheduleReturnPickup()` does not call Delhivery `/api/cmu/create.json` (`payment_mode: "Pickup"`).
- **Admin Order Detail Live Tracking Timeline & Error-propagating Label Download** (plus persisting/using `orders.shipping_label_url`).
- **Delhivery Bulk Waybill Prefetch** (optional `/waybill/api/bulk/json/` if pre-assigning waybills prior to manifest).

---

## 9. Missing-Credential & Mock-Mode Behavior

### 9.1 Environment Variables Referenced
| Variable | File(s) | Default / Fallback |
|---|---|---|
| `DELHIVERY_TOKEN` | `lib/integrations/config.ts`, `app/api/health/route.ts` | `""` (`isConfigured = Boolean(token && !token.startsWith("mock"))`) |
| `DELHIVERY_API_URL` | `lib/integrations/config.ts` | `"https://track.delhivery.com"` |
| `DELHIVERY_WEBHOOK_SECRET` | `lib/integrations/config.ts`, `lib/integrations/delhivery/service.ts` | `""` (not checked in `isConfigured`) |
| `DELHIVERY_PICKUP_LOCATION` | `lib/integrations/delhivery/service.ts` | `"Primary Warehouse"` |
| `DELHIVERY_CLIENT_NAME` | `apps/web/.env.example` only | **Unused anywhere in code** |
| `DELIVERY_OTP_HMAC_SECRET` | `lib/delivery/otp.ts`, `lib/auth/phone.ts` | **Hardcoded fallback string** (not in `.env.example`) |

### 9.2 Exact Runtime Behavior When `DELHIVERY_TOKEN` Is Missing or `mock*`
When `config.isConfigured === false` (`!DELHIVERY_TOKEN || DELHIVERY_TOKEN.startsWith("mock")`), **regardless of `NODE_ENV`**:
1. `checkPincodeServiceability(pincode)` simulates responses locally (`*000` / `999999` → unserviceable; `110001` → prepaid only; all other 6-digit pincodes → serviceable + COD, Delhi).
2. `createShipmentForOrder(orderId)` **still executes**, generates deterministic fake AWB `DLV${order.id.replace(/-/g, "").slice(0, 11).toUpperCase()}`, sets `order_status = "Shipped"`, sets `shipping_pickup_scheduled = true`, and emails the customer a broken `https://track.delhivery.com/p/DLV...` link.
3. `trackShipment(awb)` synthesizes fake tracking scans from `order.order_status`.
4. `scheduleDelhiveryPickup(orderId)` generates fake `PKP-...` ID and updates `orders.shipping_pickup_request_id` and `shipping_pickup_scheduled_at`.
5. `getShippingLabel(awb)` returns mock HTML (`htmlContent`) and a synthetic URL `https://track.delhivery.com/p/${cleanAwb}?label=pdf`; `AdminOrderDetailClient` opens that non-existent external URL.
6. `scheduleReturnPickup(returnId)` generates `REV-...` mock AWB (and also generates a local `REV-${Date.now()}` string even when configured!).
7. `verifyDelhiveryWebhookAuth()` **fails closed**: if `DELHIVERY_WEBHOOK_SECRET` is missing/empty, `POST /api/webhooks/delhivery` returns HTTP `500` and logs a `HIGH` operational alert. (However, if set to a `mock*` value, it still authenticates requests!)
8. `GET /api/health` returns `configuredServices.delhivery: Boolean(process.env.DELHIVERY_TOKEN)`—so a `"mock_..."` token reports `true` and missing `DELHIVERY_WEBHOOK_SECRET` is unreported.

---

## 10. Security, Authorization & Financial-Integrity Risks

| Severity | Finding | Exact Location & Impact |
|---|---|---|
| **Critical** | **Mock Shipment Booking & Serviceability Active in Production** | `delhivery/service.ts` (`!config.isConfigured` branches) does not check `NODE_ENV === "production"`. Missing/mock `DELHIVERY_TOKEN` lets admins mark real orders `Shipped` with fake `DLV...` AWBs and emails customers dead tracking links. |
| **Critical** | **COD Eligibility Bug Books Cancelled/Delivered/Returned Orders** | `delhivery/service.ts:146-150`: `order.payment_method === "COD"` is OR'd unconditionally, allowing `Cancelled`, `Delivered`, or `Returned` COD orders to call Delhivery `cmu/create.json`. |
| **Critical** | **OTP Gate Bypassed or Permanently Deadlocked on Delhivery Webhook** | `delhivery/service.ts:526-551`: If customer never visited `/orders/[id]`, `delivery_otps` has 0 rows and webhook marks order `Delivered` without OTP; if customer *did* visit, Delhivery `DL` leaves order stuck in `Out for Delivery`, while admins can still bypass OTP via `Advance to Delivered` (`updateAdminOrderStatus`). |
| **High** | **Hardcoded Delivery OTP HMAC Secret Fallback** | `lib/delivery/otp.ts:4`: Hardcoded fallback secret if `DELIVERY_OTP_HMAC_SECRET` is unset (and var is missing from `.env.example`, while `test-phase02-remediation-defects.ts` sets `DELIVERY_OTP_SECRET` instead). |
| **High** | **Unauthenticated Shipment Tracking Endpoint Leaks Destination City/State** | `app/api/shipping/track/route.ts`: No session/ownership check; combined with deterministic mock AWBs (`DLV<order_id_prefix>`), anyone can enumerate orders and view transit timeline / city-state in mock mode. |
| **High** | **Duplicate Consignment Creation Race Condition & Unchecked DB Updates** | `delhivery/service.ts:135-233`: No `FOR UPDATE` / lock before calling `cmu/create.json`, and `.update()` errors on lines 222 and 678 are ignored—risking double-booked Delhivery AWBs and desynced DB state. |
| **High** | **Silent Pincode Check Fail-Open in Checkout** | `delhivery/service.ts:103-112` + `lib/commerce/orders.ts:88-98, 287-297`: Any Delhivery API outage or auth error returns `{ serviceable: true, prepaid: true, cod: true }`, allowing COD/Prepaid orders for non-serviceable pincodes. |
| **High** | **RLS & RBAC Mismatch Breaks Staff Roles & Silently Drops `audit_logs`** | `lib/admin/orders.ts` uses `createClient()` + `requireAdmin()` while `orders`/`audit_logs` RLS checks `is_admin()` (`super_admin`/`admin` only) and `audit_logs` has **no `INSERT` RLS policy**. Also `bookAdminOrderShipment`, `reconcileAdminCODSettlement`, and `PATCH /api/admin/orders/[id]/status` ignore granular permissions (`orders.ship`, `orders.settle_cod`). |
| **High** | **Disjoint COD Remittance & Over-Reported COD Collected Metrics** | `reconcileDelhiveryCODRemittance` never writes `cod_remittances`, allows re-reconciling reconciled orders, and double-logs `audit_logs`. `recordDoorstepCodCollection` writes `orders.cod_settled_amount` on doorstep collection, causing `get_payment_report` RPC (`SUM(cod_settled_amount)`) to report unremitted cash or disputed amounts as collected remittance. |
| **Medium** | **Delhivery Webhook Lacks Rate Limiting, `webhook_events` Idempotency & HMAC** | `app/api/webhooks/delhivery/route.ts` lacks `checkRateLimit` and `webhook_events` persistence (unlike Razorpay); auth is static shared token; ignores `StatusType` (e.g. `"UD"`). |
| **Medium** | **Customer Refresh Rotates Active Delivery OTP** | `lib/delivery/otp.ts:177-183` regenerates OTP on every `GET /api/delivery/otp` call even if an active OTP already exists, invalidating the code the customer may already have read aloud. |
| **Medium** | **DB Trigger Security Regression & `Processing` Constraint Crash** | `20261028000001` lacks `'Processing'` in `orders_order_status_check`, and `20261109000001` dropped the DB trigger check forbidding unpaid `ONLINE` orders from entering `Confirmed`. |
| **Medium** | **Fake-AWB Modal & Broken Search/Lookup UI** | `AdminOrdersClient.tsx:106` pre-fills fake `DLH-...` AWB; `DeliveryVerificationClient.tsx:43` fetches non-existent `/api/admin/orders`; `AdminOrdersClient` filters search only on the current 20-item page. |

---

## 11. Exact Files and Functions Involved

- **Delhivery Client, Config & Service:**
  - `apps/web/lib/integrations/config.ts`: `getIntegrationsConfig()`, `checkIntegrationStatus()`
  - `apps/web/lib/integrations/delhivery/client.ts`: `getDelhiveryConfig()`
  - `apps/web/lib/integrations/delhivery/service.ts`: `checkPincodeServiceability()`, `createShipmentForOrder()`, `trackShipment()`, `mapDelhiveryStatusToOrderStatus()`, `verifyDelhiveryWebhookAuth()`, `isAllowedStatusTransition()`, `processDelhiveryWebhook()`, `scheduleDelhiveryPickup()`, `getShippingLabel()`, `reconcileDelhiveryCODRemittance()`
- **API Routes:**
  - `apps/web/app/api/shipping/serviceability/route.ts`: `GET`
  - `apps/web/app/api/shipping/track/route.ts`: `GET`
  - `apps/web/app/api/webhooks/delhivery/route.ts`: `POST`
  - `apps/web/app/api/admin/orders/[id]/status/route.ts`: `PATCH`
  - `apps/web/app/api/admin/orders/export/route.ts`: `GET`
  - `apps/web/app/api/admin/delivery/verify-otp/route.ts`: `POST`
  - `apps/web/app/api/admin/delivery/cod-collect/route.ts`: `POST`
  - `apps/web/app/api/admin/returns/pickup/route.ts`: `POST`
  - `apps/web/app/api/delivery/otp/route.ts`: `GET`
  - `apps/web/app/api/documents/packing-slip/[orderId]/route.ts`: `GET`
  - `apps/web/app/api/documents/invoice/[orderId]/route.ts`: `GET`
  - `apps/web/app/api/health/route.ts`: `GET`
- **Admin UI & Server Actions:**
  - `apps/web/lib/admin/orders.ts`: `getAdminOrders()`, `getAdminOrderById()`, `updateAdminOrderStatus()`, `cancelAdminOrder()`, `bookAdminOrderShipment()`, `scheduleAdminPickup()`, `getAdminShippingLabel()`, `reconcileAdminCODSettlement()`
  - `apps/web/lib/admin/constants.ts`: `ORDER_STATUS_TRANSITIONS`
  - `apps/web/lib/admin/auth.ts` & `apps/web/lib/admin/permissions.ts`: `requireAdmin()`, `requireStaffPermission()`, `verifyAdminApi()`, `hasPermission()`, `isStaffRole()`
  - `apps/web/lib/admin/reports.ts`: `getSalesReport()`, `getPaymentReport()`, `getInventoryValuationReport()`, `exportOrdersToCsv()`
  - `apps/web/app/admin/orders/page.tsx` & `AdminOrdersClient.tsx`
  - `apps/web/app/admin/orders/[id]/page.tsx` & `AdminOrderDetailClient.tsx`
  - `apps/web/app/admin/delivery-verification/page.tsx` & `DeliveryVerificationClient.tsx`
  - `apps/web/app/admin/returns/page.tsx` & `AdminReturnsClient.tsx`
  - `apps/web/app/admin/AdminNavClient.tsx` & `apps/web/app/admin/layout.tsx`
- **Delivery OTP, COD, Checkout, Tracking & Returns:**
  - `apps/web/lib/delivery/otp.ts`: `hashDeliveryOtp()`, `generateAndStoreDeliveryOtp()`, `verifyDeliveryOtp()`, `getCustomerOrderDeliveryOtp()`
  - `apps/web/lib/delivery/cod.ts`: `recordDoorstepCodCollection()`, `reconcileCourierRemittance()`
  - `apps/web/lib/commerce/orders.ts`: `placeOrderCOD()`, `placeOrderOnline()`, `getCustomerOrders()`, `getCustomerOrderById()`, `cancelOrder()`, `releaseExpiredReservations()`
  - `apps/web/lib/commerce/returns.ts`: `scheduleReturnPickup()`, `checkOrderReturnEligibility()`, `createCustomerReturnRequest()`, `processReturnRefund()`
  - `apps/web/lib/commerce/invoices.ts`: `getOrderPackingSlip()`, `getOrCreateOrderInvoice()`
  - `apps/web/lib/integrations/resend/service.ts`: `sendShipmentNotification()`
  - `apps/web/app/checkout/CheckoutClient.tsx`, `apps/web/app/orders/[id]/OrderDetailClient.tsx`, `apps/web/components/commerce/DeliveryOtpCard.tsx`
- **Database Migrations:**
  - `supabase/migrations/20261028000001_core_schema.sql`
  - `supabase/migrations/20261028000002_business_logic.sql`
  - `supabase/migrations/20261028000003_rls_policies.sql`
  - `supabase/migrations/20261031000002_admin_management_system.sql`
  - `supabase/migrations/20261101000001_phase04_backend_and_database_integrity.sql`
  - `supabase/migrations/20261107000001_phase00_foundation_and_security.sql`
  - `supabase/migrations/20261109000001_phase01_modernization_and_hardening.sql`
  - `supabase/migrations/20261109000002_phase00_phase01_gap_closure.sql`
  - `supabase/migrations/20261109000006_phase02_complete_features.sql`
  - `supabase/migrations/20261110000001_phase02_remediation_defects.sql`

---

## 12. Recommended Minimum Changes to Complete the Delhivery One B2C Forward Order Workflow

Keep changes strictly minimal, additive/remedial, and scoped to a reliable e-commerce shipping workflow:

1. **Fix Database Schema & RLS Integrity (1 forward-only SQL migration):**
   - Update `orders_order_status_check` to include `'Processing'` (matching `ORDER_STATUS_TRANSITIONS` and `validate_order_state_transitions`), or remove `'Processing'` from `ORDER_STATUS_TRANSITIONS` / UI if unnecessary (simplest if kept consistent).
   - Restore the unpaid `ONLINE` confirmation guard and `refund_amount <= total_amount` check inside `validate_order_state_transitions()`.
   - Update `orders`, `order_items`, `order_status_history`, `delivery_otps`, `delivery_verifications`, `cod_collections`, `cod_remittances`, and `return_requests` RLS policies from `public.is_admin()` to `public.is_staff()` (or route all admin mutations cleanly via `createAdminClient()` after `requireStaffPermission()` checks).
   - Switch `audit_logs` inserts in `lib/admin/orders.ts` to `createAdminClient()` (do **not** grant direct client `INSERT` on `audit_logs`).

2. **Harden Delhivery Client & Fail-Closed Production Guards (`delhivery/client.ts`, `delhivery/service.ts`, `config.ts`):**
   - In `NODE_ENV === "production"`, refuse mock fallbacks when `DELHIVERY_TOKEN` is missing or `mock*`—return explicit configuration errors rather than booking fake `DLV...` AWBs or faking serviceability.
   - Add request timeouts (`AbortSignal.timeout`) and structured error parsing for Delhivery API responses.
   - Check `DELHIVERY_PICKUP_LOCATION`, `DELHIVERY_WEBHOOK_SECRET`, and `DELIVERY_OTP_HMAC_SECRET` readiness cleanly (fail closed if `DELIVERY_OTP_HMAC_SECRET` is unset in production; add missing vars to `.env.example`).

3. **Upgrade `createShipmentForOrder` to Official Delhivery One B2C Forward Order Spec (`delhivery/service.ts`, `lib/admin/orders.ts`):**
   - **Fix eligibility check:** Require `!["Cancelled", "Delivered", "Returned"].includes(order.order_status)` AND (`order.payment_method === "COD"` OR `order.payment_status === "Paid"`) AND status in `["Confirmed", "Processing", "Packed"]`.
   - **Prevent double-booking race:** Acquire an atomic pre-booking claim/lock (or check `shipping_awb IS NULL` atomically) before calling `/api/cmu/create.json`.
   - **Complete B2C forward payload:** Accept optional admin overrides (`weightGrams`, `lengthCm`, `widthCm`, `heightCm`, `shippingMode: "Surface" | "Express"`, `pickupLocation`) defaulting from `books` physical fields (`weight_grams`, `length_cm`, `width_cm`, `height_cm`) and safe book-parcel defaults. Populate `order` (`order_number || order.id`), `products_desc`, `quantity`, `hsn_code: "4901"`, `weight`, `shipment_length`, `shipment_width`, `shipment_height`, `shipping_mode`, `address_type`, `seller_name`, `seller_add`, `seller_gst_tin`, `seller_inv`, and `return_*` fields from `BUSINESS_CONFIG`.
   - **Validate Delhivery response:** Verify `resData.success === true` and `packages[0].status === "Success"` (or `waybill` present without failure `remarks`), check `.update()` error on `orders`, do **not** set `shipping_pickup_scheduled = true` until pickup is requested, and deduplicate `sendShipmentNotification(orderId, "shipped")` (call in one place only).

4. **Streamline Admin Order Workflow (`AdminOrdersClient.tsx` & `AdminOrderDetailClient.tsx`):**
   - Remove/demote the fake-AWB `"Fulfill & Ship Order"` modal in `AdminOrdersClient.tsx`; either invoke a lightweight **"Create Delhivery Shipment"** drawer/modal from `/admin/orders/[id]` (and link `"Book Shipment"` from `/admin/orders`) showing destination serviceability check, editable parcel weight/dimensions, shipping mode (`Surface`/`Express`), pickup warehouse, and COD/Prepaid summary before calling `bookAdminOrderShipment`.
   - Enforce granular `requireStaffPermission("orders.ship")` on `bookAdminOrderShipment`, `scheduleAdminPickup`, and `getAdminShippingLabel`, and `requireStaffPermission("orders.settle_cod")` on `reconcileAdminCODSettlement`.
   - Fix `getAdminShippingLabel` to propagate errors (`if (!result.success)`), optionally persist `orders.shipping_label_url`, and render a printable fallback if in local mock mode.
   - Fix `scheduleDelhiveryPickup` so admins can actually reschedule an existing pickup when needed, and only set `shipping_pickup_scheduled = true` here.
   - Add a **Live Delhivery Tracking** card on `AdminOrderDetailClient.tsx` and fix `getAdminOrders()` search to filter in PostgreSQL before `.range()` pagination.

5. **Fix Webhook, Tracking, Delivery OTP & COD Reconciliation Defects:**
   - **Webhook (`/api/webhooks/delhivery`):** Add `checkRateLimit(clientIp, "webhook")`, log/deduplicate events in `webhook_events` (`provider: "Delhivery"`), inspect both `Shipment.Status.Status` and `Shipment.Status.StatusType`, and include `"Processing"` in `isAllowedStatusTransition`.
   - **Tracking (`/api/shipping/track`):** Require authenticated order ownership or staff role (or return non-PII summary only), so customer addresses cannot be probed via predictable mock AWBs.
   - **Delivery OTP & Delivery Completion:** Decide whether merchant doorstep OTP is mandatory for all orders or optional for 3PL (Delhivery) shipments:
     - If mandatory: generate the OTP automatically when transitioning to `"Out for Delivery"` (webhook or admin action), **stop rotating** an active non-expired OTP in `getCustomerOrderDeliveryOtp()`, add `GET /api/admin/orders` (or server search action) so `/admin/delivery-verification` works, and enforce the OTP check consistently.
     - If Delhivery acts as the trusted carrier for B2C forward shipments: allow Delhivery `DL` webhook to complete delivery cleanly when merchant OTP is not enforced, and reserve `/admin/delivery-verification` for self-delivered/OTP-flagged orders.
   - **COD Reconciliation:** Unify `reconcileDelhiveryCODRemittance` and `reconcileCourierRemittance` so reconciling from `AdminOrderDetailClient` inserts into `cod_remittances` (preventing duplicate `remittance_ref` and double-reconciliation), remove duplicate `audit_logs` inserts, keep `orders.cod_settled_amount` strictly for reconciled remittance (not unremitted `cod_collections`), and update `get_payment_report` to filter `cod_settlement_status = 'reconciled'` and include `'unsettled'` in pending counts.
   - **Returns & Cancellations (Minimum Hygiene):** Wire `scheduleReturnPickup` to Delhivery reverse pickup (`/api/cmu/create.json` with `payment_mode: "Pickup"`) or clearly fail closed until implemented, and call Delhivery cancel API (`/api/p/edit`) if cancelling a booked shipment prior to pickup.
