import Book from "../models/book.model.js";
import { ApiError } from "../utils/ApiError.js";
import { buildPaginatedResponse } from "../utils/pagination.js";
import { parseQueryParams } from "../utils/queryParser.js";

class BookService {
    async getAllBooks(req) {
        const { page, limit, skip, sort, minPrice, maxPrice } =
            parseQueryParams(req);

        const filter = { isActive: true };

        if (req.query.category) {
            filter.category = req.query.category;
        }

        if (minPrice !== undefined && !isNaN(minPrice)) {
            filter.price = { ...filter.price, $gte: minPrice };
        }
        if (maxPrice !== undefined && !isNaN(maxPrice)) {
            filter.price = { ...filter.price, $lte: maxPrice };
        }

        const [books, total] = await Promise.all([
            Book.find(filter).sort(sort).skip(skip).limit(limit).lean(),
            Book.countDocuments(filter),
        ]);

        return buildPaginatedResponse(books, total, page, limit);
    }

    async getBookById(bookId) {
        const book = await Book.findOne({ _id: bookId, isActive: true }).lean();
        if (!book)
            throw new ApiError(404, "Book not found or is currently inactive");
        return book;
    }

    async searchBooks(req) {
        const { page, limit, skip, sort } = parseQueryParams(req);
        const searchQuery = req.query.q;

        if (!searchQuery) {
            return this.getAllBooks(req); // Fallback if search query is empty
        }

        const filter = {
            isActive: true,
            $text: { $search: searchQuery },
        };

        if (req.query.category) {
            filter.category = req.query.category;
        }

        // Default text search sorting by relevance score if no explicit sort
        let searchSort = req.query.sort
            ? sort
            : { score: { $meta: "textScore" } };

        const [books, total] = await Promise.all([
            Book.find(filter, { score: { $meta: "textScore" } })
                .sort(searchSort)
                .skip(skip)
                .limit(limit)
                .lean(),
            Book.countDocuments(filter),
        ]);

        return buildPaginatedResponse(books, total, page, limit);
    }

    async getBooksByCategory(category, req) {
        req.query.category = category; // Inject for reuse
        return this.getAllBooks(req);
    }

    async getFeaturedBooks() {
        // Simple featured books logic (e.g. 8 newest active books)
        return await Book.find({ isActive: true })
            .sort({ createdAt: -1 })
            .limit(8)
            .lean();
    }

    async getRelatedBooks(bookId) {
        const currentBook = await Book.findById(bookId).lean();
        if (!currentBook) throw new ApiError(404, "Book not found");

        const relatedBooks = await Book.find({
            isActive: true,
            _id: { $ne: bookId },
            category: currentBook.category,
        })
            .sort({ createdAt: -1 }) // Or use random sample aggregation
            .limit(5)
            .lean();

        return relatedBooks;
    }
}

export default new BookService();
