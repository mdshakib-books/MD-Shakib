import { Router } from "express";
import {
    createBook,
    updateBook,
    deleteBook,
    updateBookStock,
    getAllBooksAdmin,
    getBookByIdAdmin,
    setCoverImage,
    deleteBookImage,
    getAllOrders,
    getOrderById,
    updateOrderStatus,
    cancelOrderByAdmin,
    createShipment,
    approveReplacement,
    rejectReplacement,
    getAllUsers,
    getUserById,
    blockUser,
    unblockUser,
    deleteUser,
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
    rejectReplacementSchema,
} from "../utils/admin.validation.js";

const router = Router();

// Secure all admin routes
router.use(verifyJWT, isAdmin);

// ================= BOOKS =================
router.post(
    "/books",
    upload.array("images", 5), // Support up to 5 images
    validate(createBookSchema),
    createBook,
);
router.get("/books", getAllBooksAdmin);
router.get("/books/:id", getBookByIdAdmin);
router.patch(
    "/books/:id",
    upload.array("images", 5),
    validate(updateBookSchema),
    updateBook,
);
router.delete("/books/:id", deleteBook);
router.patch("/books/:id/stock", validate(updateStockSchema), updateBookStock);
router.patch("/books/:id/cover", setCoverImage);
router.delete("/books/:id/image", deleteBookImage);

// ================= ORDERS =================
router.get("/orders", getAllOrders);
router.get("/orders/:id", getOrderById);
router.patch(
    "/orders/:id/status",
    validate(updateOrderStatusSchema),
    updateOrderStatus,
);
router.patch("/orders/:id/cancel", cancelOrderByAdmin);
router.post("/orders/:id/shipment", createShipment);
router.post("/orders/:id/replacement/approve", approveReplacement);
router.post(
    "/orders/:id/replacement/reject",
    validate(rejectReplacementSchema),
    rejectReplacement,
);

// ================= USERS =================
router.get("/users", getAllUsers);
router.get("/users/:id", getUserById);
router.patch("/users/:id/block", validate(blockUserSchema), blockUser);
router.patch("/users/:id/unblock", unblockUser);
router.delete("/users/:id", deleteUser);

// ================= DASHBOARD =================
router.get("/dashboard/stats", getDashboardStats);
router.get("/dashboard/sales", getSalesAnalytics);

export default router;
