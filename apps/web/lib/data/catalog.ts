import { createPublicClient } from "@/lib/supabase/server";
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

  const { data, count, error } = await query;

  if (error) {
    console.error("Database query error in getBooks:", error.message);
    throw new Error("Unable to retrieve catalog data from database.");
  }

  const books = (data || []).map(mapBookRowToCatalogBook);
  const totalCount = count || 0;
  const totalPages = Math.ceil(totalCount / pageSize) || 1;

  return {
    books,
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

  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    console.error(`Database query error in getBookById for ${id}:`, error.message);
    throw new Error("Unable to retrieve book details from database.");
  }

  if (!data) {
    return null;
  }

  return mapBookRowToCatalogBook(data);
}

/**
 * Fetches featured books for storefront presentation.
 */
export async function getFeaturedBooks(limit: number = 4): Promise<CatalogBook[]> {
  const supabase = createPublicClient();

  const { data, error } = await supabase
    .from("books")
    .select("*")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.error("Database query error in getFeaturedBooks:", error.message);
    throw new Error("Unable to retrieve featured collection from database.");
  }

  return (data || []).map(mapBookRowToCatalogBook);
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
