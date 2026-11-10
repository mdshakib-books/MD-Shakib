import { createAdminClient } from "@/lib/supabase/admin";

export interface ReviewItem {
  id: string;
  bookId: string;
  userId: string;
  userName: string;
  rating: number;
  title: string;
  comment: string;
  status: "pending" | "approved" | "rejected" | "hidden";
  createdAt: string;
}

export interface BookRatingSummary {
  averageRating: number;
  totalReviews: number;
  ratingCounts: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

/**
 * Checks whether a user is eligible to review a book (Verified Purchase validation) (2.23).
 */
export async function checkReviewEligibility(
  userId: string,
  bookId: string
): Promise<{
  isEligible: boolean;
  reason?: string;
  existingReview?: ReviewItem | null;
}> {
  const adminDb = createAdminClient();

  // 1. Check existing review
  const { data: existing } = await adminDb
    .from("reviews")
    .select("*, profiles!reviews_user_id_fkey(name)")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle();

  const existingReview: ReviewItem | null = existing
    ? {
        id: existing.id,
        bookId: existing.book_id,
        userId: existing.user_id,
        userName: (existing.profiles as any)?.name || "Customer",
        rating: existing.rating,
        title: existing.title,
        comment: existing.comment,
        status: existing.status as any,
        createdAt: existing.created_at,
      }
    : null;

  // 2. Verified purchase check: user must have a Delivered order containing this book
  const { data: deliveredOrders, error } = await adminDb
    .from("orders")
    .select("id, order_items!inner(book_id)")
    .eq("user_id", userId)
    .eq("order_status", "Delivered")
    .eq("order_items.book_id", bookId);

  const hasDeliveredPurchase = !error && deliveredOrders && deliveredOrders.length > 0;

  if (!hasDeliveredPurchase) {
    return {
      isEligible: false,
      reason: "Only verified buyers who have received delivery of this book can submit a review.",
      existingReview,
    };
  }

  return {
    isEligible: true,
    existingReview,
  };
}

/**
 * Submits or updates a verified customer review for a book (2.23).
 */
export async function submitProductReview(params: {
  userId: string;
  bookId: string;
  rating: number;
  title: string;
  comment: string;
}): Promise<{
  success: boolean;
  review?: ReviewItem;
  error?: string;
}> {
  const { userId, bookId, rating, title, comment } = params;

  // 1. Validate rating range
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { success: false, error: "Rating must be an integer between 1 and 5 stars." };
  }

  // 2. Validate title & comment length
  if (!title || !title.trim() || title.trim().length < 3) {
    return { success: false, error: "Review title must be at least 3 characters." };
  }
  if (!comment || !comment.trim() || comment.trim().length < 10) {
    return { success: false, error: "Review comment must be at least 10 characters." };
  }

  // 3. Enforce Verified Purchase rule
  const eligibility = await checkReviewEligibility(userId, bookId);
  if (!eligibility.isEligible) {
    return { success: false, error: eligibility.reason || "Review submission not permitted." };
  }

  const adminDb = createAdminClient();
  const trimmedTitle = title.trim();
  const trimmedComment = comment.trim();

  let reviewRow: any;

  if (eligibility.existingReview) {
    // Update existing review (keep status approved if already approved or reset to approved)
    const { data: updated, error: updErr } = await adminDb
      .from("reviews")
      .update({
        rating,
        title: trimmedTitle,
        comment: trimmedComment,
        status: "approved",
        updated_at: new Date().toISOString(),
      })
      .eq("id", eligibility.existingReview.id)
      .select("*, profiles!reviews_user_id_fkey(name)")
      .single();

    if (updErr || !updated) {
      return { success: false, error: updErr?.message || "Failed to update review." };
    }
    reviewRow = updated;
  } else {
    // Insert new review with approved status (or pending if strict moderation configured)
    const { data: inserted, error: insErr } = await adminDb
      .from("reviews")
      .insert({
        user_id: userId,
        book_id: bookId,
        rating,
        title: trimmedTitle,
        comment: trimmedComment,
        status: "approved",
      })
      .select("*, profiles!reviews_user_id_fkey(name)")
      .single();

    if (insErr || !inserted) {
      return { success: false, error: insErr?.message || "Failed to submit review." };
    }
    reviewRow = inserted;
  }

  return {
    success: true,
    review: {
      id: reviewRow.id,
      bookId: reviewRow.book_id,
      userId: reviewRow.user_id,
      userName: (reviewRow.profiles as any)?.name || "Customer",
      rating: reviewRow.rating,
      title: reviewRow.title,
      comment: reviewRow.comment,
      status: reviewRow.status,
      createdAt: reviewRow.created_at,
    },
  };
}

/**
 * Retrieves approved reviews and aggregate rating metrics for a book (2.23).
 */
export async function getBookReviews(
  bookId: string,
  page: number = 1,
  limit: number = 10
): Promise<{
  reviews: ReviewItem[];
  summary: BookRatingSummary;
  total: number;
}> {
  const adminDb = createAdminClient();

  const offset = (page - 1) * limit;

  // 1. Fetch approved reviews paginated
  const { data: reviewsData, count, error } = await adminDb
    .from("reviews")
    .select("*, profiles!reviews_user_id_fkey(name)", { count: "exact" })
    .eq("book_id", bookId)
    .eq("status", "approved")
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  // 2. Fetch all ratings to compute exact distribution and average
  const { data: allRatings } = await adminDb
    .from("reviews")
    .select("rating")
    .eq("book_id", bookId)
    .eq("status", "approved");

  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  let sum = 0;
  const ratings = allRatings || [];

  ratings.forEach((r) => {
    const star = r.rating as 1 | 2 | 3 | 4 | 5;
    if (counts[star] !== undefined) {
      counts[star]++;
      sum += star;
    }
  });

  const totalReviews = ratings.length;
  const averageRating = totalReviews > 0 ? Number((sum / totalReviews).toFixed(1)) : 0;

  const reviews: ReviewItem[] = (reviewsData || []).map((r: any) => ({
    id: r.id,
    bookId: r.book_id,
    userId: r.user_id,
    userName: (r.profiles as any)?.name || "Customer",
    rating: r.rating,
    title: r.title,
    comment: r.comment,
    status: r.status,
    createdAt: r.created_at,
  }));

  return {
    reviews,
    summary: {
      averageRating,
      totalReviews,
      ratingCounts: counts,
    },
    total: count ?? totalReviews,
  };
}
