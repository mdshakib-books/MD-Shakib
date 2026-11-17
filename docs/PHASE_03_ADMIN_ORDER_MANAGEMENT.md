# Phase 03 — Admin, Roles & Order Management Hardening

**Branch:** `new-fix`  
**Database Migration:** `supabase/migrations/20261112000001_phase03_admin_roles_order_management.sql`  
**Offline Verification Suite:** `apps/web/scripts/test-phase03-admin-order-management.ts`

---

## 1. Summary of Changes

Phase 03 resolves staff-role permission mismatches across the Next.js application and PostgreSQL RLS/RPCs, separates automated Delhivery API shipment booking from manual courier entry (eliminating fabricated `DLH-*` AWBs and silent `"Delhivery"` defaults), brings order-detail and order-list lifecycle actions to parity, and prohibits direct cancellation of dispatched (`Shipped` / `Out for Delivery`) orders without confirmed courier cancellation.

---

## 2. Task A — Staff-Role Permissions Matrix & Authorization Alignment

### Canonical Permission Matrix (`apps/web/lib/admin/permissions.ts` & PostgreSQL `role_has_staff_permission`)

| Permission / Capability | `super_admin` | `admin` | `order_manager` | `warehouse_staff` | `support_staff` | `user` |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| `dashboard.view` | Yes | Yes | Yes | Yes | Yes | No |
| `orders.view` | Yes | Yes | Yes | Yes | Yes | No |
| `orders.manage` (Confirmed / Processing / Packed) | Yes | Yes | Yes | Yes | No | No |
| `orders.ship` (Delhivery booking, manual shipment, Shipped/OFD/Delivered, pickups, labels) | Yes | Yes | No | Yes | No | No |
| `orders.cancel` (Pre-dispatch orders only) | Yes | Yes | Yes | No | No | No |
| `orders.cancel_dispatched` (Shipped / OFD with courier confirmation) | Yes | Yes | No | No | No | No |
| `orders.refund` (Gateway refunds & retries) | Yes | Yes | No | No | No | No |
| `orders.settle_cod` (COD collection & bank remittance) | Yes | Yes | No | No | No | No |
| `orders.export` | Yes | Yes | Yes | No | No | No |
| `returns.manage` | Yes | Yes | Yes | Yes | No | No |
| `delivery.verify` (Delivery OTP verification) | Yes | Yes | No | Yes | No | No |
| `support.manage` | Yes | Yes | Yes | No | Yes | No |
| `reviews.manage` | Yes | Yes | No | No | Yes | No |
| `inventory.view` | Yes | Yes | Yes | Yes | No | No |
| `inventory.manage` | Yes | Yes | No | Yes | No | No |
| `books.view` | Yes | Yes | Yes | Yes | No | No |
| `books.manage` / `discounts.manage` | Yes | Yes | No | No | No | No |
| `users.view` / `users.manage` / `reports.view` / `customers.export` / `audit.view` | Yes | Yes | No | No | No | No |
| `users.manage_roles` | Yes | No | No | No | No | No |

### Code & API Hardening

- `apps/web/lib/admin/auth.ts`: Added `requireAnyStaffPermission`, non-redirecting `verifyStaffActionPermission` for Server Actions returning `{ success, error }`, and extended `verifyAdminApi(requiredPermission?)` so every admin route enforces active, non-blocked, non-deleted status plus granular permissions.
- `apps/web/lib/admin/orders.ts`: Replaced bare `requireAdmin()` across all 9 order functions with `requireStaffPermission("orders.view")`, `verifyStaffActionPermission("orders.manage" | "orders.ship" | "orders.cancel" | "orders.cancel_dispatched" | "orders.refund" | "orders.settle_cod")`, and wrote audit records with `createAdminClient()` after permission checks.
- Fixed mismatched page and route checks:
  - `/admin/support/page.tsx`: Changed `"orders.manage"` -> `"support.manage"`.
  - `/admin/returns/page.tsx`: Changed `"orders.manage"` -> `"returns.manage"`.
  - `/admin/delivery-verification/page.tsx` + `/api/admin/delivery/verify-otp`: Standardized on `"delivery.verify"`.
  - `/api/admin/delivery/cod-collect`: Removed `"orders.manage"` fallback; strictly `"orders.settle_cod"`.
  - `/api/admin/returns/refund`: Removed `"orders.manage"` fallback; strictly `"orders.refund"`.
  - `/api/admin/returns/pickup`: Strictly `"orders.ship"`.
  - `/api/admin/books/export`, `books/import`, `books/[id]/variants`, `/api/admin/support/tickets/[id]`, `/api/admin/media/sign`, `/api/admin/media/upload`, `/api/admin/orders/export`, `/api/admin/customers/export`: Removed hardcoded non-existent `"operations"` role and missing block checks; migrated to `verifyAdminApi(...)`.
  - `/api/documents/{packing-slip,invoice,receipt,refund}`: Verified `!is_blocked && !is_deleted` and role permissions (`orders.ship | orders.manage` for packing slips; `orders.view` for financial documents).
- `apps/web/app/admin/AdminNavClient.tsx` & `layout.tsx`: Nav items are filtered dynamically by the signed-in user's role permissions, and the sidebar displays their active role label.

### PostgreSQL RLS & RPC Alignment

- `public.is_admin()` remains strictly `('super_admin', 'admin')` while `public.is_staff()` covers all 5 active staff roles.
- Added `public.role_has_staff_permission`, `public.user_has_staff_permission`, `public.has_staff_permission`, and scoped RLS predicates (`can_manage_orders()`, `can_ship_orders()`, `can_cancel_orders()`, `can_manage_returns()`, `can_manage_inventory()`, `can_manage_support()`, `can_manage_reviews()`).
- Updated RLS policies on `orders`, `order_items`, `order_status_history`, `order_consents`, `profiles`, `books`, `book_variants`, `inventory_history`, `inventory_adjustments`, `payments`, `refund_records`, `cod_collections`, `cod_remittances`, `delivery_otps`, `delivery_verifications`, `invoices`, `return_requests`, `return_request_items`, `support_tickets`, `ticket_messages`, and `reviews` so operational roles (`order_manager`, `warehouse_staff`, `support_staff`) are neither blocked on permitted operations nor granted write access to financial/order tables outside their permissions.
- Upgraded `adjust_inventory_atomic`, `moderate_review_atomic`, and `update_customer_status` to accept active multi-role staff (`super_admin`, `admin`, and `warehouse_staff` / `support_staff` where appropriate).

---

## 3. Task B — Manual Shipment Entry vs Delhivery API Booking

- Removed `NOT NULL DEFAULT 'Delhivery'` from `public.orders.shipping_courier` (now `DEFAULT NULL`) and backfilled unshipped historical rows cleanly.
- Added `shipping_booking_mode`, `shipping_booking_status`, `shipping_last_error`, `shipping_cancelled_at`, `shipping_provider_response` to `public.orders`.
- Created normalized `public.shipments` (enforcing one active non-cancelled/non-failed shipment per order and unique active AWBs) and `public.shipment_events` (recording actor, role, source, previous/new status, carrier, AWB, and metadata).
- Extended `public.order_status_history` with `previous_status`, `changed_by`, and `source` populated automatically by `record_order_status_history()`.
- **Mode 1 (`bookAdminOrderShipment` -> `createShipmentForOrder`)**:
  - Acquires an atomic conditional lock (`shipping_booking_status = 'booking_in_progress'`) prior to external API calls.
  - Enforces bounded `AbortController` timeouts (10s). On timeout, records `shipping_booking_status = 'booking_uncertain'` without retrying blindly or advancing to `'Shipped'`.
  - Validates Delhivery payload errors (`success === false` or `pkg.status === 'Fail'`) and marks `'booking_failed'` cleanly without leaving `'Shipped'`.
- **Mode 2 (`createManualOrderShipment` -> `create_manual_shipment_atomic`)**:
  - Requires a real `carrierName` (never silently defaults to `"Delhivery"`).
  - Makes `awb` optional (`NULL` permitted for local/manual carriers) and rejects fabricated `DLH-*` placeholder AWBs across UI, TypeScript helpers (`isSyntheticPlaceholderAwb`), and SQL.
  - `resolveOrderTrackingUrl` and `renderShipmentNotificationHtml` never generate `https://track.delhivery.com/p/...` URLs for non-Delhivery or manual shipments without an explicit `http(s)://` URL.

---

## 4. Task C — Order Details & Orders List Fulfillment Parity

- Extracted shared UI components `apps/web/components/admin/AdminShipmentModal.tsx` and `apps/web/components/admin/AdminCancelOrderModal.tsx` used identically by `AdminOrdersClient.tsx` and `AdminOrderDetailClient.tsx`.
- Order detail displays carrier, booking mode, booking status, AWB, explicit tracking URL (or `"Tracking unavailable"`), failure alerts, pickup/shipped/delivered timestamps, and combined status history + `shipment_events` logs.
- Delhivery `Download Label` and `Schedule Pickup` controls are restricted to genuine Delhivery shipments (`isDelhiveryShipment`).

---

## 5. Task D — Restricted Status Transitions & Courier-Aware Cancellation

- Removed `"Cancelled"` from `ORDER_STATUS_TRANSITIONS["Shipped"]` and `ORDER_STATUS_TRANSITIONS["Out for Delivery"]` in `apps/web/lib/admin/constants.ts`.
- Updated `public.validate_order_state_transitions()` to block direct `'Shipped' -> 'Cancelled'` and `'Out for Delivery' -> 'Cancelled'` transitions unless trusted `cancel_dispatched_order_atomic()` sets transaction-local `app.allow_verified_courier_cancellation = 'true'`.
- Updated `public.cancel_order_atomic()` and `executeOrderCancellation()` to reject `'Shipped'` and `'Out for Delivery'` orders for both customers and admins.
- Added `executeDispatchedOrderCancellation()` and `cancel_dispatched_order_atomic()`:
  - Delhivery shipments must first confirm `cancelDelhiveryShipment(awb)` (`POST /api/p/edit`); if Delhivery rejects or times out, the order remains in its dispatched state and a `courier_cancel_failed` event is logged.
  - Manual/external carrier shipments require `orders.cancel_dispatched` (`super_admin` / `admin`) plus explicit courier halt confirmation and a reference note.
  - Preserves post-dispatch inventory (`cancelled_post_dispatch_no_restock`) and triggers Phase 2 Razorpay refund orchestration for paid `ONLINE` orders.
- Hardened `processDelhiveryWebhook()` to ignore manual-carrier orders, block illegal/backward transitions, guard concurrent updates (`eq("order_status", order.order_status)`), and record `shipment_events`.

---

## 6. Verification Status (Offline Environment)

**Not verified against a remote/local PostgreSQL instance:** Supabase migrations (`20261111000001` and `20261112000001`) have not yet been executed against a live Supabase database; SQL syntax, RLS policies, and RPCs should be applied and smoke-tested on a dedicated development Supabase branch before staging/production rollout.
