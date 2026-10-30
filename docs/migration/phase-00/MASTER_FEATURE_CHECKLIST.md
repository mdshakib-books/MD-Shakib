# Master Feature Checklist: Complete Legacy Parity
## MD Shakib Islamic Books — Feature-by-Feature Parity Tracker

> **Phase:** Phase 00 — Baseline & Audit Freeze  
> **Status Convention:**  
> - `[x]` = **FULLY MIGRATED** (19 features) or **REPLACED** (2 features) [Implementation Parity: 21 / 44 (47.7%)]  
> - `[ ]` = **PARTIALLY MIGRATED** (11 features), **NOT MIGRATED** (9 features), or **REGRESSED** (3 features) [Pending Remediation: 23 / 44 (52.3%)]  
> **Total Features:** 44 | **Implementation Parity:** 21 (47.7%) | **Pending Remediation:** 23 (52.3%)  
> **Verification Coverage Note:** 15 features verified via T1 code + T2 integration scripts; 4 features verified via T1 code only. 0 features verified at T4 (Browser E2E) or T5 (Production).

---

## Module 1: Public Storefront (FEAT-01 to FEAT-08)

### - [ ] FEAT-01: Homepage Sections (Hero, Trust, Featured, OrderSteps, Reviews)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/pages/HomePage.jsx`, `client/src/components/home/HeroSection.jsx`, `client/src/components/home/TrustIndicators.jsx`, `client/src/components/home/OrderSteps.jsx`, `client/src/components/home/Reviews.jsx`
- **New Location:** `apps/web/app/page.tsx`, `apps/web/components/layout/HeroSection.tsx`
- **Target Phase:** Phase 05 (Frontend & Content Parity)
- **Checklist:**
  - [x] Hero section renders with high-resolution bookstore image and CTA buttons.
  - [x] Trust indicators bar renders 4 value propositions.
  - [x] Featured books section queries active books with highest discounts.
  - [ ] Port `<OrderSteps />` ("How to Order") with 4 numbered steps and Islamic icons.
  - [ ] Port `<Reviews />` ("What Our Customers Say") with testimonial cards and star ratings.
  - [ ] Implement smooth horizontal carousel on mobile/desktop for featured collection.

---

### - [x] FEAT-02: Book Catalog & Listing Page (`/books`)
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/BooksPage.jsx`, `client/src/components/ProductGrid.jsx`, `client/src/hooks/useBooks.js`
- **New Location:** `apps/web/app/books/page.tsx`, `apps/web/app/books/BooksCatalogClient.tsx`, `apps/web/components/commerce/ProductGrid.tsx`
- **Target Phase:** Fully Migrated (Maintained in Phase 05)
- **Checklist:**
  - [x] Server Component fetches paginated books from Supabase with `pageSize = 8`.
  - [x] Category filtering via URL search params (`category`).
  - [x] Sorting options supported: `price_asc`, `price_desc`, `newest`, `title_asc`.
  - [x] Responsive product grid (1 col mobile, 2 col tablet, 3-4 col desktop).
  - [x] Pagination controls with active page indicator and scroll to top.

---

### - [x] FEAT-03: Category Tabs & Filtering
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/components/CategoryTabs.jsx`, `client/src/components/home/CategoryTabs.jsx`
- **New Location:** `apps/web/components/commerce/ProductGrid.tsx`, `apps/web/app/books/BooksCatalogClient.tsx`
- **Target Phase:** Fully Migrated (Maintained in Phase 05)
- **Checklist:**
  - [x] Standard categories supported: `Quran`, `Hadith`, `Fiqh`, `History`, `Biography`, `Other`.
  - [x] Active category pill highlighted with gold border/background.
  - [x] Horizontal scrollbar hidden on mobile devices with smooth swipe navigation.
  - [x] Clicking category resets pagination to Page 1 and updates URL without full page reload.

---

### - [x] FEAT-04: Search Bar with Debounce & URL Synchronization
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/components/SearchBar.jsx`, `server/src/controllers/book.controller.js:searchBooks`
- **New Location:** `apps/web/components/ui/SearchBar.tsx`, `apps/web/lib/data/catalog.ts:getBooks`
- **Target Phase:** Fully Migrated (Maintained in Phase 05)
- **Checklist:**
  - [x] Search input with luxury dark styling and magnifying glass icon.
  - [x] Debounces user input by 300ms before pushing `search` parameter to URL.
  - [x] Server queries PostgreSQL `books` table using case-insensitive `ILIKE` on `title` and `author`.
  - [x] Wildcard characters (`%`, `_`) escaped to prevent search injection.
  - [x] Clear search button restores full catalog.

---

### - [ ] FEAT-05: Book Detail Page (`/books/:id`)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/pages/BookDetailsPage.jsx`, `server/src/controllers/book.controller.js:getBookById`
- **New Location:** `apps/web/app/books/[id]/page.tsx`, `apps/web/app/books/[id]/BookDetailClient.tsx`, `apps/web/lib/data/catalog.ts:getBookById`
- **Target Phase:** Phase 01 (Add to Cart Action) & Phase 05 (UI Polish)
- **Checklist:**
  - [x] Displays primary cover image, book title, author, price, and discount percentage.
  - [x] Clickable multi-image thumbnail strip updates active preview image.
  - [x] Renders publication metadata: language, publisher, pages, ISBN, publication date.
  - [x] Displays related books in the same category.
  - [ ] Connect "Add to Cart" button to functional cart store and server action (currently a 2s timer stub).
  - [ ] Quantity selector input (1 to 5 units) before adding to cart.
  - [ ] Out-of-stock badge and button disabling when `stock <= 0`.

---

### - [ ] FEAT-06: About Us Page (`/about`)
- **Status:** **REGRESSED**
- **Legacy Location:** `client/src/pages/AboutPage.jsx` (254 lines)
- **New Location:** `apps/web/app/about/page.tsx` (79 lines)
- **Target Phase:** Phase 05 (Frontend & Content Parity)
- **Checklist:**
  - [x] Hero header with title and introductory mission paragraph.
  - [x] Stats counter badges (Titles, Happy Readers, Delivery Pincodes).
  - [ ] Restore Islamic Quranic quote section with luxury gold calligraphy styling.
  - [ ] Restore "Why Choose Us" section with 3 feature cards (Authenticity, Rapid Shipping, Dedicated Support).
  - [ ] Restore "Our Core Values" section with 4 value cards (Integrity, Preservation, Accessibility, Community).
  - [ ] Restore founder message and dedication statement.
  - [ ] Replace static text emoji with luxury animated SVG or smooth motion graphic.

---

### - [ ] FEAT-07: Support & FAQ Page (`/support`)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/pages/SupportPage.jsx` (159 lines)
- **New Location:** `apps/web/app/support/page.tsx` (126 lines)
- **Target Phase:** Phase 05 (Frontend & Content Parity)
- **Checklist:**
  - [x] Interactive FAQ accordion with expand/collapse state.
  - [x] Direct contact card with email (`mailto:`) and telephone (`tel:`) links.
  - [ ] Restore all 8 original FAQ categories (currently reduced to 5).
  - [ ] Restore all 8 original FAQ questions and authoritative answers (currently only 4).
  - [ ] Restore category sidebar navigation on desktop layouts.

---

### - [x] FEAT-08: 404 Not Found Page
- **Status:** **REPLACED (Architectural Upgrade)**
- **Legacy Location:** `client/src/pages/NotFoundPage.jsx`, `client/src/pages/NotFound.jsx`
- **New Location:** `apps/web/app/not-found.tsx`
- **Target Phase:** Fully Migrated (Replaced)
- **Checklist:**
  - [x] Replaced legacy non-standard blue/white styling with luxury dark bookstore theme.
  - [x] Displays 404 error code in gold serif typography.
  - [x] Provides helpful guidance text and "Return to Bookstore" CTA button.

---

## Module 2: Cart & Checkout (FEAT-09 to FEAT-15)

### - [ ] FEAT-09: Guest Shopping Cart (localStorage Persistence)
- **Status:** **NOT MIGRATED**
- **Legacy Location:** `client/src/redux/slices/cartSlice.js` (`guest_cart` in localStorage)
- **New Location:** `apps/web/app/cart/CartClient.tsx` (lines 47–67)
- **Target Phase:** Phase 01 (Critical Functional Restoration)
- **Checklist:**
  - [ ] Implement client-side `GuestCartStore` backed by `localStorage`.
  - [ ] Allow unauthenticated visitors to add books to cart without login wall.
  - [ ] Display guest items, item quantities, and subtotal on `/cart`.
  - [ ] Retain guest cart across page reloads and browser restarts.
  - [ ] Enforce max 5 units per item in guest cart.

---

### - [ ] FEAT-10: Storefront "Add to Cart" Action (BookCard & Details)
- **Status:** **NOT MIGRATED (CRITICAL DEFECT)**
- **Legacy Location:** `client/src/components/BookCard.jsx:handleCartClick`, `client/src/pages/BookDetailsPage.jsx:handleAddToCart`
- **New Location:** `apps/web/components/commerce/BookCard.tsx`, `apps/web/app/books/[id]/BookDetailClient.tsx`
- **Target Phase:** Phase 01 (Critical Functional Restoration)
- **Checklist:**
  - [ ] Pass operational `onAddToCart` callback in `apps/web/app/page.tsx` and `BooksCatalogClient.tsx`.
  - [ ] Replace timer stub in `BookDetailClient.tsx` with call to `addToCart(bookId, quantity)`.
  - [ ] Show immediate feedback (loading spinner on button, followed by success state).
  - [ ] Increment cart badge count in global navbar immediately upon adding.
  - [ ] Dispatch success toast notification with book title and view cart action.

---

### - [ ] FEAT-11: Authenticated Cart Synchronization (`/cart`)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/pages/CartPage.jsx`, `client/src/redux/slices/cartSlice.js`, `server/src/controllers/cart.controller.js:getCart`
- **New Location:** `apps/web/app/cart/page.tsx`, `apps/web/app/cart/CartClient.tsx`, `apps/web/lib/commerce/cart.ts:getCart`
- **Target Phase:** Phase 01 (Critical Functional Restoration)
- **Checklist:**
  - [x] Server Component queries `carts` and joins `cart_items` with `books`.
  - [x] Calculates subtotal, estimated shipping (free over ₹500, else ₹50), and total.
  - [ ] Handle unauthenticated state gracefully by rendering guest cart rather than blocking.
  - [ ] Validate book stock availability on cart load; flag items with insufficient stock.
  - [ ] Empty state renders luxury illustration with "Continue Shopping" CTA.

---

### - [x] FEAT-12: Cart Item Quantity Modification & Removal
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/components/CartItem.jsx`, `server/src/controllers/cart.controller.js:updateCartItem` & `removeCartItem`
- **New Location:** `apps/web/app/cart/CartClient.tsx`, `apps/web/lib/commerce/cart.ts:updateCartItem` & `removeCartItem`
- **Target Phase:** Fully Migrated (Maintained in Phase 01)
- **Checklist:**
  - [x] Quantity increment/decrement buttons with optimistic UI updates.
  - [x] Prevents decrement below 1; prompts for removal when decrementing at 1.
  - [x] Prevents increment beyond available stock or 5 units max limit.
  - [x] Delete button invokes `removeCartItem` with confirmation prompt.
  - [x] Revalidates `/cart` and refreshes totals automatically.

---

### - [ ] FEAT-13: Guest Cart Merge on Authentication
- **Status:** **NOT MIGRATED**
- **Legacy Location:** `server/src/controllers/cart.controller.js:mergeCart`, `client/src/redux/slices/cartSlice.js`
- **New Location:** `apps/web/lib/commerce/cart.ts` (Missing `mergeGuestCart`)
- **Target Phase:** Phase 03 (Customer Account & Commerce)
- **Checklist:**
  - [ ] Implement `mergeGuestCart(guestItems)` Server Action.
  - [ ] When guest logs in or registers, read `localStorage` guest cart.
  - [ ] For each guest item: if already in DB cart, add quantities (capped at 5 and stock); if not in DB cart, insert item.
  - [ ] Clear `localStorage` guest cart upon successful merge.
  - [ ] Show toast notification informing user that guest items were added to their account cart.

---

### - [x] FEAT-14: Order Checkout & Cash on Delivery (COD) Placement
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/CheckoutPage.jsx`, `server/src/controllers/order.controller.js:createOrder`
- **New Location:** `apps/web/app/checkout/page.tsx`, `apps/web/app/checkout/CheckoutClient.tsx`, `apps/web/lib/commerce/orders.ts:placeOrderCOD`
- **Target Phase:** Fully Migrated (Maintained in Phase 03)
- **Checklist:**
  - [x] Checkout screen displays selected delivery address and order items summary.
  - [x] Payment method selection: "Cash on Delivery (COD)" vs "Pay Online (Razorpay)".
  - [x] COD order invokes `create_order_atomic` stored procedure with row-level locking (`FOR UPDATE`).
  - [x] Atomically validates stock, decrements inventory, creates order, and snapshots address.
  - [x] Purges customer cart and redirects to `/order-success?orderId=...`.

---

### - [x] FEAT-15: Online Payment Intent & Razorpay Checkout Flow
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/services/paymentService.js`, `server/src/controllers/payment.controller.js:createOnlinePaymentIntent`
- **New Location:** `apps/web/app/checkout/CheckoutClient.tsx`, `apps/web/app/api/payments/create-order/route.ts`, `apps/web/app/api/payments/verify/route.ts`
- **Target Phase:** Fully Migrated (Maintained in Phase 09 QA)
- **Checklist:**
  - [x] Generates Razorpay order via Route Handler using authoritative DB book pricing (prevents client price tampering).
  - [x] Dynamically mounts Razorpay Checkout modal with order ID, prefilled customer details, and brand styling.
  - [x] On modal payment success, sends `razorpay_order_id`, `payment_id`, and `signature` to `/api/payments/verify`.
  - [x] Verifies HMAC SHA-256 signature and executes `settle_payment_atomic` procedure.
  - [x] Redirects to `/order-success` on successful verification.

---

## Module 3: Customer Account & Authentication (FEAT-16 to FEAT-22)

### - [x] FEAT-16: Customer Registration & Email Verification
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/RegisterPage.jsx`, `client/src/pages/VerifyRegistrationOTPPage.jsx`, `server/src/controllers/user.controller.js:registerUser`
- **New Location:** `apps/web/app/register/page.tsx`, `apps/web/app/verify-email/page.tsx`, `apps/web/lib/auth/actions.ts:signUpCustomer`
- **Target Phase:** Fully Migrated (Maintained in Phase 03)
- **Checklist:**
  - [x] Registration form with Name, Email, Password, and Confirm Password fields.
  - [x] Client and server-side validation (email regex, password length >= 6).
  - [x] Creates Supabase Auth user; trigger `on_auth_user_created` creates `public.profiles` record.
  - [x] Sends verification email via Resend or Supabase Auth.
  - [x] Email verification page handles verification token and activates customer session.

---

### - [x] FEAT-17: Customer Login & Session Management
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/LoginPage.jsx`, `server/src/controllers/user.controller.js:loginUser`
- **New Location:** `apps/web/app/login/page.tsx`, `apps/web/lib/auth/actions.ts:loginCustomer`, `apps/web/middleware.ts`
- **Target Phase:** Fully Migrated (Maintained in Phase 03)
- **Checklist:**
  - [x] Login form with Email and Password inputs and luxury dark styling.
  - [x] Authenticates against Supabase GoTrue; sets secure HTTP-only cookies via `@supabase/ssr`.
  - [x] Redirects to intended destination via sanitized `redirect` URL parameter.
  - [x] Blocks suspended accounts (`is_blocked = true`) or soft-deleted accounts (`is_deleted = true`).
  - [x] Middleware protects `/checkout`, `/orders`, `/profile`, `/addresses`, and `/admin`.

---

### - [x] FEAT-18: Password Reset Flow (Forgot Password & Reset)
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/ForgotPasswordPage.jsx`, `client/src/pages/ResetPasswordPage.jsx`, `client/src/pages/VerifyOTPPage.jsx`
- **New Location:** `apps/web/app/forgot-password/page.tsx`, `apps/web/app/reset-password/page.tsx`, `apps/web/app/verify-otp/page.tsx`
- **Target Phase:** Fully Migrated (Maintained in Phase 03)
- **Checklist:**
  - [x] Forgot password screen requests registered email.
  - [x] Sends password recovery instructions/token to email (anti-enumeration protected).
  - [x] Reset password screen accepts new password and confirmation with length validation.
  - [x] Updates Supabase Auth password and redirects to login with success banner.

---

### - [ ] FEAT-19: Customer Profile Management (`/profile`)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/pages/ProfilePage.jsx`, `server/src/controllers/user.controller.js:getProfile` & `updateProfile`
- **New Location:** `apps/web/app/profile/page.tsx`, `apps/web/app/profile/ProfileClient.tsx`, `apps/web/lib/auth/actions.ts:updateCustomerProfile`
- **Target Phase:** Phase 03 (Customer Account & Commerce)
- **Checklist:**
  - [x] Renders customer account information: Name, Email, Phone, Account Role, Join Date.
  - [x] Editable profile form to update Name and Contact Phone.
  - [x] Quick link cards to Orders, Addresses, and Support.
  - [ ] Add account soft-deletion option (`DELETE /api/v1/users/account` parity).
  - [ ] Display account stats (total orders placed, active orders count).

---

### - [ ] FEAT-20: Customer Password Change
- **Status:** **NOT MIGRATED**
- **Legacy Location:** `client/src/pages/ProfilePage.jsx` (Change Password tab), `server/src/controllers/user.controller.js:changePassword`
- **New Location:** `apps/web/app/profile/ProfileClient.tsx` (Missing change password UI)
- **Target Phase:** Phase 03 (Customer Account & Commerce)
- **Checklist:**
  - [ ] Implement `changeCustomerPassword(currentPassword, newPassword)` Server Action.
  - [ ] Verify existing password before applying change.
  - [ ] Enforce minimum 6 characters and password confirmation match.
  - [ ] Add "Security & Password" tab to `ProfileClient.tsx`.
  - [ ] Display toast notification upon successful password change.

---

### - [ ] FEAT-21: Customer Address Management (List, Add, Edit, Delete, Default)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/pages/AddressesPage.jsx`, `client/src/components/AddressForm.jsx`, `server/src/controllers/address.controller.js`
- **New Location:** `apps/web/app/addresses/page.tsx`, `apps/web/app/addresses/AddressesClient.tsx`, `apps/web/lib/commerce/addresses.ts`
- **Target Phase:** Phase 03 (Customer Account & Commerce)
- **Checklist:**
  - [x] Lists all saved customer addresses with "Default" badge indicator.
  - [x] Modal form to add a new delivery address with 6-digit Indian PIN code validation.
  - [x] "Set as Default" button invokes trigger `trg_default_address` to unset other defaults.
  - [x] Delete button removes address with confirmation dialog.
  - [ ] Implement `updateAddress(addressId, formData)` Server Action (currently missing).
  - [ ] Add "Edit Address" modal button and prefilled form to `AddressesClient.tsx`.

---

### - [x] FEAT-22: Delivery Address Selection at Checkout
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/CheckoutPage.jsx`, `client/src/components/AddressSelector.jsx`
- **New Location:** `apps/web/app/checkout/CheckoutClient.tsx`
- **Target Phase:** Fully Migrated (Maintained in Phase 03)
- **Checklist:**
  - [x] Displays radio list of customer's saved addresses at checkout.
  - [x] Auto-selects the customer's default address on mount.
  - [x] Allows switching delivery address with instant UI update.
  - [x] Provides inline "+ Add New Address" button without abandoning checkout.
  - [x] Disables checkout submit button if no address is selected.

---

## Module 4: Orders & Fulfillment (FEAT-23 to FEAT-27)

### - [x] FEAT-23: Customer Order History Page (`/orders`)
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/OrdersPage.jsx`, `client/src/components/OrderCard.jsx`, `server/src/controllers/order.controller.js:getMyOrders`
- **New Location:** `apps/web/app/orders/page.tsx`, `apps/web/lib/commerce/orders.ts:getUserOrders`
- **Target Phase:** Fully Migrated (Maintained in Phase 03)
- **Checklist:**
  - [x] Lists all past customer orders sorted by `created_at DESC`.
  - [x] Displays order ID, order date, total amount, payment method, and status badge.
  - [x] Thumbnails of books included in each order.
  - [x] Direct "View Order Details" link to `/orders/[id]`.
  - [x] Empty state when customer has placed no orders.

---

### - [ ] FEAT-24: Order Details & Status Tracking (`/orders/:id`)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/pages/OrderDetailsPage.jsx`, `client/src/components/OrderTrackingTimeline.jsx`
- **New Location:** `apps/web/app/orders/[id]/page.tsx`, `apps/web/app/orders/[id]/OrderDetailClient.tsx`
- **Target Phase:** Phase 03 (Customer Account & Commerce) & Phase 06 (UI Polish)
- **Checklist:**
  - [x] Displays complete order item breakdown with quantity, unit price, and subtotal.
  - [x] Displays shipping address snapshot captured at order placement time.
  - [x] Displays payment status (`Pending`, `Paid`, `Failed`, `Refunded`) and method.
  - [x] Vertical status progress timeline (Pending -> Confirmed -> Packed -> Shipped -> Delivered).
  - [ ] Display live Delhivery AWB tracking number and direct tracking link when available.
  - [ ] Show cancellation note or rejection reason when order is Cancelled or Rejected.

---

### - [ ] FEAT-25: Real-time Order Tracking Updates (Socket.io vs Supabase Realtime)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/hooks/useSocket.js`, `server/src/sockets/order.socket.js`
- **New Location:** `apps/web/app/orders/[id]/OrderDetailClient.tsx`
- **Target Phase:** Phase 03 (Customer Account & Commerce)
- **Checklist:**
  - [x] Target architecture replaces WebSocket server (Socket.io) with Supabase Realtime.
  - [ ] Connect `OrderDetailClient.tsx` to Supabase Realtime postgres changes channel on `orders`.
  - [ ] Automatically update status timeline when status changes in database without page reload.
  - [ ] Show toast notification when admin updates order to "Shipped" or "Out for Delivery".

---

### - [x] FEAT-26: Customer Order Cancellation
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/OrderDetailsPage.jsx:handleCancel`, `server/src/controllers/order.controller.js:cancelOrder`
- **New Location:** `apps/web/app/orders/[id]/OrderDetailClient.tsx:handleCancel`, `apps/web/lib/commerce/orders.ts:cancelUserOrder`
- **Target Phase:** Fully Migrated (Modal Polish in Phase 07)
- **Checklist:**
  - [x] "Cancel Order" button visible only for un-shipped orders (`Pending` or `Confirmed`).
  - [x] Invokes `cancel_order_atomic` stored procedure with row-level locking.
  - [x] Restores book inventory automatically in PostgreSQL.
  - [x] If paid via Razorpay, updates status to `Refund Pending` and records refund intent.
  - [ ] Replace native browser `prompt()` with a custom luxury confirmation modal.

---

### - [ ] FEAT-27: Customer Replacement Request Workflow (7-Day Window)
- **Status:** **NOT MIGRATED (CRITICAL DEFECT)**
- **Legacy Location:** `server/src/controllers/order.controller.js:requestReplacement`, `client/src/pages/OrderDetailsPage.jsx`
- **New Location:** `apps/web/app/orders/[id]/OrderDetailClient.tsx` (Missing replacement request action)
- **Target Phase:** Phase 03 (Customer Account & Commerce)
- **Checklist:**
  - [ ] Implement `requestOrderReplacement(orderId, reason, description)` Server Action in `orders.ts`.
  - [ ] Verify that order status is `Delivered` and current time is within 7 days of `delivered_at`.
  - [ ] Display "Request Replacement" button on `OrderDetailClient.tsx` when eligible.
  - [ ] Modal dialog to capture replacement reason (Damaged, Defective, Wrong Item) and description.
  - [ ] Transition order status to `Replacement Requested` and alert admin dashboard.

---

## Module 5: Admin Operations (FEAT-28 to FEAT-35)

### - [x] FEAT-28: Admin Authentication & RBAC Route Protection
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `server/src/middlewares/role.middleware.js:isAdmin`, `client/src/components/ProtectedRoute.jsx`
- **New Location:** `apps/web/middleware.ts`, `apps/web/lib/admin/auth.ts:requireAdmin`
- **Target Phase:** Fully Migrated (Maintained in Phase 02)
- **Checklist:**
  - [x] Edge middleware checks user session and role claim on all `/admin/*` routes.
  - [x] `requireAdmin()` helper verifies active admin profile (`role = 'admin'`, `is_blocked = false`, `is_deleted = false`).
  - [x] Redirects unauthorized users to `/login` or returns 403 Forbidden.
  - [x] Database RLS function `public.is_admin()` enforces row-level security on tables.

---

### - [x] FEAT-29: Admin Dashboard & Analytics Metrics (`/admin`)
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/AdminDashboardPage.jsx`, `server/src/controllers/admin.controller.js:getDashboardStats`
- **New Location:** `apps/web/app/admin/page.tsx`, `apps/web/lib/admin/dashboard.ts`
- **Target Phase:** Fully Migrated (Maintained in Phase 02)
- **Checklist:**
  - [x] Metric summary cards: Total Revenue, Total Orders, Active Catalog Titles, Total Customers.
  - [x] Weekly sales trends chart showing revenue over the past 7 days.
  - [x] Recent orders table with customer name, amount, date, and status pills.
  - [x] Stock warning badges for books with inventory <= 5 units.
  - [x] Operational action items summary (pending orders, replacement requests awaiting review).

---

### - [x] FEAT-30: Admin Order Management & Filtering (`/admin/orders`)
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `client/src/pages/AdminOrdersPage.jsx`, `server/src/controllers/admin.controller.js:getAllOrders`
- **New Location:** `apps/web/app/admin/orders/page.tsx`, `apps/web/app/admin/orders/AdminOrdersClient.tsx`, `apps/web/lib/admin/orders.ts`
- **Target Phase:** Fully Migrated (Maintained in Phase 02)
- **Checklist:**
  - [x] Lists all customer orders with customer email, total amount, payment method, and date.
  - [x] Search filter by Order ID, Customer Name, or Customer Email.
  - [x] Status filter tabs (`All`, `Pending`, `Confirmed`, `Shipped`, `Delivered`, `Cancelled`).
  - [x] Direct link to detailed admin order view `/admin/orders/[id]`.
  - [x] Pagination controls for large order histories.

---

### - [x] FEAT-31: Admin Order Status Transition & Consignment Creation
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `server/src/controllers/admin.controller.js:updateOrderStatus` & `createShipment`
- **New Location:** `apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx`, `apps/web/lib/admin/orders.ts:updateAdminOrderStatus` & `createAdminShipment`
- **Target Phase:** Fully Migrated (Maintained in Phase 02)
- **Checklist:**
  - [x] Admin can transition order through valid states: `Pending` -> `Confirmed` -> `Packed` -> `Shipped` -> `Delivered`.
  - [x] Admin can cancel order with mandatory cancellation reason prior to delivery.
  - [x] Consignment creation button invokes Delhivery logistics API and saves AWB number.
  - [x] Automatically dispatches notification email on shipment and delivery.

---

### - [ ] FEAT-32: Admin Book Catalog Management (Create, Edit, Delete, Stock)
- **Status:** **NOT MIGRATED (CRITICAL DEFECT)**
- **Legacy Location:** `client/src/pages/AdminBooksPage.jsx`, `client/src/pages/AdminAddBookPage.jsx`, `client/src/components/admin/BookModal.jsx`, `server/src/controllers/admin.controller.js:createBook`
- **New Location:** `apps/web/app/admin/books/page.tsx` (100% Read-Only Table)
- **Target Phase:** Phase 02 (Complete Admin Management)
- **Checklist:**
  - [ ] Implement `createBook(formData)` Server Action in `apps/web/lib/admin/books.ts`.
  - [ ] Implement `updateBook(bookId, formData)` Server Action.
  - [ ] Implement `deleteBook(bookId)` Server Action (soft-delete flag `is_active = false`).
  - [ ] Implement `updateBookStock(bookId, newStock)` Server Action.
  - [ ] Implement `setBookCoverImage(bookId, imageUrl)` Server Action.
  - [ ] Port `BookModal.jsx` to Next.js for adding and editing book metadata.
  - [ ] Multi-image Cloudinary upload widget supporting up to 5 images per title.
  - [ ] Add "+ Add New Book" button to `apps/web/app/admin/books/page.tsx`.

---

### - [x] FEAT-33: Admin Replacement Request Approval & Rejection
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `server/src/controllers/admin.controller.js:approveReplacement` & `rejectReplacement`
- **New Location:** `apps/web/app/admin/orders/[id]/AdminOrderDetailClient.tsx`, `apps/web/lib/admin/orders.ts:approveAdminReplacement` & `rejectAdminReplacement`
- **Target Phase:** Fully Migrated (Maintained in Phase 02)
- **Checklist:**
  - [x] Admin order view displays replacement request reason and description.
  - [x] "Approve Replacement" button transitions order to `Replacement Approved`.
  - [x] "Reject Replacement" button opens modal requiring mandatory rejection rationale.
  - [x] Transitions order to `Replacement Rejected` and records rejection timestamp.

---

### - [ ] FEAT-34: Admin Customer Moderation (Block, Unblock, Delete)
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/pages/AdminUsersPage.jsx`, `server/src/controllers/admin.controller.js:blockUser`, `unblockUser`, `deleteUser`
- **New Location:** `apps/web/app/admin/users/page.tsx` (100% Read-Only Table)
- **Target Phase:** Phase 02 (Complete Admin Management)
- **Checklist:**
  - [x] Displays table of registered customers and administrators with account status.
  - [ ] Implement `blockCustomer(userId, reason)` Server Action (sets `is_blocked = true`).
  - [ ] Implement `unblockCustomer(userId)` Server Action (sets `is_blocked = false`).
  - [ ] Implement `deleteCustomer(userId)` Server Action (sets `is_deleted = true`, `deleted_at = NOW()`).
  - [ ] Prevent administrator from blocking or deleting their own account.
  - [ ] Add action dropdown or buttons to `apps/web/app/admin/users/page.tsx`.

---

### - [ ] FEAT-35: Admin Profile & Credentials Management (`/admin/profile`)
- **Status:** **NOT MIGRATED**
- **Legacy Location:** `client/src/pages/AdminProfilePage.jsx`
- **New Location:** `apps/web/app/admin/` (Missing `/admin/profile` route)
- **Target Phase:** Phase 02 (Complete Admin Management)
- **Checklist:**
  - [ ] Create `apps/web/app/admin/profile/page.tsx`.
  - [ ] Display admin profile details (Name, Email, Role, Last Login).
  - [ ] Form to update admin display name and phone number.
  - [ ] Password change section for administrators.
  - [ ] Add "Admin Profile" navigation item to admin sidebar (`AdminNavClient.tsx`).

---

## Module 6: External Integrations (FEAT-36 to FEAT-39)

### - [x] FEAT-36: Razorpay Payment Integration & Webhook Reconciliation
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `server/src/controllers/payment.controller.js`, `server/src/config/razorpay.js`
- **New Location:** `apps/web/lib/integrations/razorpay/`, `apps/web/app/api/payments/*`, `apps/web/app/api/webhooks/razorpay/route.ts`
- **Target Phase:** Fully Migrated (Maintained in Phase 09 QA)
- **Checklist:**
  - [x] Generates Razorpay orders with paise conversion and server-enforced amount.
  - [x] Verifies HMAC SHA-256 signature using `crypto.createHmac`.
  - [x] Webhook route verifies `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET`.
  - [x] Idempotent payment settlement via `settle_payment_atomic` procedure.
  - [x] Handles `payment.captured` and `payment.failed` webhooks safely.
  - [x] Automated refund initiation via Razorpay API SDK on cancelled paid orders.

---

### - [x] FEAT-37: Delhivery Logistics Integration & Webhook Sync
- **Status:** **FULLY MIGRATED**
- **Legacy Location:** `server/src/controllers/delivery.controller.js`, `server/src/services/delhivery.service.js`
- **New Location:** `apps/web/lib/integrations/delhivery/`, `apps/web/app/api/shipping/*`, `apps/web/app/api/webhooks/delhivery/route.ts`
- **Target Phase:** Fully Migrated (Maintained in Phase 09 QA)
- **Checklist:**
  - [x] Real-time 6-digit Indian pincode serviceability check (`/api/shipping/serviceability`).
  - [x] Consignment booking and AWB generation (`/api/shipping/ship`).
  - [x] Delhivery tracking URL generation (`https://www.delhivery.com/track/package/...`).
  - [x] Webhook endpoint (`/api/webhooks/delhivery`) with secret header validation.
  - [x] Automatically transitions order to `Delivered` and marks COD payment `Paid`.

---

### - [x] FEAT-38: Transactional Email Integration (Resend API)
- **Status:** **REPLACED (Architectural Upgrade)**
- **Legacy Location:** `server/src/utils/mail.js` (Google Gmail API v1 OAuth2)
- **New Location:** `apps/web/lib/integrations/resend/`, `apps/web/types/database.types.ts:email_logs`
- **Target Phase:** Fully Migrated (Replaced)
- **Checklist:**
  - [x] Replaced fragile Gmail OAuth2 tokens with robust Resend API SDK.
  - [x] HTML email templates for: Order Confirmation, Payment Receipt, Order Cancellation.
  - [x] Asynchronous dispatch prevents blocking checkout and order updates.
  - [x] Records outbound email attempts and statuses in `public.email_logs`.

---

### - [ ] FEAT-39: Cloudinary Media Upload & Asset Management
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `server/src/config/cloudinary.config.js`, `server/src/middlewares/multer.middleware.js`
- **New Location:** `apps/web/lib/integrations/cloudinary/`, `apps/web/app/api/admin/media/*`
- **Target Phase:** Phase 02 (Complete Admin Management)
- **Checklist:**
  - [x] Route Handler `/api/admin/media/upload` supports multipart file uploads.
  - [x] Route Handler `/api/admin/media/sign` generates signed upload signatures.
  - [x] Magic-byte validation verifies genuine JPEG, PNG, and WebP binaries.
  - [x] 5MB file size limit enforced.
  - [ ] Connect admin book modal image uploader component to these media endpoints.

---

## Module 7: System & Security (FEAT-40)

### - [ ] FEAT-40: System Audit Logging Ledger
- **Status:** **REGRESSED (SQL CONSTRAINT & RLS DEFECT)**
- **Legacy Location:** `server/src/middlewares/audit.middleware.js`, `server/src/models/auditLog.model.js`
- **New Location:** `apps/web/lib/admin/orders.ts`, `supabase/migrations/20261028000001_core_schema.sql`
- **Target Phase:** Phase 04 (Backend & Database Integrity)
- **Checklist:**
  - [ ] Add database migration to expand `audit_logs.action` check constraint to include all admin actions (`UPDATE_ORDER_STATUS`, `ADMIN_CANCEL_ORDER`, `APPROVE_REPLACEMENT`, `REJECT_REPLACEMENT`, `BOOK_CREATE`, `BOOK_UPDATE`, `BOOK_DELETE`, `USER_BLOCK`, `USER_UNBLOCK`).
  - [ ] Add RLS policy allowing authenticated administrators to `INSERT` records into `public.audit_logs`.
  - [ ] Verify that all admin server actions successfully record audit events without throwing constraint errors.

---

## Module 8: Design System, UI/UX & Navigation (FEAT-41 to FEAT-44)

### - [ ] FEAT-41: Brand Design Tokens & CSS Variables
- **Status:** **REGRESSED (CRITICAL STYLING DEFECT)**
- **Legacy Location:** `client/src/index.css` (`@theme`, fonts, colors)
- **New Location:** `apps/web/app/globals.css`, `apps/web/app/layout.tsx`
- **Target Phase:** Phase 06 (Design System & UI/UX Parity)
- **Checklist:**
  - [ ] Declare `--color-primary-gold: #C9A24A;` and `--color-accent-gold: #E5C87B;` inside `:root` in `globals.css`.
  - [ ] Ensure full CSS variable resolution across all 30+ files referencing `var(--color-primary-gold)`.
  - [ ] Load Cinzel font weights 800 and 900 in `layout.tsx` to match legacy typography hierarchy.
  - [ ] Audit button hover states across all components to ensure gold accent lighting functions properly.

---

### - [ ] FEAT-42: Mobile Bottom Navigation Bar
- **Status:** **NOT MIGRATED**
- **Legacy Location:** `client/src/components/MobileBottomNav.jsx`
- **New Location:** `apps/web/app/layout.tsx` (Missing component)
- **Target Phase:** Phase 08 (Advanced UX & Accessibility)
- **Checklist:**
  - [ ] Create `apps/web/components/layout/MobileBottomNav.tsx`.
  - [ ] Fixed bottom positioning (`fixed bottom-0 left-0 right-0 z-50 md:hidden`).
  - [ ] Tabs: Home (`/`), Books (`/books`), Cart (`/cart` with badge), Orders (`/orders`), Profile (`/profile`).
  - [ ] Highlight active route tab with brand gold color.
  - [ ] Add bottom padding (`pb-16 md:pb-0`) to root layout container to prevent content clipping.

---

### - [ ] FEAT-43: Toast Notification System
- **Status:** **NOT MIGRATED**
- **Legacy Location:** `client/src/context/ToastContext.jsx` (`useToast`)
- **New Location:** `apps/web/` (No global toast system)
- **Target Phase:** Phase 07 (Animation & Micro-interactions)
- **Checklist:**
  - [ ] Implement `ToastContext` and `ToastProvider` for Next.js Client Components.
  - [ ] Support notification types: `success`, `error`, `warning`, `info`.
  - [ ] Slide-up and fade animation using CSS keyframes or lightweight motion.
  - [ ] Auto-dismiss after 4 seconds with manual close button.
  - [ ] Wire toasts into Add-to-Cart, Cart updates, Address actions, Login/Logout, and Admin mutations.

---

### - [ ] FEAT-44: Global Navigation Shell & Dynamic State Synchronization
- **Status:** **PARTIALLY MIGRATED**
- **Legacy Location:** `client/src/components/Navbar.jsx` (Redux-connected)
- **New Location:** `apps/web/components/layout/Navbar.tsx`, `apps/web/app/page.tsx`, `apps/web/app/books/page.tsx`
- **Target Phase:** Phase 01 (Critical Functional Restoration)
- **Checklist:**
  - [ ] Pass authenticated user session and live cart count to `<Navbar />` on all public pages (`page.tsx`, `books/page.tsx`).
  - [ ] Navbar dynamically switches between "Login" and user profile dropdown based on active session.
  - [ ] Cart icon badge reflects real-time item count from persistent cart.
  - [ ] Mobile hamburger drawer displays authenticated user status and links.

