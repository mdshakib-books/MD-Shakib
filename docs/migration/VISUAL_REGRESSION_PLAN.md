# Visual Regression & UI Parity Plan: MD Shakib Islamic Books

## 1. Zero Visual Change Mandate

The primary requirement of this architecture migration is **strict visual and layout parity**. The rendered user interface in Next.js must look and feel identical to the existing Vite + React application.

---

## 2. Design System Tokens (Source of Truth)

All styling rules are anchored in the existing theme defined in `client/src/index.css`:

### Color Palette
- **Primary Gold:** `#C9A24A` (`var(--color-primary-gold)`)
- **Accent Gold:** `#E5C87B` (`var(--color-accent-gold)`)
- **Main Background:** `#0B0B0B` (`var(--color-main-bg)`)
- **Secondary Dark Card:** `#111111` (`var(--color-secondary-dark)`)
- **Border Dark:** `#2A2A2A` (`var(--color-border-dark)`)
- **Border Subtle:** `#1A1A1A`
- **Text Light / Primary:** `#F5F5F5` (`var(--color-text-light)`)
- **Text Muted / Gray:** `#9CA3AF` (`var(--color-text-muted)`)
- **Status Colors:**
  - Success / Delivered: `#22C55E` / `#4ADE80` (Green)
  - Warning / Pending: `#FACC15` / `#FDE047` (Yellow)
  - Error / Cancelled / Out of Stock: `#EF4444` / `#F87171` (Red)
  - Info / Packed / Shipped: `#3B82F6` / `#818CF8` (Blue / Indigo)

### Typography
- **Heading Font:** `Cinzel, serif` (weights: 400, 500, 600, 700, 800, 900)
- **Body Font:** `Inter, sans-serif` (weights: 400, 500, 600, 700)
- **Heading Styles:** Tracking `0.1em` to `0.3em`, gold gradient text masks, uppercase badges.

### Shadows, Radii & Animations
- **Card Shadow:** `0 6px 20px rgba(0, 0, 0, 0.4)` (`--shadow-luxury`)
- **Gold Glow Shadow:** `0 0 15px rgba(201, 162, 74, 0.3)`
- **Border Radius:** `rounded-lg` (`8px`), `rounded-xl` (`12px`), `rounded-2xl` (`16px`)
- **Animations:**
  - `animate-slide-up`: 0.25s ease-out translateY(16px) → translateY(0)
  - `scale-in`: 0.3s ease-out scale(0.6) → scale(1)
  - `pulse`: subtle gold badge pulsing

---

## 3. Standard Test Viewports

Every page will be inspected and compared across 3 canonical viewport widths:
1. **Desktop:** $1440 \times 900\text{ px}$ (Full desktop layout, multi-column grids, desktop navigation bar)
2. **Tablet:** $768 \times 1024\text{ px}$ (Adaptive 2-column grids, collapsible menus)
3. **Mobile:** $375 \times 812\text{ px}$ (iPhone X / standard mobile viewport, single column grid, fixed bottom navigation bar `MobileBottomNav`)

---

## 4. Visual Parity Checklist by Page & Component

### A. Storefront & Home (`/`)
- [ ] Hero section background dark gradient (`from-black/80 to-black/95`) with gold headline drop shadow.
- [ ] 4 Trust indicator cards with matching borders (`#2A2A2A`) and icon spacing.
- [ ] Product carousel with horizontal snap, left/right scroll arrows, and gold hover borders.
- [ ] 4-step order guide with numbered circle badges and connecting borders.
- [ ] Customer review cards with 5-star gold ratings and quote formatting.
- [ ] Mobile bottom navigation bar fixed at bottom with 4 active tab icons.

### B. Catalogue & Book Details (`/books`, `/books/[id]`)
- [ ] Search input with gold focus ring, clear button, and category pill tabs.
- [ ] Responsive book card layout: 4 columns (desktop), 3 columns (laptop), 2 columns (tablet/mobile).
- [ ] Book card: image ratio ($4:5$), discount ribbon (top right), rating stars, price with strikethrough original price, "Add to Cart" button.
- [ ] Book details page: 50/50 split layout on desktop, stacked on mobile.
- [ ] Thumbnail gallery: active thumbnail highlighted with gold border and glow shadow.
- [ ] Metadata specification table with alternating subtle borders.
- [ ] Related books and popular books carousels rendered beneath product details.

### C. Cart & Checkout (`/cart`, `/checkout`)
- [ ] Cart item row: book cover thumbnail, title, price, quantity increment/decrement controls, trash icon.
- [ ] Sticky price summary card: subtotal, platform fee (₹10), delivery fee (₹35), total, proceed button.
- [ ] Address selection cards with radio checkmark and "Default" gold badge.
- [ ] Payment method toggle: Cash on Delivery vs Online Payment with matching badge styling.

### D. Customer Account & Orders (`/orders`, `/orders/[id]`, `/profile`, `/addresses`)
- [ ] Order history list: order ID, date, status pill with custom background opacity (`bg-yellow-900/20`, etc.).
- [ ] Order tracking timeline: vertical step line on mobile, connected horizontal nodes on desktop.
- [ ] Order cancellation dialog: dark modal backdrop with confirmation buttons.
- [ ] 7-day replacement request modal with reason textarea.
- [ ] Address CRUD modal with form validation error text (`text-red-400`).

### E. Admin Backoffice (`/admin/*`)
- [ ] Admin sidebar layout with active tab highlighting (`text-[#C9A24A] bg-[#1a1a1a]`).
- [ ] Admin dashboard: 4 top stat metric cards, sales bar chart, order doughnut chart.
- [ ] Books table: thumbnail, title, category, price, inline stock badge, action buttons.
- [ ] Multi-image book upload form: drag-and-drop zone with image previews and delete buttons.
- [ ] Order transition dropdown enforcing strict sequential transitions.
- [ ] User directory table with block/unblock toggles and soft-delete confirmation modal.

---

## 5. Visual Regression Testing Procedure

1. **Local Preview Inspection:** Spin up legacy client on port `5173` and migrated Next.js on port `3000`.
2. **Automated Headless Capture:** Use Playwright or Puppeteer to capture identical full-page PNG screenshots across all routes for both ports.
3. **Pixel Diffing:** Run automated visual comparison (e.g. `pixelmatch` / Playwright visual comparisons) with a tolerance threshold $\Delta \le 0.5\%$.
4. **Interactive State Verification:** Verify hover states, dropdown toggles, modal animations, and validation error messages match exactly.

