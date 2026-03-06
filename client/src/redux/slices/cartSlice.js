import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { cartService } from "../../services/cartService";

export const fetchCart = createAsyncThunk(
    "cart/fetchCart",
    async (_, { rejectWithValue }) => {
        try {
            const data = await cartService.getCart();
            return data;
        } catch (err) {
            return rejectWithValue(err.response.data);
        }
    },
);

const cartSlice = createSlice({
    name: "cart",
    initialState: {
        items: [],
        loading: false,
        error: null,
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchCart.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchCart.fulfilled, (state, action) => {
                state.loading = false;
                state.items = action.payload.items || [];
            })
            .addCase(fetchCart.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export default cartSlice.reducer;
