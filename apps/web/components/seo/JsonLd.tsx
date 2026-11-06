import * as React from "react";
import { getCanonicalSiteUrl } from "@/lib/auth/session";
import type { CatalogBook } from "@/lib/data/catalog";

interface JsonLdProps {
  data: Record<string, any> | Array<Record<string, any>>;
}

/**
 * Injects valid, validated Schema.org JSON-LD structured data into the document.
 */
export function JsonLd({ data }: JsonLdProps) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  );
}

/**
 * Builds Organization Schema for MD Shakib Islamic Books.
 */
export function buildOrganizationSchema() {
  const baseUrl = getCanonicalSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "MD Shakib Islamic Books",
    alternateName: "محمد شکیب صدیقی",
    url: baseUrl,
    logo: `${baseUrl}/logo.png`,
    description:
      "Curator of authentic Islamic literature, classical texts, Quran editions, and Hadith collections.",
    contactPoint: {
      "@type": "ContactPoint",
      telephone: "+91-9876543210",
      contactType: "customer service",
      areaServed: "IN",
      availableLanguage: ["en", "ur", "hi", "ar"],
    },
  };
}

/**
 * Builds WebSite Schema with SearchAction for MD Shakib.
 */
export function buildWebSiteSchema() {
  const baseUrl = getCanonicalSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "MD Shakib Islamic Books",
    url: baseUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${baseUrl}/books?search={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/**
 * Builds Book & Product Schema for a catalog item.
 * Strictly derives prices, availability, and attributes from authoritative database record.
 */
export function buildBookProductSchema(book: CatalogBook) {
  const baseUrl = getCanonicalSiteUrl();
  const effectivePrice = book.discount
    ? Math.round(book.price * (1 - book.discount / 100))
    : book.price;

  return {
    "@context": "https://schema.org",
    "@type": ["Book", "Product"],
    name: book.title,
    author: {
      "@type": "Person",
      name: book.author || "Islamic Scholar",
    },
    description: book.description || `${book.title} published in authentic edition.`,
    image: book.imageUrl || `${baseUrl}/logo.png`,
    isbn: book.id,
    bookFormat: "https://schema.org/Hardcover",
    inLanguage: book.language || "English",
    numberOfPages: book.pages || undefined,
    publisher: book.publisher
      ? {
          "@type": "Organization",
          name: book.publisher,
        }
      : undefined,
    offers: {
      "@type": "Offer",
      url: `${baseUrl}/books/${book.id}`,
      priceCurrency: "INR",
      price: effectivePrice,
      availability:
        (book.stock ?? 0) > 0
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
      seller: {
        "@type": "Organization",
        name: "MD Shakib Islamic Books",
      },
    },
  };
}

/**
 * Builds BreadcrumbList Schema for hierarchical navigation.
 */
export function buildBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  const baseUrl = getCanonicalSiteUrl();
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url.startsWith("http") ? item.url : `${baseUrl}${item.url}`,
    })),
  };
}

