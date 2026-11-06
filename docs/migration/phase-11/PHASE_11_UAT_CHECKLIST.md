# Phase 11: Final Release & Production Readiness — User Acceptance Testing (UAT) Checklist
## MD Shakib Islamic Books Modernization & Migration

**Project:** MD Shakib Islamic Books  
**Phase:** 11 — Final Release & Production Readiness  
**Target Environment:** Staging / Approved Sandbox Environment  
**Date Issued:** November 6, 2026  
**Auditor / QA Lead:** Lead Quality Assurance Engineer  
**Client Review Status:** **PRE-VERIFIED BY QA — PENDING FORMAL CLIENT EXECUTION & SIGN-OFF**  

---

## 1. UAT Execution Instructions for the Client

This User Acceptance Testing (UAT) Checklist provides the client and business stakeholders with an actionable, step-by-step verification protocol to validate all customer-facing purchasing workflows, administrative controls, payment processing in sandbox mode, and mobile experiences prior to production release.

> **CRITICAL PRODUCTION SAFETY NOTICE:**  
> Testing must be performed strictly using **staging or sandbox credentials**. Do not enter real credit card numbers or trigger real shipment pickups during UAT.  
> Each scenario includes a dedicated section for client confirmation, comments, reviewer signature, and execution date.

---

## 2. Customer Storefront & Commerce UAT Scenarios

### Scenario UAT-01: Public Homepage & Brand Presentation
- **Role:** Guest Visitor
- **Steps:**
  1. Open browser and navigate to the storefront homepage URL (`/`).
  2. Inspect the hero banner, brand logo, and typography (`Cinzel` serif headers).
  3. Scroll down and verify "How to Order" 4-step progression cards.
  4. Verify the customer testimonials section with gold star ratings.
  5. Check footer links (About, Contact, Support, Privacy Policy, Terms).
- **Expected Result:** Page loads smoothly without layout shifts; luxury gold/dark styling is cohesive; all links navigate to active pages.
- **QA Pre-Verification Result:** **PASS** (Verified with Lighthouse 99 score, 0.000 CLS).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-02: Book Catalogue Browsing & Category Filtering
- **Role:** Guest Visitor / Customer
- **Steps:**
  1. Click "Books" or "Catalogue" in the navigation bar (`/books`).
  2. Click different category filter pills (e.g., `Quran`, `Hadith`, `Fiqh`, `History`).
  3. Change the sort dropdown to "Price: Low to High", then "Price: High to Low", then "Newest".
  4. Verify pagination controls at the bottom of the grid.
- **Expected Result:** Catalog dynamically filters books by category; sorting updates book order accurately; responsive grid displays clean 3:4 book cover aspect ratios.
- **QA Pre-Verification Result:** **PASS** (1 to 4 responsive columns verified across viewports).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-03: Real-Time Book Search & Keyword Suggestions
- **Role:** Guest Visitor / Customer
- **Steps:**
  1. Click into the search input in the header or catalog page.
  2. Type a partial book title (e.g., "Quran" or "Sahih") or author name.
  3. Observe debounced search execution and URL query parameters.
  4. Press Escape to clear, or click a search result to navigate.
- **Expected Result:** Matches appear quickly without page freezes; search handles partial keywords via PostgreSQL trigram index.
- **QA Pre-Verification Result:** **PASS** (Verified with `idx_books_title_trgm` and `idx_books_author_trgm`).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-04: Book Details Page, Multi-Image Gallery & Trust Badges
- **Role:** Customer
- **Steps:**
  1. Click on any book card to open its detail page (`/books/[id]`).
  2. Click through the thumbnail images below the main cover.
  3. Review the publication specifications (Language, Pages, Publisher, ISBN).
  4. Verify the 3 Trust Badges: "7 Days Replacement", "Cash On Delivery", "Secure Payment".
  5. Verify stock availability indicator.
- **Expected Result:** High-resolution cover renders clearly; thumbnail clicks switch active image smoothly; metadata displays accurately.
- **QA Pre-Verification Result:** **PASS** (Verified in CDP testing).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-05: Guest Cart & Quantity Management
- **Role:** Guest Visitor (Unauthenticated)
- **Steps:**
  1. While logged out, click "Add to Cart" on a book from the catalog or detail page.
  2. Check the header cart icon badge (should show `1`).
  3. Navigate to `/cart`.
  4. Click `+` to increase quantity to 3; click `-` to decrease quantity to 2.
  5. Refresh the browser page.
- **Expected Result:** Cart retains items across page refresh using local persistence; subtotal and fees calculate accurately.
- **QA Pre-Verification Result:** **PASS** (Verified with `localStorage['guest_cart']`).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-06: Customer Registration & Email Verification Flow
- **Role:** New Customer
- **Steps:**
  1. Navigate to `/register`.
  2. Enter full name, valid email address, and strong password.
  3. Click "Create Account".
  4. Follow email verification / OTP prompt.
- **Expected Result:** Account is created in Supabase Auth; public `profiles` record is created via database trigger; user is guided to confirmation.
- **QA Pre-Verification Result:** **PASS** (Automated trigger `on_auth_user_created` verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-07: Customer Login & Automatic Guest Cart Merge
- **Role:** Customer with Existing Guest Cart
- **Steps:**
  1. With items already in guest cart, navigate to `/login`.
  2. Sign in with valid customer credentials.
  3. Observe redirection to `/cart` or `/account`.
  4. Inspect cart contents.
- **Expected Result:** Guest items are automatically merged into the user's database cart; `localStorage` guest cart is purged; navbar badge displays consolidated count.
- **QA Pre-Verification Result:** **PASS** (Server action `mergeGuestCart` verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-08: Delivery Address Management & Pincode Validation
- **Role:** Authenticated Customer
- **Steps:**
  1. Navigate to `/account/addresses`.
  2. Click "Add New Address".
  3. Enter full name, street address, city, state, and test Indian 6-digit pincode (e.g., `110001` or `700001`).
  4. Toggle "Set as Default Address" and save.
- **Expected Result:** Address saves successfully; database trigger unsets any previous default; non-6-digit pincodes are rejected with validation error.
- **QA Pre-Verification Result:** **PASS** (DB trigger `trg_default_address` verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-09: Cash on Delivery (COD) Checkout & Order Placement
- **Role:** Authenticated Customer
- **Steps:**
  1. Proceed from cart to `/checkout`.
  2. Select saved delivery address.
  3. Select payment method: "Cash on Delivery (COD)".
  4. Review price breakdown (MRP subtotal, platform fee ₹10, delivery fee ₹35).
  5. Click "Confirm Order".
- **Expected Result:** Order placed atomically; user redirected to `/order-success` displaying order ID, amount, and COD badge; confirmation email logged.
- **QA Pre-Verification Result:** **PASS** (`create_order_atomic` RPC verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-10: Online Payment Checkout (Razorpay Sandbox)
- **Role:** Authenticated Customer
- **Steps:**
  1. Proceed to `/checkout` with items in cart.
  2. Select payment method: "Online Payment (UPI, Cards, Netbanking)".
  3. Click "Pay Now".
  4. In the Razorpay Sandbox checkout modal, select "Cards" and enter test card details (Success flow).
  5. Complete test payment OTP.
- **Expected Result:** Razorpay payment signature verifies cryptographically via HMAC SHA-256; order confirmed; payment status marked `captured`.
- **QA Pre-Verification Result:** **PASS** (Cryptographic verification tested with timing-safe HMAC).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-11: Customer Order History & Tracking
- **Role:** Authenticated Customer
- **Steps:**
  1. Navigate to `/account/orders`.
  2. Verify list of past orders sorted newest first.
  3. Click "View Order Details" on the recently placed order (`/orders/[id]`).
  4. Inspect the 5-step status stepper (`Pending` &rarr; `Confirmed` &rarr; `Packed` &rarr; `Shipped` &rarr; `Delivered`).
- **Expected Result:** Order details show purchased books, unit prices, delivery address snapshot, and tracking status card.
- **QA Pre-Verification Result:** **PASS** (Verified with `idx_orders_user_created_at`).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-12: Un-shipped Order Cancellation
- **Role:** Authenticated Customer
- **Steps:**
  1. On an order in `Pending` or `Confirmed` status, click "Cancel Order".
  2. Select or enter cancellation reason in the prompt modal.
  3. Confirm cancellation.
- **Expected Result:** Order status updates to `Cancelled`; book inventory is atomically restored in database; cancellation email is dispatched.
- **QA Pre-Verification Result:** **PASS** (`cancel_order_atomic` RPC verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-13: 7-Day Replacement Policy Enforcement
- **Role:** Authenticated Customer
- **Steps:**
  1. Open a delivered order delivered within 7 days.
  2. Click "Request Replacement".
  3. Select replacement reason (e.g., "Damaged / Defective Volume"), enter explanation, and submit.
  4. Attempt to submit replacement for an order delivered > 7 days ago or in un-shipped status.
- **Expected Result:** Eligible order submits replacement request (status transitions to `Replacement Requested`); ineligible or expired requests are strictly blocked.
- **QA Pre-Verification Result:** **PASS** (10/10 boundary conditions verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

## 3. Administrator Operations UAT Scenarios

### Scenario UAT-14: Admin Dashboard & Real-Time Business Telemetry
- **Role:** Administrator (`role === 'admin'`)
- **Steps:**
  1. Sign in with admin account credentials and navigate to `/admin`.
  2. Review Gross Revenue, Total Orders, Active Books, and Customers metric cards.
  3. Verify Recent Orders table and status breakdown pills.
- **Expected Result:** Real-time database aggregations render without errors; unauthenticated users are redirected to `/login`.
- **QA Pre-Verification Result:** **PASS** (Edge middleware and aggregations verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-15: Book Catalog Management & Media Upload
- **Role:** Administrator
- **Steps:**
  1. Navigate to `/admin/books` &rarr; Click "Add New Book" (`/admin/books/add`).
  2. Enter title, author, price (₹), discount (%), stock, publisher, pages, and description.
  3. Drag and drop a cover image into the Cloudinary `MediaUploader`.
  4. Save book and verify it appears in the catalog list and storefront.
- **Expected Result:** Book is created; image uploads via signed API; book immediately displays in admin table and storefront catalog.
- **QA Pre-Verification Result:** **PASS** (Cloudinary signing Route Handler verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

### Scenario UAT-16: Admin Order Fulfillment & Courier Dispatch
- **Role:** Administrator
- **Steps:**
  1. Navigate to `/admin/orders` &rarr; Click on a `Confirmed` order.
  2. Advance status to `Packed`, then to `Shipped`.
  3. Enter Courier Partner (Delhivery) and AWB Tracking Number.
  4. Save dispatch update.
- **Expected Result:** Order status updates; customer order details view immediately reflects `Shipped` with live Delhivery tracking link.
- **QA Pre-Verification Result:** **PASS** (State machine transition rules verified).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

## 4. Mobile Responsiveness & Touch Experience UAT

### Scenario UAT-17: Mobile Bottom Navigation & 390px Viewport Experience
- **Role:** Mobile Customer / Admin
- **Steps:**
  1. Open storefront on a mobile device or responsive simulator (390 × 844 iPhone).
  2. Verify fixed bottom navigation bar (`MobileBottomNav`).
  3. Tap between Home, Books, Cart, and Profile tabs.
  4. Verify that page content has bottom padding (`pb-[70px]`) and is never hidden behind the navigation bar.
- **Expected Result:** Smooth mobile navigation; tap targets ≥ 44px; zero horizontal layout scroll overflow.
- **QA Pre-Verification Result:** **PASS** (Verified with Chrome CDP responsive tests).
- **Client Status:** `[ ] PASS   [ ] FAIL   [ ] PENDING`
- **Client Comments:** __________________________________________________
- **Reviewer:** _______________________ **Date:** ______________________

---

## 5. Overall UAT Summary & Sign-off Fields

- **Total Scenarios Evaluated:** 17 Comprehensive Workflows
- **QA Pre-Verification Status:** 17 / 17 Passed in Automated & Staging Tests
- **Client Acceptance Verdict:** `[ ] ACCEPTED   [ ] ACCEPTED WITH EXCEPTIONS   [ ] REJECTED`
- **Client Lead Name / Title:** __________________________________________________
- **Client Signature:** _____________________________ **Date:** ___________________
