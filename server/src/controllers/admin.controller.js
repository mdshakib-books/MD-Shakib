import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import adminService from "../services/admin.service.js";

// ================= BOOKS =================

export const createBook = asyncHandler(async (req, res) => {
    const localImagePath = req.file?.path;
    const book = await adminService.createBook(req.body, localImagePath);
    return res
        .status(201)
        .json(new ApiResponse(201, book, "Book created successfully"));
});

export const updateBook = asyncHandler(async (req, res) => {
    const localImagePath = req.file?.path;
    const book = await adminService.updateBook(
        req.params.id,
        req.body,
        localImagePath,
    );

    return res
        .status(200)
        .json(new ApiResponse(200, book, "Book updated successfully"));
});

export const deleteBook = asyncHandler(async (req, res) => {
    const book = await adminService.deleteBook(req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, book, "Book softly deleted successfully"));
});

export const updateBookStock = asyncHandler(async (req, res) => {
    const book = await adminService.updateBookStock(
        req.params.id,
        req.body.stock,
    );
    return res
        .status(200)
        .json(new ApiResponse(200, book, "Book stock updated"));
});

export const getAllBooksAdmin = asyncHandler(async (req, res) => {
    const data = await adminService.getAllBooksAdmin(req);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Books retrieved successfully"));
});

export const getBookByIdAdmin = asyncHandler(async (req, res) => {
    const book = await adminService.getBookByIdAdmin(req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, book, "Book retrieved successfully"));
});

// ================= ORDERS =================

export const getAllOrders = asyncHandler(async (req, res) => {
    const data = await adminService.getAllOrders(req);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Orders retrieved successfully"));
});

export const getOrderById = asyncHandler(async (req, res) => {
    const order = await adminService.getOrderById(req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, order, "Order retrieved successfully"));
});

export const updateOrderStatus = asyncHandler(async (req, res) => {
    const order = await adminService.updateOrderStatus(
        req.params.id,
        req.body.status,
    );
    return res
        .status(200)
        .json(new ApiResponse(200, order, "Order status updated"));
});

export const cancelOrderByAdmin = asyncHandler(async (req, res) => {
    const order = await adminService.cancelOrderByAdmin(req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, order, "Order cancelled by admin"));
});

// ================= USERS =================

export const getAllUsers = asyncHandler(async (req, res) => {
    const data = await adminService.getAllUsers(req);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Users retrieved successfully"));
});

export const getUserById = asyncHandler(async (req, res) => {
    const user = await adminService.getUserById(req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, user, "User retrieved successfully"));
});

export const blockUser = asyncHandler(async (req, res) => {
    const user = await adminService.blockUser(req.params.id, req.user._id);
    return res
        .status(200)
        .json(new ApiResponse(200, user, "User blocked successfully"));
});

export const unblockUser = asyncHandler(async (req, res) => {
    const user = await adminService.unblockUser(req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, user, "User unblocked successfully"));
});

// ================= DASHBOARD =================

export const getDashboardStats = asyncHandler(async (req, res) => {
    const stats = await adminService.getDashboardStats();
    return res
        .status(200)
        .json(new ApiResponse(200, stats, "Dashboard stats retrieved"));
});

export const getSalesAnalytics = asyncHandler(async (req, res) => {
    const analytics = await adminService.getSalesAnalytics();
    return res
        .status(200)
        .json(new ApiResponse(200, analytics, "Sales analytics retrieved"));
});
