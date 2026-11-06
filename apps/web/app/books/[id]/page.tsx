import * as React from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getBookById, getBooks, type CatalogBook } from "@/lib/data/catalog";
import { JsonLd, buildBookProductSchema, buildBreadcrumbSchema } from "@/components/seo/JsonLd";
import { BookDetailClient } from "./BookDetailClient";

interface BookDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: BookDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  const book = await getBookById(id).catch(() => null);

  if (!book) {
    return {
      title: "Book Not Found | MD Shakib",
      description: "The requested Islamic book could not be found.",
    };
  }

  const title = `${book.title} | MD Shakib Islamic Books`;
  const description =
    book.description?.slice(0, 160) ||
    `Order ${book.title} by ${book.author || "Islamic Scholar"}. Authentic edition with express delivery across India.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/books/${book.id}`,
    },
    openGraph: {
      title,
      description,
      url: `/books/${book.id}`,
      type: "article",
      images: book.imageUrl ? [{ url: book.imageUrl }] : undefined,
    },
  };
}

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const { id } = await params;

  let book = null;
  try {
    book = await getBookById(id);
  } catch (err) {
    console.error(`Error loading book ${id} from Supabase:`, err);
  }

  if (!book) {
    notFound();
  }

  // Fetch similar books from the same category
  let similarBooks: CatalogBook[] = [];
  try {
    const similarRes = await getBooks({
      category: book.category,
      pageSize: 4,
    });
    similarBooks = similarRes.books.filter((b) => b.id !== book.id).slice(0, 4);
  } catch (err) {
    console.warn("Could not fetch similar books:", err);
  }

  const bookSchema = buildBookProductSchema(book);
  const breadcrumbSchema = buildBreadcrumbSchema([
    { name: "Home", url: "/" },
    { name: "Books", url: "/books" },
    { name: book.title, url: `/books/${book.id}` },
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
      <JsonLd data={[bookSchema, breadcrumbSchema]} />
      <Navbar />
      <main id="main-content" className="flex-grow">
        <BookDetailClient book={book} similarBooks={similarBooks} />
      </main>
      <Footer />
    </div>
  );
}
