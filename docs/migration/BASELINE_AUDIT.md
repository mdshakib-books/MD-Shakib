# Baseline Audit: MD Shakib Islamic Books

## 1. Executive Summary & Forensic Verification

- **Project Name:** MD Shakib Islamic Books (E-commerce Platform)
- **Current Architecture:** Decoupled Two-Tier Application
  - **Frontend:** Single Page Application (SPA) in `/client` powered by Vite 7.3.1, React 19.2.0, Tailwind CSS v4.2.0, Redux Toolkit 2.11.2, React Router DOM 7.13.1, and Socket.io-client 4.8.3.
  - **Backend:** Monolithic REST API + WebSocket Server in `/server` powered by Node.js (ESM), Express 5.2.1, Mongoose 9.2.1 (MongoDB Atlas), Socket.io 4.8.3, Multer 2.0.2, and Joi 18.0.2.
  - **External Integrations:** Razorpay (payment orders & HMAC-SHA256 webhooks), Cloudinary (book imagery), Google Gmail REST API v1 via OAuth2 (transactional email & OTP delivery), Delhivery (logistics API & tracking webhooks).
- **Target Architecture:** Modern Full-Stack Web Application
  - **Framework:** Next.js 15+ (App Router) with React 19 and TypeScript (strict mode).
  - **Database & Auth:** Supabase PostgreSQL with Row Level Security (RLS), Supabase Auth (`@supabase/ssr`), and SQL migrations.
  - **External Integrations:** Cloudinary (retained), Resend (replacing Gmail OAuth2), Razorpay (retained), Delhivery (retained), Supabase Realtime (replacing Socket.io).
  - **Hosting:** Vercel.
- **Git State at Baseline:**
  - Branch: `feature/codebase-audit`
  - Working tree: Clean
  - Recent Commit: `fa6c627` (Merge PR #25 saving codebase audit)
  - Prior Commits: Development ran March 3, 2026 – March 15, 2026; resumed October 2026 for audit.

---

## 2. Directory Structure & Codebase Footprint

```
/Users/arry03/Desktop/ARRRY/MD-Shakib
├── client/                     # Vite + React 19 Frontend SPA
│   ├── public/                 # Static assets (logo.png)
│   ├── src/
│   │   ├── api/axios.js        # Axios instance with 401 refresh-token interceptor
│   │   ├── assets/             # Bundled static images (hero1.png)
│   │   ├── components/         # Reusable presentation and layout components
│   │   │   ├── admin/          # Admin layout, BookModal, AdminConfirmModal
│   │   │   ├── home/           # HeroSection, CategoryTabs, OrderSteps, Reviews, TrustIndicators
│   │   │   ├── Navbar.jsx, Footer.jsx, ProductGrid.jsx, BookCard.jsx, etc.
│   │   ├── context/            # AuthContext.jsx (wrapper over Redux), ToastContext.jsx
│   │   ├── hooks/              # useAuth, useBooks, useCart, useOrders, useSocket, useDebounce
│   │   ├── pages/              # 25 Page components (Storefront, Auth, User Account, Admin)
│   │   ├── redux/              # Redux Toolkit store and slices (auth, book, cart, order)
│   │   ├── routes/AppRoutes.jsx# React Router v7 routes definition
│   │   ├── services/           # Frontend API client modules (auth, book, cart, order, payment, admin, address)
│   │   └── utils/              # validators, formatPrice, constants, truncateText
│   ├── package.json
│   ├── vite.config.js
│   └── index.html
├── server/                     # Node.js + Express 5 Backend
│   ├── features/POSTMAN/       # 7 Postman test collections & environment files
│   ├── src/
│   │   ├── config/             # db.js, cloudinary.config.js, razorpay.js, socket.js
│   │   ├── controllers/        # user, book, cart, order, payment, address, admin, delivery
│   │   ├── middlewares/        # auth (verifyJWT), role (isAdmin), validate (Joi), multer, audit, error
│   │   ├── models/             # User, Book, Cart, Order, Payment, Address, AuditLog, EmailLog, RegistrationOtp
│   │   ├── routes/             # Express routers for all resource groups
│   │   ├── services/           # Business logic layer
│   │   ├── sockets/            # order.socket.js (Socket.io event broadcaster)
│   │   └── utils/              # mail.js, stock.util.js, idempotency.util.js, pagination.js, validation schemas
│   ├── app.js                  # Express application pipeline
│   ├── server.js               # HTTP + Socket.io bootstrap
│   ├── package.json
│   ├── test_full_order_lifecycle.js # End-to-end order test script
│   └── testOrder.js            # Legacy manual test script
└── docs/migration/             # Migration specifications and plans
```

---

## 3. Technology Inventory & Compatibility Matrix

| Category | Existing Implementation | Planned Target Implementation | Reason for Change |
|---|---|---|---|
| **Framework** | React 19 SPA (Vite 7.3) | Next.js 15+ App Router (TypeScript) | Unified server/client execution, SSR/SSG, SEO, edge routing |
| **Language** | JavaScript (ESM `.js` / `.jsx`) | TypeScript (strict mode `.ts` / `.tsx`) | Type safety, maintainability, robust contracts |
| **Styling** | Tailwind CSS v4 (`@tailwindcss/vite`) | Tailwind CSS v4 / PostCSS with Next.js | Exact visual styling preservation with zero design shift |
| **Icons & Media** | `react-icons`, `@lottiefiles/dotlottie-react` | `react-icons`, `@lottiefiles/dotlottie-react` (Client Component) | Retain exact icons and animations |
| **State Store** | Redux Toolkit (`auth`, `cart`, `books`, `orders`) | Server Components + Redux Toolkit / React Context where needed | Server data-fetching where feasible; retain client store for guest cart & toasts |
| **HTTP Client** | Axios with custom refresh interceptor | Native `fetch` in Server Actions + Route Handlers; Supabase Client | Server-side execution and automatic cookie forwarding |
| **Backend API** | Express 5.2.1 REST API | Next.js Route Handlers (`app/api/...`) & Server Actions | Eliminate independent Express tier; consolidate hosting on Vercel |
| **Database** | MongoDB Atlas (Mongoose 9.2.1 ODM) | Supabase PostgreSQL 15+ | Relational integrity, ACID transactions, Row-Level Security, modern tooling |
| **Authentication** | Custom dual-JWT (Cookie + Bearer in body) | Supabase Auth (`@supabase/ssr`) + Custom OTP verification table | Secure HTTP-only cookie sessions natively managed by SSR |
| **Authorization** | Express middleware `verifyJWT`, `isAdmin` | Supabase RLS + Server Action session validation | Database-enforced isolation; prevent horizontal privilege escalation |
| **Realtime** | Socket.io 4.8.3 | Supabase Realtime (Postgres Changes & Broadcast) | Native WebSocket serverless architecture without dedicated daemon |
| **File Storage** | Cloudinary (`cloudinary.v2`) | Cloudinary (`cloudinary.v2` via Node SDK) | Preserve existing asset CDN URLs and upload pipelines |
| **Email Service** | Google Gmail API v1 (OAuth2 via `googleapis`) | Resend API SDK | Modern transactional email delivery without SMTP/OAuth timeout blocks |
| **Payments** | Razorpay SDK (`razorpay` 2.9.6) | Razorpay SDK (`razorpay` in Route Handlers) | Preserve payment intent creation and HMAC signature verification |
| **Shipping** | Delhivery REST API client | Delhivery REST API client in Route Handlers | Preserve pincode checks, AWB consignment creation, and tracking |

---

## 4. Discovered Critical Issues in Current Codebase

Prior to migration, the audit confirmed several significant logic, security, and runtime bugs in the legacy application:
1. **Frontend ErrorBoundary Vite Crash:** `client/src/components/ErrorBoundary.jsx` references `process.env.NODE_ENV`, which throws `ReferenceError: process is not defined` in browser Vite environments, crashing the error boundary itself.
2. **GET Route Query Validation Bypass:** `server/src/middlewares/validate.middleware.js` hardcodes `schema.validate(req.body)`. On GET endpoints like `/api/v1/books`, `req.body` is empty, completely bypassing query string validation.
3. **Price/Fee Discrepancy:** `client/src/pages/CheckoutPage.jsx` adds `₹10 Platform Fee` and `₹35 Delivery Fee` to the displayed total, but `server/src/services/order.service.js` calculates `totalAmount = sum(items)`, undercharging orders by ₹45.
4. **Unauthenticated Socket.io Rooms:** `server/src/sockets/order.socket.js` allows arbitrary socket clients to join `admin_room` or any `userId` room without JWT verification, exposing sensitive order details.
5. **ReDoS in Book Search:** `server/src/services/book.service.js` directly passes raw search queries to `new RegExp(searchQuery, "i")` without escaping regex meta-characters.
6. **Hardcoded Fallback JWT Secrets:** `server/src/utils/generateToken.js` falls back to `"fallback_access_secret"`.
7. **Placeholder Delhivery Pickup Location:** `server/src/services/delhivery.service.js` hardcodes pickup details to `"Store Address"`, `"DefaultCity"`, and `"9999999999"`.
8. **Admin Dashboard Mock Data:** `client/src/pages/AdminDashboardPage.jsx` renders hardcoded statistics (124 books, 48 orders, 85 users) with an empty `// TODO: fetch from API` handler.

All of these baseline discoveries will be rectified in the Next.js + Supabase implementation while maintaining strict visual and behavioral parity.

