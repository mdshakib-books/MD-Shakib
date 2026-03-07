import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { cartService } from "../../services/cartService";

const GUEST_CART_KEY = "guest_cart";

// ─── Helpers ────────────────────────────────────────────────────────────────

const loadFromStorage = () => {
    try {
        const raw = localStorage.getItem(GUEST_CART_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch {
        return [];
    }
};

const saveToStorage = (items) => {
    try {
        localStorage.setItem(GUEST_CART_KEY, JSON.stringify(items));
    } catch {
        // localStorage might be unavailable in some environments
    }
};

// ─── Async Thunks ────────────────────────────────────────────────────────────

export const fetchCart = createAsyncThunk(
    "cart/fetchCart",
    async (_, { rejectWithValue }) => {
        try {
            return await cartService.getCart();
        } catch (err) {
            return rejectWithValue(err.response?.data);
        }
    },
);

export const mergeGuestCart = createAsyncThunk(
    "cart/mergeGuestCart",
    async (_, { getState, rejectWithValue, dispatch }) => {
        try {
            const guestItems = getState().cart.guestItems;
            if (guestItems.length === 0) return null;
            const merged = await cartService.mergeCart(guestItems);
            return merged;
        } catch (err) {
            return rejectWithValue(err.response?.data);
        }
    },
);

// ─── Slice ───────────────────────────────────────────────────────────────────

const cartSlice = createSlice({
    name: "cart",
    initialState: {
        items: [], // DB cart (logged-in users)
        guestItems: loadFromStorage(), // localStorage guest cart
        loading: false,
        error: null,
    },
    reducers: {
        // Guest cart actions (all synchronous, persisted to localStorage)

        addGuestItem: (state, action) => {
            const {
                bookId,
                title,
                price,
                image,
                imageUrl,
                quantity = 1,
            } = action.payload;
            const idx = state.guestItems.findIndex((i) => i.bookId === bookId);

            if (idx > -1) {
                state.guestItems[idx].quantity += quantity;
            } else {
                state.guestItems.push({
                    bookId,
                    title,
                    price,
                    imageUrl: imageUrl || image,
                    quantity,
                });
            }
            saveToStorage(state.guestItems);
        },

        removeGuestItem: (state, action) => {
            state.guestItems = state.guestItems.filter(
                (i) => i.bookId !== action.payload,
            );
            saveToStorage(state.guestItems);
        },

        updateGuestItem: (state, action) => {
            const { bookId, quantity } = action.payload;
            const idx = state.guestItems.findIndex((i) => i.bookId === bookId);

            if (idx > -1) {
                if (quantity <= 0) {
                    state.guestItems.splice(idx, 1);
                } else {
                    state.guestItems[idx].quantity = quantity;
                }
            }
            saveToStorage(state.guestItems);
        },

        clearGuestCart: (state) => {
            state.guestItems = [];
            localStorage.removeItem(GUEST_CART_KEY);
        },

        loadGuestCart: (state) => {
            state.guestItems = loadFromStorage();
        },

        // ── Optimistic update reducers for DB cart (logged-in users) ──────────
        // These update `items` instantly so that NO loader is shown during
        // mutations. The API call then reconciles the real server state silently.

        updateItemOptimistic: (state, action) => {
            const { bookId, quantity } = action.payload;
            const idx = state.items.findIndex(
                (i) => (i.bookId?._id || i.bookId)?.toString() === bookId,
            );
            if (idx > -1) {
                state.items[idx].quantity = quantity;
            }
        },

        removeItemOptimistic: (state, action) => {
            const bookId = action.payload;
            state.items = state.items.filter(
                (i) => (i.bookId?._id || i.bookId)?.toString() !== bookId,
            );
        },

        // Set cart items directly (used after background sync)
        setItems: (state, action) => {
            state.items = action.payload || [];
        },
    },
    extraReducers: (builder) => {
        builder
            // fetchCart
            .addCase(fetchCart.pending, (state) => {
                state.loading = true;
                state.error = null;
            })
            .addCase(fetchCart.fulfilled, (state, action) => {
                state.loading = false;
                state.items = action.payload?.items || [];
            })
            .addCase(fetchCart.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            })
            // mergeGuestCart
            .addCase(mergeGuestCart.fulfilled, (state, action) => {
                if (action.payload) {
                    state.items = action.payload.items || [];
                }
                // Clear guest cart after successful merge
                state.guestItems = [];
                localStorage.removeItem(GUEST_CART_KEY);
            });
    },
});

export const {
    addGuestItem,
    removeGuestItem,
    updateGuestItem,
    clearGuestCart,
    loadGuestCart,
    updateItemOptimistic,
    removeItemOptimistic,
    setItems,
} = cartSlice.actions;

export default cartSlice.reducer;
