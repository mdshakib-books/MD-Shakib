"use server";

import { revalidatePath } from "next/cache";
import { createClient, createPublicClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
import { MOCK_BOOKS } from "@/data/mockCatalog";
import type { Database } from "@/types/database.types";

export type CartItemRow = Database["public"]["Tables"]["cart_items"]["Row"];

export interface EnrichedCartItem {
  id: string;
  cartId: string;
  bookId: string;
  quantity: number;
  price: number;
  title: string;
  author: string;
  imageUrl: string;
  stock: number;
  isActive: boolean;
  lineTotal: number;
}

export interface CustomerCartSummary {
  cartId: string;
  items: EnrichedCartItem[];
  subtotal: number;
  platformFee: number;
  deliveryFee: number;
  totalAmount: number;
  itemCount: number;
}

const PLATFORM_FEE = 10;
const DELIVERY_FEE = 35;

/**
 * Ensures the authenticated customer has a row in public.carts.
 */
export async function getOrCreateCustomerCartId(userId: string): Promise<string> {
  const supabase = await createClient();

  const { data: existingCart } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  if (existingCart?.id) {
    return existingCart.id;
  }

  const { data: newCart, error } = await supabase
    .from("carts")
    .insert({ user_id: userId })
    .select("id")
    .single();

  if (error || !newCart) {
    console.error("Error creating cart:", error?.message);
    throw new Error("Unable to initialize customer shopping cart.");
  }

  return newCart.id;
}

/**
 * Retrieves the customer's cart with up-to-date catalog prices and product information.
 */
export async function getCustomerCart(): Promise<CustomerCartSummary | null> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return null;
  }

  const supabase = await createClient();
  const cartId = await getOrCreateCustomerCartId(user.id);

  const { data: items, error } = await supabase
    .from("cart_items")
    .select(`
      id,
      cart_id,
      book_id,
      quantity,
      price,
      books:book_id (
        id,
        title,
        author,
        price,
        discount,
        stock,
        image_url,
        is_active
      )
    `)
    .eq("cart_id", cartId);

  if (error) {
    console.error("Error fetching cart items:", error.message);
    throw new Error("Failed to load shopping cart.");
  }

  const enrichedItems: EnrichedCartItem[] = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const item of items || []) {
    // Type assertion for joined relation
    const book = item.books as unknown as {
      id: string;
      title: string;
      author: string;
      price: number;
      discount: number;
      stock: number;
      image_url: string;
      is_active: boolean;
    } | null;

    if (!book) continue;

    const discount = book.discount || 0;
    const effectivePrice = discount > 0 ? Math.round(Number(book.price) * (1 - discount / 100)) : Number(book.price);
    const lineTotal = effectivePrice * item.quantity;

    enrichedItems.push({
      id: item.id,
      cartId: item.cart_id,
      bookId: item.book_id,
      quantity: item.quantity,
      price: effectivePrice,
      title: book.title,
      author: book.author,
      imageUrl: book.image_url,
      stock: book.stock,
      isActive: book.is_active,
      lineTotal,
    });

    subtotal += lineTotal;
    itemCount += item.quantity;
  }

  const platformFee = enrichedItems.length > 0 ? PLATFORM_FEE : 0;
  const deliveryFee = enrichedItems.length > 0 ? DELIVERY_FEE : 0;
  const totalAmount = subtotal + platformFee + deliveryFee;

  return {
    cartId,
    items: enrichedItems,
    subtotal,
    platformFee,
    deliveryFee,
    totalAmount,
    itemCount,
  };
}

/**
 * Adds an item to the authenticated customer's cart.
 */
export async function addToCart(bookId: string, quantity: number = 1): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: "Please log in to add books to your cart." };
  }

  const qty = Math.max(1, quantity);
  const supabase = await createClient();

  // Validate book exists and is active
  const { data: book, error: bookErr } = await supabase
    .from("books")
    .select("id, price, discount, stock, is_active")
    .eq("id", bookId)
    .single();

  if (bookErr || !book || !book.is_active) {
    return { success: false, error: "This book is currently unavailable." };
  }

  if (book.stock < qty) {
    return { success: false, error: `Only ${book.stock} copies available in stock.` };
  }

  const cartId = await getOrCreateCustomerCartId(user.id);
  const effectivePrice = book.discount > 0 ? Math.round(Number(book.price) * (1 - book.discount / 100)) : Number(book.price);

  // Check if item already in cart
  const { data: existingItem } = await supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("cart_id", cartId)
    .eq("book_id", bookId)
    .maybeSingle();

  if (existingItem) {
    const newQty = existingItem.quantity + qty;
    if (newQty > book.stock) {
      return { success: false, error: `Cannot add more than available stock (${book.stock} copies).` };
    }

    const { error: updateErr } = await supabase
      .from("cart_items")
      .update({ quantity: newQty, price: effectivePrice })
      .eq("id", existingItem.id);

    if (updateErr) return { success: false, error: updateErr.message };
  } else {
    const { error: insertErr } = await supabase
      .from("cart_items")
      .insert({
        cart_id: cartId,
        book_id: bookId,
        quantity: qty,
        price: effectivePrice,
      });

    if (insertErr) return { success: false, error: insertErr.message };
  }

  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { success: true };
}

/**
 * Updates quantity of a specific cart item by row ID or book ID.
 */
export async function updateCartQuantity(cartItemIdOrBookId: string, quantity: number): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const supabase = await createClient();

  if (quantity <= 0) {
    const { error } = await supabase
      .from("cart_items")
      .delete()
      .or(`id.eq.${cartItemIdOrBookId},book_id.eq.${cartItemIdOrBookId}`);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity })
      .or(`id.eq.${cartItemIdOrBookId},book_id.eq.${cartItemIdOrBookId}`);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { success: true };
}

/**
 * Removes an item from the customer's cart by row ID or book ID.
 */
export async function removeCartItem(cartItemIdOrBookId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("cart_items")
    .delete()
    .or(`id.eq.${cartItemIdOrBookId},book_id.eq.${cartItemIdOrBookId}`);

  if (error) return { success: false, error: error.message };

  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { success: true };
}

/**
 * Resolves book details for a list of book IDs, falling back to mock catalog if database is not available.
 */
async function fetchBooksByIds(bookIds: string[]) {
  const map = new Map<string, {
    id: string;
    title: string;
    author: string;
    price: number;
    discount: number;
    stock: number;
    imageUrl: string;
    isActive: boolean;
  }>();

  if (bookIds.length === 0) return map;

  try {
    const supabase = createPublicClient();
    const { data: dbBooks } = await supabase
      .from("books")
      .select("id, title, author, price, discount, stock, image_url, is_active")
      .in("id", bookIds);

    if (dbBooks && dbBooks.length > 0) {
      for (const b of dbBooks) {
        map.set(b.id, {
          id: b.id,
          title: b.title,
          author: b.author || "",
          price: Number(b.price),
          discount: b.discount || 0,
          stock: b.stock,
          imageUrl: b.image_url || "",
          isActive: b.is_active,
        });
      }
    }
  } catch (err) {
    console.warn("Could not load books from database, checking mock fixtures:", err);
  }

  // Fill in any missing books from MOCK_BOOKS fixtures
  for (const id of bookIds) {
    if (!map.has(id)) {
      const mock = MOCK_BOOKS.find((b) => b.id === id);
      if (mock) {
        map.set(mock.id, {
          id: mock.id,
          title: mock.title,
          author: mock.author || "",
          price: mock.price,
          discount: mock.discount || 0,
          stock: mock.stock || 50,
          imageUrl: mock.imageUrl || "",
          isActive: true,
        });
      }
    }
  }

  return map;
}

/**
 * Computes authoritative server-side cart summary for unauthenticated guest items.
 * Validates stock, calculates line totals, fees, and authoritative total amount.
 */
export async function getGuestCartDetails(
  guestItems: Array<{ bookId: string; quantity: number }>
): Promise<CustomerCartSummary> {
  if (!guestItems || guestItems.length === 0) {
    return {
      cartId: "guest",
      items: [],
      subtotal: 0,
      platformFee: 0,
      deliveryFee: 0,
      totalAmount: 0,
      itemCount: 0,
    };
  }

  const bookIds = guestItems.map((i) => i.bookId);
  const bookMap = await fetchBooksByIds(bookIds);

  const enrichedItems: EnrichedCartItem[] = [];
  let subtotal = 0;
  let itemCount = 0;

  for (const item of guestItems) {
    const book = bookMap.get(item.bookId);
    if (!book || !book.isActive) continue;

    const qty = Math.max(1, Math.min(item.quantity, book.stock));
    const effectivePrice = book.discount > 0 ? Math.round(book.price * (1 - book.discount / 100)) : book.price;
    const lineTotal = effectivePrice * qty;

    enrichedItems.push({
      id: `guest-${book.id}`,
      cartId: "guest",
      bookId: book.id,
      quantity: qty,
      price: effectivePrice,
      title: book.title,
      author: book.author,
      imageUrl: book.imageUrl,
      stock: book.stock,
      isActive: book.isActive,
      lineTotal,
    });

    subtotal += lineTotal;
    itemCount += qty;
  }

  const platformFee = enrichedItems.length > 0 ? PLATFORM_FEE : 0;
  const deliveryFee = enrichedItems.length > 0 ? DELIVERY_FEE : 0;
  const totalAmount = subtotal + platformFee + deliveryFee;

  return {
    cartId: "guest",
    items: enrichedItems,
    subtotal,
    platformFee,
    deliveryFee,
    totalAmount,
    itemCount,
  };
}

/**
 * Merges guest cart items into the authenticated customer's database cart atomically.
 * Uses merge_cart_atomic stored procedure with retry safety and token idempotency.
 */
export async function mergeGuestCart(
  guestItems: Array<{ bookId: string; quantity: number }>,
  mergeToken?: string
): Promise<{ success: boolean; error?: string; cart?: CustomerCartSummary | null }> {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { success: false, error: "Authentication required to merge cart." };
  }

  if (!guestItems || guestItems.length === 0) {
    const currentCart = await getCustomerCart();
    return { success: true, cart: currentCart };
  }

  const supabase = await createClient();

  // 1. Attempt atomic stored procedure merge
  const { data: rpcRes, error: rpcErr } = await supabase.rpc("merge_cart_atomic", {
    p_user_id: user.id,
    p_guest_items: guestItems.map((i) => ({
      book_id: i.bookId,
      quantity: Number(i.quantity) || 1,
    })),
    p_merge_token: mergeToken || null,
  });

  if (!rpcErr && rpcRes) {
    const res = rpcRes as { success: boolean; message?: string; error?: string };
    if (res.success) {
      revalidatePath("/cart");
      revalidatePath("/checkout");
      const mergedCart = await getCustomerCart();
      return { success: true, cart: mergedCart };
    }
  }

  // 2. Fallback to client-orchestrated query loop if RPC is unmigrated in environment
  const cartId = await getOrCreateCustomerCartId(user.id);

  // Fetch book catalog details
  const bookIds = guestItems.map((i) => i.bookId);
  const bookMap = await fetchBooksByIds(bookIds);

  // Fetch existing DB cart items
  const { data: existingItems, error: fetchErr } = await supabase
    .from("cart_items")
    .select("id, book_id, quantity")
    .eq("cart_id", cartId);

  if (fetchErr) {
    console.error("Error fetching existing cart for merge:", fetchErr.message);
    return { success: false, error: "Failed to retrieve existing cart." };
  }

  const existingMap = new Map((existingItems || []).map((i) => [i.book_id, i]));

  for (const guestItem of guestItems) {
    const book = bookMap.get(guestItem.bookId);
    if (!book || !book.isActive || book.stock <= 0) continue;

    const guestQty = Math.max(1, Number(guestItem.quantity) || 1);
    const effectivePrice = book.discount > 0 ? Math.round(book.price * (1 - book.discount / 100)) : book.price;

    const existing = existingMap.get(guestItem.bookId);

    if (existing) {
      // Combine quantities and cap at available stock
      const combinedQty = Math.min(existing.quantity + guestQty, Math.min(5, book.stock));
      const { error: updateErr } = await supabase
        .from("cart_items")
        .update({ quantity: combinedQty, price: effectivePrice })
        .eq("id", existing.id);

      if (updateErr) {
        console.error("Cart item update failed during merge:", updateErr.message);
        return { success: false, error: "Failed to update cart during merge." };
      }
    } else {
      // Add new item capped at available stock
      const safeQty = Math.min(guestQty, Math.min(5, book.stock));
      if (safeQty > 0) {
        const { error: insertErr } = await supabase
          .from("cart_items")
          .insert({
            cart_id: cartId,
            book_id: book.id,
            quantity: safeQty,
            price: effectivePrice,
          });

        if (insertErr) {
          console.error("Cart item insert failed during merge:", insertErr.message);
          return { success: false, error: "Failed to merge item into cart." };
        }
      }
    }
  }

  revalidatePath("/cart");
  revalidatePath("/checkout");

  const mergedCart = await getCustomerCart();
  return { success: true, cart: mergedCart };
}

/**
 * Clears the authenticated customer's cart.
 */
export async function clearCustomerCart(): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const supabase = await createClient();
  const { data: cart } = await supabase
    .from("carts")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (cart?.id) {
    const { error } = await supabase.from("cart_items").delete().eq("cart_id", cart.id);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { success: true };
}

