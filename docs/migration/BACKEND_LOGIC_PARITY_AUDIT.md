# Complete Backend & Business Logic Parity Audit
## MD Shakib Islamic Books — API, Business Rules, Services & Integrations Report

> **Audit Date:** October 30, 2026  
> **Auditors:** Principal Software Architect & Senior Backend Engineer  
> **Scope:** Full mapping of 65 Express REST API endpoints, business invariants, atomic transactions, and third-party integrations against Next.js 16 Route Handlers, Server Actions, and Supabase PostgreSQL RPCs.

---

## 1. Complete API & Endpoint Parity Inventory

### 1.1 Address Module (`/api/v1/addresses`)

| Legacy Route & Method | Auth Requirement | New Implementation Equivalent | Logic Parity | Status | Audit Findings & Evidence |
|---|---|---|---|---|---|
| `GET /api/v1/addresses` | Authenticated (JWT) | `apps/web/lib/commerce/addresses.ts:getCustomerAddresses` | Full | **FULLY MIGRATED** | Fetches user addresses from `public.addresses` ordered by `is_default DESC, created_at DESC`. RLS enforces `user_id = auth.uid()`. |
| `POST /api/v1/addresses` | Authenticated (JWT) | `apps/web/lib/commerce/addresses.ts:createAddress` | Full | **FULLY MIGRATED** | Validates recipient name, 10-digit phone, 6-digit pincode, and address type. Trigger `trg_default_address` automatically unsets previous default if new address is marked default. |
| `PATCH /api/v1/addresses/:id` | Authenticated (JWT) | None | Missing | **NOT MIGRATED** | Legacy allowed updating existing address fields (`fullName`, `phone`, `houseNo`, `area`, `landmark`, etc.). New stack has no `updateAddress` server action or API route. |
| `DELETE /api/v1/addresses/:id` | Authenticated (JWT) | `apps/web/lib/commerce/addresses.ts:deleteAddress` | Full | **FULLY MIGRATED** | Deletes address row where `id = addressId` and `user_id = user.id`. Revalidates `/addresses` and `/checkout`. |
| `PATCH /api/v1/addresses/:id/default` | Authenticated (JWT) | `apps/web/lib/commerce/addresses.ts:setDefaultAddress` | Full | **FULLY MIGRATED** | Sets `is_default = true`. PostgreSQL trigger `trg_default_address` unsets default on all other addresses for that user. |

---

### 1.2 Cart Module (`/api/v1/cart`)

| Legacy Route & Method | Auth Requirement | New Implementation Equivalent | Logic Parity | Status | Audit Findings & Evidence |
|---|---|---|---|---|---|
| `GET /api/v1/cart` | Authenticated (JWT) | `apps/web/lib/commerce/cart.ts:getCustomerCart` | Full | **FULLY MIGRATED** | Queries `public.carts` and joins `public.cart_items` with `public.books`. Computes live discounted unit prices, subtotal, ₹10 platform fee, ₹35 delivery fee. |
| `POST /api/v1/cart/add` | Authenticated (JWT) | `apps/web/lib/commerce/cart.ts:addToCart` | Partial | **PARTIALLY MIGRATED** | Server Action exists and inserts into `cart_items` with `ON CONFLICT (cart_id, book_id) DO UPDATE SET quantity = quantity + EXCLUDED.quantity`. **However, it is never invoked by any UI component in `apps/web/`**. |
| `PATCH /api/v1/cart/update/:bookId` | Authenticated (JWT) | `apps/web/lib/commerce/cart.ts:updateCartQuantity` | Full | **FULLY MIGRATED** | Updates item quantity or deletes item if `quantity <= 0`. Revalidates `/cart`. |
| `DELETE /api/v1/cart/remove/:bookId`| Authenticated (JWT) | `apps/web/lib/commerce/cart.ts:removeCartItem` | Full | **FULLY MIGRATED** | Deletes line item from `public.cart_items` by ID. Revalidates `/cart`. |
| `DELETE /api/v1/cart/clear` | Authenticated (JWT) | Handled automatically in `create_order_atomic` | Replaced | **REPLACED** | Cart is cleared atomically inside the PostgreSQL order creation procedure upon successful checkout. |
| `POST /api/v1/cart/merge` | Authenticated (JWT) | None | Missing | **NOT MIGRATED** | Legacy merged guest `localStorage` items into MongoDB cart post-login. Target stack eliminated guest cart; merge functionality is missing. |

---

### 1.3 Book Module (`/api/v1/books`)

| Legacy Route & Method | Auth Requirement | New Implementation Equivalent | Logic Parity | Status | Audit Findings & Evidence |
|---|---|---|---|---|---|
| `GET /api/v1/books` | Public | `apps/web/lib/data/catalog.ts:getBooks` | Full | **FULLY MIGRATED** | Fetches active books from `public.books` with pagination, category filter, sorting, and text search. |
| `GET /api/v1/books/search` | Public | `apps/web/lib/data/catalog.ts:getBooks` (via search param) | Full | **FULLY MIGRATED** | Integrated into unified catalog query using ILIKE against `title` and `author`. |
| `GET /api/v1/books/featured` | Public | `apps/web/lib/data/catalog.ts:getFeaturedBooks` | Full | **FULLY MIGRATED** | Fetches top active books ordered by `discount DESC, created_at DESC`. |
| `GET /api/v1/books/category/:category` | Public | `apps/web/lib/data/catalog.ts:getBooks` (via category param) | Full | **FULLY MIGRATED** | Filters books where `category = requestedCategory`. |
| `GET /api/v1/books/:id` | Public | `apps/web/lib/data/catalog.ts:getBookById` | Full | **FULLY MIGRATED** | Fetches book by UUID. Returns 404 (`notFound()`) if non-existent or inactive. |
| `GET /api/v1/books/:id/related` | Public | `apps/web/lib/data/catalog.ts:getRelatedBooks` | Full | **FULLY MIGRATED** | Fetches up to 4 books in the same category excluding the current book ID. |

---

### 1.4 Customer Order Module (`/api/v1/orders`)

| Legacy Route & Method | Auth Requirement | New Implementation Equivalent | Logic Parity | Status | Audit Findings & Evidence |
|---|---|---|---|---|---|
| `POST /api/v1/orders` | Authenticated (JWT) | `apps/web/lib/commerce/orders.ts:placeOrderCOD` & `placeOrderOnline` | Full | **FULLY MIGRATED** | Replaced with Server Actions invoking `public.create_order_atomic` stored procedure. Validates inventory under row lock, decrements stock, creates order, snapshots address. |
| `GET /api/v1/orders` | Authenticated (JWT) | `apps/web/lib/commerce/orders.ts:getCustomerOrders` | Full | **FULLY MIGRATED** | Fetches customer orders from `public.orders` ordered by `created_at DESC`. RLS restricts results to `auth.uid() = user_id`. |
| `GET /api/v1/orders/:id` | Authenticated (JWT) | `apps/web/lib/commerce/orders.ts:getCustomerOrderById` | Full | **FULLY MIGRATED** | Fetches order and child items from `public.order_items`. Enforces customer ownership check. |
| `PATCH /api/v1/orders/:id/cancel` | Authenticated (JWT) | `apps/web/lib/commerce/orders.ts:cancelOrder`<br>`supabase.rpc('cancel_order_atomic')` | Full | **FULLY MIGRATED** | Replaces custom middleware with atomic PostgreSQL procedure. Restores inventory stock for each order line item, sets `order_status = 'Cancelled'`, and records cancel reason. |
| `POST /api/v1/orders/:id/replacement`| Authenticated (JWT) | None | Missing | **NOT MIGRATED** | Legacy allowed customers to request replacement for delivered orders within 7 days. Target stack has no customer server action or API route for requesting replacements. |

---

### 1.5 Payment Module (`/api/v1/payments`)

| Legacy Route & Method | Auth Requirement | New Implementation Equivalent | Logic Parity | Status | Audit Findings & Evidence |
|---|---|---|---|---|---|
| `POST /api/v1/payments/create-intent` | Authenticated (JWT) | `apps/web/lib/integrations/razorpay/service.ts:createRazorpayOrder`<br>`apps/web/app/api/payments/create-order/route.ts` | Full | **FULLY MIGRATED** | Derives amount strictly from database order record (prevents client tampering), generates Razorpay order, records payment intention in `public.payments`. |
| `POST /api/v1/payments/verify` | Authenticated (JWT) | `apps/web/lib/integrations/razorpay/service.ts:verifyAndSettlePayment`<br>`apps/web/app/api/payments/verify/route.ts` | Full | **FULLY MIGRATED** | Cryptographically verifies HMAC SHA-256 signature, executes atomic stored procedure `public.settle_payment_atomic`, transitions order to `Confirmed` and `Paid`, initiates asynchronous email. |
| `POST /api/v1/payments/failure` | Authenticated (JWT) | `supabase.rpc('record_payment_failure_atomic')` | Full | **FULLY MIGRATED** | Records failure atomically. If order was already paid, rejects status downgrade (safeguards against out-of-order webhook races). |
| `POST /api/v1/payments/retry` | Authenticated (JWT) | Handled by `createRazorpayOrder` idempotent return | Full | **FULLY MIGRATED** | Reuses existing Razorpay order ID for pending orders rather than duplicating provider orders. |
| `POST /api/v1/payments/webhook` | Public (Signature Verified) | `apps/web/app/api/webhooks/razorpay/route.ts`<br>`apps/web/lib/integrations/razorpay/webhook.ts:processRazorpayWebhook` | Full | **FULLY MIGRATED** | Validates `x-razorpay-signature` against raw body. Handles `order.paid` and `payment.captured` idempotently via `public.settle_payment_atomic`. |

---

### 1.6 Delivery & Shipping Module (`/api/v1/delhivery`)

| Legacy Route & Method | Auth Requirement | New Implementation Equivalent | Logic Parity | Status | Audit Findings & Evidence |
|---|---|---|---|---|---|
| `GET /api/v1/delhivery/serviceability`| Public / Auth | `apps/web/app/api/shipping/serviceability/route.ts`<br>`apps/web/lib/integrations/delhivery/service.ts:checkPincodeServiceability` | Full | **FULLY MIGRATED** | Checks 6-digit Indian postal code serviceability, COD availability, and prepaid eligibility via Delhivery API. |
| `GET /api/v1/delhivery/track/:awb` | Public / Auth | `apps/web/app/api/shipping/track/route.ts`<br>`apps/web/lib/integrations/delhivery/service.ts:trackConsignmentAwb` | Full | **FULLY MIGRATED** | Fetches live tracking status and scan checkpoints from Delhivery REST endpoint. |
| `POST /api/v1/delhivery/webhook` | External / Secret | `apps/web/app/api/webhooks/delhivery/route.ts`<br>`apps/web/lib/integrations/delhivery/service.ts:verifyDelhiveryWebhookAuth` | Full | **FULLY MIGRATED** | Fail-closed webhook authentication supporting Bearer token and custom header. Maps status codes (DL, UD, IT, RT) to internal order status; marks COD orders as Paid upon delivery. |

---

### 1.7 User & Authentication Module (`/api/v1/users`)

| Legacy Route & Method | Auth Requirement | New Implementation Equivalent | Logic Parity | Status | Audit Findings & Evidence |
|---|---|---|---|---|---|
| `POST /api/v1/users/register` | Public | `apps/web/lib/auth/actions.ts:signUpCustomer` | Replaced | **REPLACED** | Replaced custom bcrypt/Mongoose user registration with Supabase Auth `signUp`. |
| `POST /api/v1/users/login` | Public | `apps/web/lib/auth/actions.ts:loginCustomer` | Replaced | **REPLACED** | Replaced custom JWT tokens with Supabase Auth `signInWithPassword` and `@supabase/ssr` cookies. |
| `POST /api/v1/users/logout` | Authenticated | `apps/web/lib/auth/actions.ts:logoutCustomer` | Replaced | **REPLACED** | Calls `supabase.auth.signOut()` and purges auth cookies. |
| `POST /api/v1/users/refresh-token` | Public / Cookie | Next.js Edge Middleware (`apps/web/middleware.ts`) | Replaced | **REPLACED** | Token refresh is performed automatically on every request by `@supabase/ssr` in Edge middleware. |
| `POST /api/v1/users/send-otp` | Public | `apps/web/lib/auth/actions.ts:sendPasswordReset` | Replaced | **REPLACED** | Calls `supabase.auth.resetPasswordForEmail`. |
| `POST /api/v1/users/verify-otp` | Public | `apps/web/lib/auth/actions.ts:verifyEmailOtp` | Replaced | **REPLACED** | Calls `supabase.auth.verifyOtp({ type: 'recovery' })`. |
| `POST /api/v1/users/reset-password` | Public | `apps/web/lib/auth/actions.ts:updatePassword` | Replaced | **REPLACED** | Calls `supabase.auth.updateUser({ password })`. |
| `POST /api/v1/users/send-registration-otp` | Public | Handled by Supabase Auth verification email | Replaced | **REPLACED** | Automated verification emails dispatched by Supabase on signup. |
| `POST /api/v1/users/verify-registration-otp` | Public | `apps/web/lib/auth/actions.ts:verifyEmailOtp` | Replaced | **REPLACED** | Calls `supabase.auth.verifyOtp({ type: 'signup' })`. |
| `GET /api/v1/users/profile` | Authenticated | `apps/web/lib/auth/session.ts:getAuthenticatedUserProfile` | Full | **FULLY MIGRATED** | Fetches profile row from `public.profiles`. |
| `PATCH /api/v1/users/profile` | Authenticated | `apps/web/lib/auth/actions.ts:updateCustomerProfile` | Full | **FULLY MIGRATED** | Updates customer `name` and `phone`. |
| `PATCH /api/v1/users/change-password` | Authenticated | None | Missing | **NOT MIGRATED** | In legacy, logged-in users could change password by verifying `oldPassword`. New stack has no authenticated change-password action. |
| `DELETE /api/v1/users/account` | Authenticated | None | Missing | **NOT MIGRATED** | Legacy soft-deleted user account. New stack has no self-service account deletion capability. |

---

### 1.8 Admin Module (`/api/v1/admin`) — Critical Gaps

| Legacy Route & Method | Auth Requirement | New Implementation Equivalent | Logic Parity | Status | Audit Findings & Evidence |
|---|---|---|---|---|---|
| **Books Management** | | | | | |
| `POST /api/v1/admin/books` | Admin | None (Media upload API exists; no book insert) | Missing | **NOT MIGRATED** | Admins cannot create books. No Server Action or Route Handler exists to insert into `public.books`. |
| `GET /api/v1/admin/books` | Admin | `apps/web/app/admin/books/page.tsx` | Full | **FULLY MIGRATED** | Lists all books directly from `public.books`. |
| `GET /api/v1/admin/books/:id` | Admin | None (Storefront detail page used instead) | Partial | **PARTIALLY MIGRATED** | Links to public `/books/:id`. No admin-specific detail view. |
| `PATCH /api/v1/admin/books/:id` | Admin | None | Missing | **NOT MIGRATED** | Admins cannot edit book metadata, description, price, publisher, pages, etc. |
| `DELETE /api/v1/admin/books/:id` | Admin | None | Missing | **NOT MIGRATED** | Admins cannot soft-delete or remove books from the catalog. |
| `PATCH /api/v1/admin/books/:id/stock` | Admin | None | Missing | **NOT MIGRATED** | Admins cannot adjust book inventory stock. |
| `PATCH /api/v1/admin/books/:id/cover` | Admin | None | Missing | **NOT MIGRATED** | Admins cannot designate an uploaded image as the primary cover. |
| `DELETE /api/v1/admin/books/:id/image`| Admin | None | Missing | **NOT MIGRATED** | Admins cannot remove individual images from a book's image gallery. |
| **Orders Management** | | | | | |
| `GET /api/v1/admin/orders` | Admin | `apps/web/lib/admin/orders.ts:getAdminOrders` | Full | **FULLY MIGRATED** | Lists orders with status, payment method, payment status filtering, search, and pagination. |
| `GET /api/v1/admin/orders/:id` | Admin | `apps/web/lib/admin/orders.ts:getAdminOrderById` | Full | **FULLY MIGRATED** | Fetches enriched order with customer details, line items, and audit/status history. |
| `PATCH /api/v1/admin/orders/:id/status`| Admin | `apps/web/lib/admin/orders.ts:updateAdminOrderStatus`<br>`apps/web/app/api/admin/orders/[id]/status/route.ts` | Full | **FULLY MIGRATED** | Enforces `ORDER_STATUS_TRANSITIONS`. Prevents confirming unpaid online orders; records shipping courier & AWB upon transition to `Shipped`. |
| `PATCH /api/v1/admin/orders/:id/cancel`| Admin | `apps/web/lib/admin/orders.ts:cancelAdminOrder` | Full | **FULLY MIGRATED** | Restores stock via `cancel_order_atomic`. Automatically triggers Razorpay refund if order was paid online. |
| `POST /api/v1/admin/orders/:id/shipment`| Admin | `apps/web/lib/integrations/delhivery/service.ts:createShipmentForOrder` | Full | **FULLY MIGRATED** | Consignment booking service creates Delhivery waybill and generates tracking URL. |
| `POST /api/v1/admin/orders/:id/replacement/approve` | Admin | `apps/web/lib/admin/orders.ts:approveAdminReplacement` | Full | **FULLY MIGRATED** | Transitions status to `Replacement Approved` and sets replacement status to `Approved`. |
| `POST /api/v1/admin/orders/:id/replacement/reject` | Admin | `apps/web/lib/admin/orders.ts:rejectAdminReplacement` | Full | **FULLY MIGRATED** | Sets status to `Replacement Rejected` and records mandatory rejection reason. |
| **Users Management** | | | | | |
| `GET /api/v1/admin/users` | Admin | `apps/web/app/admin/users/page.tsx` | Full | **FULLY MIGRATED** | Lists user profiles from `public.profiles`. |
| `GET /api/v1/admin/users/:id` | Admin | None | Missing | **NOT MIGRATED** | No endpoint or modal to view full customer history and address book. |
| `PATCH /api/v1/admin/users/:id/block` | Admin | None | Missing | **NOT MIGRATED** | No action to set `is_blocked = true` on customer accounts. |
| `PATCH /api/v1/admin/users/:id/unblock` | Admin | None | Missing | **NOT MIGRATED** | No action to unblock user accounts. |
| `DELETE /api/v1/admin/users/:id` | Admin | None | Missing | **NOT MIGRATED** | No action to soft-delete user accounts. |
| **Dashboard Analytics** | | | | | |
| `GET /api/v1/admin/dashboard/stats` | Admin | `apps/web/lib/admin/dashboard.ts:getAdminDashboardStats` | Full | **REPLACED** | Live database aggregations replacing legacy placeholder numbers. |
| `GET /api/v1/admin/dashboard/sales` | Admin | Computed in `getAdminDashboardStats` | Full | **REPLACED** | Computes monthly revenue from paid orders. |

---

## 2. Business Rules & Invariant Verification

### 2.1 Order Lifecycle State Transitions

The target stack implements the exact legacy state transition map (`ORDER_STATUS_TRANSITIONS` in `apps/web/lib/admin/constants.ts`):

```typescript
export const ORDER_STATUS_TRANSITIONS: Record<string, string[]> = {
  Pending: ["Confirmed", "Cancelled"],
  Confirmed: ["Packed", "Cancelled"],
  Packed: ["Shipped", "Cancelled"],
  Shipped: ["Out for Delivery", "Cancelled"],
  "Out for Delivery": ["Delivered", "Cancelled"],
  Delivered: ["Replacement Requested"],
  Cancelled: [],
  "Replacement Requested": ["Replacement Approved", "Replacement Rejected", "Cancelled"],
  "Replacement Approved": ["Replacement Shipped", "Cancelled"],
  "Replacement Rejected": [],
  "Replacement Shipped": ["Replacement Delivered", "Cancelled"],
  "Replacement Delivered": [],
  Returned: [],
};
```

**Verification Status:** **VERIFIED**. Both `apps/web/lib/admin/orders.ts` and `apps/web/app/api/admin/orders/[id]/status/route.ts` strictly validate current-to-next status against this matrix and reject illegal jumps.

### 2.2 Payment Method & Confirmation Invariants

1. **Prepaid Online Orders:** In `apps/web/lib/admin/orders.ts` (lines 230–240), an order with `payment_method = 'ONLINE'` **cannot** be transitioned to `Confirmed` unless `payment_status = 'Paid'`. **Status: VERIFIED**.
2. **COD Settlement on Delivery:** When an order is transitioned to `Delivered`, if `payment_method = 'COD'`, the system authoritatively marks `payment_status = 'Paid'`, `is_paid = true`, and sets `paid_at = NOW()`. **Status: VERIFIED**.
3. **Pessimistic Concurrency & Double-Settlement Prevention:** `public.settle_payment_atomic` uses `SELECT ... FOR UPDATE` row locking on candidate orders. If the order is already marked `Paid`, it returns an idempotent early exit (`settled: false`) to prevent duplicate email triggers or inventory adjustments. **Status: VERIFIED**.

### 2.3 Inventory Management & Atomic Locking

In legacy, inventory reduction was handled in Node.js application code (`server/src/utils/stock.util.js:validateAndReduceStock`). Under high concurrency, this created race conditions where stock could be oversold.

In the target stack, inventory decrements and restorations are executed inside PostgreSQL stored procedures:
- `create_order_atomic`: Locks each book row with `SELECT ... FOR UPDATE`, checks `stock >= quantity`, and decrements `stock = stock - quantity`.
- `cancel_order_atomic`: Iterates through order items and increments `stock = stock + quantity` atomically.

**Verification Status:** **SUPERIOR TO LEGACY**. Atomic, race-condition free.

---

## 3. End-to-End Workflow Parity Analysis

### Workflow 1: Customer Browse → Add to Cart → Checkout → Order Placement
- **Legacy:** Working end-to-end.
- **New Stack:** **BROKEN AT STEP 2**. Visitor can browse books and view details, but clicking "Add to Cart" fails to add items to cart. Cart remains empty. If an item is artificially inserted into database `cart_items`, checkout and atomic order placement succeed.
- **Verdict:** **BLOCKED BY P0-COMMERCE-01**.

### Workflow 2: Customer Online Payment → Razorpay Gateway → Webhook Settle
- **Legacy:** Working with custom HMAC check.
- **New Stack:** **WORKING & HARDENED**. Client checkout loads Razorpay popup, calls `/api/payments/verify`, which invokes `settle_payment_atomic`. If browser closes, webhook at `/api/webhooks/razorpay` captures event, verifies signature, and settles payment atomically. Confirmation email dispatched via Resend.
- **Verdict:** **FULLY VERIFIED**.

### Workflow 3: Admin Order Processing → Shipping → Delhivery Consignment → Delivery
- **Legacy:** Admin creates shipment, receives AWB, Delhivery webhook updates status to Delivered.
- **New Stack:** **WORKING**. Admin confirms order, enters courier/AWB to advance to Shipped, or creates shipment via Delhivery API. Inbound Delhivery webhook at `/api/webhooks/delhivery` validates secret and advances order to Delivered, settling COD payments.
- **Verdict:** **FULLY VERIFIED**.

### Workflow 4: Order Cancellation & Refund
- **Legacy:** Customer cancels un-shipped order; stock restored; admin manually refunds.
- **New Stack:** **WORKING & AUTOMATED**. Customer cancels from order details; `cancel_order_atomic` restores inventory; admin can cancel from portal, which automatically invokes Razorpay Refund API (`initiateRazorpayRefund`) for paid orders.
- **Verdict:** **FULLY VERIFIED**.

### Workflow 5: Replacement Request Lifecycle
- **Legacy:** Customer requests replacement within 7 days of delivery; admin approves/rejects; order status updates.
- **New Stack:** **BROKEN AT CUSTOMER ENTRYPOINT**. Admin side has approval and rejection actions (`approveAdminReplacement`, `rejectAdminReplacement`). However, customer UI has no button or action to submit a replacement request.
- **Verdict:** **INCOMPLETE (Blocked on Customer UI)**.

---

## 4. API & Backend Parity Scorecard

| Category | Total Legacy | Implemented in New | Missing in New | Parity % |
|---|---:|---:|---:|---:|
| Address APIs | 5 | 4 | 1 | 80.0% |
| Cart APIs | 6 | 4 | 2 | 66.7% |
| Book APIs | 6 | 6 | 0 | 100.0% |
| Order APIs | 5 | 4 | 1 | 80.0% |
| Payment APIs | 5 | 5 | 0 | 100.0% |
| Delivery APIs | 3 | 3 | 0 | 100.0% |
| User & Auth APIs | 13 | 11 | 2 | 84.6% |
| Admin APIs | 22 | 9 | 13 | 40.9% |
| **TOTAL** | **65** | **46** | **19** | **70.8%** |

