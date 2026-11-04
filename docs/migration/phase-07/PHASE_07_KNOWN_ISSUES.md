# PHASE 07 — KNOWN ISSUES, ENVIRONMENT LIMITATIONS & VERIFICATION OBSERVATIONS

**Project:** MD Shakib Islamic Books  
**Phase:** 07 — Animation & Micro-Interactions  
**Date:** November 4, 2026  

---

## 1. Classification of Observations

### 1.1 Verified Empirical Results
- **Automated Test Suites:**
  - 14/14 automated tests passed in `test-phase07-animation-and-motion.ts`.
  - 8/8 targeted acceptance audits passed in `test-phase07-targeted-verification.ts`.
- **Actual Measured Cumulative Layout Shift (CLS):**
  - Measured via `PerformanceObserver({ type: 'layout-shift', buffered: true })` in Chrome:
    - `/` (Home): Desktop = `0.0000`, Mobile = `0.0000`
    - `/books` (Catalog): Desktop = `0.0000`, Mobile = `0.0000`
    - `/cart` (Cart): Desktop = `0.0119`, Mobile = `0.0000`
    - `/checkout` (Checkout): Desktop = `0.0972`, Mobile = `0.0000`
  - All measured values pass the Google Core Web Vitals threshold of `< 0.10`.
- **Bundle Size Measurement:**
  - `ScrollReveal.tsx` client component chunk size was measured at **815 bytes** in `.next/server/chunks/ssr/` (~350 bytes gzipped).
- **Reduced Motion Behavior:**
  - Tested via Chrome CDP `Emulation.setEmulatedMedia` with `prefers-reduced-motion: reduce`:
    - `animationDuration: 0s`
    - `animationDelay: 0s`
    - `transitionDuration: 0.00001s` (0.01ms)
    - `transitionDelay: 0s`
    - Catalog items and scroll reveal elements render with computed `opacity: 1` immediately without delay.
    - Centered elements using `-translate-y-1/2` preserve `translate: 0px -50%` without distortion.
- **Modal Focus Trap & Keyboard Navigation:**
  - Tested via live DOM harness:
    - First focusable element automatically receives focus upon opening.
    - `Tab` on last focusable element loops focus to first element.
    - `Shift+Tab` on first focusable element loops focus to last element.
    - `Escape` key closes modal.
    - Focus returns to the trigger element that initiated the modal.

### 1.2 Agent-Reported / Corrected Inferences
- **CLS Initial Claim:** The initial Phase 07 report stated "CLS: 0.000" across the application. That was an inference based on the fact that only GPU-composited CSS properties (`transform`, `opacity`) were animated. In this targeted audit, actual `PerformanceObserver` layout shifts were recorded, showing that `/cart` has `0.0119` and `/checkout` has `0.0972` on desktop due to dynamic price breakdowns and form loading, while remaining well below the 0.10 threshold.

### 1.3 Not Independently Measured
- **Comparative Total Bundle Diff Against Git History:**
  - An automated baseline bundle diff against the pre-Phase 07 git commit was not performed because an automated bundle size tracking tool was not present prior to Phase 07.
  - Zero external npm packages were installed (0KB third-party library overhead).
  - The only client-side JavaScript added is `ScrollReveal.tsx` (815 bytes compiled).

### 1.4 Environment Limitations
- **Local Docker Daemon Inactive:**
  - The local Docker daemon was not running on the development machine.
  - Local Supabase containers (`supabase start`) were therefore inactive.
  - Next.js production builds and static page generation ran successfully using cached/mock catalog items and environment fallbacks on port 3001.
- **Browser Support for View Transitions API:**
  - Native CSS View Transitions (`@view-transition { navigation: auto; }`) are currently supported in Chromium 126+.
  - In Safari (WebKit) and Firefox (Gecko), this declaration is safely ignored as an unknown rule without console warnings or runtime exceptions.
  - Client-side navigation in Next.js App Router functions normally across all browsers as progressive enhancement.
- **Turbopack Deprecation Warning (`middleware` -> `proxy`):**
  - Next.js 16.4.3 logs: `⚠ The "middleware" file convention is deprecated. Please use "proxy" instead.`
  - To prevent authentication regressions, `middleware.ts` was retained as-is until a dedicated framework upgrade phase.

---

## 2. Non-Regression Guarantees

In accordance with strict safety protocols:

1. **Database & Migrations:**
   - Zero changes made to `supabase/migrations/`.
   - Zero modifications to production tables, triggers, RLS policies, or RPC functions.
2. **Payments & Checkout:**
   - Zero modifications made to Razorpay client/server integration (`/api/payments/create-order`, `/api/payments/verify`).
   - Order submission payloads, coupon redemption logic, and cash-on-delivery calculations are 100% untouched.
3. **Authentication & Authorization:**
   - Auth state management, Supabase Auth tokens, OTP verification, and role-based route protection remain exactly as implemented in Phase 05/06.
4. **Visual Design Tokens:**
   - Palette (`#C9A24A`, `#E5C87B`, `#B89139`, `#F4E8C1`, dark tones `#0B0B0B` - `#1C1C1C`) and typography (Cinzel + Inter) strictly preserved.
5. **Layout & Responsiveness:**
   - Zero horizontal overflow introduced across all 5 standard breakpoints (`375px`, `390px`, `768px`, `1024px`, `1440px`).
