# Complete UI/UX and Design Parity Audit
## MD Shakib Islamic Books — Visual, Layout, Asset & Interaction Parity Report

> **Audit Date:** October 30, 2026  
> **Auditors:** Senior UI/UX Specialist & Principal Frontend Architect  
> **Scope:** Full structural and visual comparison between `client/src/` (Legacy React/Vite) and `apps/web/` (Target Next.js App Router).

---

## 1. Design System & Design Tokens Comparison

### 1.1 Typography & Fonts

| Dimension | Legacy Implementation (`client/src/index.css`) | Target Implementation (`apps/web/app/layout.tsx` & `globals.css`) | Parity Verdict | Findings & Discrepancies |
|---|---|---|---|---|
| **Primary Serif Font (Headings)** | `Cinzel`, Google Font via `@import`<br>Weights: 400, 500, 600, 700, 800, 900<br>Class: `font-heading` | `next/font/google` (`Cinzel`)<br>Weights: 400, 500, 600, 700<br>Variable: `--font-cinzel`<br>Class: `font-serif` | **PARTIAL MATCH** | Next.js uses font optimization via CSS variable `--font-cinzel`. However, legacy used utility class `font-heading` whereas new stack standardized on `font-serif`. Legacy 800 and 900 weights are not loaded in Next.js layout. |
| **Primary Sans Font (Body/UI)** | `Inter`, Google Font via `@import`<br>Weights: 400, 500, 600, 700<br>Class: `font-body` | `next/font/google` (`Inter`)<br>Weights: 300, 400, 500, 600, 700<br>Variable: `--font-inter`<br>Class: `font-sans` | **MATCH** | Smooth font rendering with antialiasing enabled across both versions. |
| **Heading Transformations** | Uppercase / tracking-wide on select h1/h2 headings | Global `h1..h6` rule in `globals.css` applies `letter-spacing: 0.05em` | **MATCH** | Elegant luxury typography hierarchy preserved. |

---

### 1.2 Color Palette & CSS Variables

| Token Name | Legacy Token Value | Target Token Value in `globals.css` | Component Reference in Target | Parity Verdict | Defect / Impact |
|---|---|---|---|---|---|
| **Primary Gold** | `--color-primary-gold: #c9a24a` | `--color-gold: #C9A24A;` (under `@theme`) | `text-[var(--color-primary-gold)]`<br>`bg-[var(--color-primary-gold)]`<br>`border-[var(--color-primary-gold)]` | **CRITICAL REGRESSION** | In `globals.css`, the token is named `--color-gold`, NOT `--color-primary-gold`. Furthermore, it is not placed in `:root`. As a result, over 30 components referencing `var(--color-primary-gold)` without fallbacks fail to resolve the gold brand color, rendering text transparent or default white/gray. |
| **Accent Gold** | `--color-accent-gold: #e5c87b` | `--color-gold-accent: #E5C87B;` | `hover:bg-[var(--color-accent-gold)]` | **CRITICAL REGRESSION** | Mismatched variable name (`--color-gold-accent` vs `var(--color-accent-gold)`). Hover states on primary buttons fail to change color. |
| **Main Background** | `--color-main-bg: #0b0b0b` | `--color-dark-bg: #0B0B0B;`<br>`--background: #0B0B0B;` | `bg-[#0B0B0B]` or `var(--background)` | **MATCH** | Pitch-black bookstore background is visually identical. |
| **Surface Dark** | `--color-secondary-dark: #111111` | `--color-dark-surface: #111111;` | `bg-[#111111]` | **MATCH** | Card and container background surfaces match. |
| **Elevated Card** | `#161616` (hardcoded in modals) | `--color-dark-card: #161616;` | `bg-[#141414]` or `bg-[#161616]` | **MATCH** | Consistent dark elevations. |
| **Dark Border** | `--color-border-dark: #2a2a2a` | `--color-dark-border: #2A2A2A;` | `border-[#2A2A2A]` | **MATCH** | Card and section separators use identical `#2A2A2A` hex borders. |
| **Light Text** | `--color-text-light: #f5f5f5` | `--foreground: #F5F5F5;` | `text-[#F5F5F5]` or `text-white` | **MATCH** | High-contrast readable typography. |
| **Muted Text** | `--color-text-muted: #9ca3af` | `--color-dark-muted: #888888;` | `text-gray-400` / `text-neutral-400` | **MATCH** | Secondary label contrast is consistent. |

---

### 1.3 Shadows, Elevation & Spacing

| Token | Legacy (`client/src/index.css`) | Target (`apps/web/app/globals.css`) | Parity Verdict |
|---|---|---|---|
| **Luxury Glow Shadow** | `shadow-luxury`: `0 6px 20px rgba(0, 0, 0, 0.4)` | `--shadow-luxury: 0 6px 20px rgba(0, 0, 0, 0.4);` | **MATCH** |
| **Hover Gold Shadow** | `0 10px 30px rgba(201,162,74,0.15)` | `hover:shadow-[0_10px_30px_rgba(201,162,74,0.15)]` | **MATCH** on BookCard |
| **Container Widths** | `max-w-[1200px]` / `max-w-[1100px]` | `<PageContainer size="lg">` (`max-w-7xl` ~ 1280px), `md` (`max-w-5xl`), `sm` (`max-w-2xl`) | **IMPROVED** (Systematic layout containers) |

---

## 2. Layout & Global Navigation Parity

### 2.1 Desktop Navbar (`Navbar.jsx` vs `Navbar.tsx`)

| Element / Feature | Legacy `Navbar.jsx` | Target `Navbar.tsx` | Parity Status | Visual & Behavioral Notes |
|---|---|---|---|---|
| **Brand Logo & Title** | Luxury serif text with gold initial "MS" | Matches brand mark "MD SHAKIB" with gold accent | **MATCH** | Identical brand typography. |
| **Links** | Home, Books, About, Support | Home, Books, About, Support | **MATCH** | Active tab indicator uses gold underline. |
| **Scroll Transition** | Transparent at top; transitions to `#111111` with bottom border and backdrop blur after 80px scroll | Identical behavior via window scroll listener (`window.scrollY > 80`) | **MATCH** | Zero visual difference. |
| **Cart Badge Count** | Redux-connected (`cartItems.length` or `guestItems.length`); badge updates reactively | Relies on `cartCount` prop passed from parent page | **REGRESSED** | In `page.tsx`, `books/page.tsx`, `about/page.tsx`, `support/page.tsx`, the `Navbar` is rendered without props (`<Navbar />`), causing the badge to always display 0 or be hidden. |
| **User Dropdown / Auth CTA** | Displays user avatar and dropdown if logged in; displays "Sign In" button if guest | Accepts `user` prop to toggle between avatar dropdown and "Sign In" | **REGRESSED** | Because public pages pass no `user` prop, the navbar permanently displays "Sign In" even when a customer is actively logged in via Supabase Auth cookies. |
| **Logout Confirmation** | Custom `LogoutModal` prompt | Custom `ConfirmModal` prompt | **MATCH** | Confirms sign-out with backdrop blur. |

---

### 2.2 Mobile Navigation (`MobileBottomNav.jsx` vs Target Stack)

| Element / Feature | Legacy Implementation | Target Implementation | Status | Findings |
|---|---|---|---|---|
| **Mobile Bottom Bar** | `client/src/components/MobileBottomNav.jsx`<br>Fixed bottom bar (`h-[70px]`, `rounded-t-[22px]`, `bg-[#0B0B0B]`, `z-[9999]`) | **COMPLETELY MISSING** | **NOT MIGRATED** | Critical mobile UX regression. Mobile visitors on the new stack have no persistent bottom navigation. On legacy, users had instantaneous 1-tap navigation to Home, Books, Cart, Orders, and Profile (or Admin Dashboard for administrators). |
| **Mobile Hamburger Drawer** | Slide-down full-screen menu from top navbar | Slide-down overlay menu from top navbar | **MATCH** | The top hamburger drawer is implemented, but it does not replace the dedicated thumb-zone bottom navigation bar. |

---

### 2.3 Global Footer (`Footer.jsx` vs `Footer.tsx`)

| Section | Legacy `Footer.jsx` | Target `Footer.tsx` | Status | Findings |
|---|---|---|---|---|
| **Brand Statement** | Curated collection of authentic Islamic books | Preserved identical tagline | **MATCH** | |
| **Quick Links** | Books, About Us, Support, Privacy Policy | Books, About Us, Support, Terms of Service, Privacy Policy | **MATCH** | Target stack added missing Terms of Service link. |
| **Social Links** | Instagram, WhatsApp, Email icons | Instagram, WhatsApp, Email icons with gold hover rings | **MATCH** | |
| **Copyright Notice** | `© {year} MD Shakib. All rights reserved.` | `© {year} MD Shakib Islamic Books. All rights reserved.` | **MATCH** | |

---

## 3. Page-by-Page Visual & Component Parity

### 3.1 Homepage (`/`)

| Section | Legacy `HomePage.jsx` | Target `app/page.tsx` | Status | Visual Differences |
|---|---|---|---|---|
| **Hero Banner** | Dark radial gradient with Quran illustration, gold headline, subtitle, and CTA button | Preserved in `HeroSection.tsx`. Uses exact copy, gold CTA button, and responsive layout. | **FULL PARITY** | Zero visual difference. |
| **Trust Indicators** | 4-item pill bar: "Authentic Sourcing", "Free Delivery", "Secure Payments", "Customer Support" | Preserved in `TrustIndicators`. Icons and luxury borders match. | **FULL PARITY** | Zero visual difference. |
| **Featured Books Carousel** | Horizontal touch carousel with scroll indicators | Static 4-column CSS grid (`ProductGrid.tsx`) | **PARTIAL PARITY** | Cards display well, but the smooth horizontal carousel behavior was replaced by a static grid. |
| **"How To Order" Steps** | 4 visual step badges with SVG icons, numbered roundels, and connecting lines (`OrderSteps.jsx`) | **OMITTED** | **MISSING** | Section is completely missing from `app/page.tsx`. |
| **Customer Testimonials** | 3 luxury testimonial cards with gold 5-star ratings and customer initials avatar (`Reviews.jsx`) | **OMITTED** | **MISSING** | Section is completely missing from `app/page.tsx`. |

---

### 3.2 Book Catalog (`/books`)

| Feature | Legacy `BooksPage.jsx` | Target `app/books/page.tsx` | Status | Findings |
|---|---|---|---|---|
| **Page Header** | "Authentic Islamic Literature" with gold subtitle | Matches luxury heading and collection subtitle | **FULL PARITY** | |
| **Category Tabs** | Horizontal scrollable category pill bar | Horizontal scrollable category pill bar (`hide-scrollbar`) | **FULL PARITY** | Active category uses glowing gold background (`bg-[#C9A24A] text-black`). |
| **Search Input** | Centered debounced search box with clear button | Centered debounced search box with clear button (`SearchBar.tsx`) | **FULL PARITY** | |
| **Sorting Selector** | Dropdown with price low/high, newest | Dropdown with Newest, Price: Low to High, Price: High to Low, Title: A to Z | **IMPROVED** | Added Title sorting. |
| **Product Grid** | 1 to 4 responsive column grid | 1 to 4 responsive column grid | **FULL PARITY** | |
| **Product Cards** | Image with hover zoom, discount tag, title, author, price, and "Add to Cart" button | Image with hover zoom, discount tag, title, author, price, and "Add to Cart" button | **REGRESSED LOGIC** | Visually identical, but the "Add to Cart" button on the target card does not trigger any action because `onAddToCart` is not supplied by the parent page. |
| **Pagination Controls** | Next / Previous buttons with active page number | Next / Previous buttons with active page number | **FULL PARITY** | |

---

### 3.3 Book Details Page (`/books/[id]`)

| Component | Legacy `BookDetailsPage.jsx` | Target `app/books/[id]/page.tsx` | Status | Findings |
|---|---|---|---|---|
| **Breadcrumbs** | Home / Books / {Title} | Home / Books / {Title} | **FULL PARITY** | |
| **Image Gallery** | Large primary cover + clickable horizontal thumbnail strip (up to 5 images) | Large primary cover + clickable horizontal thumbnail strip | **FULL PARITY** | Thumbnail selection updates main image smoothly. |
| **Discount Tag** | Red/gold `-X% OFF` badge | `-X% OFF` badge in top-left of image card | **FULL PARITY** | |
| **Metadata Table** | Category, Author, Publisher, Language, Pages, Date | Category, Author, Publisher, Language, Pages, Date | **FULL PARITY** | Displayed in a structured 2-column key-value grid. |
| **Stock Badge** | "In Stock" (green) or "Out of Stock" (red) | "In Stock" (green) or "Out of Stock" (red) | **FULL PARITY** | |
| **Quantity Selector** | `+` and `-` counter with min: 1, max: stock | `+` and `-` counter with min: 1, max: stock | **FULL PARITY** | |
| **Add to Cart CTA** | Primary gold button with cart icon; updates cart and triggers toast | Primary gold button; triggers 2-second local timer without mutating cart | **CRITICAL LOGIC REGRESSION** | Visual presentation is identical, but backend action is stubbed out. |
| **Related Books** | 4-item carousel of similar books from category | 4-item grid of similar books from category | **FULL PARITY** | |

---

### 3.4 Shopping Cart (`/cart`)

| State / Component | Legacy `CartPage.jsx` | Target `app/cart/page.tsx` | Status | Findings |
|---|---|---|---|---|
| **Guest Cart View** | Displays local storage items with full price breakdown and "Proceed to Checkout" prompt | Shows lock screen: "Sign In to View Your Cart" with "Log In Now" CTA | **REGRESSED** | Guests cannot view or interact with items in their cart. |
| **Empty Cart View** | Cart icon, "Your Cart is Empty", "Explore Books" CTA | Cart icon, "Your Cart is Empty", "Explore Books" CTA | **FULL PARITY** | |
| **Cart Items List** | Cover thumbnail, title, author, unit price, quantity controls, and delete button | Cover thumbnail, title, author, unit price, quantity controls, and delete button | **FULL PARITY** | |
| **Price Summary Card** | MRP Total, Discount, Delivery Fee (₹35), Platform Fee (₹10), Final Payable | Subtotal, Discount, Delivery Fee (₹35), Platform Fee (₹10), Total Amount | **FULL PARITY** | Calculations match legacy rupee-for-rupee. |
| **Checkout CTA** | "Proceed to Checkout" button | "Proceed to Checkout" button linking to `/checkout` | **FULL PARITY** | |

---

### 3.5 Checkout Page (`/checkout`)

| Component | Legacy `CheckoutPage.jsx` | Target `app/checkout/page.tsx` | Status | Findings |
|---|---|---|---|---|
| **Address Selector** | Radio list of saved addresses with default badge and "+ Add Address" button | Radio list of saved addresses with default badge and "+ Add Address" link | **FULL PARITY** | |
| **Payment Method Selector** | Radio cards for "Cash on Delivery" and "Online Payment (UPI/Card)" | Radio cards for "Cash on Delivery" and "Online Payment (UPI, Cards, NetBanking)" | **FULL PARITY** | Active selection highlighted with gold ring. |
| **Order Summary Sidebar** | Compact item list + price breakdown | Compact item list + price breakdown | **FULL PARITY** | |
| **Payment Modal Trigger** | Opens Razorpay standard checkout popup on online payment | Opens Razorpay standard checkout popup via dynamic SDK loading | **FULL PARITY** | Green/gold theme applied to Razorpay modal. |

---

### 3.6 Order Success Page (`/order-success`)

| Component | Legacy `OrderSuccessPage.jsx` | Target `app/order-success/page.tsx` | Status | Findings |
|---|---|---|---|---|
| **Celebration Icon** | Animated checkmark with pulsing gold border | Large emerald checkmark circle with subtle glow | **FULL PARITY** | |
| **Order Confirmation Copy** | "Order Placed! JazakAllah Khair..." | "Order Confirmed! JazakAllah Khair..." | **FULL PARITY** | |
| **Order Details Card** | Order ID, Payment Method, Amount, Delivery Estimate (3-5 days) | Order ID, Payment Method, Amount, Delivery Estimate (3-5 days) | **FULL PARITY** | |
| **Action Buttons** | "Track Your Order" and "Continue Shopping" | "Track Your Order" and "Continue Shopping" | **FULL PARITY** | |

---

### 3.7 Order Details Page (`/orders/[id]`)

| Component | Legacy `OrderDetailsPage.jsx` | Target `app/orders/[id]/page.tsx` | Status | Findings |
|---|---|---|---|---|
| **Status Progress Bar** | 6-step visual timeline: Pending → Confirmed → Packed → Shipped → Out for Delivery → Delivered | 6-step visual timeline with gold active circles and completed checks | **FULL PARITY** | Responsive formatting on mobile screens. |
| **Item List** | Line item table with images, quantities, unit prices, and row subtotals | Line item cards with images, quantities, unit prices, and row subtotals | **FULL PARITY** | |
| **Delivery Address** | Full snapshot of recipient address and contact phone | Full snapshot of recipient address and contact phone | **FULL PARITY** | |
| **Delhivery Tracking Card** | Courier name, AWB number, and direct external tracking URL | Courier name, AWB number, and green "Track Package on Delhivery ↗" CTA | **FULL PARITY** | |
| **Order Cancellation** | Modal dialog requesting cancellation reason | Browser `prompt()` popup | **REGRESSED UI** | Legacy used a styled modal; new stack uses an unstyled browser prompt. |
| **Replacement Request** | "Request Replacement" button for delivered orders within 7 days, opening modal | **COMPLETELY MISSING** | **MISSING** | No UI controls or status banners for replacement requests. |

---

### 3.8 About Page (`/about`) — Major Discrepancy

| Content Block | Legacy `AboutPage.jsx` | Target `app/about/page.tsx` | Parity Status | Visual Impact |
|---|---|---|---|---|
| **Hero Title & Subtitle** | "About MD Shakib" / Curated authentic books | "About MD Shakib" / Curated authentic books | **MATCH** | Identical header. |
| **Metrics Bar** | 4-column counter: 500+ Books, 50+ Authors, 1000+ Readers, 100% Authentic | 4-column counter: 500+ Books, 50+ Scholars, 1000+ Readers, 100% Sourcing | **MATCH** | Minor label wording improvement. |
| **Mission Section** | Animated DotLottie graphic + Mission text | Static book emoji box + Mission text | **PARTIAL** | Lost interactive Lottie animation. |
| **Prophetic Quote** | “Seeking knowledge is an obligation upon every Muslim.” — Prophet Muhammad ﷺ | **OMITTED** | **MISSING** | Beautiful luxury gold quote section was cut. |
| **"Why Choose Us"** | 3 dark elevated cards: Authentic Islamic Books, Curated Knowledge, Trusted by Readers | **OMITTED** | **MISSING** | 3 core value proposition cards cut. |
| **"Our Values"** | 4-grid cards: Authenticity, Accessibility, Community, Integrity | **OMITTED** | **MISSING** | 4 foundational pillars cut. |
| **Founder Message** | "Message From The Founder" narrative block | **OMITTED** | **MISSING** | Personal brand storytelling cut. |
| **Journey CTA** | "Start Your Journey of Knowledge" + "Browse Books" button | **OMITTED** | **MISSING** | Bottom call-to-action banner cut. |

---

### 3.9 Admin Dashboard (`/admin`)

| Feature | Legacy `AdminDashboardPage.jsx` | Target `app/admin/page.tsx` | Status | Parity Assessment |
|---|---|---|---|---|
| **KPI Metrics** | Hardcoded mock stats ("124 Books", "48 Orders", "85 Users") | Real-time database metrics: Gross Revenue, Total Orders, Catalog Titles, Customer Accounts | **SIGNIFICANTLY IMPROVED** | Replaced placeholder UI with real live data. |
| **Sales Analytics** | Hardcoded Chart.js bar chart with placeholder data | Monthly sales breakdown calculated from paid orders | **IMPROVED** | Removed external Chart.js dependency in favor of robust server-computed numbers. |
| **Order Status Breakdown** | Mock donut chart | Categorized status pills with exact order counts | **MATCH** | Clean operational presentation. |
| **Recent Orders Table** | Missing from legacy dashboard homepage | Displays latest 5 orders with customer name, status badge, amount, and link | **NEW ENHANCEMENT** | Added to target admin dashboard. |

---

### 3.10 Admin Orders Management (`/admin/orders` & `/admin/orders/[id]`)

| Feature | Legacy `AdminOrdersPage.jsx` | Target `app/admin/orders/` | Status | Findings |
|---|---|---|---|---|
| **Orders Table** | Status, customer, amount, courier, AWB, action dropdown | Status, customer, amount, courier, AWB, advance action button | **FULL PARITY** | |
| **Status Advance Modal** | Direct transition prompt | Confirmation modal enforcing `ORDER_STATUS_TRANSITIONS` | **FULL PARITY** | |
| **Shipment Creation** | Modal collecting Courier and AWB | Modal collecting Courier and AWB before setting status to `Shipped` | **FULL PARITY** | |
| **Cancellation Modal** | Modal collecting cancellation reason | Modal collecting cancellation reason, triggering inventory restock | **FULL PARITY** | |
| **Replacement Approval/Rejection** | Dedicated approve button and rejection modal with reason | Dedicated approve button and rejection modal with mandatory reason | **FULL PARITY** | Located in `/admin/orders/[id]`. |

---

### 3.11 Admin Books Management (`/admin/books`) — Critical Gap

| Feature | Legacy `AdminBooksPage.jsx` | Target `app/admin/books/page.tsx` | Status | Findings |
|---|---|---|---|---|
| **Books Table** | Image, Title, Category, Price, Stock badge, Status, Actions | Title & Author, Category, Price, Stock badge, Status, Storefront link | **PARTIAL** | Target table renders well, but has zero action buttons. |
| **Inline Stock Editor** | Quick inline counter to adjust stock without leaving page | **OMITTED** | **MISSING** | |
| **Book Edit Modal** | Edit title, author, description, price, stock, category, images | **OMITTED** | **MISSING** | |
| **Add New Book Page** | Dedicated `/admin/books/add` page with 5-image uploader | **OMITTED** | **MISSING** | No page or modal to add books. |
| **Cover Image Selector** | Clickable thumbnail in edit modal to set primary cover | **OMITTED** | **MISSING** | |
| **Delete Image Button** | Individual image deletion from multi-image array | **OMITTED** | **MISSING** | |
| **Soft Delete Toggle** | Active/Inactive toggle switch | **OMITTED** | **MISSING** | |

---

### 3.12 Admin Customers Management (`/admin/users`)

| Feature | Legacy `AdminUsersPage.jsx` | Target `app/admin/users/page.tsx` | Status | Findings |
|---|---|---|---|---|
| **Users Table** | Name, Email, Role, Status, Joined Date, Actions | User ID, Name, Email, Role, Account Status badge, Joined Date | **PARTIAL** | Clean layout, but completely read-only. |
| **Block / Unblock Toggle** | Action button with confirmation modal (`AdminConfirmModal`) | **OMITTED** | **MISSING** | No button or action to block/unblock. |
| **Permanent Delete User** | Action button with confirmation modal | **OMITTED** | **MISSING** | No button to delete user accounts. |
| **User Details Modal** | Modal displaying user's phone, addresses, and order history | **OMITTED** | **MISSING** | No inspect modal. |

---

## 4. UI/UX Parity Summary Scorecard

| UI/UX Dimension | Score | Status | Primary Remediation Required |
|---|---:|---|---|
| **Brand Tokens & Colors** | 65% | Regressed | Define `--color-primary-gold: #C9A24A;` and `--color-accent-gold: #E5C87B;` in `:root` and `@theme`. |
| **Desktop Navigation** | 80% | Partial | Pass authenticated user profile and live cart count from server layouts into `Navbar`. |
| **Mobile Navigation** | 40% | Missing | Reintroduce fixed `MobileBottomNav` component in root layout. |
| **Public Storefront Pages** | 70% | Partial | Restore `OrderSteps` and `Reviews` on Homepage; restore 5 omitted sections on About page. |
| **Public Commerce Interactions**| 25% | Broken | Connect `onAddToCart` in `ProductGrid` and `BookDetailClient` to `addToCart` server action. |
| **Customer Order UX** | 75% | Partial | Add "Request Replacement" modal on delivered orders; replace browser `prompt()` with modal. |
| **Admin Operations UI** | 45% | Incomplete| Implement book creation/editing modals and user block/unblock moderation controls. |
| **Toast & Feedback System** | 0% | Missing | Implement a lightweight accessible toast provider (Sonner or custom React toast). |

