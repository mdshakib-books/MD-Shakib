import { MetadataRoute } from "next";
import { getCanonicalSiteUrl } from "@/lib/auth/session";
import { createPublicClient } from "@/lib/supabase/server";
import { MOCK_BOOKS } from "@/data/mockCatalog";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = getCanonicalSiteUrl();
  const currentDate = new Date();

  // Core public static routes
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: `${baseUrl}`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 1.0,
    },
    {
      url: `${baseUrl}/books`,
      lastModified: currentDate,
      changeFrequency: "daily",
      priority: 0.9,
    },
    {
      url: `${baseUrl}/about`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      lastModified: currentDate,
      changeFrequency: "monthly",
      priority: 0.7,
    },
    {
      url: `${baseUrl}/terms`,
      lastModified: currentDate,
      changeFrequency: "yearly",
      priority: 0.5,
    },
    {
      url: `${baseUrl}/privacy-policy`,
      lastModified: currentDate,
      changeFrequency: "yearly",
      priority: 0.5,
    },
  ];

  // Dynamic active book routes
  let bookRoutes: MetadataRoute.Sitemap = [];
  try {
    const supabase = createPublicClient();
    const { data: books, error } = await supabase
      .from("books")
      .select("id, updated_at, created_at")
      .eq("is_active", true)
      .limit(500);

    if (!error && books && books.length > 0) {
      bookRoutes = books.map((b) => ({
        url: `${baseUrl}/books/${b.id}`,
        lastModified: b.updated_at ? new Date(b.updated_at) : new Date(b.created_at),
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    } else {
      // Fallback to active mock catalogue books when database is unreachable
      bookRoutes = MOCK_BOOKS.map((b) => ({
        url: `${baseUrl}/books/${b.id}`,
        lastModified: currentDate,
        changeFrequency: "weekly" as const,
        priority: 0.8,
      }));
    }
  } catch {
    bookRoutes = MOCK_BOOKS.map((b) => ({
      url: `${baseUrl}/books/${b.id}`,
      lastModified: currentDate,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    }));
  }

  return [...staticRoutes, ...bookRoutes];
}
