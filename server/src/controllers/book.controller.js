import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import bookService from "../services/book.service.js";

export const getAllBooks = asyncHandler(async (req, res) => {
    const data = await bookService.getAllBooks(req);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Books retrieved successfully"));
});

export const getBookById = asyncHandler(async (req, res) => {
    const book = await bookService.getBookById(req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, book, "Book retrieved successfully"));
});

export const searchBooks = asyncHandler(async (req, res) => {
    const data = await bookService.searchBooks(req);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Search completed successfully"));
});

export const getBooksByCategory = asyncHandler(async (req, res) => {
    const data = await bookService.getBooksByCategory(req.params.category, req);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Books retrieved for category"));
});

export const getFeaturedBooks = asyncHandler(async (req, res) => {
    const books = await bookService.getFeaturedBooks();
    return res
        .status(200)
        .json(new ApiResponse(200, books, "Featured books retrieved"));
});

export const getRelatedBooks = asyncHandler(async (req, res) => {
    const books = await bookService.getRelatedBooks(req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, books, "Related books retrieved"));
});
