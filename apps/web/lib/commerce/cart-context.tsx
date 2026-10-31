"use client";

import * as React from "react";
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useTransition,
  useRef,
} from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getCustomerCart,
  addToCart as serverAddToCart,
  updateCartQuantity as serverUpdateCartQuantity,
  removeCartItem as serverRemoveCartItem,
  mergeGuestCart as serverMergeGuestCart,
  clearCustomerCart as serverClearCustomerCart,
  type CustomerCartSummary,
  type EnrichedCartItem,
} from "./cart";

export const GUEST_CART_KEY = "guest_cart";
const PLATFORM_FEE = 10;
const DELIVERY_FEE = 35;

export interface CartBookInput {
  id: string;
  title: string;
  price: number;
  discount?: number;
  stock?: number;
  imageUrl?: string;
  category?: string;
  author?: string;
}

export interface UnifiedCartItem {
  id: string;
  bookId: string;
  title: string;
  author?: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  imageUrl: string;
  quantity: number;
  stock?: number;
  isActive?: boolean;
  lineTotal: number;
}

export interface CartToast {
  message: string;
  type: "success" | "error";
  id: number;
}

interface CartContextValue {
  items: UnifiedCartItem[];
  itemCount: number;
  subtotal: number;
  platformFee: number;
  deliveryFee: number;
  totalAmount: number;
  isLoading: boolean;
  isAuthenticated: boolean;
  toast: CartToast | null;
  addItem: (book: CartBookInput, quantity?: number) => Promise<{ success: boolean; error?: string }>;
  updateQuantity: (itemIdOrBookId: string, quantity: number) => Promise<{ success: boolean; error?: string }>;
  removeItem: (itemIdOrBookId: string) => Promise<{ success: boolean; error?: string }>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
  isInCart: (bookId: string) => boolean;
  getItemQuantity: (bookId: string) => number;
  dismissToast: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function loadGuestCartFromStorage(): Array<{
  bookId: string;
  title: string;
  price: number;
  originalPrice?: number;
  discount?: number;
  imageUrl: string;
  quantity: number;
  stock?: number;
  author?: string;
}> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(GUEST_CART_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error("Failed to parse guest cart from localStorage:", err);
    return [];
  }
}

function saveGuestCartToStorage(items: any[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    window.dispatchEvent(new Event("storage"));
  } catch (err) {
    console.error("Failed to save guest cart to localStorage:", err);
  }
}

export function CartProvider({
  children,
  initialServerCart = null,
  initialAuthenticated = false,
}: {
  children: React.ReactNode;
  initialServerCart?: CustomerCartSummary | null;
  initialAuthenticated?: boolean;
}) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(initialAuthenticated);
  const [items, setItems] = useState<UnifiedCartItem[]>(() => {
    if (initialAuthenticated && initialServerCart) {
      return initialServerCart.items.map((i) => ({
        ...i,
        lineTotal: i.price * i.quantity,
      }));
    }
    return [];
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [toast, setToast] = useState<CartToast | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isMergingRef = useRef<boolean>(false);

  const showToast = useCallback((message: string, type: "success" | "error" = "success") => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    const newToast: CartToast = { message, type, id: Date.now() };
    setToast(newToast);
    toastTimeoutRef.current = setTimeout(() => {
      setToast(null);
    }, 3000);
  }, []);

  const dismissToast = useCallback(() => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast(null);
  }, []);

  // Sync state from server cart summary
  const syncFromServerCart = useCallback((serverCart: CustomerCartSummary | null) => {
    if (!serverCart || !serverCart.items) {
      setItems([]);
      return;
    }
    setItems(
      serverCart.items.map((i) => ({
        id: i.id,
        bookId: i.bookId,
        title: i.title,
        author: i.author,
        price: i.price,
        imageUrl: i.imageUrl,
        quantity: i.quantity,
        stock: i.stock,
        isActive: i.isActive,
        lineTotal: i.price * i.quantity,
      }))
    );
  }, []);

  // Sync state from guest localStorage
  const syncFromGuestStorage = useCallback(() => {
    const guestItems = loadGuestCartFromStorage();
    const unified: UnifiedCartItem[] = guestItems.map((g) => {
      const discount = g.discount || 0;
      const effectivePrice = discount > 0 ? Math.round(g.price * (1 - discount / 100)) : g.price;
      return {
        id: `guest-${g.bookId}`,
        bookId: g.bookId,
        title: g.title,
        author: g.author,
        price: effectivePrice,
        originalPrice: g.price,
        discount: g.discount,
        imageUrl: g.imageUrl,
        quantity: g.quantity,
        stock: g.stock !== undefined ? g.stock : 999,
        isActive: true,
        lineTotal: effectivePrice * g.quantity,
      };
    });
    setItems(unified);
  }, []);

  // Load and merge cart on initialization or auth state change
  const refreshCart = useCallback(async () => {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();

      if (user) {
        setIsAuthenticated(true);
        // Check for guest cart to merge
        const guestItems = loadGuestCartFromStorage();
        if (guestItems.length > 0 && !isMergingRef.current) {
          isMergingRef.current = true;
          try {
            const mergePayload = guestItems.map((i) => ({
              bookId: i.bookId,
              quantity: i.quantity,
            }));
            const mergeToken = "merge-" + guestItems.map((i) => `${i.bookId}:${i.quantity}`).join("_");
            const mergeRes = await serverMergeGuestCart(mergePayload, mergeToken);
            if (mergeRes.success && mergeRes.cart) {
              localStorage.removeItem(GUEST_CART_KEY);
              syncFromServerCart(mergeRes.cart);
              showToast("Guest cart items merged into your account ✓");
              return;
            }
          } catch (mergeErr) {
            console.error("Cart merge error:", mergeErr);
          } finally {
            isMergingRef.current = false;
          }
        }

        const serverCart = await getCustomerCart();
        syncFromServerCart(serverCart);
      } else {
        setIsAuthenticated(false);
        syncFromGuestStorage();
      }
    } catch (err) {
      console.error("Error refreshing cart:", err);
      syncFromGuestStorage();
    } finally {
      setIsLoading(false);
    }
  }, [showToast, syncFromGuestStorage, syncFromServerCart]);

  useEffect(() => {
    let isMounted = true;

    const initCart = async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();

        if (!isMounted) return;

        if (user) {
          setIsAuthenticated(true);
          const guestItems = loadGuestCartFromStorage();
          if (guestItems.length > 0 && !isMergingRef.current) {
            isMergingRef.current = true;
            try {
              const mergePayload = guestItems.map((i) => ({
                bookId: i.bookId,
                quantity: i.quantity,
              }));
              const mergeRes = await serverMergeGuestCart(mergePayload);
              if (isMounted && mergeRes.success && mergeRes.cart) {
                localStorage.removeItem(GUEST_CART_KEY);
                syncFromServerCart(mergeRes.cart);
                showToast("Guest cart items merged into your account ✓");
                setIsLoading(false);
                return;
              }
            } catch (mergeErr) {
              console.error("Cart merge error:", mergeErr);
            } finally {
              isMergingRef.current = false;
            }
          }

          const serverCart = await getCustomerCart();
          if (isMounted) syncFromServerCart(serverCart);
        } else {
          setIsAuthenticated(false);
          syncFromGuestStorage();
        }
      } catch (err) {
        console.error("Error initializing cart:", err);
        if (isMounted) syncFromGuestStorage();
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    initCart();

    const handleStorage = () => {
      if (!isAuthenticated) {
        syncFromGuestStorage();
      }
    };

    window.addEventListener("storage", handleStorage);

    const supabase = createClient();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setIsAuthenticated(true);
        await refreshCart();
      } else {
        setIsAuthenticated(false);
        syncFromGuestStorage();
      }
    });

    return () => {
      isMounted = false;
      window.removeEventListener("storage", handleStorage);
      subscription.unsubscribe();
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [isAuthenticated, refreshCart, showToast, syncFromGuestStorage, syncFromServerCart]);

  // Add Item
  const addItem = useCallback(
    async (book: CartBookInput, quantity: number = 1): Promise<{ success: boolean; error?: string }> => {
      const qtyToAdd = Math.max(1, quantity);

      if (book.stock !== undefined && book.stock <= 0) {
        showToast(`"${book.title}" is out of stock.`, "error");
        return { success: false, error: "Out of stock" };
      }

      if (isAuthenticated) {
        try {
          const res = await serverAddToCart(book.id, qtyToAdd);
          if (res.success) {
            await refreshCart();
            showToast(`Added "${book.title}" to cart ✓`);
            return { success: true };
          } else {
            showToast(res.error || "Failed to add to cart.", "error");
            return { success: false, error: res.error };
          }
        } catch (err: any) {
          const msg = err?.message || "An error occurred while adding to cart.";
          showToast(msg, "error");
          return { success: false, error: msg };
        }
      }

      // Guest Cart logic
      const guestItems = loadGuestCartFromStorage();
      const existingIdx = guestItems.findIndex((i) => i.bookId === book.id);
      const maxStock = book.stock !== undefined ? book.stock : 999;

      if (existingIdx > -1) {
        const newQty = guestItems[existingIdx].quantity + qtyToAdd;
        if (newQty > maxStock) {
          showToast(`Cannot add more than available stock (${maxStock} copies).`, "error");
          return { success: false, error: "Stock limit reached" };
        }
        guestItems[existingIdx].quantity = newQty;
      } else {
        if (qtyToAdd > maxStock) {
          showToast(`Cannot add more than available stock (${maxStock} copies).`, "error");
          return { success: false, error: "Stock limit reached" };
        }
        guestItems.push({
          bookId: book.id,
          title: book.title,
          price: book.price,
          discount: book.discount,
          imageUrl: book.imageUrl || "",
          quantity: qtyToAdd,
          stock: book.stock,
          author: book.author,
        });
      }

      saveGuestCartToStorage(guestItems);
      syncFromGuestStorage();
      showToast(`Added "${book.title}" to cart ✓`);
      return { success: true };
    },
    [isAuthenticated, refreshCart, showToast, syncFromGuestStorage]
  );

  // Update Quantity
  const updateQuantity = useCallback(
    async (itemIdOrBookId: string, newQuantity: number): Promise<{ success: boolean; error?: string }> => {
      if (isAuthenticated) {
        try {
          const res = await serverUpdateCartQuantity(itemIdOrBookId, newQuantity);
          if (res.success) {
            await refreshCart();
            return { success: true };
          }
          showToast(res.error || "Failed to update quantity.", "error");
          return { success: false, error: res.error };
        } catch (err: any) {
          showToast(err?.message || "Failed to update quantity.", "error");
          return { success: false, error: err?.message };
        }
      }

      // Guest cart update
      const guestItems = loadGuestCartFromStorage();
      const targetId = itemIdOrBookId.replace(/^guest-/, "");
      const idx = guestItems.findIndex((i) => i.bookId === targetId || `guest-${i.bookId}` === itemIdOrBookId);

      if (idx > -1) {
        if (newQuantity <= 0) {
          guestItems.splice(idx, 1);
        } else {
          const maxStock = guestItems[idx].stock !== undefined ? guestItems[idx].stock! : 999;
          if (newQuantity > maxStock) {
            showToast(`Maximum available stock is ${maxStock} copies.`, "error");
            return { success: false, error: "Exceeds stock" };
          }
          guestItems[idx].quantity = newQuantity;
        }
        saveGuestCartToStorage(guestItems);
        syncFromGuestStorage();
        return { success: true };
      }

      return { success: false, error: "Item not found in guest cart." };
    },
    [isAuthenticated, refreshCart, showToast, syncFromGuestStorage]
  );

  // Remove Item
  const removeItem = useCallback(
    async (itemIdOrBookId: string): Promise<{ success: boolean; error?: string }> => {
      if (isAuthenticated) {
        try {
          const res = await serverRemoveCartItem(itemIdOrBookId);
          if (res.success) {
            await refreshCart();
            showToast("Item removed from cart");
            return { success: true };
          }
          showToast(res.error || "Failed to remove item.", "error");
          return { success: false, error: res.error };
        } catch (err: any) {
          showToast(err?.message || "Failed to remove item.", "error");
          return { success: false, error: err?.message };
        }
      }

      // Guest cart remove
      const guestItems = loadGuestCartFromStorage();
      const targetId = itemIdOrBookId.replace(/^guest-/, "");
      const filtered = guestItems.filter(
        (i) => i.bookId !== targetId && `guest-${i.bookId}` !== itemIdOrBookId
      );
      saveGuestCartToStorage(filtered);
      syncFromGuestStorage();
      showToast("Item removed from cart");
      return { success: true };
    },
    [isAuthenticated, refreshCart, showToast, syncFromGuestStorage]
  );

  // Clear Cart
  const clearCart = useCallback(async () => {
    if (isAuthenticated) {
      await serverClearCustomerCart();
      await refreshCart();
    } else {
      localStorage.removeItem(GUEST_CART_KEY);
      setItems([]);
    }
  }, [isAuthenticated, refreshCart]);

  const isInCart = useCallback(
    (bookId: string): boolean => {
      return items.some((i) => i.bookId === bookId);
    },
    [items]
  );

  const getItemQuantity = useCallback(
    (bookId: string): number => {
      const item = items.find((i) => i.bookId === bookId);
      return item ? item.quantity : 0;
    },
    [items]
  );

  // Computed summary
  const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  const platformFee = items.length > 0 ? PLATFORM_FEE : 0;
  const deliveryFee = items.length > 0 ? DELIVERY_FEE : 0;
  const totalAmount = subtotal + platformFee + deliveryFee;

  return (
    <CartContext.Provider
      value={{
        items,
        itemCount,
        subtotal,
        platformFee,
        deliveryFee,
        totalAmount,
        isLoading,
        isAuthenticated,
        toast,
        addItem,
        updateQuantity,
        removeItem,
        clearCart,
        refreshCart,
        isInCart,
        getItemQuantity,
        dismissToast,
      }}
    >
      {children}
      {/* Global Shopping Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-xl shadow-2xl flex items-center space-x-3 text-xs md:text-sm font-medium transition-all duration-300 transform translate-y-0 ${
            toast.type === "success"
              ? "bg-[#161616] border border-[var(--color-primary-gold)] text-white"
              : "bg-red-950/90 border border-red-700 text-red-200"
          }`}
        >
          <span>{toast.message}</span>
          <button
            onClick={dismissToast}
            className="text-neutral-400 hover:text-white cursor-pointer ml-2"
            aria-label="Dismiss notification"
          >
            ✕
          </button>
        </div>
      )}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
