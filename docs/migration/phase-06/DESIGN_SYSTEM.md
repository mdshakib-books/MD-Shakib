# MD Shakib Islamic Books — Design System Specification
**Project:** MD Shakib Islamic Books  
**Phase:** 06 — Premium Design System & UI/UX  
**Target:** Unified Quiet Luxury & Editorial E-Commerce  
**Date:** November 2, 2026  
**Status:** AUTHORITATIVE SPECIFICATION

---

## 1. Visual Identity & Design Principles

MD Shakib Islamic Books is an editorial-grade, quiet luxury e-commerce destination for authentic Islamic books, scholarly collections, Quranic translations, and classical commentaries.

### Core Tenets:
1. **Quiet Luxury Aesthetic:** Understated opulence achieved through restraint, deep rich dark surfaces, and warm antique gold accents rather than loud gradients or flashy animations.
2. **Editorial Typographic Hierarchy:** Classical serif titles (`Cinzel`) paired with modern, legible humanist sans-serif body copy (`Inter`).
3. **Harmonious Layered Elevation:** 5 distinct dark surface levels establishing clear depth without harsh contrast.
4. **Predictable Spacing & Alignment:** Consistent spacing scale ensuring optical balance across desktop, tablet, and mobile devices.
5. **No Decorative Gimmicks:** Zero emoji interface icons, zero arbitrary colors, and zero horizontal overflows.

---

## 2. Color Palette & Token Definitions

All color tokens are authoritatively declared in `apps/web/app/globals.css` inside both Tailwind v4 `@theme` and CSS `:root`.

### 2.1 Brand Gold Palette
| Token Variable | Tailwind Utility | Hex Code | Semantic Role |
|---|---|---|---|
| `--color-primary-gold` | `primary-gold` | `#C9A24A` | Primary brand accent, key action buttons, active indicators, ratings |
| `--color-accent-gold` | `accent-gold` | `#E5C87B` | Luminous highlight gold, glowing header titles, decorative accents |
| `--color-gold-hover` | `gold-hover` | `#B89139` | Deep antique gold for interactive hover states on gold buttons |
| `--color-gold-light` | `gold-light` | `#F4E8C1` | Champagne cream for subtle badge backgrounds and discount tags |

### 2.2 Dark Surface Elevation Scale
| Token Variable | Tailwind Utility | Hex Code | Elevation Role |
|---|---|---|---|
| `--color-dark-bg` | `dark-bg` | `#0B0B0B` | Canvas base background |
| `--color-dark-surface` | `dark-surface` | `#111111` | Primary component background (navbars, footers, sidebars) |
| `--color-dark-card` | `dark-card` | `#161616` | Elevated cards (book cards, metric cards, order cards) |
| `--color-dark-elevated`| `dark-elevated`| `#1C1C1C` | Highest overlay surfaces (modals, dialogs, dropdown menus) |

### 2.3 Border System
| Token Variable | Tailwind Utility | Hex / Value | Semantic Role |
|---|---|---|---|
| `--color-dark-border-subtle` | `dark-border-subtle` | `#1F1F1F` | Subtle row dividers, table separators |
| `--color-dark-border` | `dark-border` | `#2A2A2A` | Standard structural borders, card outlines |
| `--color-dark-border-muted` | `dark-border-muted` | `#333333` | Focus rings, hover states for dark buttons |
| N/A | `border-gold/30` | `rgba(201, 162, 74, 0.3)` | Subtle gold accents, active navigation indicators |

### 2.4 Functional Status Colors
| State | Text Color | Background Pill / Badge | Border Color |
|---|---|---|---|
| **Success / Paid** | `text-emerald-400` | `bg-emerald-950/30` | `border-emerald-800/40` |
| **Warning / Low Stock** | `text-amber-400` | `bg-amber-950/30` | `border-amber-800/40` |
| **Danger / Cancelled** | `text-red-400` | `bg-red-950/30` | `border-red-800/40` |
| **Info / Shipped** | `text-blue-400` | `bg-blue-950/30` | `border-blue-800/40` |
| **Muted / Inactive** | `text-neutral-400` | `bg-[#1A1A1A]` | `border-[#282828]` |

---

## 3. Typography Scale & Hierarchy

- **Serif Font Family:** `var(--font-serif)` (`Cinzel`, Georgia, serif)
- **Sans-Serif Font Family:** `var(--font-sans)` (`Inter`, system-ui, -apple-system, sans-serif)

| Level | Font Family | Size & Weight | Letter Spacing | Standard Classes |
|---|---|---|---|---|
| **Display 1** | `font-serif` | `text-3xl md:text-5xl font-bold` | `tracking-wider` | `font-serif text-3xl md:text-5xl font-bold uppercase tracking-wider text-white` |
| **Page Title (H1)** | `font-serif` | `text-2xl md:text-3xl font-bold` | `tracking-wide` | `font-serif text-2xl md:text-3xl font-bold uppercase tracking-wide text-white` |
| **Section Title (H2)**| `font-serif` | `text-xl md:text-2xl font-semibold` | `tracking-wide` | `font-serif text-xl md:text-2xl font-semibold uppercase tracking-wide text-neutral-100` |
| **Card Title (H3)** | `font-serif` | `text-base md:text-lg font-medium` | `tracking-normal` | `font-serif text-base md:text-lg font-medium text-neutral-100` |
| **Eyebrow / Category**| `font-sans` | `text-[10px] md:text-xs font-semibold`| `tracking-[0.2em]`| `font-sans text-[11px] font-semibold tracking-[0.2em] uppercase text-primary-gold` |
| **Body Large** | `font-sans` | `text-base font-normal` | `tracking-normal` | `font-sans text-base text-neutral-300 leading-relaxed font-light` |
| **Body Default** | `font-sans` | `text-sm font-normal` | `tracking-normal` | `font-sans text-sm text-neutral-300 leading-relaxed` |
| **Body Small** | `font-sans` | `text-xs font-normal` | `tracking-normal` | `font-sans text-xs text-neutral-400 leading-normal` |
| **Price Main** | `font-sans` | `text-lg md:text-2xl font-bold` | `tracking-tight` | `font-sans font-bold text-primary-gold` |
| **Price Strike** | `font-sans` | `text-xs md:text-sm font-normal` | `tracking-normal` | `font-sans text-neutral-500 line-through` |

---

## 4. Spacing, Elevation & Corner Radii

### 4.1 Spacing Standard
- **Page Container Max Width:** `max-w-[1200px]` (Customer storefront), `max-w-7xl` (Admin portal)
- **Container Side Padding:** `px-4 sm:px-6 lg:px-8`
- **Section Vertical Padding:** `py-12 md:py-20` (Storefront), `space-y-6 sm:space-y-8` (Admin)
- **Card Padding:** `p-4 sm:p-6`
- **Grid Gap:** `gap-4 sm:gap-6 lg:gap-8`

### 4.2 Corner Radii
- **Input / Button / Badge:** `rounded-lg` (`8px`) or `rounded-[10px]` (`10px`)
- **Card:** `rounded-xl` (`12px` – `14px`)
- **Modal / Dialog / Container:** `rounded-2xl` (`16px` – `20px`)
- **Pill / Roundel:** `rounded-full` (`9999px`)

### 4.3 Shadows
- **Card Shadow:** `shadow-luxury` (`0 4px 20px rgba(0, 0, 0, 0.4)`)
- **Card Hover:** `hover:shadow-luxury-hover hover:border-primary-gold/60`
- **Gold Glow:** `shadow-[0_0_20px_rgba(201,162,74,0.25)]`

---

## 5. UI Component Specifications

### 5.1 Button Variants (`components/ui/Button.tsx`)
- **`primary`:** `bg-primary-gold hover:bg-gold-hover text-black font-semibold shadow-md focus:ring-2 focus:ring-primary-gold`
- **`secondary`:** `bg-[#161616] border border-[#2A2A2A] text-neutral-200 hover:border-primary-gold hover:text-primary-gold`
- **`outline`:** `bg-transparent border border-primary-gold text-primary-gold hover:bg-primary-gold hover:text-black`
- **`danger`:** `bg-red-950/40 border border-red-800/60 text-red-400 hover:bg-red-900/60 hover:text-white`
- **`ghost`:** `bg-transparent text-neutral-400 hover:text-neutral-100 hover:bg-[#1A1A1A]`

### 5.2 Form Inputs (`components/ui/Input.tsx`, `Select.tsx`, `Textarea.tsx`)
- Standard input height: `h-11` (44px, guaranteeing comfortable touch-target compliance).
- Background: Inset `#0E0E0E`.
- Border: `#2A2A2A`.
- Active focus state: `focus:border-primary-gold focus:ring-1 focus:ring-primary-gold/40`.
- Integrated accessible label (`htmlFor`) and helper/error text with `aria-invalid` and `aria-describedby`.

### 5.3 Badges (`components/ui/Badge.tsx`)
- Rounded `px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wider`.
- Variants: `gold`, `discount`, `success`, `danger`, `warning`, `info`, `muted`.

### 5.4 Card Primitives (`components/ui/Card.tsx`)
- `Card`: Background `#161616`, border `#2A2A2A`, `rounded-xl`, subtle padding.
- `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`.

### 5.5 Data Table Primitives (`components/ui/Table.tsx`)
- Responsive scroll wrapper `overflow-x-auto`.
- Header: `bg-[#161616] text-[11px] uppercase tracking-wider text-neutral-400 border-b border-[#2A2A2A]`.
- Row: `hover:bg-[#1A1A1A]/50 transition divide-y divide-[#1F1F1F]`.
- Cell: `py-3.5 px-4 text-xs sm:text-sm text-neutral-300`.

### 5.6 Modals & Dialogs (`components/ui/Modal.tsx`)
- Backdrop: `fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4`.
- Dialog Container: `bg-[#161616] border border-[#2A2A2A] rounded-2xl p-6 shadow-2xl max-w-lg w-full`.
- Full keyboard support: Escape key dismissal, focus trap, body scroll lock, accessible close button.

