# Route Mapping: React Router to Next.js App Router

This document maps all existing React Router client routes and Express 5 API endpoints to their exact Next.js App Router equivalents.

---

## 1. Client-Side Page Routes

| Existing React Router Path | Access Level | Existing Component | Target Next.js App Router File | Rendering Strategy & Notes |
|---|---|---|---|---|
| `/` | Public | `pages/HomePage.jsx` | `app/page.tsx` | Server Component (SSR / ISR) with Client Component interactive carousels |
| `/books` | Public | `pages/BooksPage.jsx` | `app/books/page.tsx` | Server Component reading `searchParams` (`q`, `category`, `page`, `sort`, `minPrice`, `maxPrice`) |
| `/books/:id` | Public | `pages/BookDetailsPage.jsx` | `app/books/[id]/page.tsx` | Server Component with Dynamic Route; metadata generation via `generateMetadata` |
| `/about` | Public | `pages/AboutPage.jsx` | `app/about/page.tsx` | Static Server Component |
| `/support` | Public | `pages/SupportPage.jsx` | `app/support/page.tsx` | Server Component with Client Component FAQ accordion |
| `/contact` | Public | *(Missing in React Router)* | `app/contact/page.tsx` | New Server Component implementing active contact form (resolves dead footer link) |
| `/privacy-policy` | Public | *(Missing in React Router)* | `app/privacy-policy/page.tsx` | New Static Server Component (resolves dead footer link) |
| `/terms` | Public | *(Missing in React Router)* | `app/terms/page.tsx` | New Static Server Component (resolves dead footer link) |
| `/cart` | Public / Hybrid | `pages/CartPage.jsx` | `app/cart/page.tsx` | Client Component handling guest localStorage and authenticated Supabase cart sync |
| `/verify-email` | Public | `pages/EmailVerificationPage.jsx` | `app/(auth)/verify-email/page.tsx` | Client Component triggering Resend registration OTP |
| `/verify-registration-otp` | Public (Guarded) | `pages/VerifyRegistrationOTPPage.jsx` | `app/(auth)/verify-registration-otp/page.tsx` | Client Component with 6-digit OTP inputs and 60s resend timer |
| `/register` | Public (Guarded) | `pages/RegisterPage.jsx` | `app/(auth)/register/page.tsx` | Client Component; redirects to `/verify-email` if email unverified |
| `/login` | Public | `pages/LoginPage.jsx` | `app/(auth)/login/page.tsx` | Client Component with Supabase Auth sign-in and post-login redirect |
| `/forgot-password` | Public | `pages/ForgotPasswordPage.jsx` | `app/(auth)/forgot-password/page.tsx` | Client Component triggering password reset OTP email |
| `/verify-otp` | Public (Guarded) | `pages/VerifyOTPPage.jsx` | `app/(auth)/verify-otp/page.tsx` | Client Component validating 6-digit password reset OTP |
| `/reset-password` | Public (Guarded) | `pages/ResetPasswordPage.jsx` | `app/(auth)/reset-password/page.tsx` | Client Component submitting new password; auto-logs in |
| `/checkout` | Protected (`user`) | `pages/CheckoutPage.jsx` | `app/checkout/page.tsx` | Client Component with SSR auth guard; loads Razorpay checkout |
| `/order-success` | Protected (`user`) | `pages/OrderSuccessPage.jsx` | `app/order-success/page.tsx` | Server/Client Component displaying confirmed order confirmation |
| `/orders` | Protected (`user`) | `pages/OrdersPage.jsx` | `app/orders/page.tsx` | Server Component fetching customer order list with Supabase SSR |
| `/orders/:id` | Protected (`user`) | `pages/OrderDetailsPage.jsx` | `app/orders/[id]/page.tsx` | Server Component + Client Timeline with Supabase Realtime listeners |
| `/profile` | Protected (`user`) | `pages/ProfilePage.jsx` | `app/profile/page.tsx` | Server Component with Client profile and password editor forms |
| `/addresses` | Protected (`user`) | `pages/AddressesPage.jsx` | `app/addresses/page.tsx` | Client Component managing customer address CRUD |
| `/admin`, `/admin/dashboard` | Protected (`admin`) | `pages/AdminDashboardPage.jsx` | `app/admin/dashboard/page.tsx` | Server Component with live PostgreSQL aggregations & Chart.js client wrapper |
| `/admin/books` | Protected (`admin`) | `pages/AdminBooksPage.jsx` | `app/admin/books/page.tsx` | Server Component with Client table, stock toggles, and image modal |
| `/admin/books/add` | Protected (`admin`) | `pages/AdminAddBookPage.jsx` | `app/admin/books/add/page.tsx` | Client Component with multi-file dropzone and Cloudinary upload |
| `/admin/orders` | Protected (`admin`) | `pages/AdminOrdersPage.jsx` | `app/admin/orders/page.tsx` | Server Component with Client status updater and Delhivery shipment dispatcher |
| `/admin/users` | Protected (`admin`) | `pages/AdminUsersPage.jsx` | `app/admin/users/page.tsx` | Server Component with Client user blocking and deletion modals |
| `/admin/profile` | Protected (`admin`) | `pages/AdminProfilePage.jsx` | `app/admin/profile/page.tsx` | Client Component managing admin personal credentials |
| `*` | Public (404) | `pages/NotFoundPage.jsx` | `app/not-found.tsx` | Next.js root not-found component styled in dark/gold luxury theme |

---

## 2. API Route & Backend Endpoint Mapping

| Existing Express Endpoint | HTTP Method | Auth Requirement | Target Next.js Implementation | Implementation Details |
|---|---|---|---|---|
| `/api/v1/users/send-registration-otp` | `POST` | Public | `app/api/auth/send-registration-otp/route.ts` | Validates email, enforces 3-per-10m rate limit, inserts OTP into Supabase, sends Resend email |
| `/api/v1/users/verify-registration-otp` | `POST` | Public | `app/api/auth/verify-registration-otp/route.ts` | Validates 6-digit code, checks attempts $\le 5$, flags `verified = true` |
| `/api/v1/users/register` | `POST` | Public | `app/api/auth/register/route.ts` | Verifies OTP record, creates Supabase Auth user, creates `profiles` record |
| `/api/v1/users/login` | `POST` | Public | Server Action / `app/api/auth/login/route.ts` | Calls `supabase.auth.signInWithPassword`, sets SSR session cookies |
| `/api/v1/users/logout` | `POST` | Authenticated | Server Action / `app/api/auth/logout/route.ts` | Calls `supabase.auth.signOut()`, clears session cookies |
| `/api/v1/users/refresh-token` | `POST` | Public | Built-in via `@supabase/ssr` Middleware | Handled automatically in Next.js middleware by refreshing Supabase session |
| `/api/v1/users/send-otp` | `POST` | Public | `app/api/auth/send-reset-otp/route.ts` | Validates existing user, generates 6-digit reset OTP, sends Resend email |
| `/api/v1/users/verify-otp` | `POST` | Public | `app/api/auth/verify-reset-otp/route.ts` | Checks reset OTP expiry & attempts, marks record verified |
| `/api/v1/users/reset-password` | `POST` | Public | `app/api/auth/reset-password/route.ts` | Validates verified OTP, updates user password using Supabase Admin client |
| `/api/v1/users/profile` | `GET`, `PATCH` | Authenticated | Server Actions in `actions/user.ts` | Directly reads/updates `profiles` table guarded by Supabase RLS |
| `/api/v1/users/change-password` | `PATCH` | Authenticated | Server Action in `actions/auth.ts` | Validates old password and updates credentials via Supabase Auth |
| `/api/v1/users/account` | `DELETE` | Authenticated | Server Action in `actions/user.ts` | Soft-deletes profile (`is_deleted = true`, `is_blocked = true`) |
| `/api/v1/books` | `GET` | Public | Server Component / `actions/books.ts` | Direct Supabase query with filtering, sorting, price range, and pagination |
| `/api/v1/books/search` | `GET` | Public | Server Component / `actions/books.ts` | PostgreSQL Full-Text Search (`tsvector`) or sanitized `ILIKE` query |
| `/api/v1/books/featured` | `GET` | Public | Server Component / `actions/books.ts` | Query top 8 active books ordered by `created_at DESC` |
| `/api/v1/books/category/:cat` | `GET` | Public | Server Component / `actions/books.ts` | Filter books by category enum |
| `/api/v1/books/:id` | `GET` | Public | Server Component / `actions/books.ts` | Query book by UUID where `is_active = true` |
| `/api/v1/books/:id/related` | `GET` | Public | Server Component / `actions/books.ts` | Query up to 4 books in same category excluding current book |
| `/api/v1/cart` | `GET` | Authenticated | Server Action / `actions/cart.ts` | Query `carts` and joined `cart_items` with book details |
| `/api/v1/cart/add` | `POST` | Authenticated | Server Action / `actions/cart.ts` | Upsert `cart_items`, revalidating stock availability |
| `/api/v1/cart/update/:bookId` | `PATCH` | Authenticated | Server Action / `actions/cart.ts` | Update quantity in `cart_items` |
| `/api/v1/cart/remove/:bookId` | `DELETE` | Authenticated | Server Action / `actions/cart.ts` | Delete specific book row from `cart_items` |
| `/api/v1/cart/clear` | `DELETE` | Authenticated | Server Action / `actions/cart.ts` | Delete all rows for user in `cart_items` |
| `/api/v1/cart/merge` | `POST` | Authenticated | Server Action / `actions/cart.ts` | Merge array of guest cart items into database cart |
| `/api/v1/addresses` | `GET`, `POST` | Authenticated | Server Actions / `actions/addresses.ts` | CRUD operations on `addresses` table protected by RLS |
| `/api/v1/addresses/:id` | `PATCH`, `DELETE`| Authenticated | Server Actions / `actions/addresses.ts` | Update or delete address verifying `user_id` ownership |
| `/api/v1/addresses/:id/default` | `PATCH` | Authenticated | Server Action / `actions/addresses.ts` | Transaction unsetting other defaults and setting target default |
| `/api/v1/orders` | `POST` | Authenticated | Server Action / `app/api/orders/route.ts` | PostgreSQL function `create_order` (atomic stock deduction & idempotency) |
| `/api/v1/orders` | `GET` | Authenticated | Server Component / `actions/orders.ts` | Paginated query on `orders` table filtered by `user_id` |
| `/api/v1/orders/:id` | `GET` | Authenticated | Server Component / `actions/orders.ts` | Query order with snapshot items, status history, and payment details |
| `/api/v1/orders/:id/cancel` | `PATCH` | Authenticated | Server Action / `actions/orders.ts` | PostgreSQL function `cancel_order` (atomic stock restoration) |
| `/api/v1/orders/:id/replacement` | `POST` | Authenticated | Server Action / `actions/orders.ts` | Validates 7-day policy from `delivered_at`, updates replacement status |
| `/api/v1/payments/create-intent` | `POST` | Authenticated | `app/api/payments/create-intent/route.ts`| Authoritative server calculation, creates Razorpay Order, inserts `payments` record |
| `/api/v1/payments/verify` | `POST` | Authenticated | `app/api/payments/verify/route.ts` | HMAC-SHA256 signature verification, marks order and payment `Paid`, dispatches email |
| `/api/v1/payments/webhook` | `POST` | Public (Signed)| `app/api/payments/webhook/route.ts` | Reads raw request body, verifies webhook signature, idempotently processes events |
| `/api/v1/delhivery/serviceability` | `GET` | Public | `app/api/delhivery/serviceability/route.ts` | Proxies check to Delhivery PIN-code API with caching |
| `/api/v1/delhivery/track/:awb` | `GET` | Public | `app/api/delhivery/track/[awb]/route.ts` | Proxies tracking request to Delhivery |
| `/api/v1/delhivery/webhook` | `POST` | Public (Signed)| `app/api/delhivery/webhook/route.ts` | Webhook verification, updates order status and marks COD paid on delivery |
| `/api/v1/admin/books` | `POST`, `GET` | Admin | Server Actions & Route Handlers (`app/api/admin/books/route.ts`) | Cloudinary upload + database insert; administrative list with inactive books |
| `/api/v1/admin/books/:id` | `PATCH`, `DELETE`| Admin | Server Actions in `actions/admin.ts` | Update details/stock, upload images, soft-delete book |
| `/api/v1/admin/orders` | `GET` | Admin | Server Component in `app/admin/orders` | Query all customer orders with status and payment filters |
| `/api/v1/admin/orders/:id/status` | `PATCH` | Admin | Server Action in `actions/admin.ts` | Enforces `ORDER_STATUS_TRANSITIONS` state machine |
| `/api/v1/admin/orders/:id/shipment` | `POST` | Admin | Server Action in `actions/admin.ts` | Calls Delhivery API, saves AWB & tracking URL, marks `Shipped` |
| `/api/v1/admin/orders/:id/replacement/:action` | `POST` | Admin | Server Action in `actions/admin.ts` | Approves or rejects replacement request with mandatory reason |
| `/api/v1/admin/users` | `GET` | Admin | Server Component in `app/admin/users` | Lists registered customer profiles |
| `/api/v1/admin/users/:id/block` | `PATCH` | Admin | Server Action in `actions/admin.ts` | Sets `is_blocked = true` in profile and revokes Supabase Auth refresh tokens |
| `/api/v1/admin/dashboard/stats` | `GET` | Admin | Server Component / `actions/admin.ts` | SQL aggregations for total revenue, active orders, customer counts |
| `/api/v1/admin/dashboard/sales` | `GET` | Admin | Server Component / `actions/admin.ts` | Monthly revenue pipeline and top 5 selling book aggregations |

