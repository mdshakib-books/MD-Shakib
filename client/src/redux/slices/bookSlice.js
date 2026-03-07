import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import { bookService } from "../../services/bookService";

export const fetchBooks = createAsyncThunk(
    "books/fetchBooks",
    async (params, { rejectWithValue }) => {
        try {
            const data = await bookService.getBooks(params);
            // bookService.getBooks returns: data.items || data (from API)
            // So `data` is already an array OR has a .books/.items key
            return data;
        } catch (err) {
            return rejectWithValue(err.response?.data || err.message);
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
                state.error = null; // Clear stale errors on new fetch
            })
            .addCase(fetchBooks.fulfilled, (state, action) => {
                state.loading = false;
                const payload = action.payload;
                // Handle all possible shapes:
                // 1. Already an array (bookService extracted .items)
                // 2. { items: [...] } — paginated wrapper
                // 3. { books: [...] } — alternative shape
                if (Array.isArray(payload)) {
                    state.items = payload;
                } else if (Array.isArray(payload?.items)) {
                    state.items = payload.items;
                } else if (Array.isArray(payload?.books)) {
                    state.items = payload.books;
                } else {
                    state.items = [];
                }
            })
            .addCase(fetchBooks.rejected, (state, action) => {
                state.loading = false;
                state.error = action.payload;
            });
    },
});

export default bookSlice.reducer;
