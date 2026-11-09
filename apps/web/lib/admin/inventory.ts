"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "./auth";
import { sendLowStockAlertEmail } from "@/lib/integrations/resend/service";
import type { Database } from "@/types/database.types";

export type InventoryAdjustmentRow = Database["public"]["Tables"]["inventory_adjustments"]["Row"];
export type BookRow = Database["public"]["Tables"]["books"]["Row"];

export interface InventoryItem extends BookRow {
  stockStatus: "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK";
}

export interface AdjustStockPayload {
  bookId: string;
  type: "INCREASE" | "DECREASE" | "SET";
  quantity: number;
  reason: string;
}

/**
 * Retrieves catalog inventory with stock levels and status categorization.
 */
export async function getAdminInventory(params?: {
  search?: string;
  stockFilter?: "all" | "low" | "out";
  category?: string;
  page?: number;
  limit?: number;
}): Promise<{
  items: InventoryItem[];
  total: number;
  page: number;
  totalPages: number;
  summary: {
    totalItems: number;
    lowStockCount: number;
    outOfStockCount: number;
    totalUnits: number;
  };
}> {
  await requireAdmin();
  const supabase = await createClient();

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 20));
  const offset = (page - 1) * limit;

  // 1. Fetch total counts for summary
  const { data: allBooks } = await supabase
    .from("books")
    .select("id, stock");

  let totalItems = 0;
  let lowStockCount = 0;
  let outOfStockCount = 0;
  let totalUnits = 0;

  for (const b of allBooks || []) {
    totalItems++;
    totalUnits += b.stock;
    if (b.stock === 0) {
      outOfStockCount++;
      lowStockCount++;
    } else if (b.stock <= 5) {
      lowStockCount++;
    }
  }

  // 2. Build filtered query
  let query = supabase.from("books").select("*", { count: "exact" });

  if (params?.search?.trim()) {
    const term = params.search.trim();
    query = query.or(`title.ilike.%${term}%,author.ilike.%${term}%`);
  }

  if (params?.category && params.category !== "ALL") {
    query = query.eq("category", params.category);
  }

  if (params?.stockFilter === "low") {
    query = query.lte("stock", 5);
  } else if (params?.stockFilter === "out") {
    query = query.eq("stock", 0);
  }

  query = query.order("stock", { ascending: true }).order("title", { ascending: true });
  query = query.range(offset, offset + limit - 1);

  const { data: books, error, count } = await query;

  if (error) {
    console.error("Error loading inventory:", error.message);
    throw new Error(`Failed to load inventory: ${error.message}`);
  }

  const items: InventoryItem[] = (books || []).map((book) => {
    let stockStatus: "OUT_OF_STOCK" | "LOW_STOCK" | "IN_STOCK" = "IN_STOCK";
    if (book.stock === 0) stockStatus = "OUT_OF_STOCK";
    else if (book.stock <= 5) stockStatus = "LOW_STOCK";

    return {
      ...book,
      stockStatus,
    };
  });

  const total = count || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    items,
    total,
    page,
    totalPages,
    summary: {
      totalItems,
      lowStockCount,
      outOfStockCount,
      totalUnits,
    },
  };
}

/**
 * Executes an atomic stock adjustment via database RPC with inventory and audit logging.
 */
export async function adjustAdminStock(payload: AdjustStockPayload): Promise<{
  success: boolean;
  bookId?: string;
  previousStock?: number;
  newStock?: number;
  quantityChange?: number;
  error?: string;
}> {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { bookId, type, quantity, reason } = payload;

  if (!bookId) {
    return { success: false, error: "Book ID is required." };
  }

  if (typeof quantity !== "number" || quantity < 0 || isNaN(quantity)) {
    return { success: false, error: "Quantity must be a non-negative number." };
  }

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { success: false, error: "Adjustment reason is mandatory." };
  }

  const { data, error } = await supabase.rpc("adjust_inventory_atomic", {
    p_book_id: bookId,
    p_admin_id: user.id,
    p_type: type,
    p_quantity: Math.floor(quantity),
    p_reason: trimmedReason,
  });

  if (error || !data) {
    return {
      success: false,
      error: error?.message || "Failed to adjust inventory.",
    };
  }

  const result = data as Record<string, any>;

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/books");
  revalidatePath("/admin");
  revalidatePath("/catalog");
  revalidatePath("/books");
  revalidatePath("/");
  revalidatePath(`/books/${bookId}`);

  return {
    success: true,
    bookId: result.book_id,
    previousStock: result.previous_stock,
    newStock: result.new_stock,
    quantityChange: result.quantity_change,
  };
}

/**
 * Retrieves the history of inventory adjustments for an individual book or across all catalog books.
 */
export async function getInventoryAdjustmentHistory(params?: {
  bookId?: string;
  limit?: number;
}): Promise<
  Array<
    InventoryAdjustmentRow & {
      bookTitle?: string;
      adminEmail?: string;
    }
  >
> {
  await requireAdmin();
  const supabase = await createClient();

  const limit = Math.max(1, Math.min(100, params?.limit || 30));

  let query = supabase.from("inventory_adjustments").select("*");

  if (params?.bookId) {
    query = query.eq("book_id", params.bookId);
  }

  query = query.order("created_at", { ascending: false }).limit(limit);

  const { data: rawAdjustments, error } = await query;

  if (error) {
    console.error("Error querying inventory adjustments history:", error.message);
    throw new Error(`Failed to load inventory history: ${error.message}`);
  }

  const adjustments = rawAdjustments || [];
  const bookIds = [...new Set(adjustments.map((a) => a.book_id))];
  const adminIds = [...new Set(adjustments.map((a) => a.admin_id))];

  let bookTitleMap: Record<string, string> = {};
  if (bookIds.length > 0) {
    const { data: books } = await supabase.from("books").select("id, title").in("id", bookIds);
    if (books) {
      bookTitleMap = Object.fromEntries(books.map((b) => [b.id, b.title]));
    }
  }

  let adminEmailMap: Record<string, string> = {};
  if (adminIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, email").in("id", adminIds);
    if (profiles) {
      adminEmailMap = Object.fromEntries(profiles.map((p) => [p.id, p.email]));
    }
  }

  return adjustments.map((adj) => ({
    ...adj,
    bookTitle: bookTitleMap[adj.book_id] || "Unknown Title",
    adminEmail: adminEmailMap[adj.admin_id] || "Admin",
  }));
}

/**
 * Checks books for low stock (<= 5 units), prevents spam via 24-hr deduplication in stock_alerts,
 * and notifies admin staff via email (Feature 1.22).
 */
export async function checkAndTriggerLowStockAlerts(bookIds: string[]): Promise<{
  triggeredCount: number;
  alerts: Array<{ bookId: string; title: string; stock: number }>;
}> {
  if (!bookIds || bookIds.length === 0) return { triggeredCount: 0, alerts: [] };

  const adminDb = createAdminClient();

  // 1. Fetch books that are at or below low stock threshold (<= 5)
  const { data: books, error } = await adminDb
    .from("books")
    .select("id, title, stock")
    .in("id", bookIds)
    .lte("stock", 5);

  if (error || !books || books.length === 0) {
    return { triggeredCount: 0, alerts: [] };
  }

  // 2. Query recent alerts within 24 hours to deduplicate
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: recentAlerts } = await adminDb
    .from("stock_alerts")
    .select("book_id")
    .in("book_id", books.map((b) => b.id))
    .gte("notified_at", twentyFourHoursAgo);

  const recentlyAlertedSet = new Set((recentAlerts || []).map((r) => r.book_id));
  const newAlerts = books.filter((b) => !recentlyAlertedSet.has(b.id));

  if (newAlerts.length === 0) {
    return { triggeredCount: 0, alerts: [] };
  }

  // 3. Record in stock_alerts table
  const alertInserts = newAlerts.map((b) => ({
    book_id: b.id,
    stock_level: b.stock,
    threshold: 5,
    status: "active" as const,
  }));

  await adminDb.from("stock_alerts").insert(alertInserts);

  // 4. Dispatch alert email
  const formattedAlerts = newAlerts.map((b) => ({
    bookId: b.id,
    title: b.title,
    stock: b.stock,
  }));

  sendLowStockAlertEmail(formattedAlerts).catch((err) =>
    console.error("Async low stock alert dispatch error:", err)
  );

  return {
    triggeredCount: formattedAlerts.length,
    alerts: formattedAlerts,
  };
}

