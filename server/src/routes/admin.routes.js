import { Router } from "express";
import {
    createBook,
    updateBook,
    deleteBook,
    updateBookStock,
    getAllBooksAdmin,
    getBookByIdAdmin,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    cancelOrderByAdmin,
    getAllUsers,
    getUserById,
    blockUser,
    unblockUser,
    getDashboardStats,
    getSalesAnalytics,
} from "../controllers/admin.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { isAdmin } from "../middlewares/role.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { upload } from "../middlewares/multer.middleware.js";
import {
    createBookSchema,
    updateBookSchema,
    updateStockSchema,
    updateOrderStatusSchema,
    blockUserSchema,
} from "../utils/admin.validation.js";

const router = Router();

// Secure all admin routes
router.use(verifyJWT, isAdmin);

// ================= BOOKS =================
router.post(
    "/books",
    upload.single("image"),
    validate(createBookSchema),
    createBook,
);
router.get("/books", getAllBooksAdmin);
router.get("/books/:id", getBookByIdAdmin);
router.patch(
    "/books/:id",
    upload.single("image"),
    validate(updateBookSchema),
    updateBook,
);
router.delete("/books/:id", deleteBook);
router.patch("/books/:id/stock", validate(updateStockSchema), updateBookStock);

// ================= ORDERS =================
router.get("/orders", getAllOrders);
router.get("/orders/:id", getOrderById);
router.patch(
    "/orders/:id/status",
    validate(updateOrderStatusSchema),
    updateOrderStatus,
);
router.patch("/orders/:id/cancel", cancelOrderByAdmin);

// ================= USERS =================
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id/block", validate(blockUserSchema), blockUser);
router.patch("/users/:id/unblock", unblockUser);

// ================= DASHBOARD =================
router.get("/dashboard/stats", getDashboardStats);
router.get("/dashboard/sales", getSalesAnalytics);

export default router;
