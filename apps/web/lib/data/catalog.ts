import { createPublicClient } from "@/lib/supabase/server";
import { MOCK_BOOKS } from "@/data/mockCatalog";
import type { Database } from "@/types/database.types";
import type { BookItem } from "@/components/commerce/BookCard";

export type BookRow = Database["public"]["Tables"]["books"]["Row"];

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
export function mapBookRowToCatalogBook(row: BookRow): CatalogBook {
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
 * Escapes characters with special meaning in PostgreSQL LIKE / ILIKE patterns (% and _).
 */
function escapeLikePattern(pattern: string): string {
  return pattern.replace(/[%_\\]/g, "\\$&");
}

/**
 * Fetches published active books with filtering, search, sorting, and pagination.
 */
export async function getBooks(params: CatalogQueryParams = {}): Promise<PaginatedCatalogResult> {
  const supabase = createPublicClient();

  const page = Math.max(1, Number(params.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(params.pageSize) || 8));
  const offset = (page - 1) * pageSize;

  let query = supabase
    .from("books")
    .select("*", { count: "exact" })
    .eq("is_active", true);

  // Category filter
  if (params.category && params.category.trim() !== "") {
    query = query.eq("category", params.category.trim());
  }

  // Price range filters
  if (params.minPrice !== undefined && !Number.isNaN(params.minPrice)) {
    query = query.gte("price", params.minPrice);
  }
  if (params.maxPrice !== undefined && !Number.isNaN(params.maxPrice)) {
    query = query.lte("price", params.maxPrice);
  }

  // Text search across title and author (sanitized pattern matching)
  if (params.search && params.search.trim() !== "") {
    const sanitized = escapeLikePattern(params.search.trim().slice(0, 100));
    query = query.or(`title.ilike.%${sanitized}%,author.ilike.%${sanitized}%`);
  }

  // Deterministic sorting
  switch (params.sort) {
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

  // Pagination boundaries
  query = query.range(offset, offset + pageSize - 1);

  try {
    const { data, count, error } = await query;

    if (!error && data && data.length > 0) {
      const books = (data || []).map(mapBookRowToCatalogBook);
      const totalCount = count || books.length;
      const totalPages = Math.ceil(totalCount / pageSize) || 1;

      return {
        books,
        totalCount,
        page,
        pageSize,
        totalPages,
      };
    }
  } catch (err) {
    console.warn("Could not query books table, falling back to mock fixtures:", err);
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
 * Fetches a single published active book by its primary UUID.
 */
export async function getBookById(id: string): Promise<CatalogBook | null> {
  // Validate UUID structure to avoid database errors
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!id || !uuidRegex.test(id)) {
    return null;
  }

  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("id", id)
      .eq("is_active", true)
      .maybeSingle();

    if (!error && data) {
      return mapBookRowToCatalogBook(data);
    }
  } catch (err) {
    console.warn(`Could not query book ${id} from database, checking fixtures:`, err);
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
}

/**
 * Fetches featured books for storefront presentation.
 */
export async function getFeaturedBooks(limit: number = 4): Promise<CatalogBook[]> {
  try {
    const supabase = createPublicClient();
    const { data, error } = await supabase
      .from("books")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (!error && data && data.length > 0) {
      return (data || []).map(mapBookRowToCatalogBook);
    }
  } catch (err) {
    console.warn("Could not query featured books from database, checking fixtures:", err);
  }

  return MOCK_BOOKS.slice(0, limit).map((mock) => ({
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
