# Phase 05 — Asset Parity Report

**Project:** MD Shakib Islamic Books  
**Phase:** 05 — Complete Frontend & Content Parity  
**Date:** November 2, 2026  

---

## 1. Asset Inventory & Verification

An audit of all static media, images, icons, and fonts was conducted across `client/` and `apps/web/`.

| Asset File | Original Location | Intended Usage | Next.js Availability | Parity Status | Required Action |
|---|---|---|---|---|---|
| **`logo.png`** | `client/public/logo.png` | Brand logo mark, browser favicon, tab identifier | Missing from `apps/web/public/` | **Missing** | Copy to `apps/web/public/logo.png` and `apps/web/public/favicon.ico`. |
| **`hero1.png`** | `client/src/assets/Home/hero1.png` | Primary homepage hero Quran artwork | Available at `apps/web/public/assets/Home/hero1.png` | **Present** | Verified in `HeroSection.tsx`. Preserve. |
| **`Cinzel` Font** | Google Fonts (`client/src/index.css`) | Luxury serif typography for all h1..h6 headings | Loaded via Google Fonts `@import` in `globals.css` and font variable | **Present** | Matches legacy luxury heading aesthetic. |
| **`Inter` Font** | Google Fonts (`client/src/index.css`) | Clean sans-serif typography for body text and UI labels | Loaded via Google Fonts `@import` in `globals.css` and font variable | **Present** | Matches legacy body aesthetic. |
| **Brand Colors** | CSS Variables in `client/src/index.css` | `--color-primary-gold: #C9A24A`, `--color-accent-gold: #E5C87B`, `--color-main-bg: #0B0B0B` | Standardized in `globals.css` `:root` and `@theme` | **Present** | Gold brand tokens verified. |
| **SVG Icons** | Inline SVG in legacy components | Navigation, cart, chevron, checkmark, lock, shield, truck, stars | Rendered as accessible inline SVGs across components | **Present** | Vector icons render cleanly without external font lag. |

---

## 2. Asset Restoration Actions

1. **`logo.png` Restoration:**
   - Source: `client/public/logo.png`
   - Destination: `apps/web/public/logo.png`
   - Destination: `apps/web/public/favicon.ico`
   - Update metadata in `apps/web/app/layout.tsx` to include `icons: { icon: "/logo.png" }`.

2. **Asset Integrity Check:**
   - No external broken hotlinks.
   - Cloudinary image paths in database catalog (`imageUrl`) continue to resolve securely via the verified Cloudinary integration established in Phase 02 and Phase 04.

