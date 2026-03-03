import Book from "../models/book.model.js";
import Order from "../models/order.model.js";
import User from "../models/user.model.js";
import {
    uploadOnCloudinary,
    deleteFromCloudinary,
} from "../utils/cloudinary.util.js";
import { ApiError } from "../utils/ApiError.js";
import {
    getPaginationOptions,
    buildPaginatedResponse,
} from "../utils/pagination.js";
import {
    ORDER_STATUS_TRANSITIONS,
    DASHBOARD_CONFIG,
} from "../utils/admin.constants.js";
import {
    revenueAggregationPipeline,
    monthlyRevenuePipeline,
    topSellingBooksPipeline,
} from "../utils/dashboard.utils.js";

class AdminService {
    // ================= BOOKS =================

    async createBook(bookData, localImagePath) {
        if (!localImagePath && !bookData.imageUrl) {
            throw new ApiError(400, "Book image is required.");
        }

        let imageUrl = bookData.imageUrl;

        // If a file was uploaded, bounce it up to Cloudinary
        if (localImagePath) {
            imageUrl = await uploadOnCloudinary(localImagePath, "books");
            if (!imageUrl) {
                throw new ApiError(
                    500,
                    "Failed to upload book image securely.",
                );
            }
        }

        const book = await Book.create({
            ...bookData,
            imageUrl,
        });

        return book;
    }

    async updateBook(bookId, updateData, localImagePath) {
        const book = await Book.findById(bookId);
        if (!book) throw new ApiError(404, "Book not found");

        // If a new image was passed, upload it and delete the old one
        if (localImagePath) {
            const newImageUrl = await uploadOnCloudinary(
                localImagePath,
                "books",
            );
            if (newImageUrl) {
                // Background process: delete the old image passively
                if (book.imageUrl) {
                    deleteFromCloudinary(book.imageUrl).catch((err) =>
                        console.error("Could not delete old image", err),
                    );
                }
                updateData.imageUrl = newImageUrl;
            }
        }

        Object.assign(book, updateData);
        await book.save();
        return book;
    }

    async deleteBook(bookId) {
        const book = await Book.findByIdAndUpdate(
            bookId,
            { isActive: false },
            { new: true },
        );
        if (!book) throw new ApiError(404, "Book not found");
        return book;
    }

    async updateBookStock(bookId, newStock) {
        const book = await Book.findByIdAndUpdate(
            bookId,
            { stock: newStock },
            { new: true, runValidators: true },
        );
        if (!book) throw new ApiError(404, "Book not found");
        return book;
    }

    async getAllBooksAdmin(req) {
        const { page, limit, skip, sort } = getPaginationOptions(req);

        // Admin can see both active and inactive books. Add optional filtering
        const filter = {};
        if (req.query.status === "active") filter.isActive = true;
        if (req.query.status === "inactive") filter.isActive = false;

        const [books, total] = await Promise.all([
            Book.find(filter).sort(sort).skip(skip).limit(limit),
            Book.countDocuments(filter),
        ]);

        return buildPaginatedResponse(books, total, page, limit);
    }

    async getBookByIdAdmin(bookId) {
        const book = await Book.findById(bookId);
        if (!book) throw new ApiError(404, "Book not found");
        return book;
    }

    // ================= ORDERS =================

    async getAllOrders(req) {
        const { page, limit, skip, sort } = getPaginationOptions(req);

        // Filter by exact status if provided
        const filter = {};
        if (req.query.status) {
            filter.orderStatus = req.query.status;
        }

        const [orders, total] = await Promise.all([
            Order.find(filter)
                .sort(sort)
                .skip(skip)
                .limit(limit)
                .populate("userId", "name email"),
            Order.countDocuments(filter),
        ]);

        return buildPaginatedResponse(orders, total, page, limit);
    }

    async getOrderById(orderId) {
        const order = await Order.findById(orderId).populate(
            "userId",
            "name email",
        );
        if (!order) throw new ApiError(404, "Order not found");
        return order;
    }

    async updateOrderStatus(orderId, newStatus) {
        const order = await Order.findById(orderId);
        if (!order) throw new ApiError(404, "Order not found");

        const currentStatus = order.orderStatus;
        const allowedTransitions =
            ORDER_STATUS_TRANSITIONS[currentStatus] || [];

        if (!allowedTransitions.includes(newStatus)) {
            throw new ApiError(
                400,
                `Cannot transition order status from ${currentStatus} to ${newStatus}`,
            );
        }

        order.orderStatus = newStatus;
        if (newStatus === "Delivered") order.deliveredAt = new Date();

        await order.save();
        return order;
    }

    async cancelOrderByAdmin(orderId) {
        const order = await Order.findById(orderId);
        if (!order) throw new ApiError(404, "Order not found");

        if (
            ["Delivered", "Cancelled", "Returned"].includes(order.orderStatus)
        ) {
            throw new ApiError(400, `Order is already ${order.orderStatus}`);
        }

        // Here you would optimally run MongoDB sessions/transactions to restore book stock
        // as well as trigger refund mechanisms if paymentStatus was 'Paid'

        // Simulate stock restore
        const stockUpdatePromises = order.items.map((item) => {
            return Book.updateOne(
                { _id: item.bookId },
                { $inc: { stock: item.quantity } },
            );
        });

        await Promise.all(stockUpdatePromises);

        order.orderStatus = "Cancelled";

        if (order.paymentStatus === "Paid") {
            // Logic to initiate refund via payment provider goes here
            order.paymentStatus = "Refunded";
        }

        await order.save();
        return order;
    }

    // ================= USERS =================

    async getAllUsers(req) {
        const { page, limit, skip, sort } = getPaginationOptions(req);

        const filter = {};
        if (req.query.role) filter.role = req.query.role;
        if (req.query.blocked) filter.isBlocked = req.query.blocked === "true";

        const [users, total] = await Promise.all([
            User.find(filter)
                .select("-password")
                .sort(sort)
                .skip(skip)
                .limit(limit),
            User.countDocuments(filter),
        ]);

        return buildPaginatedResponse(users, total, page, limit);
    }

    async getUserById(userId) {
        const user = await User.findById(userId).select("-password");
        if (!user) throw new ApiError(404, "User not found");
        return user;
    }

    async blockUser(userId, adminId) {
        if (userId.toString() === adminId.toString()) {
            throw new ApiError(403, "Admin cannot block themselves");
        }

        const user = await User.findByIdAndUpdate(
            userId,
            { isBlocked: true },
            { new: true },
        ).select("-password");

        if (!user) throw new ApiError(404, "User not found");
        return user;
    }

    async unblockUser(userId) {
        const user = await User.findByIdAndUpdate(
            userId,
            { isBlocked: false },
            { new: true },
        ).select("-password");

        if (!user) throw new ApiError(404, "User not found");
        return user;
    }

    // ================= DASHBOARD =================

    async getDashboardStats() {
        const [totalUsers, totalOrders, revenueMetrics] = await Promise.all([
            User.countDocuments({ role: "user" }), // only standard users
            Order.countDocuments(),
            Order.aggregate(revenueAggregationPipeline()),
        ]);

        const totalRevenue =
            revenueMetrics.length > 0 ? revenueMetrics[0].totalRevenue : 0;

        return {
            totalUsers,
            totalOrders,
            totalRevenue,
        };
    }

    async getSalesAnalytics() {
        const [monthlyRevenue, topSellingBooks] = await Promise.all([
            Order.aggregate(monthlyRevenuePipeline()),
            Order.aggregate(
                topSellingBooksPipeline(DASHBOARD_CONFIG.TOP_SELLING_LIMIT),
            ),
        ]);

        return {
            monthlyRevenue,
            topSellingBooks,
        };
    }
}

export default new AdminService();
