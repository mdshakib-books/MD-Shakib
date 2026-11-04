# PHASE 07 — ANIMATION INVENTORY

**Project:** MD Shakib Islamic Books  
**Phase:** 07 — Animation & Micro-Interactions  
**Date:** November 4, 2026  

This inventory documents all motion interactions, CSS animations, keyframe transitions, and scroll reveal primitives implemented across the MD Shakib Islamic Books storefront and administrative interface.

---

## 1. Centralized Motion Tokens

| Token Name | Value | Purpose |
|---|---|---|
| `--duration-micro` | `150ms` | Badges, toggles, button active depression, tooltips |
| `--duration-button` | `180ms` | Primary/secondary button hovers, icon state shifts |
| `--duration-card` | `240ms` | Card elevation, border highlights, interactive tiles |
| `--duration-dropdown` | `200ms` | Dropdown menus, popovers, select expansion |
| `--duration-modal` | `260ms` | Dialog backdrop transitions, modal zoom entrances |
| `--duration-page` | `300ms` | Page route content fade-in |
| `--duration-reveal` | `400ms` | Viewport scroll reveals, hero typography entrances |
| `--ease-luxury` | `cubic-bezier(0.16, 1, 0.3, 1)` | Luxury ease-out for entrances, reveals, and card lifts |
| `--ease-subtle` | `cubic-bezier(0.4, 0, 0.2, 1)` | Standard balanced easing for form elements and UI |
| `--ease-spring` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Tactile spring curve for cart count badge pops |

---

## 2. Animation & Micro-Interaction Catalog

| Component / Route | Animation / Transition | Trigger | Duration | Easing | Properties Animated | Reduced-Motion Behavior |
|---|---|---|---|---|---|---|
| **Button** (`components/ui/Button.tsx`) | Hover highlight & lift | Mouse hover | `180ms` | `--ease-luxury` | `background-color`, `box-shadow`, `border-color` | Immediate color change |
| **Button** (`components/ui/Button.tsx`) | Active depression | Mouse down / tap | `150ms` | `--ease-luxury` | `transform: scale(0.98)` | Immediate (no scale) |
| **Button** (`components/ui/Button.tsx`) | Loading spinner | `isLoading=true` | `200ms` | `--ease-subtle` | `opacity`, `transform: rotate` | Immediate visibility |
| **Input** (`components/ui/Input.tsx`) | Focus ring glow | Focus / Blur | `150ms` | `--ease-subtle` | `border-color`, `box-shadow` | Immediate color change |
| **Input** (`components/ui/Input.tsx`) | Error entrance | Form validation error | `300ms` | `--ease-luxury` | `opacity`, `transform: translateY` | Immediate display |
| **Select** (`components/ui/Select.tsx`) | Chevron rotation & focus | Select focus / open | `150ms` | `--ease-subtle` | `border-color`, `transform: rotate` | Immediate rotation |
| **Textarea** (`components/ui/Textarea.tsx`) | Focus ring glow | Focus / Blur | `150ms` | `--ease-subtle` | `border-color`, `box-shadow` | Immediate color change |
| **Card (interactive)** (`components/ui/Card.tsx`) | Hover lift & gold shadow | Mouse hover | `240ms` | `--ease-luxury` | `transform: translateY(-4px)`, `box-shadow`, `border-color` | Border color change only |
| **Modal** (`components/ui/Modal.tsx`) | Backdrop fade | Modal open | `260ms` | `--ease-subtle` | `opacity: 0 -> 1` | Immediate display |
| **Modal** (`components/ui/Modal.tsx`) | Dialog scale-in | Modal open | `260ms` | `--ease-luxury` | `opacity`, `transform: scale(0.96 -> 1)` | Immediate display |
| **Modal** (`components/ui/Modal.tsx`) | Focus Trap Cycling | Tab / Shift+Tab | N/A | N/A | Focus cycling between boundary buttons | Maintained (Accessible) |
| **Badge** (`components/ui/Badge.tsx`) | Hover tint | Mouse hover | `150ms` | `--ease-subtle` | `background-color`, `border-color` | Immediate color change |
| **Table** (`components/ui/Table.tsx`) | Row highlight | Mouse hover | `150ms` | `--ease-subtle` | `background-color` | Immediate color change |
| **EmptyState** (`components/ui/EmptyState.tsx`) | Content entrance | Mount / Render | `400ms` | `--ease-luxury` | `opacity`, `transform: translateY(12px -> 0)` | Immediate display |
| **AdminMetricCard** (`components/ui/AdminMetricCard.tsx`) | Card lift & icon zoom | Mouse hover | `240ms` | `--ease-luxury` | `transform: translateY(-4px)`, icon `scale(1.05)` | Border glow only |
| **SearchBar** (`components/ui/SearchBar.tsx`) | Focus glow & clear button | Input focus / text enter | `150ms` | `--ease-subtle` | `border-color`, `opacity` | Immediate display |
| **BookCard** (`components/commerce/BookCard.tsx`) | Card elevation | Mouse hover | `240ms` | `--ease-luxury` | `transform: translateY(-6px)`, `box-shadow`, `border-color` | Border color only |
| **BookCard** (`components/commerce/BookCard.tsx`) | Image zoom | Card hover | `500ms` | `--ease-subtle` | `transform: scale(1.04)` | No scale |
| **BookCard** (`components/commerce/BookCard.tsx`) | Wishlist tap | Mouse click / tap | `150ms` | `--ease-spring` | `transform: scale(0.95)` | No scale |
| **ProductGrid** (`components/commerce/ProductGrid.tsx`) | Staggered entrance | Category switch / mount | `400ms` (delay 0-300ms) | `--ease-luxury` | `opacity`, `transform: translateY(12px -> 0)` | Immediate display |
| **ProductGrid** (`components/commerce/ProductGrid.tsx`) | Skeleton shimmer | Data loading | `2000ms` (infinite) | `linear` | `background-position: -200% -> 200%` | Static solid fill |
| **BookDetailClient** (`app/books/[id]`) | Main image crossfade | Thumbnail click | `200ms` | `--ease-luxury` | `opacity: 0.8 -> 1`, `transform: scale` | Immediate swap |
| **BookDetailClient** (`app/books/[id]`) | Thumbnail active glow | Selection | `150ms` | `--ease-luxury` | `border-color`, `transform: scale(1.05)` | Immediate border |
| **BookDetailClient** (`app/books/[id]`) | Quantity adjuster tap | Plus / Minus tap | `150ms` | `--ease-luxury` | `transform: scale(0.9)` | Immediate value change |
| **CartClient** (`app/cart`) | Item row entrance | Mount / Load | `300ms` (delay 0-200ms) | `--ease-luxury` | `opacity`, `transform: translateY(10px -> 0)` | Immediate display |
| **CartClient** (`app/cart`) | Quantity button tap | Increment / decrement | `150ms` | `--ease-luxury` | `transform: scale(0.9)` | Immediate value change |
| **Cart Toast** (`lib/commerce/cart-context.tsx`) | Slide-up entrance | Item added to cart | `260ms` | `--ease-luxury` | `opacity`, `transform: translateY(12px -> 0)` | Immediate display |
| **CheckoutClient** (`app/checkout`) | Address card selection | User select | `240ms` | `--ease-luxury` | `border-color`, `background-color`, `box-shadow` | Immediate color change |
| **CheckoutClient** (`app/checkout`) | Payment method selection | User select | `240ms` | `--ease-luxury` | `border-color`, `background-color`, `box-shadow` | Immediate color change |
| **Navbar** (`components/layout/Navbar.tsx`) | Link underline highlight | Mouse hover | `180ms` | `--ease-luxury` | `color`, `border-color` | Immediate color change |
| **Navbar** (`components/layout/Navbar.tsx`) | Cart count pop | Item count change | `200ms` | `--ease-spring` | `transform: scale(0.85 -> 1.15 -> 1)` | Immediate number swap |
| **Navbar** (`components/layout/Navbar.tsx`) | Mobile drawer slide | Menu button tap | `240ms` | `--ease-luxury` | `opacity`, `transform: translateY(-8px -> 0)` | Immediate display |
| **MobileBottomNav** (`components/layout/MobileBottomNav.tsx`) | Nav item tap | Tap / click | `150ms` | `--ease-luxury` | `transform: scale(0.95)` | Immediate route change |
| **MobileBottomNav** (`components/layout/MobileBottomNav.tsx`) | Active pill glow | Route active | `180ms` | `--ease-luxury` | `color`, `box-shadow`, `border-color` | Immediate color change |
| **HeroSection** (`components/layout/HeroSection.tsx`) | Title entrance | Page load | `400ms` | `--ease-luxury` | `opacity`, `transform: translateY(16px -> 0)` | Immediate display |
| **OrderSteps** (`components/home/OrderSteps.tsx`) | Section scroll reveal | Viewport scroll (15%) | `400ms` | `--ease-luxury` | `opacity`, `transform: translateY(16px -> 0)` | Immediate display |
| **Reviews** (`components/home/Reviews.tsx`) | Testimonial scroll reveal | Viewport scroll (15%) | `400ms` | `--ease-luxury` | `opacity`, `transform: translateY(16px -> 0)` | Immediate display |
| **PageContainer** (`components/layout/PageContainer.tsx`) | Route content fade | Route transition | `300ms` | `--ease-luxury` | `opacity: 0 -> 1` | Immediate display |
| **View Transitions API** (`app/globals.css`) | Cross-route view transition | Link navigation | `300ms` | `--ease-luxury` | `opacity`, `mix-blend-mode` (Chromium 126+) | Browser default navigation |

---

## 3. Keyframe Definitions

```css
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes fadeInUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes scaleIn {
  from { opacity: 0; transform: scale(0.96); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes pop {
  0% { transform: scale(0.85); }
  60% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

@keyframes slideDown {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}
```

