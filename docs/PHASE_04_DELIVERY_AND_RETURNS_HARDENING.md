# Phase 04 — Delivery, Returns, COD & Webhook Hardening

**Branch:** `new-fix`  
**Database Migration:** `supabase/migrations/20261113000001_phase04_delivery_and_returns_hardening.sql`  
**Offline Verification Suite:** `apps/web/scripts/test-phase04-delivery-returns.ts`

---

## 1. Summary of Changes

Phase 04 hardens reverse pickup and return lifecycle management, Delhivery forward shipment validation and timeout recovery, end-to-end Cash on Delivery (COD) collection/remittance/cancellation/refund workflows, and Delhivery inbound webhook idempotency and out-of-order protection.

---

## 2. Reverse Pickup & Return Management (H-4)

- **Eradicated synthetic `REV-*` AWBs:** Removed mock `REV-...` AWB generation from `scheduleReturnPickup()` (`apps/web/lib/commerce/returns.ts`), enforced HTTP `501` / `503` fail-closed responses in `POST /api/admin/returns/pickup`, and added PostgreSQL trigger `validate_return_request_lifecycle()` forbidding `pickup_awb ~* '^(REV-|MOCK)'`.
- **Honest Admin Returns Workflow:** Updated `AdminReturnsPage` / `AdminReturnsClient.tsx` to display an explicit notice that automated courier reverse pickup is unavailable / not integrated, added `"Mark Return Item Received"` (`approved -> received`), and separated refund authorization (`refund_pending`) from confirmed settlement (`completed`).
- **Return State Machine & Audit:** Added `RETURN_STATUS_TRANSITIONS` / `isAllowedReturnStatusTransition()` in `apps/web/lib/commerce/returns.ts` paired with `validate_return_request_lifecycle()` in SQL (`refund_pending` added to `return_requests.status` CHECK), recording `RETURN_REQUEST_REVIEWED` entries in `audit_logs`.

---

## 3. Delhivery Forward Shipment Booking Validation

- **Pre-Lock Consignment Validation (`validateDelhiveryBookingPayload`):** Validates `pickup_location`, recipient `full_name`, street address (`house_no`, `area`), `city`, `state`, 6-digit Indian `pincode` (`/^[1-9]\d{5}$/`), normalized 10-digit Indian mobile number (`normalizeIndianPhoneNumber`), positive `total_amount`, `payment_mode` (`"COD"` / `"Prepaid"`), matching `cod_amount`, parcel `weight` (grams derived from `order_items` + `books`), parcel dimensions (`shipment_length`, `shipment_width`, `shipment_height`), `hsn_code: "4901"`, and `shipping_mode` (`Surface` | `Express`) **before** acquiring the `booking_in_progress` lock.
- **Strict Response & Pickup State:** Rejects `resData.success === false`, `packages[0].status === "Fail"` / `"Error"` / non-`"Success"`, missing waybills, and synthetic AWBs; preserves `shipping_pickup_scheduled: false` until `scheduleDelhiveryPickup` confirms a pickup; removes duplicate `"shipped"` notification dispatch in `bookAdminOrderShipment()`.
- **Uncertain Booking Recovery (`reconcileUncertainDelhiveryBooking` & `verifyUncertainAdminShipment`):** Queries Delhivery `/api/v1/packages/json/?ref_ids=...` for timed-out `booking_uncertain` orders to adopt an already-created waybill or cleanly unlock `booking_failed` when confirmed absent, preventing duplicate manifests.

---

## 4. COD Lifecycle, Cancellation, Remittance & Offline Refund Workflows

- **Collection vs. Remittance Separation:** Extended `orders` (`cod_collection_status`, `cod_collected_amount`, `cod_collected_at`, `cod_refund_reference`) and added atomic `record_cod_collection_atomic` & `reconcile_cod_remittance_atomic` RPCs. Doorstep collection (`recordDoorstepCodCollection`) validates order status (`Out for Delivery` / `Delivered`), rejects `refused` with `> 0`, prevents duplicate positive collections via `idx_cod_collections_positive_unique`, and never overwrites `orders.cod_settled_amount` before courier remittance. `reconcileDelhiveryCODRemittance` now delegates to `reconcileCourierRemittance`, writing `cod_remittances` atomically. Updated `get_payment_report` to count only `cod_settlement_status = 'reconciled'` toward `cod_collected_amount`.
- **Pre-Collection Zero-Refund Guarantees:** Database trigger `validate_order_state_transitions()`, `guard_refund_records_integrity()`, and `initiate_return_refund_atomic()` prohibit creating `refund_records` or transitioning to `Refund Pending` / `Refunded` for uncollected COD orders (including pre-collection cancellations and `RTO` returns). Dispatched `COD` cancellations continue to enforce Phase 3 courier-halt verification via `executeDispatchedOrderCancellation` / `cancel_dispatched_order_atomic`.
- **Two-Step Collected COD Return Refunds:** Removed synthetic `COD-REFUND-${Date.now()}` generation from `processReturnRefund()`. Initiating a refund on a verified-collected COD return creates a `pending` offline payout record (`payment_channel = 'cod_offline'`) and moves the return to `refund_pending`. Explicit external payout confirmation (`confirmCodReturnRefundPayout()` -> `POST /api/admin/returns/refund/confirm` -> `complete_cod_refund_atomic`) requires a genuine non-synthetic UTR/UPI/voucher `payout_reference` before marking `refund_records.status = 'processed'`, `return_requests.status = 'completed'`, and `orders.payment_status = 'Refunded' | 'Partially Refunded'`.
- **Delivery Verification Order Lookup Fix:** Added `GET /api/admin/orders` (`verifyAdminApi("orders.view")`) resolving the 404 lookup used by `DeliveryVerificationClient.tsx`.

---

## 5. Webhook Idempotency & Event Ordering

- **Durable `webhook_events` Persistence & Atomic Processing:** Extended `public.webhook_events` (`payload_hash`, `provider_event_timestamp`, `waybill`, `order_id`, `processing_outcome`, `error_message`) and `public.shipments` (`last_webhook_event_id`, `last_webhook_event_at`), and added `orders.shipping_last_webhook_at` / `shipping_last_webhook_status`.
- **`apply_delhivery_webhook_atomic` & `processDelhiveryWebhook`:** Computes explicit or SHA-256 deterministic `event_id`, safely parses optional provider timestamps (`parseDelhiveryWebhookTimestamp`), deduplicates identical replays (`duplicate_ignored`), handles in-flight duplicates and failed-event retries, enforces `shipping_last_webhook_at` timestamp regression checks and `ORDER_STATUS_PROGRESS_RANK` monotonicity (`stale_event_ignored` with `webhook_stale_ignored` audit events), rejects post-cancellation transitions (`rejected_illegal_transition`), skips manual/non-Delhivery couriers, enforces the D-2 delivery OTP gate, and clears unpaid COD refund fields on `RTO` (`Returned`).
- **Route Hardening (`POST /api/webhooks/delhivery`):** Enforces fail-closed auth before webhook-tier rate limiting and rejects non-object JSON payloads cleanly.

---

## 6. Verification Scope (Offline Isolation)

- **Tested locally offline** via `apps/web/scripts/test-phase04-delivery-returns.ts` (in-memory database simulator & mocked Delhivery `fetchFn`), plus Phase 01, Phase 02, Phase 03, Delhivery missing-credentials, and Phase 09 unit test suites, `tsc --noEmit`, `eslint`, and `next build`.
- **Not verified against an isolated provider sandbox or live PostgreSQL/Supabase instance:** Migrations `20261111000001`, `20261112000001`, and `20261113000001` remain un-applied to any remote database due to local-only isolation; apply and smoke-test sequentially on a dedicated development Supabase database before staging/production deployment.
