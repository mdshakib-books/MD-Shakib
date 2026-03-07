import { useRef, useCallback } from "react";
import { useSelector, useDispatch } from "react-redux";
import {
    fetchCart,
    addGuestItem,
    removeGuestItem,
    updateGuestItem,
    updateItemOptimistic,
    removeItemOptimistic,
    setItems,
} from "../redux/slices/cartSlice";
import { cartService } from "../services/cartService";

const DEBOUNCE_MS = 500;

export const useCart = () => {
    const dispatch = useDispatch();
    const { items, guestItems, loading, error } = useSelector(
        (state) => state.cart,
    );
    const user = useSelector((state) => state.auth.user);
    const isLoggedIn = !!user;

    // Unified cart object
    const cart = { items: isLoggedIn ? items : guestItems };

    const loadCart = useCallback(() => {
        if (isLoggedIn) dispatch(fetchCart());
    }, [dispatch, isLoggedIn]);

    // ── Add to cart ──────────────────────────────────────────────────────────
    const addToCart = async (book, qty = 1) => {
        if (isLoggedIn) {
            // For logged-in users: call API, then set returned items directly
            const updated = await cartService.addToCart(
                book.bookId || book._id,
                qty,
            );
            if (updated?.items) dispatch(setItems(updated.items));
        } else {
            dispatch(
                addGuestItem({
                    bookId: book.bookId || book._id,
                    title: book.title,
                    price: book.price,
                    imageUrl: book.image || book.imageUrl || book.coverImage,
                    quantity: qty,
                }),
            );
        }
    };

    // ── Remove from cart ─────────────────────────────────────────────────────
    const removeFromCart = async (bookId) => {
        if (isLoggedIn) {
            // 1. Optimistic: remove from Redux immediately → no loader flash
            dispatch(removeItemOptimistic(bookId));
            try {
                const updated = await cartService.removeFromCart(bookId);
                // 2. Reconcile with server response
                if (updated?.items) dispatch(setItems(updated.items));
            } catch {
                // Rollback: re-fetch on error
                dispatch(fetchCart());
            }
        } else {
            dispatch(removeGuestItem(bookId));
        }
    };

    // ── Debounced quantity update ─────────────────────────────────────────────
    // Each bookId gets its own debounce timer stored in a ref.
    const debounceTimers = useRef({});

    const updateQuantity = useCallback(
        (bookId, quantity) => {
            if (quantity <= 0) {
                removeFromCart(bookId);
                return;
            }

            if (!isLoggedIn) {
                // Guest: update Redux (localStorage) immediately — done
                dispatch(updateGuestItem({ bookId, quantity }));
                return;
            }

            // Logged-in:
            // 1. Optimistic update — UI reflects change INSTANTLY, no loader
            dispatch(updateItemOptimistic({ bookId, quantity }));

            // 2. Debounce the API call so rapid +/- clicks only fire once
            if (debounceTimers.current[bookId]) {
                clearTimeout(debounceTimers.current[bookId]);
            }

            debounceTimers.current[bookId] = setTimeout(async () => {
                try {
                    const updated = await cartService.updateCartItem(
                        bookId,
                        quantity,
                    );
                    // 3. Reconcile with actual server state silently
                    if (updated?.items) dispatch(setItems(updated.items));
                } catch {
                    // Rollback on error
                    dispatch(fetchCart());
                }
            }, DEBOUNCE_MS);
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [isLoggedIn, dispatch],
    );

    return {
        cart,
        loading,
        error,
        isLoggedIn,
        addToCart,
        removeFromCart,
        updateQuantity,
        fetchCart: loadCart,
    };
};
