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
};
