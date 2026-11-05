# PHASE 08 — ACCESSIBILITY & ADVANCED UX INVENTORY

**Project:** MD Shakib Islamic Books  
**Repository:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`  
**Branch:** `new-fix`  
**Framework:** Next.js 16.4.3 (App Router), React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.0.9  
**Specification Target:** WCAG 2.2 Level AA  
**Date:** November 4, 2026  
**Status:** INITIAL INVENTORY & PRE-IMPLEMENTATION AUDIT  

---

## 1. Executive Summary

This inventory documents the empirical accessibility and UX audit of the MD Shakib Islamic Books platform prior to Phase 08 implementation.

The application possesses a solid luxury visual identity (Phase 06) and a refined motion system (Phase 07) with centralized CSS tokens and reduced-motion overrides. However, comprehensive auditing across customer storefront and administrative routes revealed key gaps in keyboard focus visibility, landmark uniqueness, interactive control nesting, search suggestion accessibility, ad-hoc dialog implementations in admin clients, and offline/network failure resilience.

---

## 2. Audited Routes & Surface Area

| Route | Classification | Primary Surface Type | Key Interactive Elements Audited |
|---|---|---|---|
| `/` | Storefront | Landing / Showcase | Navbar, Hero, Category pills, Product cards, Review cards, Footer |
| `/books` | Storefront | Catalog | SearchBar, CategoryTabs, Sort dropdown, Pagination, Book cards |
| `/books/[id]` | Storefront | Product Detail | Image gallery, Quantity selector, Add to Cart, Sticky mobile bar |
| `/cart` | Storefront | Shopping Cart | Item quantity steppers, Remove buttons, Checkout CTA |
| `/checkout` | Storefront | Purchase Flow | Shipping address radios, Payment radios, Order submission CTA |
| `/order-success` | Storefront | Post-Purchase | Order receipt, Continue Shopping link |
| `/login` | Auth | Form | Email/Password inputs, Password toggle, Submit button |
| `/register` | Auth | Form | Name/Email/Password inputs, Submit button |
| `/forgot-password` | Auth | Form | Email input, Reset request CTA |
| `/reset-password` | Auth | Form | New password inputs, Submit button |
| `/verify-otp` | Auth | Form | OTP digits input, Resend timer, Submit button |
| `/account` | Customer | Portal | Overview metrics, Navigation tabs, Quick links |
| `/addresses` | Customer | Form / CRUD | Address cards, Add/Edit address form, Delete confirm modal |
| `/profile` | Customer | Form | Name/Phone update, Password change |
| `/orders` | Customer | List | Order cards, Status pills, Tracking link |
| `/orders/[id]` | Customer | Detail | Order breakdown, Delivery status, Back link |
| `/admin` | Admin | Dashboard | Metrics cards, Recent orders table, Navigation sidebar |
| `/admin/books` | Admin | CRUD / Table | Books data table, Add/Edit modal, Stock modal, Delete modal |
| `/admin/orders` | Admin | CRUD / Table | Orders data table, Status updater, Filter tabs |
| `/admin/inventory` | Admin | CRUD / Table | Stock adjustment modal, Threshold editor, Batch update |
| `/admin/categories` | Admin | CRUD / Table | Categories data table, Add/Edit modal, Delete confirm |
| `/admin/discounts` | Admin | CRUD / Table | Coupon code modal, Discount table, Toggle status |
| `/admin/users` | Admin | CRUD / Table | Users table, Role toggle modal, Customer activity |
| `/admin/reviews` | Admin | Moderation | Review approval/rejection buttons, Star ratings |
| `/admin/audit-logs` | Admin | Audit | Filter form, Details modal, Timestamp logs |

---

## 3. Detailed Component Inventory & Gap Analysis

### 3.1 Global Navigation & Landmarks
- **Issue 1 (Landmarks):** Homepage (`app/page.tsx`) lacks a `<main>` landmark. Content is placed directly in root `div`.
- **Issue 2 (Multiple Nav Landmarks):** Header `<nav>`, `MobileBottomNav`, `AdminNavClient`, and pagination contain `<nav>` tags without differentiating `aria-label` attributes.
- **Issue 3 (Skip to Content):** No keyboard "Skip to main content" mechanism exists to bypass header links.
- **Issue 4 (Mobile Drawer State):** Hamburger button in `Navbar.tsx` lacks `aria-expanded` and `aria-controls` referencing mobile dropdown menu.
- **Issue 5 (Semantic Navigation):** `MobileBottomNav.tsx` uses `<button onClick={() => router.push(...)}>` instead of semantic `<Link href="...">` with `aria-current="page"`.

### 3.2 Focus System & Visible Focus Indicators
- **Issue 1 (Focus Outline Removal):** Several components use `focus:outline-none` without `:focus-visible:ring-2` replacement.
- **Issue 2 (Focus vs Focus-Visible):** `Button.tsx` applied `focus:ring-2` which triggers focus rings on mouse click, whereas `:focus-visible` is desired for keyboard navigation.
- **Issue 3 (Icon Buttons):** Wishlist, search clear, modal close, and admin action buttons lack explicit `:focus-visible:ring-2 focus-visible:ring-[#C9A24A]` focus rings.

### 3.3 Semantic Correctness & Interactive Nesting
- **Issue 1 (Nested Interactive Controls):** `BookCard.tsx` wraps the whole card in `<Link>` while containing inner `<button>` elements (Wishlist, Add to Cart). This violates HTML standards and causes screen reader and keyboard conflicts.
- **Issue 2 (Button Inside Link):** `EmptyState.tsx`, `CartClient.tsx`, and `error.tsx` nest `<Button>` inside `<Link href="...">` (`<a><button>...</button></a>`).
- **Issue 3 (Table Headers):** `Table.tsx` `<TableHead>` does not include `scope="col"` by default.

### 3.4 Screen Reader Announcements & Accessible Naming
- **Issue 1 (Icon Buttons Missing Labels):** Several icon buttons across admin tables (view, adjust stock, delete) and customer cart (steppers, clear) have only `title` attributes without proper `aria-label`.
- **Issue 2 (Live Regions):** Search result count changes, cart quantity updates, and dynamic form validation feedback lack `aria-live="polite"` or `role="status"` announcements.
- **Issue 3 (Decorative Icons):** Decorative SVGs lack `aria-hidden="true"`.
- **Issue 4 (Non-English Text):** Arabic calligraphy title on homepage lacks `lang="ar"` or an English `aria-label` for screen readers.

### 3.5 Dialogs & Modals
- **Issue 1 (Ad-hoc Admin Modals):** `AdminBooksClient.tsx`, `AdminCategoriesClient.tsx`, `AdminDiscountsClient.tsx`, `AdminInventoryClient.tsx`, `AdminUsersClient.tsx`, and `AdminAuditLogsClient.tsx` construct inline `<div className="fixed inset-0 ...">` overlays without `role="dialog"`, `aria-modal="true"`, `aria-labelledby`, keyboard focus traps, or Escape listeners.
- **Issue 2 (Modal Height & Overflow on Mobile):** Modals need explicit `max-h-[90vh] overflow-y-auto` to prevent clipping on small mobile viewports (375px/390px).

### 3.6 Color Contrast (WCAG 2.2 AA)
- **Measured Pass:** Gold primary (`#C9A24A`) on dark base (`#0B0B0B`) has an **8.20:1** contrast ratio (passes 4.5:1).
- **Measured Pass:** Accent gold (`#E5C87B`) on dark card (`#161616`) has an **11.10:1** contrast ratio.
- **Measured Pass:** Black text on primary gold button has an **8.75:1** contrast ratio.
- **Identified Gap:** Placeholder text and muted text using `#737373` (`text-neutral-500`) on `#161616` card surfaces measure **3.82:1** (below 4.5:1 requirement for normal body text).
- **Remediation:** Upgrade placeholder and muted text to `#9CA3AF` / `#A3A3A3` (`text-neutral-400`), yielding **7.17:1 - 7.80:1** contrast.

### 3.7 Form Usability & Validation Guidance
- **Issue 1 (Label Associations in Admin):** Multiple admin forms use `<label>` without `htmlFor` pointing to input IDs.
- **Issue 2 (Error Association):** Form errors are rendered as unassociated text blocks without `aria-describedby` or `aria-invalid="true"`.
- **Issue 3 (Required Fields):** Visual asterisks (`*`) need `aria-hidden="true"` while inputs need `aria-required="true"`.
- **Issue 4 (First Invalid Field Focus):** Submitting an invalid form does not programmatically focus the first invalid field.

### 3.8 Search Suggestions & Combobox
- **Issue 1 (Search Field Label):** `SearchBar.tsx` input lacks `<label>` or `aria-label`.
- **Issue 2 (Suggestions Pattern):** Search input currently lacks an accessible suggestions listbox pattern with arrow-key navigation (ArrowDown/ArrowUp), Enter selection, Escape dismissal, and `aria-expanded` state.

### 3.9 Error Recovery & Network Resilience
- **Issue 1 (Offline Status):** The application has no online/offline listener or user notification when connection drops.
- **Issue 2 (Safe Retry Actions):** Error states on catalogue, cart, and account lack clean retry triggers with idempotency preservation.

---

## 4. Priority Classification & Remediation Roadmap

| Priority | Scope Item | Files Affected | Target Standard |
|---|---|---|---|
| **P0 - Critical** | Skip-to-content link & Main landmarks | `layout.tsx`, `page.tsx`, storefront pages | WCAG 2.4.1 (Bypass Blocks) |
| **P0 - Critical** | Eliminate nested interactive controls | `BookCard.tsx`, `EmptyState.tsx`, `CartClient.tsx` | HTML 5.2 / WCAG 4.1.2 |
| **P0 - Critical** | Focus-visible luxury ring system | `globals.css`, `Button.tsx`, inputs, links | WCAG 2.4.7 (Focus Visible) |
| **P0 - Critical** | Accessible Dialogs for all Admin Modals | `AdminBooksClient`, `AdminCategoriesClient`, etc. | WCAG 2.1.2, 4.1.2 |
| **P1 - High** | Form labels, `aria-describedby`, error focus | `Input.tsx`, auth pages, checkout, admin | WCAG 3.3.1, 3.3.2 |
| **P1 - High** | Contrast adjustment for placeholders/muted | `globals.css`, inputs, card meta | WCAG 1.4.3 (Contrast Minimum) |
| **P1 - High** | Search suggestions combobox/listbox | `SearchBar.tsx`, `BooksCatalogClient.tsx` | WCAG 4.1.2, WAI-ARIA Combobox |
| **P1 - High** | Offline & Network Failure messaging | `NetworkStatusBanner.tsx`, `layout.tsx` | Advanced UX / Resiliency |
| **P2 - Medium** | Differentiate navigation landmarks | `Navbar.tsx`, `MobileBottomNav.tsx`, `AdminNav` | WCAG 1.3.1 (Info and Relationships) |
| **P2 - Medium** | Icon button accessible labels | Header, cart steppers, admin actions | WCAG 4.1.2 (Name, Role, Value) |
| **P2 - Medium** | Table header column scopes | `Table.tsx`, admin data tables | WCAG 1.3.1 |
| **P2 - Medium** | Responsive touch targets (>= 44x44px) | Mobile buttons, nav items, steppers | WCAG 2.5.8 (Target Size) |

