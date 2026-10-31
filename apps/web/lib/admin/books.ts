"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { recordAdminAuditLog } from "./audit";
import type { Database } from "@/types/database.types";

export type BookRow = Database["public"]["Tables"]["books"]["Row"];

export interface BookInput {
  title: string;
  author: string;
  description?: string;
  price: number;
  stock: number;
  discount?: number;
  category: string;
  language?: string | null;
  pages?: number | null;
  publisher?: string | null;
  published_date?: string | null;
  image_url: string;
  cover_image?: string;
  images?: string[];
  is_active?: boolean;
}

/**
 * Retrieves paginated books for admin management with filters.
 */
export async function getAdminBooks(params?: {
  search?: string;
  category?: string;
  status?: "all" | "active" | "inactive";
  lowStock?: boolean;
  page?: number;
  limit?: number;
}): Promise<{
  books: BookRow[];
  total: number;
  page: number;
  totalPages: number;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 20));
  const offset = (page - 1) * limit;

  let query = supabase.from("books").select("*", { count: "exact" });

  if (params?.search?.trim()) {
    const term = params.search.trim();
    query = query.or(`title.ilike.%${term}%,author.ilike.%${term}%`);
  }

  if (params?.category && params.category !== "ALL") {
    query = query.eq("category", params.category);
  }

  if (params?.status === "active") {
    query = query.eq("is_active", true);
  } else if (params?.status === "inactive") {
    query = query.eq("is_active", false);
  }

  if (params?.lowStock) {
    query = query.lte("stock", 5);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data: books, error, count } = await query;

  if (error) {
    console.error("Error fetching admin books:", error.message);
    throw new Error(`Failed to load books: ${error.message}`);
  }

  const total = count || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    books: books || [],
    total,
    page,
    totalPages,
  };
}

/**
 * Retrieves a single book by ID for admin edit form.
 */
export async function getAdminBookById(id: string): Promise<BookRow | null> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: book, error } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !book) {
    return null;
  }

  return book;
}

/**
 * Creates a new book in the catalog.
 */
export async function createAdminBook(input: BookInput): Promise<{
  success: boolean;
  book?: BookRow;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const trimmedTitle = input.title?.trim();
  const trimmedAuthor = input.author?.trim();

  if (!trimmedTitle) {
    return { success: false, error: "Book title is required." };
  }
  if (!trimmedAuthor) {
    return { success: false, error: "Author name is required." };
  }
  if (typeof input.price !== "number" || input.price < 0 || isNaN(input.price)) {
    return { success: false, error: "Price must be a non-negative number." };
  }
  if (typeof input.stock !== "number" || input.stock < 0 || isNaN(input.stock)) {
    return { success: false, error: "Stock must be a non-negative integer." };
  }
  if (!input.category) {
    return { success: false, error: "Category is required." };
  }

  const primaryImage = input.image_url?.trim() || input.cover_image?.trim();
  if (!primaryImage) {
    return { success: false, error: "A primary book cover image URL is required." };
  }

  const insertPayload = {
    title: trimmedTitle,
    author: trimmedAuthor,
    description: input.description?.trim() || "",
    price: Number(input.price),
    stock: Math.floor(input.stock),
    discount: input.discount ? Math.min(100, Math.max(0, Math.floor(input.discount))) : 0,
    category: input.category,
    language: input.language?.trim() || null,
    pages: input.pages ? Math.max(1, Math.floor(input.pages)) : null,
    publisher: input.publisher?.trim() || null,
    published_date: input.published_date || null,
    image_url: primaryImage,
    cover_image: primaryImage,
    images: input.images && Array.isArray(input.images) ? input.images.filter(Boolean) : [primaryImage],
    is_active: input.is_active ?? true,
  };

  const { data: newBook, error } = await supabase
    .from("books")
    .insert(insertPayload)
    .select()
    .single();

  if (error || !newBook) {
    return {
      success: false,
      error: error?.message || "Failed to create book.",
    };
  }

  await recordAdminAuditLog({
    action: "CREATE",
    modelName: "books",
    modelId: newBook.id,
    newValues: newBook,
    changes: { title: trimmedTitle, price: insertPayload.price, stock: insertPayload.stock },
  });

  revalidatePath("/admin/books");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/catalog");

  return { success: true, book: newBook };
}

/**
 * Updates an existing book.
 */
export async function updateAdminBook(
  id: string,
  input: Partial<BookInput>
): Promise<{
  success: boolean;
  book?: BookRow;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return { success: false, error: "Book not found." };
  }

  const updateData: Database["public"]["Tables"]["books"]["Update"] = {};

  if (input.title !== undefined) {
    const trimmed = input.title.trim();
    if (!trimmed) return { success: false, error: "Title cannot be empty." };
    updateData.title = trimmed;
  }

  if (input.author !== undefined) {
    const trimmed = input.author.trim();
    if (!trimmed) return { success: false, error: "Author cannot be empty." };
    updateData.author = trimmed;
  }

  if (input.description !== undefined) {
    updateData.description = input.description.trim();
  }

  if (input.price !== undefined) {
    if (typeof input.price !== "number" || input.price < 0 || isNaN(input.price)) {
      return { success: false, error: "Price must be non-negative." };
    }
    updateData.price = Number(input.price);
  }

  if (input.stock !== undefined) {
    if (typeof input.stock !== "number" || input.stock < 0 || isNaN(input.stock)) {
      return { success: false, error: "Stock must be non-negative." };
    }
    updateData.stock = Math.floor(input.stock);
  }

  if (input.discount !== undefined) {
    updateData.discount = Math.min(100, Math.max(0, Math.floor(Number(input.discount) || 0)));
  }

  if (input.category !== undefined) {
    if (!input.category.trim()) return { success: false, error: "Category cannot be empty." };
    updateData.category = input.category.trim();
  }

  if (input.language !== undefined) {
    updateData.language = input.language ? input.language.trim() : null;
  }

  if (input.pages !== undefined) {
    updateData.pages = input.pages ? Math.max(1, Math.floor(Number(input.pages))) : null;
  }

  if (input.publisher !== undefined) {
    updateData.publisher = input.publisher ? input.publisher.trim() : null;
  }

  if (input.published_date !== undefined) {
    updateData.published_date = input.published_date || null;
  }

  if (input.image_url !== undefined || input.cover_image !== undefined) {
    const primaryImg = (input.image_url || input.cover_image || "").trim();
    if (primaryImg) {
      updateData.image_url = primaryImg;
      updateData.cover_image = primaryImg;
    }
  }

  if (input.images !== undefined) {
    updateData.images = Array.isArray(input.images) ? input.images.filter(Boolean) : [];
  }

  if (input.is_active !== undefined) {
    updateData.is_active = Boolean(input.is_active);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("books")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (updateErr || !updated) {
    return {
      success: false,
      error: updateErr?.message || "Failed to update book.",
    };
  }

  await recordAdminAuditLog({
    action: "UPDATE",
    modelName: "books",
    modelId: id,
    oldValues: existing,
    newValues: updated,
    changes: updateData,
  });

  revalidatePath("/admin/books");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/catalog");
  revalidatePath(`/books/${id}`);

  return { success: true, book: updated };
}

/**
 * Safely deletes or archives a book.
 * If the book exists in historical customer orders, it is deactivated and archived to preserve transaction integrity.
 */
export async function deleteAdminBook(id: string): Promise<{
  success: boolean;
  archived?: boolean;
  message?: string;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: book, error: fetchErr } = await supabase
    .from("books")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !book) {
    return { success: false, error: "Book not found." };
  }

  // Check if book has ever been ordered
  const { data: orderItem } = await supabase
    .from("order_items")
    .select("id")
    .eq("book_id", id)
    .limit(1)
    .maybeSingle();

  if (orderItem) {
    // Preserve database referential integrity by archiving
    const { error: archiveErr } = await supabase
      .from("books")
      .update({ is_active: false, stock: 0 })
      .eq("id", id);

    if (archiveErr) {
      return { success: false, error: `Failed to archive book: ${archiveErr.message}` };
    }

    await recordAdminAuditLog({
      action: "SOFT_DELETE",
      modelName: "books",
      modelId: id,
      oldValues: book,
      changes: { archived: true, reason: "Referenced by existing customer orders" },
    });

    revalidatePath("/admin/books");
    revalidatePath("/admin/inventory");
    revalidatePath("/catalog");
    revalidatePath(`/books/${id}`);

    return {
      success: true,
      archived: true,
      message: `"${book.title}" is referenced by existing customer orders. It has been deactivated and archived from the public catalog.`,
    };
  }

  // If no order references exist, delete permanently
  const { error: delErr } = await supabase.from("books").delete().eq("id", id);

  if (delErr) {
    return { success: false, error: `Failed to delete book: ${delErr.message}` };
  }

  await recordAdminAuditLog({
    action: "DELETE",
    modelName: "books",
    modelId: id,
    oldValues: book,
    changes: { deleted: true },
  });

  revalidatePath("/admin/books");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
  revalidatePath("/catalog");

  return {
    success: true,
    archived: false,
    message: `"${book.title}" was permanently removed from the catalog.`,
  };
}

/**
 * Toggles a book's active publication status in the storefront.
 */
export async function toggleBookStatus(
  id: string,
  isActive: boolean
): Promise<{ success: boolean; error?: string }> {
  await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("books")
    .update({ is_active: isActive })
    .eq("id", id);

  if (error) {
    return { success: false, error: error.message };
  }

  await recordAdminAuditLog({
    action: "UPDATE",
    modelName: "books",
    modelId: id,
    changes: { is_active: isActive },
  });

  revalidatePath("/admin/books");
  revalidatePath("/catalog");
  revalidatePath(`/books/${id}`);

  return { success: true };
}
