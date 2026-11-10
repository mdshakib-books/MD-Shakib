import { createAdminClient } from "@/lib/supabase/admin";

export type VariantType = "format" | "language" | "edition";

export interface BookVariant {
  id: string;
  bookId: string;
  sku: string;
  variantType: VariantType;
  variantValue: string;
  price: number;
  stock: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Retrieves all variants for a specific book (2.32).
 */
export async function getBookVariants(bookId: string): Promise<BookVariant[]> {
  const adminDb = createAdminClient();

  const { data, error } = await adminDb
    .from("book_variants")
    .select("*")
    .eq("book_id", bookId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  return data.map((v) => ({
    id: v.id,
    bookId: v.book_id,
    sku: v.sku,
    variantType: v.variant_type as VariantType,
    variantValue: v.variant_value,
    price: Number(v.price),
    stock: v.stock,
    isActive: v.is_active,
    createdAt: v.created_at,
    updatedAt: v.updated_at,
  }));
}

/**
 * Creates a new SKU variant for a book (2.32).
 */
export async function createBookVariant(params: {
  bookId: string;
  sku: string;
  variantType?: VariantType;
  variantValue?: string;
  title?: string;
  price: number;
  stock: number;
  isActive?: boolean;
}): Promise<{ success: boolean; variant?: BookVariant; error?: string }> {
  const {
    bookId,
    sku,
    variantType = "format",
    variantValue,
    title,
    price,
    stock,
    isActive = true,
  } = params;

  const resolvedValue = (variantValue || title || "Standard").trim();

  if (!sku || !sku.trim()) {
    return { success: false, error: "Variant SKU is required." };
  }
  if (!resolvedValue) {
    return { success: false, error: "Variant value is required." };
  }
  if (price < 0 || isNaN(price)) {
    return { success: false, error: "Price must be non-negative." };
  }
  if (stock < 0 || isNaN(stock)) {
    return { success: false, error: "Stock must be non-negative." };
  }

  const validTypes: VariantType[] = ["format", "language", "edition"];
  if (!validTypes.includes(variantType)) {
    return { success: false, error: `Invalid variant type: ${variantType}. Must be format, language, or edition.` };
  }

  const adminDb = createAdminClient();

  const { data: inserted, error: insErr } = await adminDb
    .from("book_variants")
    .insert({
      book_id: bookId,
      sku: sku.trim(),
      variant_type: variantType,
      variant_value: resolvedValue,
      price,
      stock: Math.floor(stock),
      is_active: isActive,
    })
    .select("*")
    .single();

  if (insErr || !inserted) {
    return { success: false, error: insErr?.message || "Failed to create variant." };
  }

  return {
    success: true,
    variant: {
      id: inserted.id,
      bookId: inserted.book_id,
      sku: inserted.sku,
      variantType: inserted.variant_type as VariantType,
      variantValue: inserted.variant_value,
      price: Number(inserted.price),
      stock: inserted.stock,
      isActive: inserted.is_active,
      createdAt: inserted.created_at,
      updatedAt: inserted.updated_at,
    },
  };
}

/**
 * Atomically adjusts variant stock and records movement into the inventory history ledger (2.32, 2.33).
 */
export async function adjustVariantStockAtomic(params: {
  variantId: string;
  bookId: string;
  quantityChange: number;
  reason: string;
  actorId?: string;
}): Promise<{
  success: boolean;
  newStock?: number;
  error?: string;
}> {
  const { variantId, bookId, quantityChange, reason, actorId } = params;
  const adminDb = createAdminClient();

  const { data, error } = await adminDb.rpc("record_inventory_movement_atomic", {
    p_book_id: bookId,
    p_variant_id: variantId,
    p_movement_type: quantityChange >= 0 ? "PURCHASE" : "MANUAL_ADJUSTMENT",
    p_quantity_change: quantityChange,
    p_reason: reason,
    p_order_id: undefined,
    p_return_id: undefined,
    p_actor_id: actorId || undefined,
  } as any);

  if (error || !(data as any)?.success) {
    return {
      success: false,
      error: (data as any)?.error || error?.message || "Failed to adjust variant stock.",
    };
  }

  return {
    success: true,
    newStock: (data as any).new_stock,
  };
}
