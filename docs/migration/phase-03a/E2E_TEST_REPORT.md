# PHASE 03A — BROWSER END-TO-END TEST & ACCEPTANCE REPORT

**Project:** MD Shakib Islamic Books  
**Phase:** 03A — Authenticated Customer Lifecycle, Database Security & End-to-End Verification  
**Date:** October 31, 2026  
**Status:** 14 / 14 Tests Passed (100% Success Rate)  
**Execution Environment:** Headless Google Chrome (v156) via Chrome DevTools Protocol (CDP), Next.js App Router (`http://localhost:3000`), Local Supabase Docker PostgreSQL 17 (`http://127.0.0.1:54321`)

---

## 1. Executive Summary

This report documents the independent browser-driven end-to-end verification of the **Customer Account & Commerce** system implemented in Phase 03. Testing was conducted using automated Chrome CDP sessions interacting directly with live client UI components, React 19 Server Actions, and Supabase PostgreSQL stored procedures.

All 14 comprehensive test scenarios passed without failure, generating 15 high-resolution PNG screenshot artifacts documenting the customer experience from initial login through profile update, address management, checkout, order cancellation, replacement request, administrative moderation, and customer isolation.

---

## 2. Test Execution Environment & Configuration

| Parameter | Configuration Value | Verification Notes |
| :--- | :--- | :--- |
| **Browser Engine** | Google Chrome 156.0.8078.76 (Headless CDP) | Remote debugging port 9222, isolated user profile |
| **Viewport Dimensions** | 1440 × 900 (Desktop) | Clean typography, centered cards, responsive containers |
| **Web Application** | Next.js 15 App Router (`apps/web`) | Running locally on `http://localhost:3000` via Turbopack |
| **Database Engine** | Supabase PostgreSQL 17.6.1.167 | Running locally on port 54322, REST/Auth on port 54321 |
| **Customer A (Alpha)** | `customer.alpha@example.com` | Primary test customer account (`role = 'user'`) |
| **Customer B (Beta)** | `customer.beta@example.com` | Adversarial test customer account (`role = 'user'`) |
| **Admin User** | `admin.books@example.com` | Authoritative administrator (`role = 'admin'`) |
| **Catalog Book Fixture** | `a0000000-0000-0000-0000-000000000001` | *The Noble Quran (English Translation & Commentary)* |

---

## 3. End-to-End Test Results Matrix

| Test ID | Test Scenario | Module | Status | Execution Time | Screenshot Reference |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **E2E-01** | Customer Login (`/login`) | Authentication | **PASS** | 3.2s | `01_customer_login_success.png` |
| **E2E-02** | Customer Profile Management (`/profile`) | Profile | **PASS** | 2.8s | `02_customer_profile_saved.png` |
| **E2E-03** | Address Management & Single Default Invariant (`/addresses`) | Address Book | **PASS** | 5.8s | `03_address_management_list.png`<br>`04_address_add_modal.png` |
| **E2E-04** | Cart Addition & Address Selector (`/checkout`) | Checkout | **PASS** | 3.5s | `05_checkout_address_selector.png` |
| **E2E-05** | Atomic COD Order Placement & Confirmation | Commerce | **PASS** | 4.1s | `06_order_confirmation.png` |
| **E2E-06** | Customer Order History Badge Verification (`/orders`) | Order History | **PASS** | 1.8s | `07_order_history_list.png` |
| **E2E-07** | Order Detail Timeline & Tracking View (`/orders/[id]`) | Order Details | **PASS** | 1.9s | `08_order_detail_view.png` |
| **E2E-08** | Atomic Order Cancellation & Inventory Restoration | Inventory / Order | **PASS** | 3.8s | `09_order_cancellation_confirmed.png` |
| **E2E-09** | 7-Day Replacement Policy & Modal Trigger | Replacements | **PASS** | 2.4s | `10_replacement_modal.png` |
| **E2E-10** | Replacement Request Submission (`Replacement Requested`) | Replacements | **PASS** | 3.4s | `11_replacement_requested_status.png` |
| **E2E-11** | Administrative Replacement Review & Approval | Admin Moderation | **PASS** | 5.2s | `12_admin_replacement_review.png` |
| **E2E-12** | Customer Payments & Refunds Ledger (`/account/payments`) | Financial History | **PASS** | 1.8s | `13_customer_payments_refunds.png` |
| **E2E-13** | Customer-to-Customer Data Isolation Barrier | Security / RBAC | **PASS** | 2.1s | `14_customer_isolation_boundary.png` |
| **E2E-14** | Account Security & Password Recovery (`/account/security`) | Account Security | **PASS** | 1.7s | `15_password_recovery_and_security.png` |

---

## 4. Scenario Breakdown & Detailed Observations

### 4.1 E2E-01: Customer Authentication (`/login`)
- **Action:** Navigated to `http://localhost:3000/login`. Entered credentials `customer.alpha@example.com` / `SecretPassword123!`. Clicked **Log In**.
- **Observation:** Server Action `loginCustomer` authenticated the user via Supabase GoTrue, wrote session cookies, and issued client-side redirect to `/profile`.
- **Assertion:** Redirection target verified as `/profile`. Verified that input `#name` displayed `Customer Alpha`.
- **Evidence:** `docs/migration/phase-03a/screenshots/01_customer_login_success.png`.

### 4.2 E2E-02: Customer Profile Management (`/profile`)
- **Action:** Customer updated phone number field to `+91 98765 43210` and submitted the form.
- **Observation:** Server Action `updateCustomerProfile` validated ownership (`auth.uid() = profile.id`) and updated `public.profiles`. The page displayed a success confirmation banner.
- **Assertion:** Page was forcibly reloaded via browser refresh; verified that `input#phone` retained `+91 98765 43210` from persistent PostgreSQL storage.
- **Evidence:** `docs/migration/phase-03a/screenshots/02_customer_profile_saved.png`.

### 4.3 E2E-03: Address Management & Single Default Invariant (`/addresses`)
- **Action:**
  1. Clicked `+ Add New Address`. Captured modal screenshot.
  2. Created Address 1 (*Home*): `Flat 4B, Heritage Heights, Park Circus, Kolkata, West Bengal, 700017` with `isDefault: true`.
  3. Created Address 2 (*Office*): `Level 6, Tech Park, Salt Lake Sector V, Kolkata, West Bengal, 700091` with `isDefault: true`.
- **Observation:** Trigger `trg_default_address` executed `handle_default_address()`, automatically clearing `is_default` on Address 1 when Address 2 was marked default.
- **Assertion:** Querying DOM elements verified that exactly **one** address badge displayed `Default`.
- **Evidence:** 
  - `docs/migration/phase-03a/screenshots/03_address_management_list.png`
  - `docs/migration/phase-03a/screenshots/04_address_add_modal.png`.

### 4.4 E2E-04: Cart Addition & Address Selector (`/checkout`)
- **Action:** Navigated to book catalog page `/books/a0000000-0000-0000-0000-000000000001` and clicked `Add to Cart`. Navigated to `/checkout`.
- **Observation:** `CheckoutPage` loaded authoritative cart and saved customer addresses. Address 2 (*Tech Park*) was automatically pre-selected based on `is_default: true`.
- **Assertion:** Page displayed `1. DELIVERY DESTINATION` and line item *The Noble Quran (English Translation & Commentary)*.
- **Evidence:** `docs/migration/phase-03a/screenshots/05_checkout_address_selector.png`.

### 4.5 E2E-05: Atomic COD Order Placement & Confirmation
- **Action:** Selected payment mode `COD` and clicked `Confirm Order`.
- **Observation:** Executed `placeOrderCOD` Server Action calling `create_order_atomic` RPC. Stock decremented from catalog, customer cart purged, and order recorded with `Pending` status.
- **Assertion:** Browser redirected to `/order-success?orderId=...`. Database confirmed persistent order row with matching `user_id` and total amount ₹899.00.
- **Evidence:** `docs/migration/phase-03a/screenshots/06_order_confirmation.png`.

### 4.6 E2E-06 & E2E-07: Order History & Order Details (`/orders`, `/orders/[id]`)
- **Action:** Navigated to customer order listing `/orders` and drilled down into `/orders/[createdOrderId]`.
- **Observation:** Listing rendered order card with formatted creation timestamp, ₹899.00 amount, and `Pending` status badge. Detail view rendered visual progress tracker, item listing, delivery address snapshot, and action controls.
- **Assertion:** Order detail page displayed `ORDER STATUS: PENDING`, `Cancel Order` button, and order item breakdown.
- **Evidence:**
  - `docs/migration/phase-03a/screenshots/07_order_history_list.png`
  - `docs/migration/phase-03a/screenshots/08_order_detail_view.png`.

### 4.7 E2E-08: Order Cancellation & Inventory Restoration
- **Action:** Clicked `Cancel Order` button. Modal prompted for cancellation reason. Entered: *"Found a better edition for my study circle."* Confirmed cancellation.
- **Observation:** Stored procedure `cancel_order_atomic` executed:
  1. Validated caller identity (`auth.uid() = order.user_id`).
  2. Verified order status is pre-delivery (`Pending`).
  3. Restored 1 copy of book stock atomically (`books.stock` increased from 44 to 45).
  4. Updated `order_status` to `Cancelled`.
- **Assertion:** Page updated immediately to `ORDER STATUS: CANCELLED` with cancellation alert banner. Database verified `books.stock` restored by +1.
- **Evidence:** `docs/migration/phase-03a/screenshots/09_order_cancellation_confirmed.png`.

### 4.8 E2E-09 & E2E-10: 7-Day Replacement Workflow
- **Action:**
  1. Seeded a verified delivered order delivered 2 days ago (`delivered_at = NOW() - INTERVAL '2 days'`).
  2. Navigated to `/orders/[deliveredOrderId]`. Verified `Request Replacement` button was visible.
  3. Clicked button to open modal. Captured modal screenshot.
  4. Selected reason *"Damaged pages / binding"*, entered defect notes, and clicked `Submit Request`.
- **Observation:** Stored procedure `request_replacement_atomic` validated:
  - Caller identity match (`auth.uid() = p_user_id`).
  - Order status is `Delivered`.
  - Delivery timestamp is verified and within rolling 168-hour window (`2 days < 7 days`).
  - Order has not previously requested replacement.
  - Set `order_status = 'Replacement Requested'` and `replacement_status = 'Requested'`.
- **Assertion:** Order detail rendered prominent `Replacement Request Status` card showing `Requested` badge and customer description.
- **Evidence:**
  - `docs/migration/phase-03a/screenshots/10_replacement_modal.png`
  - `docs/migration/phase-03a/screenshots/11_replacement_requested_status.png`.

### 4.9 E2E-11: Admin Replacement Review & Approval
- **Action:** Cleared cookies, logged in as `admin.books@example.com` (`role = 'admin'`), and navigated to `/admin/orders/[deliveredOrderId]`. Clicked `Approve Replacement`.
- **Observation:** Server Action `approveAdminReplacement` verified admin credentials via `requireAdmin()`, executed forward transition to `Replacement Approved`, and wrote audit log entry.
- **Assertion:** Database confirmed `order_status = 'Replacement Approved'` and `replacement_status = 'Approved'`.
- **Evidence:** `docs/migration/phase-03a/screenshots/12_admin_replacement_review.png`.

### 4.10 E2E-12: Payments & Refunds Ledger
- **Action:** Cleared cookies, logged back in as Customer Alpha, and visited `/account/payments` and `/account/refunds`.
- **Observation:** Pages queried `payments` table and `orders` refund columns scoped strictly to authenticated customer ID.
- **Assertion:** Customer viewed truthful financial ledger without exposing other customers' transaction records.
- **Evidence:** `docs/migration/phase-03a/screenshots/13_customer_payments_refunds.png`.

### 4.11 E2E-13: Customer-to-Customer Isolation Barrier
- **Action:** Cleared cookies, logged in as Customer Beta (`customer.beta@example.com`), and attempted to navigate directly to Customer Alpha's order URL `/orders/[deliveredOrderId]`.
- **Observation:** Server Component invoked `getCustomerOrderById(id)` which enforces `.eq("user_id", user.id)`. Because the order belongs to Customer Alpha, the query returned `null`, triggering Next.js `notFound()`.
- **Assertion:** Customer Beta was presented with the `404 - Page Not Found` screen. Navigating to `/addresses` confirmed Customer Beta has 0 saved addresses, strictly isolating Customer Alpha's address records.
- **Evidence:** `docs/migration/phase-03a/screenshots/14_customer_isolation_boundary.png`.

### 4.12 E2E-14: Account Security & Password Recovery
- **Action:** Navigated to `/account/security`.
- **Observation:** Rendered password change interface, password strength criteria, and session controls.
- **Assertion:** Verified presence of account security headings, current password input, new password input, and confirm password fields.
- **Evidence:** `docs/migration/phase-03a/screenshots/15_password_recovery_and_security.png`.

---

## 5. Screenshot Evidence Catalog

All captured screenshots are stored under `docs/migration/phase-03a/screenshots/`:

| File Name | Size | Visual Description |
| :--- | :---: | :--- |
| `01_customer_login_success.png` | 49 KB | Customer profile view after authenticating via login form |
| `02_customer_profile_saved.png` | 49 KB | Profile updated with verified phone number and success alert |
| `03_address_management_list.png` | 64 KB | Saved address listing showing single `Default` badge enforcement |
| `04_address_add_modal.png` | 72 KB | Address entry modal with PIN code, address type, and default checkbox |
| `05_checkout_address_selector.png` | 89 KB | Multi-address selector during checkout with default pre-selection |
| `06_order_confirmation.png` | 48 KB | Order placement confirmation banner with generated order ID |
| `07_order_history_list.png` | 57 KB | Customer order history listing showing `Pending` order card |
| `08_order_detail_view.png` | 75 KB | Order detail view with tracking progress bar, item list, and Cancel button |
| `09_order_cancellation_confirmed.png` | 73 KB | Order detail reflecting `Cancelled` status with reason and stock restoration |
| `10_replacement_modal.png` | 60 KB | 7-day replacement modal with reason dropdown and defect description |
| `11_replacement_requested_status.png` | 68 KB | Order detail showing prominent `Replacement Request Status: Requested` card |
| `12_admin_replacement_review.png` | 113 KB | Administrative order view showing replacement moderation controls |
| `13_customer_payments_refunds.png` | 50 KB | Customer payments ledger displaying truthful transaction records |
| `14_customer_isolation_boundary.png` | 50 KB | Customer Beta encountering `404 Page Not Found` on Customer Alpha order |
| `15_password_recovery_and_security.png` | 64 KB | Account security page with password update form and guidance |

---

## 6. Conclusion

The Phase 03A browser E2E test suite confirms that the customer account, address management, checkout, order lifecycle, cancellation, 7-day replacement guarantee, and admin moderation workflows are fully functional in a real browser environment. All authorization barriers and database security rules operate as designed.

