# PHASE 07 — ANIMATION & MICRO-INTERACTIONS IMPLEMENTATION REPORT

**Project:** MD Shakib Islamic Books  
**Repository:** `/Users/arry03/Desktop/ARRRY/MD-Shakib`  
**Branch:** `new-fix`  
**Application Stack:** Next.js 16.4.3 (Turbopack, App Router), React 19.3.1, TypeScript 5.9.3, Tailwind CSS 4.3.3  
**Status:** COMPLETE & EMPIRICALLY AUDITED  
**Date:** November 4, 2026  

---

## 1. Executive Summary

Phase 07 introduces a refined, luxury Islamic motion design system to the MD Shakib Islamic Books storefront and administrative interface.

In alignment with strict safety protocols:
- **Zero Design Drift:** Preserved 100% of the Phase 06 visual design system (palette: `#C9A24A`, `#E5C87B`, `#B89139`, `#F4E8C1`, dark backgrounds `#0B0B0B` to `#1C1C1C`, typography: Cinzel + Inter).
- **Zero Production Risk:** Modified zero database schemas, Supabase migrations, API contracts, Razorpay payment flows, Delhivery shipping logic, or authentication handlers.
- **Subtle, Purposeful Interactions:** Introduced cohesive timing tokens, luxury easing curves, interactive elevations, image zooms, button depressions, and staggered entrances.
- **Complete Reduced-Motion Compliance:** Audited and enforced `@media (prefers-reduced-motion: reduce)` which cancels durations, resets delays to 0ms, and guarantees immediate visibility of all catalog and scroll reveal content without breaking layout positioning.
- **Accessibility Remediation:** Directly resolved the Phase 06 modal accessibility observation by implementing accessible keyboard focus trapping, Tab/Shift+Tab boundary looping, Escape dismissal, and focus restoration to trigger elements.

---

## 2. Motion Architecture & Library Selection

### Evaluation of Options
1. **Option A (Pure Tailwind CSS + Custom Properties) — SELECTED (Foundation):**
   - Zero external runtime bundle dependencies.
   - GPU compositing via `transform` and `opacity`.
   - 100% compatibility with React 19 Server Components and Next.js Turbopack.
   - Declarative and instantaneous overriding via CSS `@media (prefers-reduced-motion: reduce)`.
2. **Option B (Native IntersectionObserver Component) — SELECTED (Scroll Reveals):**
   - Implemented as `ScrollReveal.tsx`.
   - Lightweight: 1,710 bytes source, **815 bytes compiled client chunk** (~350 bytes gzipped).
   - Disconnects observer immediately upon intersection to prevent ongoing CPU consumption.
   - Immediate visibility fallback under reduced motion (`opacity: 1 !important; transform: none !important;`).
3. **Option C (Framer Motion) — REJECTED:**
   - Adds ~35 KB minified runtime JS overhead.
   - High risk of React 19 / Turbopack peer dependency conflicts.
   - Adds unnecessary JavaScript execution overhead for straightforward CSS transitions.

---

## 3. Centralized Motion Tokens

Defined in `apps/web/app/globals.css`:

```css
:root {
  /* Motion Timing Tokens */
  --duration-micro: 150ms;      /* Badges, active button states, toggles */
  --duration-button: 180ms;     /* Button hover, taps, icon state shifts */
  --duration-dropdown: 200ms;   /* Dropdowns, popovers, select menus */
  --duration-card: 240ms;       /* Card hover elevation, border glows */
  --duration-modal: 260ms;      /* Dialog backdrops and modal pop-ins */
  --duration-page: 300ms;       /* Route content entrance fade */
  --duration-reveal: 400ms;     /* Section reveals and grid entrances */

  /* Motion Easing Curves */
  --ease-luxury: cubic-bezier(0.16, 1, 0.3, 1);    /* Sophisticated ease-out */
  --ease-subtle: cubic-bezier(0.25, 1, 0.5, 1);    /* Balanced transition */
  --ease-spring: cubic-bezier(0.34, 1.4, 0.64, 1); /* Tactile pop */
}
```

### Keyframes Defined
- `@keyframes fadeIn`: Opacity 0 to 1 (`--duration-page`, `--ease-luxury`).
- `@keyframes fadeInUp`: Opacity 0 to 1 with `translateY(12px)` to `0` (`--duration-reveal`, `--ease-luxury`).
- `@keyframes scaleIn`: Opacity 0 to 1 with `scale(0.96)` to `1` (`--duration-modal`, `--ease-luxury`).
- `@keyframes pop`: Scale `0.92` to `1.12` to `1` (`--duration-button`, `--ease-spring`).
- `@keyframes shimmer`: Background position `-200%` to `200%` (2s infinite linear).
- `@keyframes slideDown`: Drawer entrance `translateY(-8px)` to `0` with fade.
- `@keyframes slideUp`: Notification toast entrance `translateY(12px)` to `0`.

---

## 4. Components & Routes Updated

### Shared UI Components (`components/ui/`)
1. **`Button.tsx`:**
   - Smooth hover transition with `--duration-button` and `--ease-luxury`.
   - Subtle tactile depression on tap: `active:scale-[0.98]`.
   - Distinct gold focus ring: `focus-visible:ring-2 focus-visible:ring-[#C9A24A]/60`.
   - Smooth loading spinner entrance.
2. **`Input.tsx`, `Textarea.tsx`, `Select.tsx`:**
   - Smooth border and focus ring transitions: `--duration-micro`.
   - Error messages enter smoothly via `animate-fade-in`.
   - Select dropdown chevron smoothly rotates and transitions without breaking vertical centering (`-translate-y-1/2`).
3. **`Card.tsx`:**
   - Interactive variant features subtle hover lift: `hover:-translate-y-1 hover:shadow-luxury-hover hover:border-[#C9A24A]/60` with `--duration-card`.
4. **`Modal.tsx`:**
   - Backdrop fades in via `animate-fade-in`.
   - Dialog scales smoothly via `animate-scale-in`.
   - **Accessible Focus Trap:** Automatically cycles Tab and Shift+Tab between modal boundaries, traps focus, listens for `Escape`, and restores focus to `document.activeElement` on dismissal.
5. **`Badge.tsx` & `Table.tsx`:**
   - Added `--duration-micro` transitions; interactive table rows smoothly highlight on hover.
6. **`EmptyState.tsx` & `AdminMetricCard.tsx`:**
   - Empty states enter with subtle `animate-fade-in-up`.
   - Admin KPI cards lift on hover (`hover:-translate-y-1`) with metric icon scale (`group-hover:scale-105`).
7. **`SearchBar.tsx`:**
   - Border focus transition with clear button fade in; icon vertical centering preserved.

### Commerce & Layout Components
1. **`BookCard.tsx`:**
   - Card lift: `hover:-translate-y-1.5 hover:shadow-luxury-hover hover:border-[#C9A24A]/60`.
   - Restrained image zoom: `group-hover:scale-[1.04]` over 500ms with container overflow hidden.
   - Wishlist button tactile depression: `active:scale-95`.
   - Cart action button transitions.
2. **`ProductGrid.tsx`:**
   - Staggered card entrance: Dynamic `animationDelay = ${(index % 6) * 45}ms`.
   - Under reduced motion, animation and delay are removed, ensuring cards are immediately visible.
   - Skeleton loading shimmer effect via `.skeleton-shimmer`.
   - Category tab pills smooth active background transition.
3. **`BookDetailClient.tsx`:**
   - Gallery image smooth cross-fade on thumbnail selection.
   - Active thumbnail border glow and subtle scale (`scale-105`).
   - Quantity controls tactile feedback (`active:scale-90`).
   - Sticky action bar button micro-interactions.
4. **`CartClient.tsx` & `cart-context.tsx`:**
   - Items enter with staggered fade-in.
   - Quantity increment/decrement buttons feature `active:scale-90`.
   - Add-to-cart toast upgraded with `animate-slide-up`, responsive mobile bottom clearance (`bottom-[calc(80px+env(safe-area-inset-bottom,0px))] md:bottom-6`), and accessible dismiss button.
5. **`CheckoutClient.tsx`:**
   - Delivery address and payment method selection cards transition borders and backgrounds smoothly (`--duration-card`).
6. **`Navbar.tsx` & `MobileBottomNav.tsx`:**
   - Desktop nav links gold underline hover and active state transitions.
   - Cart item count badge features `animate-pop` on quantity change.
   - Mobile nav drawer slides down smoothly (`animate-slide-down`).
   - Mobile bottom bar items have tactile depression (`active:scale-95`) and active gold pill glow.
7. **`HeroSection.tsx`, `OrderSteps.tsx`, `Reviews.tsx`:**
   - Hero typography enters via `animate-fade-in` and `animate-fade-in-up`.
   - How to Order sequence and Testimonials wrapped in `ScrollReveal` with card hover elevations.

---

## 5. Reduced Motion Audit & Implementation

In response to targeted verification requirements, the `@media (prefers-reduced-motion: reduce)` rules were audited and strengthened in `globals.css`:

```css
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-delay: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    transition-delay: 0ms !important;
    scroll-behavior: auto !important;
  }

  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation: none !important;
  }

  .animate-pulse,
  .animate-spin,
  .animate-shimmer,
  .skeleton-shimmer,
  .animate-fade-in,
  .animate-fade-in-up,
  .animate-fade-in-down,
  .animate-scale-in,
  .animate-pop,
  .animate-slide-down,
  .animate-slide-up {
    animation: none !important;
  }

  .reveal-init {
    opacity: 1 !important;
    transform: none !important;
    transition: none !important;
    will-change: auto !important;
  }

  .hover\:-translate-y-1,
  .hover\:-translate-y-1\.5,
  .group-hover\:scale-105,
  .group-hover\:scale-102,
  .group-hover\:scale-\[1\.04\],
  .group-hover\:scale-\[1\.03\],
  .active\:scale-95,
  .active\:scale-\[0\.98\],
  .active\:scale-90 {
    transform: none !important;
  }
}
```

### Key Verification Highlights
1. **Duration & Delay Collapse:** Verified via Chrome CDP that `animationDuration: 0s`, `animationDelay: 0s`, `transitionDuration: 0.01ms`, and `transitionDelay: 0s`.
2. **No Delayed or Hidden Content:** Product grid cards and scroll reveal elements render with computed `opacity: 1` immediately upon mount.
3. **Layout Centering Preserved:** By scoping transform resets to interactive utility classes rather than a blanket `* { transform: none !important }`, layout centering elements using `-translate-y-1/2` retain their `translate: 0px -50%` computed value without distortion.
4. **View Transitions Cancelled:** Added pseudo-element rules ensuring cross-document view transitions do not animate when reduced motion is preferred.

---

## 6. Performance Audit & Verification Data

### Measured Cumulative Layout Shift (CLS)
Measured via `PerformanceObserver({ type: 'layout-shift', buffered: true })` across 4 key routes:

- `/` (Home): **Desktop: 0.0000 | Mobile: 0.0000**
- `/books` (Catalog): **Desktop: 0.0000 | Mobile: 0.0000**
- `/cart` (Cart): **Desktop: 0.0119 | Mobile: 0.0000**
- `/checkout` (Checkout): **Desktop: 0.0972 | Mobile: 0.0000**

All tested routes are strictly within the Google Core Web Vitals threshold for "Good" (`< 0.10`).

### Bundle Impact Analysis
- **External Dependencies:** `0` added.
- **Client Components Added:** `ScrollReveal.tsx` (Source: 1,710 bytes; Compiled chunk: 815 bytes; ~350 bytes gzipped).
- **Global CSS:** ~1.4 KB added to `globals.css`.
- **Pre/Post Historical Baseline:** Not independently measured against an automated git commit baseline (historical bundle tracking was not previously configured).
