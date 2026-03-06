import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { bookService } from "../../services/bookService";

export const fetchBooks = createAsyncThunk(
    "books/fetchBooks",
    async (params, { rejectWithValue }) => {
        try {
            const data = await bookService.getBooks(params);
            return data;
        } catch (err) {
            return rejectWithValue(err.response.data);
        }
    },
);

const bookSlice = createSlice({
    name: "books",
    initialState: {
        items: [],
        loading: false,
        error: null,
    },
    reducers: {},
    extraReducers: (builder) => {
        builder
            .addCase(fetchBooks.pending, (state) => {
                state.loading = true;
            })
            .addCase(fetchBooks.fulfilled, (state, action) => {
                state.loading = false;
                state.items = action.payload.books || action.payload;
            })
            .addCase(fetchBooks.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export default bookSlice.reducer;
