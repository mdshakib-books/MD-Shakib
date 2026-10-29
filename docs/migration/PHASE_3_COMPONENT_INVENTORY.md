# Phase 3 — Component Inventory
**Project:** MD Shakib Islamic Books  
**Audit Date:** 2026-10-28  
**Scope:** Reusable UI Primitives, Layout Shells & Commerce Presentation Components (`apps/web/components/`)  

---

## 1. Inventory Matrix

| Component | Category | Path | Render Mode | Key Props / Interfaces | Status | Parity Notes |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`Navbar`** | Layout | `components/layout/Navbar.tsx` | `"use client"` | `cartCount?: number`, `user?: User \| null`, `onLogout?: () => void` | **Verified** | Strict parity with `client/src/components/Navbar.jsx`. Sticky/transparent home scroll state, mobile hamburger dropdown, cart badge count. |
| **`Footer`** | Layout | `components/layout/Footer.tsx` | Server Component | None | **Verified** | Strict parity with `client/src/components/Footer.jsx`. Brand logo, navigation links (`/about`, `/support`, `/privacy-policy`, `/terms`), social icons, copyright. |
| **`PageContainer`**| Layout | `components/layout/PageContainer.tsx`| Server Component | `size?: 'sm' \| 'md' \| 'lg' \| 'full'`, `className?: string` | **Verified** | Standardized container wrapping up to `max-w-[1200px]` with responsive padding. |
| **`SectionHeading`**| Layout | `components/layout/PageContainer.tsx`| Server Component | `title: string`, `subtitle?: string`, `align?: 'left' \| 'center' \| 'right'` | **Verified** | Cinzel font, uppercase gold title, gold decorative accent line. |
| **`HeroSection`** | Presentation | `components/layout/HeroSection.tsx` | Server Component | `presentingText?`, `arabicTitle?`, `blessingText?` | **Verified** | Preserves 500px hero container, gradient overlay, Urdu/Arabic typography ("محمد شکیب صدیقی"). |
| **`TrustIndicators`**| Presentation | `components/layout/HeroSection.tsx` | Server Component | None | **Verified** | 3 trust badges: Free Shipping, Secure Payments, Verified Quality with SVG icons and gold borders. |
| **`Button`** | UI Primitive | `components/ui/Button.tsx` | Client/Server (`forwardRef`) | `variant?: 'primary' \| 'secondary' \| 'outline' \| 'danger' \| 'ghost'`, `size`, `isLoading` | **Verified** | Gold luxury buttons with rounded-[10px], focus rings, and animated spinner loading state. |
| **`Input`** | UI Primitive | `components/ui/Input.tsx` | Client/Server (`forwardRef`) | `error?: string`, `label?: string`, standard HTML attributes | **Verified** | Dark `#0B0B0B` background, `#2A2A2A` border, gold glow focus, red error feedback. |
| **`Badge`** | UI Primitive | `components/ui/Badge.tsx` | Server Component | `variant?: 'gold' \| 'discount' \| 'success' \| 'danger' \| 'muted'` | **Verified** | Replaces scattered inline badges with standardized tokens (e.g. `#FFF5D1` for discount tags). |
| **`EmptyState`** | UI Primitive | `components/ui/EmptyState.tsx` | Server Component | `message?: string`, `actionText?: string`, `actionUrl?: string` | **Verified** | SVG package icon, neutral message, gold action button. |
| **`Loader`** | UI Primitive | `components/ui/Loader.tsx` | Server Component | `fullScreen?: boolean`, `size?: 'sm' \| 'md' \| 'lg'` | **Verified** | Animated gold spinning loader. |
| **`Modal` & `ConfirmModal`** | UI Primitive | `components/ui/Modal.tsx` | `"use client"` | `isOpen`, `onClose`, `title`, `description`, `onConfirm`, `isDestructive` | **Verified** | Accessible backdrop dialog, ESC keyboard dismissal, body scroll lock, dark luxury theme. |
| **`SearchBar`** | UI Primitive | `components/ui/SearchBar.tsx` | `"use client"` | `onSearch?`, `onClear?`, `defaultQuery?`, `autoFocus?`, `placeholder?` | **Verified** | 200ms debounce, rounded-full styling, clear button, gold focus glow. |
| **`BookCard`** | Commerce | `components/commerce/BookCard.tsx` | `"use client"` | `book: BookItem`, `inCart?: boolean`, `onAddToCart?`, `onGoToCart?`, `onToggleWishlist?` | **Verified** | Strict parity with `client/src/components/BookCard.jsx`. 3:4 aspect image, wishlist button, discount tag, formatPrice, cart toggle button. |
| **`ProductGrid`** | Commerce | `components/commerce/ProductGrid.tsx` | `"use client"` | `books: BookItem[]`, `cartBookIds?`, `onAddToCart?`, `isLoading?` | **Verified** | Responsive 2/3/4-column grid, skeleton loader fallback, empty state handling. |
| **`CategoryTabs`**| Commerce | `components/commerce/ProductGrid.tsx` | `"use client"` | `categories: string[]`, `activeCategory: string`, `onSelectCategory` | **Verified** | Horizontal scrollable category pill buttons with active gold background pill. |

---

## 2. Shared Utilities (`apps/web/lib/utils.ts`)

1. **`cn(...inputs)`**: Class merge utility combing `clsx` and `tailwind-merge` to resolve conflicting classes cleanly.
2. **`formatPrice(price)`**: Formats numeric values to Indian Rupee currency strings (`₹899`) without decimals using `Intl.NumberFormat('en-IN')`.
3. **`truncateText(text, maxLength)`**: Truncates text strings safely with ellipsis.

