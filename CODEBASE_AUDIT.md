

# Comprehensive Legacy Codebase Audit & Status Recovery Report

**Project Target:** `MD-Shakib` / `mdshakib-books`  
**Audit Mode:** Read-Only Forensic Codebase Investigation  
**Audit Date:** October 26, 2026  
**Auditor:** Senior Software Architect, Technical Lead, Code Auditor & Project Recovery Specialist  

---

## 1. Project Identity and Executive Summary

### 1.1 Project Identity & Business Context
* **Project Name:** MD Shakib Islamic Books (Repository: `MD-Shakib` / Client identifier: `mdshakib-books`)
* **Client / Business Brand:** MD Shakib Book Store
* **Core Business Problem:** A specialized direct-to-consumer (D2C) e-commerce platform for authentic Islamic literature, Qurans, Hadith collections, Fiqh, and biographies, catering to the Indian subcontinent (with currency configured in `INR - ₹` and domestic courier integrations).
* **Target Audience:** Readers and students seeking curated Islamic books across India.
* **User Roles:**
  1. **Guest / Public User:** Browse books, search by title/author/category, inspect book details, maintain a persistent client-side guest cart.
  2. **Registered Customer (`user`):** Email OTP verification upon registration, login with auto-refreshing JWTs, server-side cart synchronization, saved address management, checkout via Cash on Delivery (COD) or Razorpay Online Payment, order cancellation, replacement requests within 7 days, live order tracking via Socket.io / Delhivery tracking links.
  3. **Administrator (`admin`):** Full catalogue CRUD (multi-image Cloudinary uploads up to 5 images), stock adjustments, customer order lifecycle management (Pending → Confirmed → Packed → Shipped → Delivered → Cancelled), Delhivery shipment creation with automated AWB generation, replacement request approval/rejection, user account blocking/unblocking/soft-deletion, and audit trail inspection.

### 1.2 Repository Structure & Monorepo Configuration
The repository is structured as a two-tier decoupled client-server architecture:
```
/Users/arry03/Desktop/ARRRY/MD-Shakib
├── client/                     # Vite + React 19 Frontend SPA
│   ├── src/                    # Source components, pages, redux store, hooks, services
│   ├── package.json            # Client dependencies & scripts
│   └── vite.config.js          # Vite configuration with Tailwind CSS v4
├── server/                     # Node.js + Express 5 Backend REST API
│   ├── src/                    # Controllers, models, routes, middlewares, services, sockets
│   ├── features/POSTMAN/       # Postman test collections & environment files
│   ├── server.js               # HTTP + Socket.io Server bootstrap
│   ├── app.js                  # Express middleware pipeline & route mounts
│   └── package.json            # Server dependencies & scripts
├── IMPLEMENTATION_GUIDE.md     # Detailed changelog of previously implemented fixes
└── README.md                   # Repository overview
```

### 1.3 Project Age & Timeline Analysis
* **Initial Development Commit:** March 3, 2026 (`1e30b3d` - "adding backend/server first commit").
* **Last Development Activity:** March 15, 2026 (`376afa2` - "Merge pull request #24 from mdshakib-books/dev").
* **Development Duration:** A rapid 12-day sprint covering 24 pull requests.
* **Dormancy Period:** ~7 months of inactivity (March 2026 to October 2026).
* **Target Deployment Host:** Render (`https://mdshakib-books.onrender.com`), as evidenced by CORS configuration in [`server/app.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/app.js#L21) and proxy trust directives.

### 1.4 How the Application Works (End-to-End Flow)
1. **Frontend Boot:** The React 19 SPA mounts at [`client/src/main.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/main.jsx) wrapped in `Provider (Redux Toolkit)`, `BrowserRouter`, `AuthProvider`, `ToastProvider`, and `ErrorBoundary`.
2. **Catalog Browsing:** Visitors load [`HomePage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/HomePage.jsx) and [`BooksPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/BooksPage.jsx), fetching from `GET /api/v1/books` or `GET /api/v1/books/search`.
3. **Cart & Guest Transition:** Guests store items in `localStorage` (`guest_cart`). Upon authentication, `loginUser` thunk dispatches `mergeCart`, automatically synchronizing the local guest cart into MongoDB via `POST /api/v1/cart/merge`.
4. **Registration & Auth:** Registration requires two steps: email verification via Google Gmail REST API OTP (`POST /api/v1/users/send-registration-otp` and `/verify-registration-otp`), followed by account creation (`POST /api/v1/users/register`).
5. **Checkout & Ordering:** Customers select an address and choose either COD or Razorpay Online. Placing an order triggers `POST /api/v1/orders`. Stock is decremented atomically inside MongoDB transactions.
6. **Payment & Realtime Notifications:** Razorpay triggers the client checkout modal, verifies payment signatures via HMAC SHA-256 on `POST /api/v1/payments/verify` or via webhook at `POST /api/v1/payments/webhook`. Socket.io pushes `orderStatusUpdated` and `orderPaid` events directly to the user's browser room and admin dashboard.

### 1.5 Executive Verdict & Key Blockers
The project possesses a modern codebase with high architectural maturity (MongoDB transactions, atomic stock operations, audit logging, OAuth2 Gmail integration, dual token JWT rotation, and Socket.io event propagation). However, it is blocked from production resumption by four critical defects:
1. **Frontend Error Boundary Crash:** [`ErrorBoundary.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/ErrorBoundary.jsx#L39) checks `process.env.NODE_ENV`, which throws `ReferenceError: process is not defined` in Vite browser runtime, crashing the error boundary itself upon any React error.
2. **GET Route Body Validation Bug:** [`server/src/middlewares/validate.middleware.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/middlewares/validate.middleware.js#L4) validates `req.body`, but is mounted on GET routes (`/api/v1/books`), causing search and filter validations to be completely bypassed.
3. **Price/Fee Discrepancy:** The frontend [`CheckoutPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/CheckoutPage.jsx#L14-L50) adds `₹10 Platform Fee` and `₹35 Delivery Fee`, but [`order.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/order.service.js#L76-L96) calculates order totals strictly as `sum(items)`, resulting in a ₹45 undercharge on every online payment intent and COD order.
4. **Unauthenticated Socket.io Rooms:** Socket.io listeners (`join_user_room`, `join_admin_room`) perform zero authentication, allowing any connected web client to listen to administrative order broadcasts and personal user order streams.

---

## 2. Technology Stack and Architecture

### 2.1 Technology Matrix

| Layer | Component | Version / Specification | Purpose & Implementation Details |
| :--- | :--- | :--- | :--- |
| **Frontend Core** | React | `^19.2.0` | Declarative UI framework |
| | React DOM | `^19.2.0` | Browser DOM rendering engine |
| | Vite | `^7.3.1` | ESM build tool and local development server |
| **Frontend Styling** | Tailwind CSS | `^4.2.0` (`@tailwindcss/vite`) | Utility-first CSS styling; dark luxury gold theme |
| | React Icons | `^5.6.0` | Iconography (`react-icons/fi`, `react-icons/fa`) |
| | Lottie | `^0.18.3` (`@lottiefiles/dotlottie-react`)| Animated JSON vector graphics |
| **Frontend State & API** | Redux Toolkit | `^2.11.2` (`@reduxjs/toolkit`) | Centralized state management (`auth`, `cart`, `books`, `orders`) |
| | React Redux | `^9.2.0` | React bindings for Redux store |
| | React Router DOM | `^7.13.1` | Client-side routing, protected routes, URL state |
| | Axios | `^1.13.6` | HTTP client with automatic 401 refresh token interceptor |
| | Socket.io Client | `^4.8.3` | Real-time WebSocket connection to backend |
| | Chart.js & React-Chartjs-2 | `^4.5.1` / `^5.3.1` | Canvas-based data charts (Admin Analytics) |
| **Backend Core** | Node.js | `>=18.x` (ES Modules `"type": "module"`) | JavaScript server runtime |
| | Express | `^5.2.1` | Web framework (using modern Express 5) |
| | HTTP Server | Node.js native `http.createServer(app)` | Server wrapping Express and Socket.io |
| **Backend Database** | MongoDB | Mongoose `^9.2.1` | Document database ODM |
| **Backend Real-Time** | Socket.io | `^4.8.3` | WebSocket bidirectional event server |
| **Security & Auth** | JWT (`jsonwebtoken`) | `^9.0.3` | Dual access token (15m/1d) + refresh token (7d/10d) |
| | Bcrypt | `^6.0.0` | Password hashing (salt rounds: 10) |
| | Helmet | `^8.1.0` | HTTP security headers |
| | Express Rate Limit | `^8.2.1` | Rate limiting (1000 requests / 15 min window) |
| | Cookie Parser | `^1.4.7` | Signed/HTTP-only cookie serialization |
| | Joi | `^18.0.2` | Schema-based payload validation |
| **Media & Storage** | Cloudinary | `^2.9.0` (`cloudinary.v2`) | Cloud asset storage for book covers & gallery |
| | Multer | `^2.0.2` | Multipart form data parser (`./public/temp`) |
| **Integrations** | Razorpay SDK | `^2.9.6` | Payment gateway orders and signature verification |
| | Google APIs (`googleapis`) | `^171.4.0` | Gmail REST API v1 via OAuth2 for transactional emails |
| | Delhivery Logistics | Custom REST client (Axios) | Pincode serviceability, shipment AWB, and tracking |

### 2.2 System Architecture Overview

```mermaid
flowchart TD
    subgraph Client["Frontend Client (Vite + React 19)"]
        UI["React Components & Pages\n(Dark Luxury Theme)"]
        Store["Redux Toolkit Store\n(auth, cart, books, orders)"]
        Axios["Axios HTTP Client\n(with Auto-Refresh Interceptor)"]
        SocketClient["Socket.io Client\n(useSocket Hook)"]
        UI --> Store
        Store --> Axios
        UI --> SocketClient
    end

    subgraph Server["Backend Server (Node.js + Express 5)"]
        HTTP["Express 5 HTTP Pipeline\n(Helmet, CORS, RateLimit, AuditLog)"]
        SocketServer["Socket.io Engine\n(order.socket.js)"]
        Router["API v1 Routers\n(users, books, cart, orders, payments, admin, delivery)"]
        Services["Business Service Layer\n(user, book, cart, order, payment, delhivery, audit)"]
        
        HTTP --> Router
        Router --> Services
    end

    subgraph Data["Persistence & Storage"]
        Mongo[("MongoDB Atlas\n(Mongoose 9.2 Models & Transactions)")]
        LocalTemp[("Server Disk\n(./public/temp)")]
    end

    subgraph External["Third-Party Integrations"]
        RazorpayGateway["Razorpay Payments API\n(Orders, HMAC SHA256 Webhook)"]
        CloudinaryAPI["Cloudinary Cloud Media\n(Books & Covers)"]
        GoogleGmailAPI["Google Gmail REST API\n(OAuth2 Token Exchange)"]
        DelhiveryAPI["Delhivery Logistics API\n(Pincode Serviceability & Tracking)"]
    end

    Axios -->|"HTTPS (JSON / withCredentials)"| HTTP
    SocketClient <-->|"WSS (Bidirectional Events)"| SocketServer
    Services -->|"Atomic Transactions / Mongoose"| Mongo
    Services --> LocalTemp
    LocalTemp -->|"Upload & Unlink"| CloudinaryAPI
    Services -->|"Create Order & Verify Signature"| RazorpayGateway
    Services -->|"Send Base64 Encoded Emails"| GoogleGmailAPI
    Services -->|"Waybill Generation & Tracking"| DelhiveryAPI
    SocketServer -.->|"Push Order / Payment Updates"| SocketClient
```

---

## 3. Current Project Status

### 3.1 Overall Readiness Verdict
* **Backend Implementation:** ~85% complete. High quality service layer, atomic stock reduction via MongoDB transactions, idempotency checks, HMAC signature validation for Razorpay webhooks, and audit logging.
* **Frontend Implementation:** ~75% complete. Core shopping, customer account, multi-image book details, and order tracking flows are functional. However, the Admin Dashboard is 100% placeholder data, and several secondary routes (About, Support, Footer legal links) lack backend integration.
* **Testing & QA Coverage:** < 10%. Zero automated unit or integration tests (no Vitest/Jest suite). Only manual Postman collections and two standalone node scripts exist.
* **Production Deployment Readiness:** **BLOCKED**. Requires resolving the Vite `process.env` ErrorBoundary bug, the order fee mismatch, the Socket.io security vulnerability, and configuring production OAuth2/Razorpay environment credentials.

---

## 4. Complete Feature Status Matrix

| Feature Name | Business Purpose | Target Roles | Frontend Pages / Components | Backend Endpoints & Services | Models Involved | Tests Available | Status | Supporting Evidence & Gaps |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Email OTP Registration** | Verify customer email before creating account | Guest / Customer | [`EmailVerificationPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/EmailVerificationPage.jsx), [`VerifyRegistrationOTPPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/VerifyRegistrationOTPPage.jsx), [`RegisterPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/RegisterPage.jsx) | `POST /users/send-registration-otp`, `POST /users/verify-registration-otp`, `POST /users/register` in [`user.controller.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/controllers/user.controller.js#L14) | `RegistrationOtp`, `User` | Postman Auth collection | **COMPLETE AND VERIFIED** | 6-digit OTP generated, rate-limited (max 3 per 10m), verified flag checked before account creation in [`user.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/user.service.js#L184). |
| **Authentication & Token Rotation** | Secure session management with JWT | Customer, Admin | [`LoginPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/LoginPage.jsx), [`authSlice.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/redux/slices/authSlice.js), [`axios.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/api/axios.js) | `POST /users/login`, `POST /users/logout`, `POST /users/refresh-token` in [`user.controller.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/controllers/user.controller.js#L46) | `User`, `AuditLog` | Postman Auth collection | **COMPLETE AND VERIFIED** | Bcrypt hashing, dual tokens (accessToken in body + cookies), auto-retry on 401 with request queuing in [`axios.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/api/axios.js#L42). |
| **Password Reset via OTP** | Account recovery without email magic links | Customer, Admin | [`ForgotPasswordPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/ForgotPasswordPage.jsx), [`VerifyOTPPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/VerifyOTPPage.jsx), [`ResetPasswordPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/ResetPasswordPage.jsx) | `POST /users/send-otp`, `POST /users/verify-otp`, `POST /users/reset-password` | `User`, `EmailLog` | Postman Auth collection | **COMPLETE AND VERIFIED** | Verified OTP flow sets `isOtpVerified = true` on `User` model, updates password, clears OTP fields, returns new JWTs. |
| **Catalogue Browsing & Filtering** | Display Islamic books with categories & pricing | Public / All | [`BooksPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/BooksPage.jsx), [`CategoryTabs.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/CategoryTabs.jsx), [`ProductGrid.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/ProductGrid.jsx) | `GET /books`, `GET /books/category/:category`, `GET /books/featured` | `Book` | Postman Books collection | **COMPLETE AND VERIFIED** | Pagination, category filtering, discount calculations, active status checks implemented in [`book.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/book.service.js#L7). |
| **Book Search (Text & Partial)** | Find books by title, author, description | Public / All | [`SearchBar.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/SearchBar.jsx), [`BooksPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/BooksPage.jsx) | `GET /books/search` | `Book` | Postman Books collection | **IMPLEMENTED, VERIFICATION INCOMPLETE** | Works via regex, but vulnerable to ReDoS and syntax crashes due to unescaped regex characters in [`book.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/book.service.js#L58). |
| **Book Detail & Multi-Image Gallery** | Detailed product information & images | Public / All | [`BookDetailsPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/BookDetailsPage.jsx) | `GET /books/:id`, `GET /books/:id/related`, `GET /books/featured` | `Book` | Postman Books collection | **COMPLETE AND VERIFIED** | Multi-image thumbnail gallery, metadata table (pages, language, publisher), related books carousel. |
| **Cart & Guest-to-User Merge** | Cart persistence across guest & authenticated states | Guest / Customer | [`CartPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/CartPage.jsx), [`cartSlice.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/redux/slices/cartSlice.js) | `GET /cart`, `POST /cart/add`, `PATCH /cart/update/:id`, `DELETE /cart/remove/:id`, `POST /cart/merge` | `Cart`, `Book` | Postman Cart collection | **COMPLETE AND VERIFIED** | Dual storage in localStorage and MongoDB with automatic merge on login in [`authSlice.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/redux/slices/authSlice.js#L26). |
| **Customer Address Management** | Manage shipping addresses | Customer | [`AddressesPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AddressesPage.jsx), [`AddressForm.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/AddressForm.jsx), [`AddressSelector.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/AddressSelector.jsx) | `GET /addresses`, `POST /addresses`, `PATCH /addresses/:id`, `DELETE /addresses/:id`, `PATCH /addresses/:id/default` | `Address` | Postman Address collection | **COMPLETE AND VERIFIED** | Full address CRUD, default address enforcement, address snapshots on order placement. |
| **Order Placement (COD)** | Place orders with Cash on Delivery | Customer | [`CheckoutPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/CheckoutPage.jsx), [`OrderSuccessPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/OrderSuccessPage.jsx) | `POST /orders` in [`order.controller.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/controllers/order.controller.js#L5) | `Order`, `Cart`, `Book`, `Address` | [`testOrder.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/testOrder.js) (has bug) | **IMPLEMENTED, VERIFICATION INCOMPLETE** | Stock reduced atomically via transaction. **Defect:** Frontend displays ₹45 extra fees, backend charges item subtotal only. |
| **Online Payment (Razorpay)** | Prepaid payments via Razorpay Gateway | Customer | [`CheckoutPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/CheckoutPage.jsx), [`paymentService.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/services/paymentService.js) | `POST /payments/create-intent`, `POST /payments/verify`, `POST /payments/failure`, `POST /payments/webhook` | `Payment`, `Order` | [`test_full_order_lifecycle.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/test_full_order_lifecycle.js) | **COMPLETE AND VERIFIED** | Checkout modal loads dynamic Razorpay SDK, verifies HMAC SHA-256 signature, supports retry payment. |
| **Live Order Tracking** | Step-by-step visual delivery timeline | Customer | [`OrderDetailsPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/OrderDetailsPage.jsx), [`OrderTrackingTimeline.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/OrderTrackingTimeline.jsx) | `GET /orders/:id` + Socket.io event `orderStatusUpdated` | `Order` | Postman Orders collection | **COMPLETE AND VERIFIED** | Visual status timeline, statusHistory log, Socket.io push updates with 30s polling fallback. |
| **Order Cancellation** | Customer order cancellation before shipping | Customer | [`OrderDetailsPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/OrderDetailsPage.jsx) | `PATCH /orders/:id/cancel` in [`order.controller.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/controllers/order.controller.js#L26) | `Order`, `Book` | Postman Orders collection | **COMPLETE AND VERIFIED** | Validates status is not Shipped/Delivered, atomically restores inventory stock via transaction. |
| **Replacement Request (7 Days)** | Post-delivery book replacement request | Customer | [`OrderDetailsPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/OrderDetailsPage.jsx) | `POST /orders/:id/replacement` | `Order` | Postman Orders collection | **COMPLETE AND VERIFIED** | Restricts to `Delivered` status and enforces 7-day window from `deliveredAt` in [`order.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/order.service.js#L214). |
| **Admin Book Management** | Create, edit, delete books with multi-image Cloudinary | Admin | [`AdminBooksPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminBooksPage.jsx), [`AdminAddBookPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminAddBookPage.jsx) | `POST /admin/books`, `PATCH /admin/books/:id`, `DELETE /admin/books/:id`, `PATCH /admin/books/:id/stock`, `PATCH /admin/books/:id/cover` | `Book` | Postman Admin collection | **COMPLETE AND VERIFIED** | Multer multipart handler, Cloudinary upload, primary cover selector, stock updates, soft-delete via `isActive: false`. |
| **Admin Order Lifecycle & Replacements** | Manage order transitions and process replacements | Admin | [`AdminOrdersPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminOrdersPage.jsx) | `GET /admin/orders`, `PATCH /admin/orders/:id/status`, `POST /admin/orders/:id/replacement/approve`, `POST /admin/orders/:id/replacement/reject` | `Order` | Postman Admin collection | **COMPLETE AND VERIFIED** | Strict status transition map (`ORDER_STATUS_TRANSITIONS`), real-time Socket.io admin room notifications. |
| **Admin Delhivery Courier Integration** | Create waybill and shipment with Delhivery | Admin | [`AdminOrdersPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminOrdersPage.jsx) | `POST /admin/orders/:id/shipment` in [`admin.controller.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/controllers/admin.controller.js#L143) | `Order` | Manual code inspection | **PARTIALLY IMPLEMENTED** | Code exists, but [`delhivery.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/delhivery.service.js#L77-L84) has placeholder store address ("DefaultCity", "9999999999") and unverified token. |
| **Delhivery Pincode Serviceability** | Check courier availability by pincode | Public / Customer | *None in frontend* | `GET /delhivery/serviceability?pincode=...` | None | None | **PLACEHOLDER / NOT IMPLEMENTED** | Backend endpoint exists in [`delivery.controller.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/controllers/delivery.controller.js#L16), but no frontend UI calls it. |
| **Admin User Management** | View customers, block/unblock, delete | Admin | [`AdminUsersPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminUsersPage.jsx) | `GET /admin/users`, `PATCH /admin/users/:id/block`, `PATCH /admin/users/:id/unblock`, `DELETE /admin/users/:id` | `User` | Postman Admin collection | **COMPLETE AND VERIFIED** | Soft delete filtering, blocking triggers cookie clearing and session termination on subsequent requests. |
| **Admin Analytics Dashboard** | Real-time sales, order counts, revenue charts | Admin | [`AdminDashboardPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminDashboardPage.jsx) | `GET /admin/dashboard/stats`, `GET /admin/dashboard/sales` | `Order`, `Book`, `User` | Postman Admin collection | **UI ONLY / MOCK DATA** | Backend aggregation pipelines exist in [`dashboard.utils.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/utils/dashboard.utils.js), but frontend uses hardcoded stats (124 books, 48 orders) and empty `fetchDashboardStats` stub. |
| **Customer Reviews** | Display user testimonials | Public | [`Reviews.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/home/Reviews.jsx) | *None* | *None* | None | **UI ONLY / MOCK DATA** | Hardcoded array of 3 reviews in React component. No backend model or submission form exists. |
| **Support Center & Contact** | Help center, FAQs, contact form | Public | [`SupportPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/SupportPage.jsx) | *None* | *None* | None | **UI ONLY / MOCK DATA** | Static FAQ accordion. "Contact Support" button has no click handler or form submission. |
| **Audit Logging System** | Compliance logging for mutations and logins | Internal | *None (DB level)* | `audit.middleware.js` auto-attached to Express pipeline | `AuditLog` | DB query checks | **COMPLETE AND VERIFIED** | Automatically captures IP, User-Agent, model name, diffs, and TTL auto-cleanup after 30 days. |

---

## 5. Pages, Routes, APIs, and User Journeys

### 5.1 Frontend Route Inventory

All routes are declared in [`client/src/routes/AppRoutes.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/routes/AppRoutes.jsx):

| Route Path | Associated Page Component | Access Level | Description & State Handling |
| :--- | :--- | :--- | :--- |
| `/` | [`HomePage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/HomePage.jsx) | Public | Hero banner, trust badges, top 8 books carousel, order steps, mock reviews. |
| `/books` | [`BooksPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/BooksPage.jsx) | Public | Search input with debounce, category tabs, paginated book grid. |
| `/books/:id` | [`BookDetailsPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/BookDetailsPage.jsx) | Public | Multi-image gallery, pricing, stock indicator, related & popular books. |
| `/about` | [`AboutPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AboutPage.jsx) | Public | Brand narrative, values, customer statistics. |
| `/support` | [`SupportPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/SupportPage.jsx) | Public | Interactive FAQ accordion (no active contact form). |
| `/verify-email` | [`EmailVerificationPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/EmailVerificationPage.jsx) | Public | Step 1 of registration: triggers email OTP via Gmail API. |
| `/verify-registration-otp` | [`VerifyRegistrationOTPPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/VerifyRegistrationOTPPage.jsx) | Public | Step 2 of registration: 6-digit OTP verification. |
| `/register` | [`RegisterPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/RegisterPage.jsx) | Public (Guarded) | Step 3: Enter name & password. Redirects to `/verify-email` if not verified. |
| `/login` | [`LoginPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/LoginPage.jsx) | Public | Credentials form, password visibility toggle, forgot password link. |
| `/forgot-password` | [`ForgotPasswordPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/ForgotPasswordPage.jsx) | Public | Enter email to request 6-digit password reset OTP. |
| `/verify-otp` | [`VerifyOTPPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/VerifyOTPPage.jsx) | Public (Guarded) | Enter 6-digit password reset OTP (reads `sessionStorage.otp_email`). |
| `/reset-password` | [`ResetPasswordPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/ResetPasswordPage.jsx) | Public (Guarded) | Submit new password after OTP verification; auto-logs in. |
| `/cart` | [`CartPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/CartPage.jsx) | Public / Hybrid | Manages guest items (`localStorage`) or DB items; price breakdown. |
| `/checkout` | [`CheckoutPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/CheckoutPage.jsx) | Protected (`user`) | Address selection, payment mode (COD / Razorpay), order submission. |
| `/order-success` | [`OrderSuccessPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/OrderSuccessPage.jsx) | Protected (`user`) | Order confirmation screen with link to track order. |
| `/orders` | [`OrdersPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/OrdersPage.jsx) | Protected (`user`) | Customer order history list with status badges and timestamps. |
| `/orders/:id` | [`OrderDetailsPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/OrderDetailsPage.jsx) | Protected (`user`) | Visual tracking timeline, replacement modal, cancel order action. |
| `/profile` | [`ProfilePage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/ProfilePage.jsx) | Protected (`user`) | Profile editor, password changer, address book, recent orders tab. |
| `/addresses` | [`AddressesPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AddressesPage.jsx) | Protected (`user`) | Customer address management CRUD. |
| `/admin`, `/admin/dashboard`| [`AdminDashboardPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminDashboardPage.jsx) | Protected (`admin`)| Admin metrics cards & charts (**Mock Data**). |
| `/admin/books` | [`AdminBooksPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminBooksPage.jsx) | Protected (`admin`)| Book list table, inline stock updates, image gallery modal. |
| `/admin/books/add` | [`AdminAddBookPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminAddBookPage.jsx) | Protected (`admin`)| Add book form with multi-image upload & preview. |
| `/admin/orders` | [`AdminOrdersPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminOrdersPage.jsx) | Protected (`admin`)| Order management, status transitions, shipment creation, replacements. |
| `/admin/users` | [`AdminUsersPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminUsersPage.jsx) | Protected (`admin`)| User directory, account blocking/unblocking, deletion modal. |
| `/admin/profile` | [`AdminProfilePage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminProfilePage.jsx) | Protected (`admin`)| Admin personal profile and credentials management. |
| `*` | [`NotFoundPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/NotFoundPage.jsx) | Public | 404 catch-all page styled in gold/dark luxury theme. |

*Dead/Unrouted Code Note:* [`client/src/pages/Dashboard/`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/Dashboard/Dashboard.jsx), [`client/src/pages/Login/`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/Login/Login.jsx), and [`client/src/pages/NotFound.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/NotFound.jsx) are legacy scaffolding files not routed in `AppRoutes.jsx`.

### 5.2 Backend API Endpoint Reference

#### Public Endpoints
* `POST /api/v1/users/send-registration-otp`: Sends 6-digit OTP via Gmail API to unverified email.
* `POST /api/v1/users/verify-registration-otp`: Verifies OTP and flags email as ready for registration.
* `POST /api/v1/users/register`: Creates new user account (enforces password complexity and verified OTP record).
* `POST /api/v1/users/login`: Authenticates credentials; returns `{ user, accessToken, refreshToken }` and sets HTTP-only cookies.
* `POST /api/v1/users/refresh-token`: Rotates access and refresh tokens.
* `POST /api/v1/users/send-otp`: Sends password reset OTP.
* `POST /api/v1/users/verify-otp`: Validates password reset OTP.
* `POST /api/v1/users/reset-password`: Sets new password and auto-issues authentication tokens.
* `GET /api/v1/books`: Paginated book catalogue (supports `category`, `minPrice`, `maxPrice`, `page`, `limit`, `sort`).
* `GET /api/v1/books/search`: Regex-based book search across title, author, description, category.
* `GET /api/v1/books/featured`: Returns 8 newest active books.
* `GET /api/v1/books/category/:category`: Books filtered by specific category.
* `GET /api/v1/books/:id`: Full details for a single active book.
* `GET /api/v1/books/:id/related`: Up to 4 related books in the same category.
* `POST /api/v1/payments/webhook`: Razorpay payment webhook (HMAC-SHA256 signature verified via raw body).
* `POST /api/v1/delhivery/webhook`: Delhivery tracking webhook (processes status transitions).
* `GET /api/v1/delhivery/serviceability`: Courier pincode check.
* `GET /api/v1/delhivery/track/:awb`: Real-time tracking proxy to Delhivery API.

#### Authenticated Customer Endpoints (`verifyJWT`)
* `POST /api/v1/users/logout`: Clears HTTP-only cookies and logs logout audit event.
* `GET /api/v1/users/profile`: Retrieves current authenticated user profile.
* `PATCH /api/v1/users/profile`: Updates name or phone.
* `PATCH /api/v1/users/change-password`: Changes password requiring existing password verification.
* `DELETE /api/v1/users/account`: Performs soft delete (`isDeleted: true`, `isBlocked: true`).
* `GET /api/v1/cart`: Retrieves active cart populated with book titles, prices, stock, and images.
* `POST /api/v1/cart/add`: Adds book to cart with stock validation.
* `PATCH /api/v1/cart/update/:bookId`: Updates quantity of an item in cart.
* `DELETE /api/v1/cart/remove/:bookId`: Removes item from cart.
* `DELETE /api/v1/cart/clear`: Clears all items in cart.
* `POST /api/v1/cart/merge`: Merges guest cart items into database cart.
* `POST /api/v1/addresses`: Creates new delivery address.
* `GET /api/v1/addresses`: Lists all addresses for authenticated user.
* `PATCH /api/v1/addresses/:id`: Updates existing address.
* `DELETE /api/v1/addresses/:id`: Deletes address.
* `PATCH /api/v1/addresses/:id/default`: Sets address as primary default.
* `POST /api/v1/orders`: Places order (atomic stock deduction, idempotency check, cart clearing).
* `GET /api/v1/orders`: Paginated list of customer orders.
* `GET /api/v1/orders/:id`: Full order details including payment record and status history.
* `PATCH /api/v1/orders/:id/cancel`: Cancels order and restores book stock atomically.
* `POST /api/v1/orders/:id/replacement`: Submits replacement request (valid within 7 days of delivery).
* `POST /api/v1/payments/create-intent`: Creates Razorpay order for online payment.
* `POST /api/v1/payments/verify`: Verifies Razorpay signature and marks order as Paid.
* `POST /api/v1/payments/failure`: Records payment failure note.
* `POST /api/v1/payments/retry`: Recreates or returns payment intent for unpaid orders.

#### Administrator Endpoints (`verifyJWT` + `isAdmin`)
* `POST /api/v1/admin/books`: Creates new book with up to 5 images via Multer + Cloudinary.
* `GET /api/v1/admin/books`: Administrative book list (including inactive books).
* `GET /api/v1/admin/books/:id`: Retrieves any book by ID.
* `PATCH /api/v1/admin/books/:id`: Updates book details and uploads additional images.
* `DELETE /api/v1/admin/books/:id`: Soft-deletes book (`isActive: false`).
* `PATCH /api/v1/admin/books/:id/stock`: Adjusts inventory quantity.
* `PATCH /api/v1/admin/books/:id/cover`: Sets primary display cover from existing image gallery.
* `DELETE /api/v1/admin/books/:id/image`: Deletes specific image from Cloudinary and array.
* `GET /api/v1/admin/orders`: Retrieves all orders across all customers with filters.
* `GET /api/v1/admin/orders/:id`: Retrieves complete administrative order dossier.
* `PATCH /api/v1/admin/orders/:id/status`: Updates order status enforcing `ORDER_STATUS_TRANSITIONS`.
* `PATCH /api/v1/admin/orders/:id/cancel`: Administrative cancellation with stock restoration.
* `POST /api/v1/admin/orders/:id/shipment`: Generates Delhivery consignment and stores AWB.
* `POST /api/v1/admin/orders/:id/replacement/approve`: Approves replacement request.
* `POST /api/v1/admin/orders/:id/replacement/reject`: Rejects replacement with mandatory reason.
* `GET /api/v1/admin/users`: Lists all users with pagination.
* `GET /api/v1/admin/users/:id`: User details.
* `PATCH /api/v1/admin/users/:id/block`: Blocks user and invalidates active sessions.
* `PATCH /api/v1/admin/users/:id/unblock`: Restores user access.
* `DELETE /api/v1/admin/users/:id`: Soft-deletes user.
* `GET /api/v1/admin/dashboard/stats`: Returns total revenue, order count, books, user counts.
* `GET /api/v1/admin/dashboard/sales`: Aggregates monthly revenue and top 5 best-selling books.

### 5.3 Major User Journey Walkthroughs

#### Journey A: Customer Registration & Onboarding
1. User clicks "Sign Up" or navigates to `/verify-email`.
2. User enters email → `POST /users/send-registration-otp` creates `RegistrationOtp` record and sends 6-digit OTP via Google Gmail REST API.
3. User is redirected to `/verify-registration-otp`.
4. User enters 6 digits → `POST /users/verify-registration-otp` validates code, checks attempts (< 5), and marks `verified: true`.
5. Frontend navigates to `/register` (pre-fills email from `sessionStorage`).
6. User enters Name and Strong Password → `POST /users/register` validates complexity, verifies OTP record, hashes password with Bcrypt, and removes OTP document.
7. Frontend auto-dispatches `loginUser` and redirects to `/`.
*Break Point:* If the user's browser blocks cookies or localStorage is disabled, the flow completes on the backend but fails to set client authentication state.

#### Journey B: Catalogue Browsing, Cart Merge & Checkout
1. Guest visits `/books`, searches for a book, and clicks "Add to Cart" → Stored in `localStorage` under `guest_cart`.
2. Guest navigates to `/cart` and clicks "Proceed to Checkout".
3. [`ProtectedRoute.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/ProtectedRoute.jsx#L17) intercepts unauthenticated visitor and redirects to `/login` with `state: { from: "/checkout" }`.
4. User logs in → `loginUser` automatically reads `localStorage.guest_cart`, calls `POST /api/v1/cart/merge`, and purges `guest_cart`.
5. User is redirected to `/checkout`.
6. User selects shipping address and payment method (e.g. Razorpay).
7. User clicks "Place Order" → `orderService.createOrder` creates order record, atomically decrements inventory stock inside a MongoDB transaction, clears DB cart, and emits Socket.io `newOrder` event.
8. If Razorpay: Frontend calls `paymentService.createPaymentIntent` → Razorpay SDK opens checkout popup → User enters test/live payment details → Razorpay returns payment ID and signature → Client sends to `POST /api/v1/payments/verify`.
9. Backend verifies HMAC-SHA256 signature, updates order to `Paid`, and emits Socket.io `orderPaid`.
10. Customer is redirected to `/order-success?orderId=...`.
*Break Point:* If stock is 0, the transaction aborts with 400. If an unhandled frontend price discrepancy occurs (UI displays Subtotal + ₹45, backend creates order for Subtotal only), the customer pays the subtotal amount only.

#### Journey C: Admin Order Fulfillment & Delhivery Dispatch
1. Admin logs in with `admin` role and navigates to `/admin/orders`.
2. New incoming order appears via Socket.io event `orderCreated`.
3. Admin moves status from `Pending` → `Confirmed` → `Packed`.
4. Admin clicks "Create Shipment" → Calls `POST /admin/orders/:id/shipment`.
5. Backend invokes `delhiveryService.createShipment(order)` → Delhivery returns Waybill / AWB.
6. Order status updates to `Shipped`, tracking URL and AWB are saved, and Socket.io notifies the customer.
*Break Point:* In [`delhivery.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/delhivery.service.js#L77-L84), pickup location data is hardcoded to dummy values (`DefaultCity`, `pin_code: 110001`, `phone: 9999999999`), which will be rejected by live Delhivery API validations.

---

## 6. Database and Data Flow

### 6.1 Entity-Relationship Diagram

```mermaid
erDiagram
    User ||--o{ Order : places
    User ||--o{ Address : owns
    User ||--o| Cart : maintains
    User ||--o{ Payment : authorizes
    User ||--o{ AuditLog : triggers

    Cart ||--o{ CartItem : contains
    CartItem }|--|| Book : references

    Order ||--|{ OrderItem : contains
    OrderItem }|--|| Book : snapshots
    Order ||--|| AddressSnapshot : embeds
    Order ||--o{ StatusHistory : tracks
    Order ||--o| ShippingDetails : embeds
    Order ||--o| ReplacementDetails : embeds
    Order ||--o{ Payment : generates
    Order ||--o{ EmailLog : audits

    RegistrationOtp {
        string email PK
        number otp
        date expiresAt
        boolean verified
        number attempts
        number otpSentCount
        date rateLimitWindowStart
    }

    User {
        ObjectId _id PK
        string name
        string email UK
        string password
        string role
        string phone
        boolean isBlocked
        boolean isDeleted
        date deletedAt
        number resetOtp
        date otpExpires
        boolean isOtpVerified
    }

    Book {
        ObjectId _id PK
        string title
        string author
        string description
        number price
        number stock
        number discount
        string category
        string language
        number pages
        string publisher
        date publishedDate
        string imageUrl
        array images
        string coverImage
        boolean isActive
    }

    Cart {
        ObjectId _id PK
        ObjectId userId FK
        array items
    }

    Address {
        ObjectId _id PK
        ObjectId userId FK
        string fullName
        string phone
        string pincode
        string state
        string city
        string houseNo
        string area
        string landmark
        string addressType
        boolean isDefault
    }

    Order {
        ObjectId _id PK
        ObjectId userId FK
        array items
        object address
        number totalAmount
        string paymentMethod
        string paymentStatus
        string orderStatus
        array statusHistory
        object shipping
        object replacement
        string cancelReason
        boolean isPaid
        date paidAt
        date deliveredAt
        string razorpayOrderId
        string razorpayPaymentId
    }

    Payment {
        ObjectId _id PK
        ObjectId orderId FK
        ObjectId userId FK
        string paymentId UK
        string providerOrderId UK
        string providerPaymentId
        string signature
        string idempotencyKey
        number amount
        string currency
        string status
        string provider
        string failureReason
        date verifiedAt
        array webhookEventIds
    }

    AuditLog {
        ObjectId _id PK
        ObjectId userId FK
        string action
        string modelName
        ObjectId modelId
        object changes
        object oldValues
        object newValues
        string ipAddress
        string userAgent
        string status
        date createdAt
    }

    EmailLog {
        ObjectId _id PK
        ObjectId orderId FK
        string recipient
        string eventType
        string status
        string providerResponse
        date timestamp
    }
```

### 6.2 Schema Analysis & Lifecycle Hooks

1. **User Model ([`server/src/models/user.model.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/models/user.model.js)):**
   * **Indexes:** `email` (unique, lowercase, trim), `role`, `isDeleted`.
   * **Soft Delete Hook:** `userSchema.pre(/^find/, function() { this.where({ isDeleted: { $ne: true } }); });` auto-filters soft-deleted records from all standard queries.
2. **Book Model ([`server/src/models/book.model.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/models/book.model.js)):**
   * **Indexes:** Compound Text index `{ title: "text", author: "text" }`, Single indexes on `price`, `category`, `isActive`.
   * **Enums:** `category` restricted to `["Quran", "Hadith", "Fiqh", "History", "Biography", "Other"]`.
3. **Order Model ([`server/src/models/order.model.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/models/order.model.js)):**
   * **Snapshots:** Embeds immutable subdocument copies of book items (`OrderItem`) and customer address (`AddressSnapshot`), ensuring historical orders are preserved even if book prices or customer addresses change later.
   * **Lifecycle Hook:** `pre("save")` auto-pushes `{ status: "Pending", timestamp: new Date() }` into `statusHistory` on initial order creation.
   * **Indexes:** `userId`, `paymentStatus`, `orderStatus`, `{ createdAt: -1 }`.
4. **Payment Model ([`server/src/models/payment.model.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/models/payment.model.js)):**
   * **Indexes:** Unique sparse indexes on `providerPaymentId`, `{ orderId: 1, idempotencyKey: 1 }`, and compound index `{ orderId: 1, userId: 1, createdAt: -1 }`.
5. **RegistrationOtp Model ([`server/src/models/registrationOtp.model.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/models/registrationOtp.model.js)):**
   * **TTL Index:** `expiresAt` with `{ expires: 0 }`. MongoDB background workers automatically delete expired OTP records.
6. **AuditLog Model ([`server/src/models/auditLog.model.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/models/auditLog.model.js)):**
   * **TTL Index:** `expireAfterSeconds: 2592000` (auto-deletes audit logs older than 30 days).

### 6.3 Transaction Handling & Database Risks
* **Replica Set Prerequisite:** [`stock.util.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/utils/stock.util.js#L9) invokes `mongoose.startSession()` and `session.startTransaction()`. Standalone local MongoDB installations without a configured replica set (`--replSet rs0`) will throw `MongoServerError: Transaction numbers are only allowed on a replica set member or mongos`.
* **Transaction Boundary Limitation:** In [`order.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/order.service.js#L67-L103), `validateAndReduceStock` commits its transaction *before* `Order.create` executes. If `Order.create` throws an unhandled database error, stock has already been decremented without an order record being created.

---

## 7. Security and Risk Assessment

| Severity | Issue Title | Affected File & Lines | Risk Description | Recommended Remediation |
| :--- | :--- | :--- | :--- | :--- |
| **CRITICAL** | **Unauthenticated Socket.io Rooms** | [`server/src/sockets/order.socket.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/sockets/order.socket.js#L11-L24) | `join_user_room` and `join_admin_room` accept arbitrary IDs without JWT authentication. Any malicious client can join `admin_room` and intercept real-time customer names, addresses, and order details. | Implement Socket.io authentication middleware (`io.use`) validating `accessToken` via `jwt.verify`, restricting `admin_room` to `user.role === 'admin'`. |
| **CRITICAL** | **Hardcoded JWT Fallback Secrets** | [`server/src/utils/generateToken.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/utils/generateToken.js#L10-L22), [`auth.middleware.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/middlewares/auth.middleware.js#L24) | If `ACCESS_TOKEN_SECRET` or `REFRESH_TOKEN_SECRET` are not set in `.env`, the server falls back to hardcoded strings `"fallback_access_secret"`. An attacker can forge arbitrary admin JWTs. | Remove hardcoded fallbacks. Throw a fatal error on server startup if JWT secrets are undefined. |
| **CRITICAL** | **Unauthenticated Delhivery Webhook** | [`server/src/controllers/delivery.controller.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/controllers/delivery.controller.js#L45-L56) | `POST /api/v1/delhivery/webhook` processes status updates without verifying any secret token or HMAC signature. An attacker can POST arbitrary AWBs and forge delivery status. | Add webhook token verification checking a pre-shared secret header (`Authorization: Token ...`). |
| **HIGH** | **Regular Expression Injection (ReDoS)** | [`server/src/services/book.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/book.service.js#L58-L67) | User search query is passed directly into `new RegExp(searchQuery, "i")`. Entering unescaped characters (e.g. `(`, `[`) crashes the route with `SyntaxError`. Catastrophic backtracking patterns can cause Denial of Service. | Escape special regex characters using `searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')`, or utilize MongoDB Atlas Search / text index search. |
| **HIGH** | **Bypassed GET Route Schema Validation** | [`server/src/middlewares/validate.middleware.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/middlewares/validate.middleware.js#L4), [`book.routes.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/routes/book.routes.js#L16-L19) | Middleware validates `schema.validate(req.body)`. On GET requests (`/books`), `req.body` is empty, so query parameter validations (`minPrice`, `maxPrice`, `page`, `limit`) are never checked. | Update middleware to inspect `req.method === 'GET' ? req.query : req.body`. |
| **HIGH** | **Unrestricted File Uploads in Multer** | [`server/src/middlewares/multer.middleware.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/middlewares/multer.middleware.js#L14-L16) | Multer has no `fileSize` limits or `fileFilter` extensions. Attackers can upload arbitrarily large files or malicious scripts into `./public/temp`. | Add `limits: { fileSize: 5 * 1024 * 1024 }` and a `fileFilter` permitting only `image/jpeg`, `image/png`, and `image/webp`. |
| **HIGH** | **Order Price & Fee Desynchronization** | [`client/src/pages/CheckoutPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/CheckoutPage.jsx#L14-L50), [`order.service.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/services/order.service.js#L76-L96) | Frontend adds `PLATFORM_FEE (₹10)` and `DELIVERY_FEE (₹35)`, but backend calculates `totalAmount = sum(items)`. Customers are charged subtotal only, causing accounting discrepancies. | Implement authoritative fee calculation on the backend in `order.service.js` and persist fee breakdown fields on the `Order` model. |
| **MEDIUM** | **Aggressive 403 Session Logout** | [`client/src/api/axios.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/api/axios.js#L91-L96) | Axios interceptor wipes `localStorage` tokens and forces a redirect to `/login` upon *any* 403 status (e.g. non-admin visiting admin page or unverified email). | Restrict token purging to 401 unresolvable refresh errors or specific account-blocked error payloads. |
| **MEDIUM** | **Rate Limit Proxy Misconfiguration** | [`server/app.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/app.js#L12) | `app.set("trust proxy", 1)` is enabled. If deployed behind multiple reverse proxies without exact proxy IP specification, clients could spoof `X-Forwarded-For` to bypass rate limits. | Configure exact proxy subnet or IP range in production environments. |
| **LOW** | **CORS Origin Fallback** | [`server/src/config/socket.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/config/socket.js#L9) | Socket.io server allows `origin: process.env.CORS_ORIGIN || "*"`. If unconfigured, it permits cross-origin WebSocket connections from any website. | Enforce explicit origin whitelist matching Express `cors` configuration. |
| **INFORMATIONAL** | **Duplicate Role Constants** | [`server/src/utils/admin.constants.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/utils/admin.constants.js#L1-L4) | Defines `SUPER_ADMIN` and `MANAGER`, while `user.model.js` schema enforces enum `["user", "admin"]`. | Unify role definitions across constants and schemas. |

---

## 8. Bugs, Errors, and Technical Debt

### 8.1 Critical Runtime Bugs
1. **Frontend Error Boundary ReferenceError:**
   * **Location:** [`client/src/components/ErrorBoundary.jsx:39`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/ErrorBoundary.jsx#L39)
   * **Defect:** `process.env.NODE_ENV === "development"` crashes in modern Vite browsers with `ReferenceError: process is not defined`.
   * **Consequence:** Whenever any React component throws an error, the error boundary crashes during render, displaying a blank white screen instead of the fallback UI.
   * **Fix:** Replace with `import.meta.env.DEV`.
2. **ESLint Temporal Dead Zone in Admin Dashboard:**
   * **Location:** [`client/src/pages/AdminDashboardPage.jsx:27`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/AdminDashboardPage.jsx#L27)
   * **Defect:** `fetchDashboardStats()` is invoked inside `useEffect` before its `const` arrow function definition on line 30, triggering a TDZ lint failure and React hook error.
3. **Broken Seed / Test Script:**
   * **Location:** [`server/testOrder.js:21`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/testOrder.js#L21)
   * **Defect:** Calls `user.generateAccessToken()`. The Mongoose User schema does not have this method; token generation was moved to [`server/src/utils/generateToken.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/src/utils/generateToken.js#L3). Running `node testOrder.js` fails with `TypeError: user.generateAccessToken is not a function`.

### 8.2 Technical Debt & Architectural Gaps
1. **Unused / Dead Components & Scaffolding:**
   * [`client/src/pages/Dashboard/`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/Dashboard/Dashboard.jsx) and [`client/src/pages/Login/`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/Login/Login.jsx) are remnants from early project initialization.
   * [`client/src/pages/NotFound.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/NotFound.jsx) is an unused duplicate of [`NotFoundPage.jsx`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/NotFoundPage.jsx) with conflicting styles.
   * [`client/src/pages/HomePage.jsx:5`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/pages/HomePage.jsx#L5) imports `CategoryTabs` but never renders it.
2. **Dead Footer Links (404 Triggers):**
   * [`client/src/components/Footer.jsx:30-46`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/components/Footer.jsx#L30-L46) links to `/contact`, `/privacy-policy`, and `/terms`. None of these routes exist in `AppRoutes.jsx`, landing visitors on the 404 page.
3. **Unbundled Asset & Bundle Size Warnings:**
   * [`client/src/assets/Home/hero1.png`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/client/src/assets/Home/hero1.png) is 2.6 MB uncompressed, inflating production assets.
   * Single client JS chunk (`index-CMV-VcOZ.js`) is 1.1 MB without code splitting or dynamic imports (`React.lazy`).

---

## 9. Testing and Verification Results

### 9.1 Test Suite Inventory
* **Unit Tests:** None exist. No test runner (`vitest`, `jest`, `mocha`) is installed in either `client` or `server`.
* **Integration Tests:** Two standalone Node scripts exist in `server/`:
  1. [`server/test_full_order_lifecycle.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/test_full_order_lifecycle.js) (294 lines): Exercises Login → Address verification → Cart seeding → Order creation → Razorpay Payment Intent → HMAC signature verification → Order status inspection.
  2. [`server/testOrder.js`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/testOrder.js) (50 lines): Outdated manual test script (fails due to calling non-existent model method).
* **API Collections:** 7 Postman collections located in [`server/features/POSTMAN/`](file:///Users/arry03/Desktop/ARRRY/MD-Shakib/server/features/POSTMAN/):
  * `Auth.postman_collection.json`
  * `Books.postman_collection.json`
  * `Cart.postman_collection.json`
  * `Address.postman_collection.json`
  * `Orders.postman_collection.json`
  * `Payments.postman_collection.json`
  * `Admin.postman_collection.json`
  * `Environment.postman_environment.json`

### 9.2 Tests Executed During Audit

| Check / Test Target | Command Executed | Result | Details & Findings |
| :--- | :--- | :--- | :--- |
| **Frontend Production Build** | `cd client && npm run build` | **PASSED** | Vite compiled 217 modules in 1.01s. Output: `dist/index.html` (0.64 kB), `dist/assets/index.css` (62.38 kB), `dist/assets/index.js` (1099.84 kB). Large chunk warnings emitted. |
| **Frontend Static Linter** | `cd client && npm run lint` | **FAILED (18 problems)** | 9 errors, 9 warnings. Key errors: `ErrorBoundary.jsx` (`process` undefined), `AdminDashboardPage.jsx` (TDZ variable access), `SearchBar.jsx` & `CartPage.jsx` (setState inside effect). |
| **Backend Order Lifecycle Script** | `cd server && npm run test:razorpay-flow` | **NOT RUN** | Blocked by missing credentials (`TEST_USER_EMAIL`, `TEST_USER_PASSWORD`, `RAZORPAY_WEBHOOK_SECRET` are not set in `server/.env`). |
| **Database Integration Tests** | `node server/testOrder.js` | **NOT RUN** | Requires live MongoDB database connection and contains known code bug (`user.generateAccessToken` does not exist). |

---

## 10. Git History and Workspace Status

### 10.1 Repository Metadata
* **Active Branch:** `main` (synchronized with `origin/main`).
* **Latest Commit:** `376afa2`
* **Commit Date:** Sun Mar 15, 2026, 18:19:12 +0530
* **Commit Message:** `Merge pull request #24 from mdshakib-books/dev - add password validation ui changes, and razorpay issue`
* **Primary Author:** `Arry <arifquerry@gmail.com>` / `mdshakib-books`

### 10.2 Existing Branches
* `main` (active local & remote tracking)
* `remotes/origin/dev` (development integration branch)
* `remotes/origin/mdshakib-books-patch-1` through `patch-5` (historic pull request branches)

### 10.3 Uncommitted Working Directory Changes
`git status` reports uncommitted modifications in two files:
* `client/package-lock.json` (15 deletions, removal of `"peer": true` attributes due to npm version diffs)
* `server/package-lock.json` (2 deletions, removal of `"peer": true` attributes)
* *Per Audit Rules, these uncommitted changes have been strictly preserved without staging or altering.*

---

## 11. Deployment and Environment Readiness

### 11.1 Infrastructure & Hosting Topology
* **Backend Hosting:** Designed for Render Web Service (Node.js). Evidenced by `app.set("trust proxy", 1)`, Render CORS origin whitelist, and implementation of Google Gmail REST API to circumvent Render's outbound SMTP port blocking.
* **Frontend Hosting:** Standard static SPA deployment (Render Static Site, Vercel, or Netlify) with client-side rewrite rules to `index.html`.
* **Database:** MongoDB Atlas (Cloud Replica Set).
* **Media Assets:** Cloudinary (`shakib_ecommerce/books/`).

### 11.2 Environment Variable Configuration Guide

#### Backend Environment Variables (`server/.env`)

| Variable Name | Purpose | Configured in Local File? | Production Necessity |
| :--- | :--- | :--- | :--- |
| `PORT` | HTTP server port (defaults to 8000) | No (uses fallback) | Optional |
| `NODE_ENV` | Runtime environment (`production` / `development`) | No | **CRITICAL** (controls secure cookies) |
| `MONGODB_URI` | MongoDB Atlas connection string with replica set | **Yes (configured)** | **CRITICAL** |
| `CORS_ORIGIN` | Allowed client URL (e.g. `http://localhost:5173`) | No (falls back to localhost) | **CRITICAL** |
| `CLIENT_URL` | Frontend URL for email redirect links | No (defaults to localhost:5173) | High |
| `ACCESS_TOKEN_SECRET` | Secret key for signing short-lived access JWTs | No (uses fallback!) | **CRITICAL** (Security) |
| `ACCESS_TOKEN_EXPIRY` | Access token lifespan (e.g. `15m` or `1d`) | No | High |
| `REFRESH_TOKEN_SECRET`| Secret key for signing long-lived refresh JWTs | No (uses fallback!) | **CRITICAL** (Security) |
| `REFRESH_TOKEN_EXPIRY`| Refresh token lifespan (e.g. `7d` or `10d`) | No | High |
| `CLOUDINARY_CLOUD_NAME`| Cloudinary account name | No | **CRITICAL** for book image uploads |
| `CLOUDINARY_API_KEY` | Cloudinary API Key | No | **CRITICAL** for book image uploads |
| `CLOUDINARY_API_SECRET`| Cloudinary API Secret | No | **CRITICAL** for book image uploads |
| `RAZORPAY_KEY_ID` | Razorpay public key (`rzp_test_...` or `rzp_live_...`) | No | **CRITICAL** for payments |
| `RAZORPAY_KEY_SECRET` | Razorpay private API secret | No | **CRITICAL** for payments |
| `RAZORPAY_WEBHOOK_SECRET`| Secret for verifying webhook HMAC signatures | No | **CRITICAL** for payments |
| `OAUTH_CLIENT_ID` | Google Cloud Console OAuth 2.0 Client ID | No | **CRITICAL** for OTP & Order emails |
| `OAUTH_CLIENT_SECRET` | Google Cloud Console OAuth 2.0 Client Secret | No | **CRITICAL** for OTP & Order emails |
| `OAUTH_REFRESH_TOKEN` | Google OAuth 2.0 Refresh Token (Gmail Scope) | No | **CRITICAL** for OTP & Order emails |
| `EMAIL` | Sender Gmail address (e.g. `md.shakib.books@gmail.com`)| No | **CRITICAL** for OTP & Order emails |
| `DELHIVERY_TOKEN` | Delhivery API Token | No (uses `"test_token"`) | **CRITICAL** for shipping |
| `DELHIVERY_BASE_URL` | Delhivery endpoint (`https://track.delhivery.com`) | No | High |

#### Frontend Environment Variables (`client/.env`)

| Variable Name | Purpose | Configured Locally? | Production Necessity |
| :--- | :--- | :--- | :--- |
| `VITE_API_BASE_URL` | Base API URL (e.g. `https://api.domain.com/api/v1`) | No (defaults to localhost:8000) | **CRITICAL** |
| `VITE_SOCKET_URL` | Base Socket.io URL (e.g. `https://api.domain.com`) | No (defaults to localhost:8000) | **CRITICAL** |
| `VITE_RAZORPAY_KEY_ID` | Razorpay Public Key ID | No | **CRITICAL** for checkout modal |

---

## 12. Client Dependencies and Open Questions

Before resuming active feature development or launching to production, the following business decisions and assets must be clarified with the client:

1. **Platform & Delivery Fees Policy:**
   * Does the client intend to charge customer fees (₹10 Platform Fee + ₹35 Delivery Fee = ₹45), or should all orders offer 100% Free Shipping?
   * If fees are required, backend schemas and order creation logic must be updated to record them authoritatively.
2. **Delhivery Merchant Account & Warehouse Details:**
   * Live Delhivery API Token and verified Client Warehouse Pickup Location (Name, Registered Address, City, Pincode, and Dispatch Contact Number).
3. **Google Cloud Console OAuth2 Credentials:**
   * Authorized OAuth Client ID, Secret, and long-lived Refresh Token with `https://www.googleapis.com/auth/gmail.send` scope.
4. **Legal & Policy Content:**
   * Content and text for `/terms`, `/privacy-policy`, and `/contact` pages.
5. **Customer Reviews Strategy:**
   * Should customer reviews remain static curated testimonials, or should verified buyers be able to submit star ratings and text reviews on product pages?
6. **Production Domain & SSL Certificates:**
   * Confirmation of the client's production custom domain names for frontend and backend.

---

## 13. Prioritized Project Resumption Roadmap

```mermaid
flowchart LR
    Phase0["Phase 0: Environment & Blockers\n(P0)"] --> Phase1["Phase 1: Security & Core Bugs\n(P0)"]
    Phase1 --> Phase2["Phase 2: Business Logic & Fees\n(P1)"]
    Phase2 --> Phase3["Phase 3: Admin Dashboard & Delhivery\n(P1)"]
    Phase3 --> Phase4["Phase 4: QA, Testing & Polish\n(P2)"]
    Phase4 --> Phase5["Phase 5: Production Deployment\n(P2)"]
```

### Phase 0: Immediate Blockers & Local Setup (P0)
* **Task 0.1:** Fix `ErrorBoundary.jsx` Vite runtime crash by replacing `process.env.NODE_ENV` with `import.meta.env.DEV`.
* **Task 0.2:** Create template environment files (`server/.env.example`, `client/.env.example`) specifying all mandatory keys without values.
* **Task 0.3:** Resolve ESLint temporal dead zone in `AdminDashboardPage.jsx` and missing hook dependencies across components.

### Phase 1: Critical Security Hardening (P0)
* **Task 1.1:** Secure Socket.io rooms with JWT authentication middleware; restrict `admin_room` to authenticated administrators.
* **Task 1.2:** Eliminate hardcoded fallback JWT secrets in `generateToken.js` and `auth.middleware.js`.
* **Task 1.3:** Escape regex inputs in `book.service.js` to eliminate ReDoS vulnerabilities and syntax crashes.
* **Task 1.4:** Update `validate.middleware.js` to inspect `req.query` for GET requests.
* **Task 1.5:** Restrict Multer file uploads with strict 5MB size limits and image-only MIME type filters.
* **Task 1.6:** Add authentication/token verification to the Delhivery webhook endpoint.

### Phase 2: Business Logic & Accounting Synchronization (P1)
* **Task 2.1:** Align order pricing between frontend and backend. Implement authoritative fee calculations (`platformFee`, `deliveryFee`) on the server.
* **Task 2.2:** Adjust Axios 403 interceptor to avoid logging out users on non-session authorization rejections.
* **Task 2.3:** Include `Order.create` and cart clearing within the MongoDB transaction boundary in `order.service.js`.

### Phase 3: Incomplete Feature Completion (P1)
* **Task 3.1:** Connect `AdminDashboardPage.jsx` to live backend aggregation endpoints (`/admin/dashboard/stats`, `/admin/dashboard/sales`).
* **Task 3.2:** Replace hardcoded Delhivery store pickup location with configurable environment variables.
* **Task 3.3:** Implement frontend Pincode Delivery Checker on `BookDetailsPage.jsx` leveraging `GET /api/v1/delhivery/serviceability`.
* **Task 3.4:** Add missing legal and contact pages (`/terms`, `/privacy-policy`, `/contact`) or update footer navigation links.

### Phase 4: Automated Testing & Performance Optimization (P2)
* **Task 4.1:** Install Vitest and React Testing Library in `client/` for component and store testing.
* **Task 4.2:** Configure Jest or Vitest in `server/` with Supertest for automated API endpoint integration testing.
* **Task 4.3:** Implement code-splitting (`React.lazy`) for admin pages and compress large image assets (`hero1.png`).
* **Task 4.4:** Remove legacy scaffolding directories (`client/src/pages/Dashboard/`, `client/src/pages/Login/`, `NotFound.jsx`).

### Phase 5: Production Deployment & Monitoring (P2)
* **Task 5.1:** Deploy backend to Render with environment secrets and health check monitoring.
* **Task 5.2:** Deploy frontend to Vercel/Render with SPA rewrite configurations.
* **Task 5.3:** Perform end-to-end sandbox purchase verification using Razorpay test mode.

---

## 14. Proposed Content for `MASTER_PROJECT_CONTEXT.md`

*(The markdown content below is designed to be saved as `MASTER_PROJECT_CONTEXT.md` in the project root to onboard future engineering teams and AI coding agents).*

```markdown
# MASTER_PROJECT_CONTEXT.md

## 1. Project Overview & Architecture
MD Shakib Islamic Books is a full-stack e-commerce platform built for selling Islamic literature in India.
- **Frontend:** Single-page application built with React 19, Vite 7, Tailwind CSS v4, and Redux Toolkit.
- **Backend:** Node.js, Express 5, and Mongoose 9 connected to MongoDB Atlas.
- **Real-Time Layer:** Socket.io WebSockets for live order tracking and admin notifications.
- **Integrations:** Razorpay (Payments), Cloudinary (Images), Delhivery (Courier/AWB), Google Gmail REST API (Transactional Emails).

## 2. Directory Structure
- `/client/src/pages`: User & Admin view components.
- `/client/src/redux/slices`: Redux Toolkit state slices (`authSlice`, `cartSlice`, `bookSlice`, `orderSlice`).
- `/client/src/api/axios.js`: Central Axios instance with JWT auto-refresh interceptor.
- `/server/src/models`: Mongoose database models (`User`, `Book`, `Cart`, `Order`, `Payment`, `Address`, `AuditLog`, `EmailLog`, `RegistrationOtp`).
- `/server/src/controllers`: Request handlers delegating to the service layer.
- `/server/src/services`: Core business logic and external API integrations.
- `/server/src/sockets`: Socket.io event definitions (`order.socket.js`).

## 3. Key Architectural Patterns
1. **Authentication:** Dual JWT tokens. Access tokens (15m/1d) returned in JSON payload and HTTP-only cookies; refresh tokens (7d/10d) stored in client localStorage and cookies. Token rotation handled via `/users/refresh-token`.
2. **Registration:** Two-phase verification. Requires email OTP validation via Google Gmail REST API before account creation.
3. **Inventory Management:** Stock decrements and cancellations execute within atomic MongoDB transactions using `session.startTransaction()`.
4. **Cart Synchronization:** Guests store items in `localStorage.guest_cart`. Upon login, cart items are automatically merged into MongoDB via `POST /api/v1/cart/merge`.
5. **Audit Logging:** Global Express middleware attaches `req.auditLog(...)` to record actions, model diffs, IP addresses, and user agents with a 30-day TTL.

## 4. Local Development Commands
```bash
# Server setup
cd server
npm install
npm run dev          # Starts nodemon on http://localhost:8000

# Client setup
cd client
npm install
npm run dev          # Starts Vite dev server on http://localhost:5173
npm run build        # Production bundle build
npm run lint         # ESLint check
```

## 5. Mandatory Environment Variables
* **Server (`server/.env`):** `PORT`, `NODE_ENV`, `MONGODB_URI`, `CORS_ORIGIN`, `ACCESS_TOKEN_SECRET`, `REFRESH_TOKEN_SECRET`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `OAUTH_CLIENT_ID`, `OAUTH_CLIENT_SECRET`, `OAUTH_REFRESH_TOKEN`, `EMAIL`, `DELHIVERY_TOKEN`.
* **Client (`client/.env`):** `VITE_API_BASE_URL`, `VITE_SOCKET_URL`, `VITE_RAZORPAY_KEY_ID`.

## 6. Known Defects to Fix First
1. `client/src/components/ErrorBoundary.jsx`: Replace `process.env.NODE_ENV` with `import.meta.env.DEV`.
2. `server/src/sockets/order.socket.js`: Secure rooms with JWT authentication.
3. `server/src/services/book.service.js`: Escape regex input in search function.
4. `server/src/middlewares/validate.middleware.js`: Validate `req.query` for GET requests.
5. `client/src/pages/CheckoutPage.jsx` vs `server/src/services/order.service.js`: Synchronize platform and delivery fees.
```

---

## 15. WHAT WE NEED BEFORE RESUMING DEVELOPMENT

To resume active development without blockers, the following specific inputs and actions are required:

1. **Client Confirmation on Pricing & Shipping Fees:**
   * Formal decision on whether platform fee (₹10) and shipping fee (₹35) should be added to customer orders or if shipping is free.
2. **Third-Party API Credentials (Sandbox / Test Mode):**
   * **Razorpay:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and a configured Webhook Secret.
   * **Cloudinary:** `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`.
   * **Google Gmail API:** OAuth2 Client ID, Client Secret, and Refresh Token for sending OTP emails.
   * **Delhivery:** Staging / Production API Token and registered pickup warehouse details.
3. **Database Environment:**
   * A MongoDB Atlas connection string (or local replica set) to support MongoDB Sessions and Transactions.
4. **Approval to Execute Phase 0 & Phase 1 Bug Fixes:**
   * Permission to proceed with applying non-destructive code fixes to the four critical defects (`ErrorBoundary.jsx`, Socket.io authentication, Regex escaping, and GET route validation).