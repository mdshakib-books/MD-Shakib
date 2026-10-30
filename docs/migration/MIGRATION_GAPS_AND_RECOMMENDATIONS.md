# Migration Gaps & Prioritized Recommendations
## MD Shakib Islamic Books — Remediation Backlog & Technical Runbook

> **Audit Date:** October 30, 2026  
> **Classification Standard:**  
> - **P0:** Critical Functionality / Security Failure (Blocks sales, checkout, or core purpose)  
> - **P1:** Major Business Functionality Missing (Severe feature gap or broken administrative flow)  
> - **P2:** Important Feature or UX Regression (Degrades user experience, styling, or navigation)  
> - **P3:** Minor Visual or Behavioral Inconsistency  
> - **P4:** Optional Enhancement (Future improvement not present in legacy baseline)

---

## 1. Prioritized Defect & Gap Backlog

### 1.1 [P0-COMMERCE-01] "Add to Cart" Disconnected / Non-Functional Across Entire Storefront
- **Module:** Public Storefront / Shopping Cart
- **Feature Name:** Book Add-to-Cart Action
- **Legacy Behavior:** Clicking "Add to Cart" on a book card or detail page immediately added the book to local storage (for guests) or dispatches `/api/v1/cart/add` (for logged-in customers), updating the cart count badge and showing a success toast.
- **New Stack Status:** **BROKEN / STUBBED OUT**.
- **Exact Missing Functionality:**  
  1. In `apps/web/components/commerce/BookCard.tsx`, the `onAddToCart` prop is accepted, but neither `apps/web/app/page.tsx` nor `apps/web/app/books/BooksCatalogClient.tsx` passes an `onAddToCart` callback.
  2. In `apps/web/app/books/[id]/BookDetailClient.tsx` (lines 29–34), `handleAddToCart` is a dummy function that only sets a 2-second timeout (`setAdded(true); setTimeout(...)`) without mutating cart state.
  3. The `addToCart` server action in `apps/web/lib/commerce/cart.ts` (line 164) is never invoked by any client component in the repository.
- **Legacy Source File:** `client/src/redux/slices/cartSlice.js` (lines 80–120), `client/src/pages/BookDetailsPage.jsx` (lines 50–70)
- **New Stack Relevant File:** `apps/web/app/books/[id]/BookDetailClient.tsx`, `apps/web/components/commerce/BookCard.tsx`, `apps/web/app/books/BooksCatalogClient.tsx`
- **User Impact:** No user can add books to the shopping cart.
- **Business Impact:** 100% loss of e-commerce conversions; orders cannot be created through natural customer flow.
- **Severity:** **P0 (BLOCKER)**
- **Recommended Resolution:**  
  1. Wire a client cart context or invoke `addToCart(bookId, quantity)` from `apps/web/lib/commerce/cart.ts` inside `BookDetailClient.tsx`.
  2. Implement an `onAddToCart` handler in `BooksCatalogClient.tsx` that calls `addToCart(book.id, 1)` and refreshes router state.
  3. If unauthenticated, prompt user to log in or save to temporary local storage cart.

---

### 1.2 [P0-ADMIN-01] Admin Book Creation, Editing, Stock Adjustment & Deletion Missing
- **Module:** Admin Operations / Catalog Management
- **Feature Name:** Book Inventory CRUD & Multi-Image Upload
- **Legacy Behavior:** Administrators could create new books with up to 5 Cloudinary images, edit book metadata, inline-adjust stock levels, set the primary cover image, delete individual images, and toggle soft-deletion from `/admin/books` and `/admin/books/add`.
- **New Stack Status:** **100% READ-ONLY / MUTATIONS OMITTED**.
- **Exact Missing Functionality:**  
  1. `apps/web/app/admin/books/page.tsx` contains only a read-only table with no "Add Book" button, no inline stock editor, no edit modal, and no delete action.
  2. `/admin/books/add` page does not exist.
  3. There are zero Server Actions or Route Handlers in `apps/web/` that perform `INSERT`, `UPDATE`, or `DELETE` on `public.books`.
- **Legacy Source File:** `client/src/pages/AdminBooksPage.jsx`, `client/src/pages/AdminAddBookPage.jsx`, `server/src/controllers/admin.controller.js` (lines 20–160)
- **New Stack Relevant File:** `apps/web/app/admin/books/page.tsx`, `apps/web/lib/admin/`
- **User Impact:** Administrators cannot manage bookstore inventory.
- **Business Impact:** Store cannot launch new book editions, adjust out-of-stock items, or update book pricing.
- **Severity:** **P0 (CRITICAL BUSINESS GAP)**
- **Recommended Resolution:**  
  1. Create Server Actions in `apps/web/lib/admin/books.ts`: `createBook`, `updateBook`, `updateBookStock`, `deleteBook`, `setCoverImage`.
  2. Connect the Cloudinary upload API (`/api/admin/media/upload`) to an Admin Add Book dialog/page.
  3. Add an "Edit Book" modal and inline stock changer in `apps/web/app/admin/books/page.tsx`.

---

### 1.3 [P1-COMMERCE-02] Guest Shopping Cart & Post-Login Cart Merging Omitted
- **Module:** Cart & Checkout
- **Feature Name:** LocalStorage Guest Cart & Account Merge
- **Legacy Behavior:** Guests could add items to cart without logging in (`localStorage.guest_cart`). When a guest logged in, `authSlice.js` sent `POST /api/v1/cart/merge` to sync guest items into their database cart.
- **New Stack Status:** **ELIMINATED / NOT MIGRATED**.
- **Exact Missing Functionality:**  
  1. `apps/web/app/cart/CartClient.tsx` (lines 47–67) displays a blocker wall ("Sign In to View Your Cart") for guests.
  2. No local storage cart synchronization exists.
  3. No post-login cart merging logic exists in `apps/web/lib/auth/actions.ts` or `cart.ts`.
- **Legacy Source File:** `client/src/redux/slices/cartSlice.js`, `server/src/routes/cart.routes.js:mergeCart`
- **New Stack Relevant File:** `apps/web/app/cart/CartClient.tsx`, `apps/web/lib/commerce/cart.ts`
- **User Impact:** First-time visitors cannot accumulate items before creating an account; cart items added before login are lost.
- **Business Impact:** Higher friction and checkout abandonment rate.
- **Severity:** **P1**
- **Recommended Resolution:** Implement a `useCart` client hook that persists guest items in `localStorage`, and runs a server action on login to upsert guest items into `public.cart_items`.

---

### 1.4 [P1-COMMERCE-03] Customer 7-Day Replacement Request Missing
- **Module:** Orders & Fulfillment
- **Feature Name:** Customer Order Replacement Workflow
- **Legacy Behavior:** In `OrderDetailsPage.jsx`, if an order was "Delivered" and less than 7 days had elapsed, a "Request Replacement" button was visible. Clicking opened a modal with reason input, submitting `POST /api/v1/orders/:id/replacement`.
- **New Stack Status:** **NOT MIGRATED IN CUSTOMER UI**.
- **Exact Missing Functionality:**  
  1. `apps/web/app/orders/[id]/OrderDetailClient.tsx` has no "Request Replacement" button or replacement modal.
  2. `apps/web/lib/commerce/orders.ts` has no `requestOrderReplacement` server action.
- **Legacy Source File:** `client/src/pages/OrderDetailsPage.jsx` (lines 116–132, 330–394), `server/src/controllers/order.controller.js:requestReplacement`
- **New Stack Relevant File:** `apps/web/app/orders/[id]/OrderDetailClient.tsx`, `apps/web/lib/commerce/orders.ts`
- **User Impact:** Customers who receive defective or damaged books cannot submit a replacement claim online.
- **Business Impact:** Increased customer support load and dispute escalations.
- **Severity:** **P1**
- **Recommended Resolution:** Add `requestOrderReplacement(orderId, reason)` in `apps/web/lib/commerce/orders.ts` and add the "Request Replacement" modal to `OrderDetailClient.tsx`.

---

### 1.5 [P1-ADMIN-02] Admin Customer Account Moderation Controls Missing
- **Module:** Admin Operations / Customer Accounts
- **Feature Name:** User Blocking, Unblocking, and Deletion
- **Legacy Behavior:** `AdminUsersPage.jsx` provided action buttons to view customer details, block users (`PATCH /api/v1/admin/users/:id/block`), unblock users, and delete accounts permanently with confirmation modals.
- **New Stack Status:** **READ-ONLY TABLE**.
- **Exact Missing Functionality:**  
  1. `apps/web/app/admin/users/page.tsx` renders a read-only table with no action column.
  2. No server actions exist for blocking/unblocking or soft-deleting profiles.
- **Legacy Source File:** `client/src/pages/AdminUsersPage.jsx` (lines 37–82), `server/src/controllers/admin.controller.js:blockUser`
- **New Stack Relevant File:** `apps/web/app/admin/users/page.tsx`
- **User Impact:** Admins cannot suspend abusive or fraudulent accounts.
- **Severity:** **P1**
- **Recommended Resolution:** Add an interactive client table with action dropdowns calling `toggleBlockUser(userId, isBlocked)` and `deleteUser(userId)` server actions.

---

### 1.6 [P1-UI-01] Global Navbar Auth and Cart Desynchronization
- **Module:** Navigation / Storefront Shell
- **Feature Name:** Global Navbar Session & Cart Reactive Badge
- **Legacy Behavior:** `Navbar.jsx` subscribed to Redux state (`auth.user` and `cart.items`), reactively displaying user profile dropdown or login CTA, and showing the live item count badge across all pages.
- **New Stack Status:** **PARTIALLY MIGRATED / DESYNCHRONIZED**.
- **Exact Missing Functionality:** `Navbar.tsx` receives `user` and `cartCount` as props, but in `apps/web/app/page.tsx`, `books/page.tsx`, `about/page.tsx`, `support/page.tsx`, `<Navbar />` is invoked with zero props. The navbar permanently displays "Sign In" and 0 cart badge.
- **New Stack Relevant File:** `apps/web/components/layout/Navbar.tsx`, `apps/web/app/page.tsx`, `apps/web/app/books/page.tsx`
- **Severity:** **P1**
- **Recommended Resolution:** Convert `Navbar` into a self-sufficient client component that fetches the session/cart via lightweight client listener, or pass server session and cart summary in root/nested layouts.

---

### 1.7 [P2-UI-01] Undefined Brand Gold CSS Variable
- **Module:** Design System / Styling
- **Feature Name:** Primary Gold CSS Token
- **Legacy Behavior:** Defined `--color-primary-gold: #c9a24a;` and `--color-accent-gold: #e5c87b;` in `@theme` in `client/src/index.css`.
- **New Stack Status:** **REGRESSED TOKEN CONFIGURATION**.
- **Exact Missing Functionality:** In `apps/web/app/globals.css`, the theme variables are named `--color-gold: #C9A24A;` and `--color-gold-accent: #E5C87B;`. However, 30+ components reference `var(--color-primary-gold)` without fallback, resulting in unset CSS variables for primary typography and button borders.
- **New Stack Relevant File:** `apps/web/app/globals.css`
- **Severity:** **P2**
- **Recommended Resolution:** Add `--color-primary-gold: #C9A24A;` and `--color-accent-gold: #E5C87B;` to `:root` and `@theme` in `apps/web/app/globals.css`.

---

### 1.8 [P2-UI-02] Mobile Bottom Navigation Bar Missing
- **Module:** Navigation / Mobile Experience
- **Feature Name:** Persistent Mobile Bottom Tab Bar
- **Legacy Behavior:** `MobileBottomNav.jsx` provided a fixed bottom bar with tabs for Home, Books, Cart, Orders, and Profile (or Admin Dashboard).
- **New Stack Status:** **COMPLETELY OMITTED**.
- **Exact Missing Functionality:** Component was not created in `apps/web/` and is not rendered in `app/layout.tsx`.
- **Legacy Source File:** `client/src/components/MobileBottomNav.jsx`
- **New Stack Relevant File:** `apps/web/app/layout.tsx`
- **Severity:** **P2**
- **Recommended Resolution:** Port `MobileBottomNav` as a client component and include it in `apps/web/app/layout.tsx`.

---

### 1.9 [P2-UI-03] About Page Severe Content Truncation (65% Omitted)
- **Module:** Public Storefront / Content Pages
- **Feature Name:** Brand Storytelling & Values
- **Legacy Behavior:** 254 lines featuring Hero, Metrics, Mission with DotLottie animation, Prophetic Hadith Quote, "Why Choose Us" (3 cards), "Our Values" (4 cards), Founder Message, and Journey CTA.
- **New Stack Status:** **TRUNCATED TO 79 LINES**.
- **Exact Missing Functionality:** 5 major sections (Quote, Why Choose Us, Values, Founder Message, Journey CTA) were cut.
- **Legacy Source File:** `client/src/pages/AboutPage.jsx`
- **New Stack Relevant File:** `apps/web/app/about/page.tsx`
- **Severity:** **P2**
- **Recommended Resolution:** Restore all 5 omitted content sections to `apps/web/app/about/page.tsx`.

---

### 1.10 [P2-UI-04] Homepage Missing "How to Order" Steps and "Reviews"
- **Module:** Public Storefront / Homepage
- **Feature Name:** Order Steps and Customer Testimonials
- **Legacy Behavior:** Rendered `<OrderSteps />` ("How To Order" with 4 step icons) and `<Reviews />` ("What Our Customers Say" with star ratings).
- **New Stack Status:** **OMITTED**.
- **Exact Missing Functionality:** Neither component exists in `apps/web/`.
- **Legacy Source File:** `client/src/components/home/OrderSteps.jsx`, `client/src/components/home/Reviews.jsx`
- **New Stack Relevant File:** `apps/web/app/page.tsx`
- **Severity:** **P2**
- **Recommended Resolution:** Port `OrderSteps.tsx` and `Reviews.tsx` and render them in `apps/web/app/page.tsx`.

---

### 1.11 [P2-SEC-01] Audit Logs Action CHECK Constraint & RLS Failure
- **Module:** Security & Audit Logging
- **Feature Name:** Administrative Audit Trail
- **Legacy Behavior:** Logged all admin mutations with user agent and changes into `AuditLog`.
- **New Stack Status:** **SILENT DATABASE RUNTIME FAILURE**.
- **Exact Missing Functionality:**  
  1. In `supabase/migrations/20261028000001_core_schema.sql`, `audit_logs.action` has constraint `CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'SOFT_DELETE', 'RESTORE', 'LOGIN', 'LOGOUT', 'PAYMENT'))`.
  2. `apps/web/lib/admin/orders.ts` inserts `UPDATE_ORDER_STATUS`, `ADMIN_CANCEL_ORDER`, `APPROVE_REPLACEMENT`, and `REJECT_REPLACEMENT`. These violate the check constraint.
  3. `public.audit_logs` has no RLS insert policy for authenticated users, and the service uses client-scoped `createClient()` rather than `createAdminClient()`.
- **New Stack Relevant File:** `apps/web/lib/admin/orders.ts` (lines 291, 379, 447, 500), `supabase/migrations/20261028000001_core_schema.sql`
- **Severity:** **P2 (SECURITY & COMPLIANCE)**
- **Recommended Resolution:** Use `createAdminClient()` for writing audit logs, and either update the table CHECK constraint to include order actions or map the action to `'UPDATE'`.

---

### 1.12 [P2-COMMERCE-04] Customer Address Editing Missing
- **Module:** Customer Addresses
- **Feature Name:** Edit Existing Address
- **Legacy Behavior:** `AddressCard.jsx` had an "Edit" button opening `AddressForm.jsx` in edit mode to modify phone, house number, area, or landmark.
- **New Stack Status:** **MISSING EDIT CAPABILITY**.
- **Exact Missing Functionality:** `apps/web/lib/commerce/addresses.ts` has no `updateAddress` function; `AddressesClient.tsx` only supports create and delete.
- **Severity:** **P2**
- **Recommended Resolution:** Add `updateAddress(addressId, formData)` server action and edit modal in `AddressesClient.tsx`.

---

### 1.13 [P2-AUTH-01] Authenticated User Change Password Missing
- **Module:** Customer Profile / Security
- **Feature Name:** In-App Password Change
- **Legacy Behavior:** Logged-in users could update their password from their profile by verifying their `oldPassword`.
- **New Stack Status:** **MISSING IN PROFILE**.
- **Exact Missing Functionality:** `ProfileClient.tsx` only updates name and phone. No password change panel exists.
- **Severity:** **P2**
- **Recommended Resolution:** Add `changeCustomerPassword(oldPassword, newPassword)` server action and collapsible password panel in `ProfileClient.tsx`.

---

### 1.14 [P2-ADMIN-03] Admin Profile Page Missing
- **Module:** Admin Operations
- **Feature Name:** Dedicated Admin Profile
- **Legacy Behavior:** Accessible at `/admin/profile` inside `AdminLayout` to manage administrator credentials and details.
- **New Stack Status:** **MISSING ROUTE**.
- **Exact Missing Functionality:** Route `/admin/profile` does not exist in `apps/web/app/admin/`.
- **Severity:** **P2**
- **Recommended Resolution:** Add `apps/web/app/admin/profile/page.tsx` with admin profile and password management.

---

### 1.15 [P3-UI-05] Missing Toast Notification System
- **Module:** UI / Feedback
- **Feature Name:** Global Toast Feedback
- **Legacy Behavior:** `ToastContext.jsx` provided `useToast()` (`addToast(message, type)`) with animated slide-up toasts for cart additions, order updates, errors, and logins.
- **New Stack Status:** **MISSING**.
- **Exact Missing Functionality:** No toast provider exists in `apps/web/`. Components fall back to raw browser alerts or inline messages.
- **Severity:** **P3**
- **Recommended Resolution:** Add a toast provider (e.g. Sonner or custom React toast) to `app/layout.tsx`.

---

## 2. Summary Priority Matrix

| Priority | Count | Description | Primary Action |
|---|---:|---|---|
| **P0** | 2 | Storefront Add-to-Cart failure & Admin Book Management absence | Fix `BookDetailClient` / `BookCard` cart wiring; implement Admin Book mutations. |
| **P1** | 4 | Guest cart, replacement workflow, user moderation, navbar session sync | Implement guest cart & merge; add customer replacement UI; add admin moderation actions; fix navbar session props. |
| **P2** | 8 | CSS brand token, mobile nav, About page content, home sections, audit logs, address edit, password change, admin profile | Add CSS variables to `:root`; port `MobileBottomNav`; restore About and Home sections; fix audit log inserts; add address/password edit. |
| **P3** | 1 | Toast feedback system | Install/configure global toast provider. |
| **TOTAL** | **15** | Identified Parity Gaps | |

