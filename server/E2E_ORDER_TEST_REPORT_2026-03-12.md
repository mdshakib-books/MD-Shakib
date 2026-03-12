# Ecommerce Order System E2E Test Report

Date: 2026-03-12
Environment: Local API (`http://localhost:8000/api/v1`) + MongoDB
Accounts used:
- User: `mauryaanushka089@gmail.com`
- Admin: `arifquerry@gmail.com`

Primary tested orders:
- COD order: `69b2c3deebc7cb9dffa2529f`
- Online order: `69b2c3dfebc7cb9dffa252b3`
- Online payment record: `pay_daeefd2282dcc700`

Automated check summary:
- Total checks: `45`
- Passed: `38`
- Failed: `3`
- Blocked: `4`

## Summary
The complete lifecycle was executed end-to-end through API and database verification:
- User login, address/cart preparation, COD order creation, Online order creation.
- Duplicate submission was blocked (`409`) with same idempotency key.
- Admin could view both orders and confirm both.
- Online payment was captured via webhook simulation and persisted as `Paid` in both `orders` and `payments` collections.
- COD status transitions worked step-by-step: `Confirmed -> Packed -> Shipped -> Out for Delivery -> Delivered`.
- For each COD step, status was verified across:
  - User order-details API
  - Admin order-details API
  - Admin orders list API
- `statusHistory` timestamps were present and chronological in DB.
- User replacement request after delivery succeeded; admin approval succeeded; replacement state was visible to user payload.
- User cancel-before-shipping case worked.
- Invalid status transition (`Pending -> Delivered`) was blocked.
- Multiple same-status admin updates were blocked on second attempt.
- Online payment failure path worked (`paymentStatus=Failed`, payment row `status=Failed`).
- Replacement after allowed window (>7 days) was blocked.

Email note:
- Backend logs showed multiple successful sends:
  - `Order confirmation email sent to: mauryaanushka089@gmail.com`
- Inbox-level delivery/open verification was not executed from CLI.

## Improvement
Issues and gaps found:
1. COD payment not auto-marked as paid after delivery.
- Observed: Delivered COD order stayed `paymentStatus=Pending`.
- Expected: COD should become `Paid` at handover/delivery confirmation.

2. Shipment data validation gap.
- Observed: Order could be moved to `Shipped`/`Delivered` without `shipping.awb`.
- Impact: User can see delivered flow without courier/tracking identity.

3. Replacement rejection flow is incomplete.
- Observed:
  - `POST /admin/orders/:id/replacement/reject` -> `404`
  - status patch to `Rejected` -> `400` (validation blocks it)
- Impact: Admin can approve replacement but cannot reject through supported API.

4. Frontend real-time reflection is not verifiable in current implementation path.
- Order/Admin pages fetch once on mount; no live subscription used there.
- Live instant-update expectation is at risk unless manual refresh/polling is added.

5. Payment status visibility UX is inconsistent.
- Admin table primarily shows order status; payment status is not a separate first-class column.
- User order details shows payment method, not explicit payment status beside order status.

6. Email failure handling was not fault-injected.
- Success logs were observed, but failure scenario test needs controlled provider failure simulation.

## Implementation
To make this flow production-ready end-to-end:
1. Add COD settlement transition.
- On `Delivered` event, set:
  - `paymentStatus: "Paid"`
  - `isPaid: true`
  - `paidAt: <timestamp>`
- Add audit history note for COD settlement source.

2. Enforce shipment prerequisites in status transitions.
- Block `Packed -> Shipped` unless `shipping.awb` and `shipping.trackingUrl` exist.
- Alternatively force shipping creation endpoint before allowing `Shipped`.

3. Implement full replacement rejection API.
- Add route and service method:
  - `POST /admin/orders/:id/replacement/reject`
- Persist:
  - `orderStatus: "Rejected"` (or dedicated replacement-rejected status)
  - `replacement.replacementStatus: "Rejected"`
  - rejection reason + timestamp in `statusHistory`.
- Align enums/constants/validation so backend + UI + transitions match.

4. Real-time frontend synchronization.
- Subscribe order pages and admin orders page to socket events (`orderStatusUpdated`, payment events).
- Fallback polling for disconnected clients.
- Update store/state by order ID on each event.

5. Improve payment-status visibility in UI.
- Add dedicated `Payment Status` column in admin orders table.
- Show `Order Status` and `Payment Status` as separate badges in user order details.

6. Add deterministic email observability.
- Log/send email event IDs and delivery state.
- Persist email dispatch logs per order (`queued/sent/failed`).
- Add fault-injection test path for provider failures.

7. Strengthen automated regression coverage.
- Keep this E2E script in CI/staging.
- Add browser-based UI E2E (Playwright/Cypress) for live reflection and timeline rendering assertions.

Artifacts:
- JSON run report: `/Users/annu/Desktop/SHAKIB/server/e2e_order_lifecycle_report_1773323242577.json`
- Test runner script: `/Users/annu/Desktop/SHAKIB/server/test_full_order_lifecycle.js`
