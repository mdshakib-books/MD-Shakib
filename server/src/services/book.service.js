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
        const { page, limit, skip } = parseQueryParams(req);
        const searchQuery = (req.query.query || req.query.q || "").trim();

        // If no search query provided, return all books
        if (!searchQuery) {
            return this.getAllBooks(req);
        }

        const filter = {
            isActive: true,
        };

        if (req.query.category) {
            filter.category = req.query.category;
        }

        // Use regex search for partial matching (case-insensitive)
        // MongoDB text search won't match partial words like "Dee" in "Deep Work"
        const regexPattern = new RegExp(searchQuery, "i");
        const regexFilter = {
            ...filter,
            $or: [
                { title: regexPattern },
                { author: regexPattern },
                { description: regexPattern },
                { category: regexPattern },
            ],
        };

        let books = [];
        let total = 0;

        [books, total] = await Promise.all([
            Book.find(regexFilter).skip(skip).limit(limit).lean(),
            Book.countDocuments(regexFilter),
        ]);

        // Return in format expected by frontend
        const totalPages = Math.ceil(total / limit);
        console.log(
            `Search Query: "${searchQuery}" | Results: ${total} | Page: ${page}/${totalPages}`,
        );
        return {
            books,
            total,
            totalPages,
            page,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        };
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
