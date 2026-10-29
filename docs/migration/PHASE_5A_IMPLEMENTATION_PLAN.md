# PHASE 5A — Implementation Plan: Supabase Foundation & Storefront Data Integration

**Project:** MD Shakib Islamic Books  
**Phase:** 5A — Supabase Foundation & Read-Only Storefront Integration  
**Framework:** Next.js App Router (16.4.3), React 19, TypeScript 5.9.3, Tailwind CSS v4  
**Database:** Local Supabase (PostgreSQL 17.6) / Supabase CLI  
**Audit Date:** 2026-10-29  

---

## 1. Existing Architecture & Baseline

### 1.1 Storefront & Next.js Foundation
- The Next.js 16 App Router application resides in `apps/web/`.
- Styling is powered by Tailwind CSS v4 with an Islamic emerald (`#047857`) and gold (`#C9A24A`) visual design system.
- Static and client components currently consume development fixtures from `apps/web/data/mockCatalog.ts`.
- All 21 customer-facing routes were verified in Pre-Phase 5.

### 1.2 Target Public Catalog Database Schema
The public catalog is represented in Supabase PostgreSQL by `public.books`:
- `id` (UUID, PK, default `gen_random_uuid()`)
- `title` (TEXT NOT NULL)
- `author` (TEXT NOT NULL)
- `description` (TEXT NOT NULL DEFAULT '')
- `price` (NUMERIC(10,2) NOT NULL)
- `stock` (INTEGER NOT NULL DEFAULT 0)
- `discount` (INTEGER NOT NULL DEFAULT 0)
- `category` (TEXT NOT NULL, CHECK: `'Quran', 'Hadith', 'Fiqh', 'History', 'Biography', 'Other'`)
- `language` (TEXT DEFAULT NULL)
- `pages` (INTEGER DEFAULT NULL)
- `publisher` (TEXT DEFAULT NULL)
- `published_date` (DATE DEFAULT NULL)
- `image_url` (TEXT NOT NULL)
- `images` (TEXT[] NOT NULL DEFAULT '{}')
- `cover_image` (TEXT NOT NULL DEFAULT '')
- `is_active` (BOOLEAN NOT NULL DEFAULT TRUE)
- `created_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())
- `updated_at` (TIMESTAMPTZ NOT NULL DEFAULT NOW())

Indexes:
- `idx_books_category` on `category`
- `idx_books_price` on `price`
- `idx_books_is_active` on `is_active`
- `idx_books_search` USING GIN (`to_tsvector('english', title || ' ' || author)`)

Row Level Security (RLS):
- `books_select_public` policy allows `SELECT TO public USING (is_active = TRUE OR is_admin())`.
- Anonymous and public requests can only read active books.
- All non-active books, customer tables, carts, orders, and payments are blocked by RLS.

---

## 2. Identified Catalog Routes & Components

| Route / Component | Current Data Source | Target Data Source in Phase 5A |
|---|---|---|
| `app/page.tsx` (Homepage) | Hardcoded `SAMPLE_BOOKS` array | Server-side / Supabase `getFeaturedBooks()` |
| `app/books/page.tsx` (Catalogue) | `MOCK_BOOKS` filtered in React `useMemo` | Supabase `getBooks({ category, search, minPrice, maxPrice, sort, page, limit })` |
| `app/books/[id]/page.tsx` (Book Details) | `MOCK_BOOKS.find(b => b.id === id)` | Supabase `getBookById(id)` with `notFound()` on null |
| `components/commerce/BookCard.tsx` | `BookItem` interface | Maps cleanly from Supabase `books` row |
| `components/commerce/ProductGrid.tsx` | Array of `BookItem` | Directly consumes Supabase book data |

---

## 3. Scope of Changes in Phase 5A

1. **Environment Configuration:**
   - Configure `.env.local` for `apps/web` with local Supabase public credentials:
     - `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY=...`
   - Update `.env.example` in repo root with placeholder documentation.
   - Zero exposure of service role keys or private credentials.

2. **Supabase Client Factories:**
   - Create `apps/web/lib/supabase/client.ts` using `@supabase/ssr` `createBrowserClient` with `Database` types.
   - Create `apps/web/lib/supabase/server.ts` using `@supabase/ssr` `createServerClient` reading `next/headers` cookies with `Database` types.

3. **Type-Safe Catalog Data Access Layer:**
   - Create `apps/web/lib/data/catalog.ts`:
     - `getBooks({ search, category, minPrice, maxPrice, sort, page, pageSize })`
     - `getBookById(id: string)`
     - `getFeaturedBooks(limit?: number)`
     - `getCategories()`
   - Strict input validation, parameterized query building, sanitized ILIKE escaping, pagination safety.

4. **Storefront Route Integration:**
   - Update `app/page.tsx` to fetch featured active books from Supabase.
   - Update `app/books/page.tsx` to perform real server/client data fetching, pagination, category filtering, and search.
   - Update `app/books/[id]/page.tsx` to fetch book details by UUID from Supabase, invoking Next.js `notFound()` on missing items.

5. **Visual Parity & State Handling:**
   - Preserve all existing emerald/gold color tokens, typography, grid layouts, responsive breakpoints (375px, 768px, 1024px, 1440px).
   - Provide clean loading skeletons, empty search states, and error alerts.

6. **Safety Rules:**
   - No modifications to legacy `client/` or `server/`.
   - No Phase 5B (auth), 5C (cart/checkout), or 5D (external APIs).
   - Mock data remains preserved in `mockCatalog.ts` for untouched mock routes (e.g. mock orders).

---

## 4. Planned Validation & Verification Commands

1. `apps/web`: `npm run typecheck`
2. `apps/web`: `npm run lint`
3. `apps/web`: `npm run build`
4. Storefront integration testing against live local Supabase stack (`http://127.0.0.1:54321`)
5. RLS security verification (negative tests for inactive books, customer tables)
6. Legacy verification: `cd client && npm run build` & `node -c server/app.js`
7. `git diff --check` and `git status --short`

