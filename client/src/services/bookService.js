import api from "../api/axios";

export const bookService = {
    getBooks: async (params = {}) => {
        const response = await api.get("/books", { params });
        return response.data.data.items || response.data.data;
    },
    getBookById: async (id) => {
        const response = await api.get(`/books/${id}`);
        return response.data.data;
    },
    searchBooks: async (query = "", category = "", page = 1, limit = 12) => {
        const params = {
            query: query.trim(),
            category,
            page,
            limit,
        };
        console.log(
            "bookService.searchBooks - Sending request with params:",
            params,
        );
        const response = await api.get("/books/search", { params });
        console.log("bookService.searchBooks - Response:", response.data.data);
        return response.data.data;
    },
};
