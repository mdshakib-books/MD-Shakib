import { createAdminClient } from "@/lib/supabase/admin";

export interface WishlistItem {
  id: string;
  bookId: string;
  title: string;
  author: string;
  price: number;
  discountPrice?: number | null;
  coverImage?: string | null;
  stock: number;
  createdAt: string;
}

/**
 * Retrieves the customer's wishlist items with book metadata (2.22).
 */
export async function getCustomerWishlist(userId: string): Promise<WishlistItem[]> {
  const adminDb = createAdminClient();

  const { data, error } = await adminDb
    .from("wishlists")
    .select(`
      id,
      book_id,
      created_at,
      books (
        id,
        title,
        author,
        price,
        discount,
        cover_image,
        image_url,
        stock
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data
    .filter((row: any) => row.books)
    .map((row: any) => {
      const b = row.books;
      const discountPct = Number(b.discount || 0);
      const discountPrice = discountPct > 0 ? Math.round(Number(b.price) * (1 - discountPct / 100)) : null;
      return {
        id: row.id,
        bookId: row.book_id,
        title: b.title,
        author: b.author,
        price: Number(b.price),
        discountPrice,
        coverImage: b.cover_image || b.image_url || null,
        stock: Number(b.stock ?? 0),
        createdAt: row.created_at,
      };
    });
}

/**
 * Adds a book to customer wishlist idempotently (2.22).
 */
export async function addToWishlist(
  userId: string,
  bookId: string
): Promise<{ success: boolean; id?: string; alreadyInWishlist?: boolean; error?: string }> {
  const adminDb = createAdminClient();

  // Verify book exists
  const { data: book, error: bookErr } = await adminDb
    .from("books")
    .select("id")
    .eq("id", bookId)
    .single();

  if (bookErr || !book) {
    return { success: false, error: "Book not found." };
  }

  // Check if already in wishlist
  const { data: existing } = await adminDb
    .from("wishlists")
    .select("id")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (existing) {
    return { success: true, id: existing.id, alreadyInWishlist: true };
  }

  const { data: inserted, error: insErr } = await adminDb
    .from("wishlists")
    .insert({
      user_id: userId,
      book_id: bookId,
    })
    .select("id")
    .single();

  if (insErr || !inserted) {
    return { success: false, error: insErr?.message || "Failed to add to wishlist." };
  }

  return { success: true, id: inserted.id, alreadyInWishlist: false };
}

/**
 * Removes a book from customer wishlist (2.22).
 */
export async function removeFromWishlist(
  userId: string,
  bookId: string
): Promise<{ success: boolean; error?: string }> {
  const adminDb = createAdminClient();

  const { error } = await adminDb
    .from("wishlists")
    .delete()
    .eq("user_id", userId)
    .eq("book_id", bookId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Checks whether a specific book is in the customer's wishlist (2.22).
 */
export async function isBookInCustomerWishlist(
  userId: string,
  bookId: string
): Promise<boolean> {
  const adminDb = createAdminClient();

  const { data } = await adminDb
    .from("wishlists")
    .select("id")
    .eq("user_id", userId)
    .eq("book_id", bookId)
    .maybeSingle();

  return !!data;
}
