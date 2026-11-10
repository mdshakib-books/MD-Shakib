# Phase 2: Core E-Commerce Gap Analysis & Remediation Report
## MD Shakib Islamic Books Modernization Project — Lean E-Commerce Completion

**Date:** November 10, 2026  
**Status:** All Gaps Fully Remediated & Verified  
**Scope:** Identification of Gaps, Root Causes, and Concrete Engineering Remediations

---

## 1. Overview

During the Phase 2 audit, the application was inspected to identify broken links, missing user journeys, or extraneous bloat that contradicted the **Lean E-Commerce** mandate. This report details the gaps identified, their root causes, and how they were resolved and tested.

---

## 2. Identified Gaps and Remediations

### Gap 1: Missing Customer Return Request Interface in Order Details
- **Description:**  
  While the database had schema support for `return_requests` and an atomic stored procedure (`initiate_return_refund_atomic`), customers viewing their delivered orders in `apps/web/app/orders/[id]/OrderDetailClient.tsx` had no UI mechanism to initiate a return or view return progress.
- **Root Cause:**  
  Backend logic had been prepared during foundation phases, but the customer-facing return modal had not been integrated into the App Router order detail view.
- **Remediation:**  
  1. Updated `apps/web/app/orders/[id]/page.tsx` to query the latest `return_requests` record for the order and pass `initialReturnRequest` to the client.
  2. Implemented the "Request Return / Refund" button in `OrderDetailClient.tsx`, conditionally rendered when:
     - Order status is `Delivered`.
     - Delivery timestamp is within the 7-day return policy window.
     - No active return request already exists.
  3. Created an accessible, responsive modal allowing the customer to:
     - Select Return for Refund or Replacement.
     - Choose specific items and quantities to return.
     - Select predefined return reasons (e.g. *Damaged in transit*, *Defective printing*, *Wrong item received*).
     - Add customer notes and photo links.
  4. Built a persistent **Return & Refund Status Card** displaying the return reference (`RET-YYYYMM-XXXXX`), status badge, admin review feedback, courier reverse AWB, and refund amount.
- **Verification:** Verified via automated assertions 32–38 in `scripts/test-phase02-lean-ecommerce.ts`.

---

### Gap 2: Extraneous Bulk Import/Export Clutter (Non-Lean Elements)
- **Description:**  
  Several admin pages contained non-lean enterprise bulk export/import controls:
  - `AdminBooksClient.tsx` had "Import CSV" and "Export CSV" buttons.
  - `AdminOrdersClient.tsx` had "Export CSV".
  - `AdminUsersClient.tsx` had "Export Customers".
  - `AdminReportsClient.tsx` had a large bulk export header bar.
  - `AdminNavClient.tsx` had an experimental "Support Desk" link.
- **Root Cause:**  
  Prototypes introduced non-essential enterprise features that increased maintenance surface area without serving the core e-commerce workflow.
- **Remediation:**  
  1. Removed bulk CSV import and export buttons from `AdminBooksClient.tsx`, `AdminOrdersClient.tsx`, and `AdminUsersClient.tsx`.
  2. Streamlined `AdminReportsClient.tsx` to focus cleanly on business summaries (Sales, Orders, Top Books, GST Summary) without clutter.
  3. Streamlined `AdminNavClient.tsx` to focus on core operations: **Dashboard, Orders, Delivery OTP, Returns, Reports, Books, Inventory, Categories, Customers, Discounts**.
- **Verification:** Verified clean compilation and zero UI regression.

---

### Gap 3: Verification of Delivery OTP Doorstep Invariants
- **Description:**  
  Ensuring delivery OTP generation, hash storage, and verification transitions conformed strictly to the delivery security model.
- **Root Cause:**  
  Doorstep verification requires decoupling merchant OTP verification from third-party courier proprietary OTPs while guaranteeing that zero plaintext OTPs reside in the database.
- **Remediation:**  
  1. Enforced CSPRNG 6-digit OTP generation in `lib/delivery/otp.ts`.
  2. Stored OTP exclusively as an HMAC-SHA256 digest with salt in `delivery_otps`.
  3. Enforced rate-limiting (max 5 failed attempts) and expiry (24-hour default).
  4. Verified that successful OTP verification authoritatively transitions the order status to `Delivered`.
- **Verification:** Verified in `test-phase02-lean-ecommerce.ts` assertions 20–24.

---

### Gap 4: Statutory GST Invoicing and Line-Item Snapshots
- **Description:**  
  Ensuring invoices adhere to Indian GST compliance: books are nil-rated (0% GST under HSN 4901), while courier charges are taxed at 18% GST (split into 9% CGST + 9% SGST for intra-Delhi or 18% IGST for interstate).
- **Root Cause:**  
  Financial records must remain immutable: future price updates in the book catalog must never alter historical invoice totals or tax amounts.
- **Remediation:**  
  1. `lib/commerce/tax.ts` dynamically resolves intra-state vs inter-state tax splits based on shipping address pincode/state.
  2. `lib/commerce/invoices.ts` serializes an immutable line-item snapshot into `order_invoices.items_snapshot`.
  3. Assigned sequential invoice numbering via `invoice_number_seq` (`INV-YYYYMM-XXXXX`).
- **Verification:** Verified in `test-phase02-lean-ecommerce.ts` assertions 25–31.

---

## 3. Summary of Remediations

| Identified Gap | Primary Area | Severity | Resolution Status |
| :--- | :--- | :---: | :---: |
| Customer Return Request Modal Missing | Customer Account / Orders | High | **Resolved & Verified** |
| Return Status Tracking on Order Page | Customer Account / Orders | Medium | **Resolved & Verified** |
| Non-Lean Bulk CSV Import/Export Buttons | Admin Catalogue & Orders | Medium | **Purged & Streamlined** |
| Admin Navigation Clutter | Admin Dashboard | Low | **Purged & Streamlined** |
| Zero-Plaintext Delivery OTP Proof | Logistics & Fulfillment | High | **Hardened & Verified** |
| GST Splitting & Sequential Invoicing | Accounting & Compliance | High | **Hardened & Verified** |

All identified gaps have been closed cleanly with full test coverage and no architectural regressions.
