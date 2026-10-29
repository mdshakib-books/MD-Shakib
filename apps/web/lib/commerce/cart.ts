"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthenticatedUser } from "@/lib/auth/session";
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
 * Updates quantity of a specific cart item.
 */
export async function updateCartQuantity(cartItemId: string, quantity: number): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const supabase = await createClient();

  if (quantity <= 0) {
    const { error } = await supabase.from("cart_items").delete().eq("id", cartItemId);
    if (error) return { success: false, error: error.message };
  } else {
    const { error } = await supabase.from("cart_items").update({ quantity }).eq("id", cartItemId);
    if (error) return { success: false, error: error.message };
  }

  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { success: true };
}

/**
 * Removes an item from the customer's cart.
 */
export async function removeCartItem(cartItemId: string): Promise<{ success: boolean; error?: string }> {
  const user = await getAuthenticatedUser();
  if (!user) return { success: false, error: "Authentication required." };

  const supabase = await createClient();
  const { error } = await supabase.from("cart_items").delete().eq("id", cartItemId);

  if (error) return { success: false, error: error.message };

  revalidatePath("/cart");
  revalidatePath("/checkout");
  return { success: true };
}

