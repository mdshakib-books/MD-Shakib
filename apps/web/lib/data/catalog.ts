import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import { isMockCatalogAllowed } from "@/lib/env/server";
import { MOCK_BOOKS } from "@/data/mockCatalog";
import { CATALOG_CACHE_TAGS, withSafePublicCatalogCache } from "@/lib/cache/catalog";
import type { Database } from "@/types/database.types";
import type { BookItem } from "@/components/commerce/BookCard";

export type BookRow = Database["public"]["Tables"]["books"]["Row"];

const PUBLIC_BOOK_SELECT_COLUMNS =
  "id, title, author, price, discount, stock, category, image_url, cover_image, images, description, publisher, published_date, pages, language, is_active, created_at";

export interface CatalogBook extends BookItem {
  description: string;
  publisher?: string | null;
  publishedDate?: string | null;
  pages?: number | null;
  language?: string | null;
  images?: string[];
  coverImage?: string;
  isActive: boolean;
  createdAt: string;
}

export interface CatalogQueryParams {
  search?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  sort?: "newest" | "price_asc" | "price_desc" | "title_asc";
  page?: number;
  pageSize?: number;
}

export interface PaginatedCatalogResult {
  books: CatalogBook[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/**
 * Safely transforms a PostgreSQL `books` table row into the application's domain model.
 */
export function mapBookRowToCatalogBook(
  row: Pick<
    BookRow,
    | "id"
    | "title"
    | "author"
    | "price"
    | "discount"
    | "stock"
    | "category"
    | "image_url"
    | "description"
    | "publisher"
    | "published_date"
    | "pages"
    | "language"
    | "images"
    | "cover_image"
    | "is_active"
    | "created_at"
  >
): CatalogBook {
  return {
    id: row.id,
    title: row.title,
    author: row.author,
    price: Number(row.price),
    discount: row.discount || 0,
    stock: row.stock,
    category: row.category,
    imageUrl: row.image_url || "",
    description: row.description || "",
    publisher: row.publisher,
    publishedDate: row.published_date,
    pages: row.pages,
    language: row.language,
    images: row.images && row.images.length > 0 ? row.images : (row.image_url ? [row.image_url] : []),
    coverImage: row.cover_image,
    isActive: row.is_active,
    createdAt: row.created_at,
  };
}

/**
 * Escapes characters with special meaning in PostgreSQL LIKE / ILIKE patterns (% and _)
 * AND strips PostgREST `.or(...)` filter structural delimiters (commas and parentheses)
 * to prevent filter syntax injection.
 */
function sanitizeSearchPattern(pattern: string): string {
  return pattern
    .replace(/[,()]/g, " ")
    .replace(/[%_\\]/g, "\\$&")
    .trim()
    .slice(0, 100);
}

/**
 * Fetches published active books with filtering, search, sorting, and pagination.
 */
export async function getBooks(params: CatalogQueryParams = {}): Promise<PaginatedCatalogResult> {
  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 8));
  const offset = (page - 1) * pageSize;

  const cleanCategory = params.category?.trim() || "";
  const cleanSearch = params.search?.trim() ? sanitizeSearchPattern(params.search) : "";
  const minPriceVal =
    params.minPrice !== undefined && !Number.isNaN(params.minPrice) ? Number(params.minPrice) : null;
  const maxPriceVal =
    params.maxPrice !== undefined && !Number.isNaN(params.maxPrice) ? Number(params.maxPrice) : null;
  const sortMode = params.sort || "newest";

  const cacheKey = [
    "catalog:getBooks",
    cleanCategory,
    cleanSearch,
    String(minPriceVal ?? ""),
    String(maxPriceVal ?? ""),
    sortMode,
    String(page),
    String(pageSize),
  ];

  try {
    return await withSafePublicCatalogCache(
      cacheKey,
      [CATALOG_CACHE_TAGS.books],
      60,
      async () => {
        const supabase = createPublicClient();

        let query = supabase
          .from("books")
          .select(PUBLIC_BOOK_SELECT_COLUMNS, { count: "exact" })
          .eq("is_active", true);

        if (cleanCategory) {
          query = query.eq("category", cleanCategory);
        }

        if (minPriceVal !== null) {
          query = query.gte("price", minPriceVal);
        }
        if (maxPriceVal !== null) {
          query = query.lte("price", maxPriceVal);
        }

        if (cleanSearch) {
          query = query.or(`title.ilike.%${cleanSearch}%,author.ilike.%${cleanSearch}%`);
        }

        switch (sortMode) {
          case "price_asc":
            query = query.order("price", { ascending: true }).order("id", { ascending: true });
            break;
          case "price_desc":
            query = query.order("price", { ascending: false }).order("id", { ascending: true });
            break;
          case "title_asc":
            query = query.order("title", { ascending: true }).order("id", { ascending: true });
            break;
          case "newest":
          default:
            query = query.order("created_at", { ascending: false }).order("id", { ascending: true });
            break;
        }

        query = query.range(offset, offset + pageSize - 1);

        const { data, count, error } = await query;

        if (error) {
          throw new Error(error.message);
        }

        const books = (data || []).map(mapBookRowToCatalogBook);
        const totalCount = count ?? books.length;
        const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

        return {
          books,
          totalCount,
          page,
          pageSize,
          totalPages,
        };
      }
    );
  } catch (err) {
    if (!isMockCatalogAllowed()) {
      console.error("Failed to query books table from Supabase:", err);
      throw err instanceof Error ? err : new Error("Failed to query book catalog.");
    }
    console.warn("[MOCK][Catalog] Could not query books table; falling back to dev/test mock fixtures:", err);
  }

  // Graceful fallback to verified authentic fixtures if database table is unavailable
  let filtered = MOCK_BOOKS.map((b) => ({
    ...b,
    description: b.description || "",
    isActive: true,
    createdAt: new Date().toISOString(),
  }));

  if (params.category && params.category.trim() !== "") {
    filtered = filtered.filter((b) => b.category === params.category?.trim());
  }

  if (params.search && params.search.trim() !== "") {
    const term = params.search.trim().toLowerCase();
    filtered = filtered.filter(
      (b) =>
        b.title.toLowerCase().includes(term) ||
        (b.author && b.author.toLowerCase().includes(term))
    );
  }

  if (params.minPrice !== undefined && !Number.isNaN(params.minPrice)) {
    filtered = filtered.filter((b) => b.price >= params.minPrice!);
  }
  if (params.maxPrice !== undefined && !Number.isNaN(params.maxPrice)) {
    filtered = filtered.filter((b) => b.price <= params.maxPrice!);
  }

  // Sorting
  switch (params.sort) {
    case "price_asc":
      filtered.sort((a, b) => a.price - b.price);
      break;
    case "price_desc":
      filtered.sort((a, b) => b.price - a.price);
      break;
    case "title_asc":
      filtered.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "newest":
    default:
      break;
  }

  const totalCount = filtered.length;
  const paginated = filtered.slice(offset, offset + pageSize);
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    books: paginated,
    totalCount,
    page,
    pageSize,
    totalPages,
  };
}

/**
 * Fetches a single published active book by its primary UUID (request-memoized + tag-cached).
 */
export const getBookById = cache(async function getBookById(id: string): Promise<CatalogBook | null> {
  // Validate UUID structure to avoid database errors
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    return null;
  }

  try {
    return await withSafePublicCatalogCache(
      ["catalog:getBookById", id],
      [CATALOG_CACHE_TAGS.books, CATALOG_CACHE_TAGS.book(id)],
      60,
      async () => {
        const supabase = createPublicClient();
        const { data, error } = await supabase
          .from("books")
          .select(PUBLIC_BOOK_SELECT_COLUMNS)
          .eq("id", id)
          .eq("is_active", true)
          .maybeSingle();

        if (error) {
          throw new Error(error.message);
        }

        if (data) {
          return mapBookRowToCatalogBook(data);
        }
        return null;
      }
    );
  } catch (err) {
    if (!isMockCatalogAllowed()) {
      console.error(`Failed to query book ${id} from database:`, err);
      throw err instanceof Error ? err : new Error("Failed to load book details.");
    }
    console.warn(`[MOCK][Catalog] Could not query book ${id} from database; checking dev/test fixtures:`, err);
  }

  const mock = MOCK_BOOKS.find((b) => b.id === id);
  if (mock) {
    return {
      ...mock,
      description: mock.description || "",
      isActive: true,
      createdAt: new Date().toISOString(),
    };
  }

  return null;
});

/**
 * Fetches featured books for storefront presentation.
 */
export async function getFeaturedBooks(limit: number = 4): Promise<CatalogBook[]> {
  const safeLimit = Math.min(24, Math.max(1, Number(limit) || 4));
  try {
    return await withSafePublicCatalogCache(
      ["catalog:getFeaturedBooks", String(safeLimit)],
      [CATALOG_CACHE_TAGS.featured, CATALOG_CACHE_TAGS.books],
      60,
      async () => {
        const supabase = createPublicClient();
        const { data, error } = await supabase
          .from("books")
          .select(PUBLIC_BOOK_SELECT_COLUMNS)
          .eq("is_active", true)
          .order("created_at", { ascending: false })
          .limit(safeLimit);

        if (error) {
          throw new Error(error.message);
        }

        return (data || []).map(mapBookRowToCatalogBook);
      }
    );
  } catch (err) {
    if (!isMockCatalogAllowed()) {
      console.error("Failed to query featured books from database:", err);
      throw err instanceof Error ? err : new Error("Failed to load featured books.");
    }
    console.warn("[MOCK][Catalog] Could not query featured books from database; using dev/test fixtures:", err);
  }

  return MOCK_BOOKS.slice(0, safeLimit).map((mock) => ({
    ...mock,
    description: mock.description || "",
    isActive: true,
    createdAt: new Date().toISOString(),
  }));
}

/**
 * Returns the list of standard supported Islamic book categories.
 */
export const CATALOG_CATEGORIES = [
  "Quran",
  "Hadith",
  "Fiqh",
  "History",
  "Biography",
  "Other",
] as const;
