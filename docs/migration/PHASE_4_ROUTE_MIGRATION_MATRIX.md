# Phase 4 — Route Migration Matrix
**Project:** MD Shakib Islamic Books  
**Audit Date:** 2026-10-28  
**Scope:** Complete inventory and mapping of customer-facing routes from React Router (`client/src/routes/AppRoutes.jsx`) to Next.js App Router (`apps/web/app/`).  

---

## 1. Route Migration Matrix

| Legacy Path (`client/`) | Next.js App Router Path (`apps/web/`) | Legacy Component | Dynamic / Query Params | Feature Parity Status | Visual Verification | Backend Status | Remaining Phase 5 Integrations |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | `app/page.tsx` | `HomePage.jsx` | None | **IMPLEMENTED** | **PASS** | UI Shell / Fixtures | Live Supabase catalog feed |
| `/books` | `app/books/page.tsx` | `BooksPage.jsx` | `?category=`, `?search=` | **IMPLEMENTED** | **PASS** | Client-side fixture filter | Supabase full-text search & pagination |
| `/books/:id` | `app/books/[id]/page.tsx` | `BookDetailsPage.jsx` | `[id]` (UUID/Slug) | **IMPLEMENTED** | **PASS** | Mock fixtures / 404 on invalid | Supabase `books` table lookup & related query |
| `/cart` | `app/cart/page.tsx` | `CartPage.jsx` | None | **IMPLEMENTED** | **PASS** | Local state quantity toggle | Supabase `carts` & `cart_items` persistence |
| `/checkout` | `app/checkout/page.tsx` | `CheckoutPage.jsx` | None | **IMPLEMENTED** | **PASS** | Presentation & validation | Supabase RPC `create_order_atomic` & Razorpay |
| `/orders` | `app/orders/page.tsx` | `OrdersPage.jsx` | None | **IMPLEMENTED** | **PASS** | Sample customer order list | Supabase `orders` RLS query & realtime |
| `/orders/:id` | `app/orders/[id]/page.tsx` | `OrderDetailsPage.jsx`| `[id]` (Order ID) | **IMPLEMENTED** | **PASS** | Delhivery timeline / modals | Delhivery tracking webhook sync & replacement RPC |
| `/order-success` | `app/order-success/page.tsx`| `OrderSuccessPage.jsx` | None | **IMPLEMENTED** | **PASS** | Confirmation layout | Live order confirmation context |
| `/profile` | `app/profile/page.tsx` | `ProfilePage.jsx` | None | **IMPLEMENTED** | **PASS** | Form validation & fields | Supabase `profiles` update mutation |
| `/addresses` | `app/addresses/page.tsx` | `AddressesPage.jsx` | None | **IMPLEMENTED** | **PASS** | Local state address CRUD | Supabase `addresses` table CRUD & default flag |
| `/about` | `app/about/page.tsx` | `AboutPage.jsx` | None | **IMPLEMENTED** | **PASS** | Complete content & stats | None (Static presentation complete) |
| `/support` | `app/support/page.tsx` | `SupportPage.jsx` | None | **IMPLEMENTED** | **PASS** | Interactive FAQ accordion | None (Static presentation complete) |
| `/privacy-policy` | `app/privacy-policy/page.tsx` | N/A (Doc Link) | None | **IMPLEMENTED** | **PASS** | Standard legal policy | None (Static presentation complete) |
| `/terms` | `app/terms/page.tsx` | N/A (Doc Link) | None | **IMPLEMENTED** | **PASS** | Standard legal terms | None (Static presentation complete) |
| `/login` | `app/login/page.tsx` | `LoginPage.jsx` | None | **IMPLEMENTED** | **PASS** | Form validation & toggles | Supabase `auth.signInWithPassword` |
| `/register` | `app/register/page.tsx` | `RegisterPage.jsx` | None | **IMPLEMENTED** | **PASS** | Form validation & fields | Supabase `auth.signUp` |
| `/verify-email` | `app/verify-email/page.tsx` | `EmailVerificationPage.jsx` | None | **IMPLEMENTED** | **PASS** | Status layout | Supabase email link confirmation |
| `/verify-registration-otp` | `app/verify-registration-otp/page.tsx` | `VerifyRegistrationOTPPage.jsx` | None | **IMPLEMENTED** | **PASS** | OTP input form | Resend OTP verification logic |
| `/forgot-password`| `app/forgot-password/page.tsx`| `ForgotPasswordPage.jsx` | None | **IMPLEMENTED** | **PASS** | Form validation | Supabase `auth.resetPasswordForEmail` |
| `/verify-otp` | `app/verify-otp/page.tsx` | `VerifyOTPPage.jsx` | None | **IMPLEMENTED** | **PASS** | 6-digit OTP input form | Supabase OTP token verify |
| `/reset-password` | `app/reset-password/page.tsx` | `ResetPasswordPage.jsx` | None | **IMPLEMENTED** | **PASS** | Password mismatch check | Supabase `auth.updateUser` |

---

## 2. Admin Routes Status (Scheduled for Phase 6)

The following admin-specific routes from legacy `client/src/routes/AppRoutes.jsx` are strictly scheduled for **Phase 6: Admin Dashboard & Protected Operations**:
- `/admin` & `/admin/dashboard` (`AdminDashboardPage.jsx`)
- `/admin/books` (`AdminBooksPage.jsx`)
- `/admin/books/add` (`AdminAddBookPage.jsx`)
- `/admin/orders` (`AdminOrdersPage.jsx`)
- `/admin/users` (`AdminUsersPage.jsx`)
- `/admin/profile` (`AdminProfilePage.jsx`)

All 21 customer-facing storefront routes are implemented, verified, and passing smoke tests.

