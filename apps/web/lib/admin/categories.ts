"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import { recordAdminAuditLog } from "./audit";
import type { Database } from "@/types/database.types";

export type CategoryRow = Database["public"]["Tables"]["categories"]["Row"];

export interface CategoryInput {
  name: string;
  slug: string;
  description?: string;
  image_url?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export interface EnrichedCategory extends CategoryRow {
  bookCount: number;
}

/**
 * Lists all categories with associated book counts for administrative management.
 */
export async function getAdminCategories(): Promise<EnrichedCategory[]> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: categories, error } = await supabase
    .from("categories")
    .select("*")
    .order("display_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    console.error("Error fetching categories:", error.message);
    throw new Error(`Failed to load categories: ${error.message}`);
  }

  // Fetch count of books per category name
  const { data: books, error: booksError } = await supabase
    .from("books")
    .select("category");

  if (booksError) {
    console.error("Error fetching book counts for categories:", booksError.message);
  }

  const countMap: Record<string, number> = {};
  for (const b of books || []) {
    if (b.category) {
      countMap[b.category] = (countMap[b.category] || 0) + 1;
    }
  }

  return (categories || []).map((cat) => ({
    ...cat,
    bookCount: countMap[cat.name] || 0,
  }));
}

/**
 * Creates a new category with slug validation and audit logging.
 */
export async function createAdminCategory(input: CategoryInput): Promise<{
  success: boolean;
  category?: CategoryRow;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const trimmedName = input.name?.trim();
  const trimmedSlug = (input.slug || input.name)?.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  if (!trimmedName) {
    return { success: false, error: "Category name is required." };
  }
  if (!trimmedSlug) {
    return { success: false, error: "Category slug is required." };
  }

  const { data: newCategory, error } = await supabase
    .from("categories")
    .insert({
      name: trimmedName,
      slug: trimmedSlug,
      description: input.description?.trim() || "",
      image_url: input.image_url || null,
      display_order: input.display_order ?? 0,
      is_active: input.is_active ?? true,
    })
    .select()
    .single();

  if (error || !newCategory) {
    return {
      success: false,
      error: error?.message.includes("unique")
        ? "A category with this name or slug already exists."
        : error?.message || "Failed to create category.",
    };
  }

  await recordAdminAuditLog({
    action: "CREATE",
    modelName: "categories",
    modelId: newCategory.id,
    newValues: newCategory,
    changes: { name: trimmedName, slug: trimmedSlug },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/books");
  revalidatePath("/catalog");

  return { success: true, category: newCategory };
}

/**
 * Updates an existing category.
 */
export async function updateAdminCategory(
  id: string,
  input: Partial<CategoryInput>
): Promise<{
  success: boolean;
  category?: CategoryRow;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: existing, error: fetchErr } = await supabase
    .from("categories")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !existing) {
    return { success: false, error: "Category not found." };
  }

  const updateData: Database["public"]["Tables"]["categories"]["Update"] = {};

  if (input.name !== undefined) {
    const trimmed = input.name.trim();
    if (!trimmed) return { success: false, error: "Category name cannot be empty." };
    updateData.name = trimmed;
  }

  if (input.slug !== undefined) {
    const trimmedSlug = input.slug.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    if (!trimmedSlug) return { success: false, error: "Category slug cannot be empty." };
    updateData.slug = trimmedSlug;
  }

  if (input.description !== undefined) {
    updateData.description = input.description.trim();
  }

  if (input.image_url !== undefined) {
    updateData.image_url = input.image_url;
  }

  if (input.display_order !== undefined) {
    updateData.display_order = Number(input.display_order) || 0;
  }

  if (input.is_active !== undefined) {
    updateData.is_active = Boolean(input.is_active);
  }

  const { data: updated, error: updateErr } = await supabase
    .from("categories")
    .update(updateData)
    .eq("id", id)
    .select()
    .single();

  if (updateErr || !updated) {
    return {
      success: false,
      error: updateErr?.message.includes("unique")
        ? "Another category with this name or slug already exists."
        : updateErr?.message || "Failed to update category.",
    };
  }

  await recordAdminAuditLog({
    action: "UPDATE",
    modelName: "categories",
    modelId: id,
    oldValues: existing,
    newValues: updated,
    changes: updateData,
  });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/books");
  revalidatePath("/catalog");

  return { success: true, category: updated };
}

/**
 * Deletes a category safely. Rejects deletion if books are currently assigned.
 */
export async function deleteAdminCategory(id: string): Promise<{
  success: boolean;
  error?: string;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const { data: category, error: fetchErr } = await supabase
    .from("categories")
    .select("id, name")
    .eq("id", id)
    .single();

  if (fetchErr || !category) {
    return { success: false, error: "Category not found." };
  }

  // Safety check: verify no books are linked to this category
  const { count, error: countErr } = await supabase
    .from("books")
    .select("id", { count: "exact", head: true })
    .eq("category", category.name);

  if (countErr) {
    return { success: false, error: `Failed to verify category books: ${countErr.message}` };
  }

  if (count && count > 0) {
    return {
      success: false,
      error: `Cannot delete "${category.name}" because ${count} ${
        count === 1 ? "book is" : "books are"
      } currently assigned to it. Please reassign or archive those books first.`,
    };
  }

  const { error: delErr } = await supabase.from("categories").delete().eq("id", id);

  if (delErr) {
    return { success: false, error: `Failed to delete category: ${delErr.message}` };
  }

  await recordAdminAuditLog({
    action: "DELETE",
    modelName: "categories",
    modelId: id,
    oldValues: category,
    changes: { deleted_name: category.name },
  });

  revalidatePath("/admin/categories");
  revalidatePath("/admin/books");
  revalidatePath("/catalog");

  return { success: true };
}
