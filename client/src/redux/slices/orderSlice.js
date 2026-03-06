import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { orderService } from "../../services/orderService";

export const fetchOrders = createAsyncThunk(
    "orders/fetchOrders",
    async (_, { rejectWithValue }) => {
        try {
            const data = await orderService.getOrders();
            return data;
        } catch (err) {
            return rejectWithValue(err.response.data);
        }
    },
);

const orderSlice = createSlice({
    name: "orders",
    initialState: {
        items: [],
        loading: false,
        error: null,
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchOrders.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchOrders.fulfilled, (state, action) => {
                state.loading = false;
                state.items = action.payload.orders || action.payload;
            })
            .addCase(fetchOrders.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export default orderSlice.reducer;
