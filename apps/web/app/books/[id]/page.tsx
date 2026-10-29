import * as React from "react";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { getBookById, getBooks, type CatalogBook } from "@/lib/data/catalog";
import { BookDetailClient } from "./BookDetailClient";

interface BookDetailPageProps {
  params: Promise<{ id: string }>;
}

export const dynamic = "force-dynamic";

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

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0B0B] text-[#F5F5F5]">
      <Navbar />
      <main className="flex-grow">
        <BookDetailClient book={book} similarBooks={similarBooks} />
      </main>
      <Footer />
    </div>
  );
}
