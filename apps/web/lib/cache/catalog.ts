import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";

export const CATALOG_CACHE_TAGS = {
  books: "catalog:books",
  featured: "catalog:featured",
  categories: "catalog:categories",
  book: (bookId: string) => `catalog:book:${bookId}`,
} as const;

/**
 * Wraps public read-only catalog queries in Next.js `unstable_cache` when running inside
 * a Next.js runtime, gracefully falling back to direct execution in standalone CLI/test runners
 * where Next's incrementalCache store is unavailable.
 *
 * SECURITY: Never use this helper for private customer, financial, order, or admin data.
 */
export async function withSafePublicCatalogCache<T>(
  keyParts: string[],
  tags: string[],
  revalidateSeconds: number,
  loader: () => Promise<T>
): Promise<T> {
  if (!process.env.NEXT_RUNTIME) {
    return loader();
  }

  try {
    const cachedFn = unstable_cache(loader, keyParts, {
      revalidate: revalidateSeconds,
      tags,
    });
    return await cachedFn();
  } catch (err: any) {
    const msg = String(err?.message || "");
    if (
      msg.includes("incrementalCache") ||
      msg.includes("staticGenerationAsyncStorage") ||
      msg.includes("Invariant")
    ) {
      return loader();
    }
    throw err;
  }
}

/**
 * Invalidates public catalog cache tags and storefront routes after catalog/inventory mutations.
 */
export function invalidateCatalogCache(bookId?: string): void {
  try {
    revalidateTag(CATALOG_CACHE_TAGS.books, "max");
    revalidateTag(CATALOG_CACHE_TAGS.featured, "max");
    revalidateTag(CATALOG_CACHE_TAGS.categories, "max");
    if (bookId) {
      revalidateTag(CATALOG_CACHE_TAGS.book(bookId), "max");
    }
  } catch {
    // Safe no-op outside Next.js server request context
  }

  try {
    revalidatePath("/");
    revalidatePath("/books");
    revalidatePath("/catalog");
    if (bookId) {
      revalidatePath(`/books/${bookId}`);
    }
  } catch {
    // Safe no-op outside Next.js server request context
  }
}
