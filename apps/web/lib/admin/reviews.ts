"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireAdmin } from "./auth";
import type { Database } from "@/types/database.types";

export type ReviewRow = Database["public"]["Tables"]["reviews"]["Row"];

export interface EnrichedReview extends ReviewRow {
  bookTitle: string;
  reviewerName: string;
  reviewerEmail: string;
}

/**
 * Retrieves paginated reviews for administrator moderation.
 */
export async function getAdminReviews(params?: {
  status?: "pending" | "approved" | "rejected" | "hidden" | "ALL";
  bookId?: string;
  page?: number;
  limit?: number;
}): Promise<{
  reviews: EnrichedReview[];
  total: number;
  page: number;
  totalPages: number;
  pendingCount: number;
}> {
  await requireAdmin();
  const supabase = await createClient();

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 20));
  const offset = (page - 1) * limit;

  // Pending count for badge/alert
  const { count: pendingCount } = await supabase
    .from("reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  let query = supabase.from("reviews").select("*", { count: "exact" });

  if (params?.status && params.status !== "ALL") {
    query = query.eq("status", params.status);
  }

  if (params?.bookId) {
    query = query.eq("book_id", params.bookId);
  }

  query = query.order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data: rawReviews, error, count } = await query;

  if (error) {
    console.error("Error fetching admin reviews:", error.message);
    throw new Error(`Failed to load reviews: ${error.message}`);
  }

  const reviews = rawReviews || [];
  const bookIds = [...new Set(reviews.map((r) => r.book_id))];
  const userIds = [...new Set(reviews.map((r) => r.user_id))];

  let bookTitleMap: Record<string, string> = {};
  if (bookIds.length > 0) {
    const { data: books } = await supabase.from("books").select("id, title").in("id", bookIds);
    if (books) {
      bookTitleMap = Object.fromEntries(books.map((b) => [b.id, b.title]));
    }
  }

  let profileMap: Record<string, { name: string; email: string }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase.from("profiles").select("id, name, email").in("id", userIds);
    if (profiles) {
      profileMap = Object.fromEntries(
        profiles.map((p) => [p.id, { name: p.name || "Customer", email: p.email || "" }])
      );
    }
  }

  const enrichedReviews: EnrichedReview[] = reviews.map((r) => ({
    ...r,
    bookTitle: bookTitleMap[r.book_id] || "Unknown Book",
    reviewerName: profileMap[r.user_id]?.name || "Customer",
    reviewerEmail: profileMap[r.user_id]?.email || "",
  }));

  const total = count || 0;
  const totalPages = Math.ceil(total / limit) || 1;

  return {
    reviews: enrichedReviews,
    total,
    page,
    totalPages,
    pendingCount: pendingCount || 0,
  };
}

/**
 * Moderates a customer review (approved, rejected, hidden) via atomic database procedure.
 */
export async function moderateAdminReview(payload: {
  reviewId: string;
  status: "approved" | "rejected" | "hidden" | "pending";
}): Promise<{ success: boolean; error?: string }> {
  const { user } = await requireAdmin();
  const supabase = await createClient();

  const { reviewId, status } = payload;

  const { data, error } = await supabase.rpc("moderate_review_atomic", {
    p_review_id: reviewId,
    p_admin_id: user.id,
    p_status: status,
  });

  if (error || !data) {
    return {
      success: false,
      error: error?.message || "Failed to update review status.",
    };
  }

  // Get book_id to revalidate book page
  const { data: rev } = await supabase
    .from("reviews")
    .select("book_id")
    .eq("id", reviewId)
    .single();

  revalidatePath("/admin/reviews");
  revalidatePath("/admin");
  if (rev?.book_id) {
    revalidatePath(`/books/${rev.book_id}`);
    revalidatePath("/catalog");
  }

  return { success: true };
}

/**
 * Computes approved rating metrics for a book to display on public product detail page.
 */
export async function getBookRatingSummary(bookId: string): Promise<{
  averageRating: number;
  reviewCount: number;
  ratingDistribution: Record<number, number>;
}> {
  const supabase = await createClient();

  const { data: reviews } = await supabase
    .from("reviews")
    .select("rating")
    .eq("book_id", bookId)
    .eq("status", "approved");

  const list = reviews || [];
  if (list.length === 0) {
    return {
      averageRating: 0,
      reviewCount: 0,
      ratingDistribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    };
  }

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let totalRating = 0;

  for (const r of list) {
    totalRating += r.rating;
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
  }

  return {
    averageRating: Number((totalRating / list.length).toFixed(1)),
    reviewCount: list.length,
    ratingDistribution: distribution,
  };
}

