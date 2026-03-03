import { Router } from "express";
import {
    getAllBooks,
    getBookById,
    searchBooks,
    getBooksByCategory,
    getFeaturedBooks,
    getRelatedBooks,
} from "../controllers/book.controller.js";
import { validate } from "../middlewares/validate.middleware.js";
import { searchSchema } from "../utils/book.validation.js";

const router = Router();

// Public routes - no auth middleware
router.get("/", validate(searchSchema), getAllBooks);
router.get("/search", validate(searchSchema), searchBooks);
router.get("/featured", getFeaturedBooks);
router.get("/category/:category", validate(searchSchema), getBooksByCategory);
router.get("/:id", getBookById);
router.get("/:id/related", getRelatedBooks);

export default router;
