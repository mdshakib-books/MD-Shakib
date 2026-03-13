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
import delhiveryService from "./delhivery.service.js";
import {
    ORDER_STATUS,
    PAYMENT_METHODS,
    normalizePaymentMethod,
} from "../utils/order.constants.js";
import {
    emitOrderStatusUpdated,
    emitPaymentUpdated,
    emitReplacementUpdated,
} from "../sockets/order.socket.js";
import {
    revenueAggregationPipeline,
    monthlyRevenuePipeline,
    topSellingBooksPipeline,
} from "../utils/dashboard.utils.js";
import { PAYMENT_STATUS } from "../utils/payment.constants.js";

class AdminService {
    normalizeOptionalBookFields(input = {}) {
        const normalized = { ...input };

        const emptyToNull = (key) => {
            if (
                normalized[key] === "" ||
                normalized[key] === undefined ||
                normalized[key] === null
            ) {
                normalized[key] = null;
            }
        };

        emptyToNull("language");
        emptyToNull("publisher");
        emptyToNull("publishedDate");
        emptyToNull("pages");

        if (normalized.pages !== null) {
            normalized.pages = Number(normalized.pages);
        }
        if (normalized.discount !== undefined) {
            normalized.discount = Number(normalized.discount);
        }
        if (normalized.price !== undefined) {
            normalized.price = Number(normalized.price);
        }
        if (normalized.stock !== undefined) {
            normalized.stock = Number(normalized.stock);
        }

        return normalized;
    }

    // ================= BOOKS =================

    async createBook(bookData, localFilePaths) {
        // Support both single file (req.file) and multiple (req.files)
        const paths = Array.isArray(localFilePaths)
            ? localFilePaths
            : localFilePaths
              ? [localFilePaths]
              : [];

        if (paths.length === 0 && !bookData.imageUrl) {
            throw new ApiError(400, "Book image is required.");
        }

        const uploadedUrls = [];
        for (const p of paths.slice(0, 5)) {
            const url = await uploadOnCloudinary(p, "books");
            if (url) uploadedUrls.push(url);
        }

        const coverImage = uploadedUrls[0] || bookData.imageUrl || "";
        const imageUrl = coverImage;

        const normalizedData = this.normalizeOptionalBookFields(bookData);

        const book = await Book.create({
            ...normalizedData,
            imageUrl,
            coverImage,
            images: uploadedUrls.length
                ? uploadedUrls
                : imageUrl
                  ? [imageUrl]
                  : [],
        });

        return book;
    }

    async updateBook(bookId, updateData, localFilePaths) {
        const book = await Book.findById(bookId);
        if (!book) throw new ApiError(404, "Book not found");

        const paths = Array.isArray(localFilePaths)
            ? localFilePaths
            : localFilePaths
              ? [localFilePaths]
              : [];

        if (paths.length > 0) {
            const currentCount = (book.images || []).length;
            const slots = Math.max(0, 5 - currentCount);
            const toUpload = paths.slice(0, slots);

            for (const p of toUpload) {
                const url = await uploadOnCloudinary(p, "books");
                if (url) book.images.push(url);
            }

            // Keep imageUrl and coverImage in sync
            if (!book.coverImage && book.images.length > 0) {
                book.coverImage = book.images[0];
                book.imageUrl = book.images[0];
            }
        }

        // Apply scalar updates
        const normalizedData = this.normalizeOptionalBookFields(updateData);
        const allowed = [
            "title",
            "author",
            "description",
            "category",
            "price",
            "stock",
            "discount",
            "language",
            "pages",
            "publisher",
            "publishedDate",
            "isActive",
        ];
        for (const key of allowed) {
            if (normalizedData[key] !== undefined) book[key] = normalizedData[key];
        }

        await book.save();
        return book;
    }

    async setCoverImage(bookId, imageUrl) {
        const book = await Book.findById(bookId);
        if (!book) throw new ApiError(404, "Book not found");
        if (!book.images.includes(imageUrl)) {
            throw new ApiError(400, "Image not found in book's image list");
        }
        book.coverImage = imageUrl;
        book.imageUrl = imageUrl;
        await book.save();
        return book;
    }

    async deleteBookImage(bookId, imageUrl) {
        const book = await Book.findById(bookId);
        if (!book) throw new ApiError(404, "Book not found");
        const idx = book.images.indexOf(imageUrl);
        if (idx === -1) throw new ApiError(404, "Image not found");
        if (book.images.length === 1) {
            throw new ApiError(400, "Cannot remove the only book image");
        }
        book.images.splice(idx, 1);
        deleteFromCloudinary(imageUrl).catch(console.error);
        // If removed image was cover, reassign
        if (book.coverImage === imageUrl) {
            book.coverImage = book.images[0];
            book.imageUrl = book.images[0];
        }
        await book.save();
        return book;
    }

    async deleteBook(bookId) {
        const book = await Book.findByIdAndUpdate(
            bookId,
            { isActive: false },
            { returnDocument: "after" },
        );
        if (!book) throw new ApiError(404, "Book not found");
        return book;
    }

    async updateBookStock(bookId, newStock) {
        const book = await Book.findByIdAndUpdate(
            bookId,
            { stock: newStock },
            { returnDocument: "after", runValidators: true },
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
        if (req.query.paymentStatus) {
            filter.paymentStatus = req.query.paymentStatus;
        }
        if (req.query.paymentMethod) {
            const normalized = normalizePaymentMethod(req.query.paymentMethod);
            if (normalized === PAYMENT_METHODS.ONLINE) {
                filter.paymentMethod = { $in: ["ONLINE", "Online"] };
            } else if (normalized === PAYMENT_METHODS.COD) {
                filter.paymentMethod = PAYMENT_METHODS.COD;
            }
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
                `Cannot transition order status from "${currentStatus}" to "${newStatus}"`,
            );
        }

        const normalizedPaymentMethod = normalizePaymentMethod(order.paymentMethod);
        if (
            newStatus === ORDER_STATUS.CONFIRMED &&
            normalizedPaymentMethod === PAYMENT_METHODS.ONLINE &&
            order.paymentStatus !== PAYMENT_STATUS.PAID
        ) {
            throw new ApiError(
                400,
                "Online prepaid orders can be confirmed only after successful payment",
            );
        }

        if (newStatus === ORDER_STATUS.SHIPPED) {
            const hasShipmentDetails = Boolean(
                order.shipping?.courier &&
                    order.shipping?.awb &&
                    order.shipping?.trackingUrl,
            );
            if (!hasShipmentDetails) {
                throw new ApiError(400, "Shipment information missing");
            }
        }

        order.orderStatus = newStatus;
        if (newStatus === ORDER_STATUS.DELIVERED) {
            const now = new Date();
            order.deliveredAt = now;
            if (!order.shipping) {
                order.shipping = {};
            }
            if (!order.shipping.deliveredAt) {
                order.shipping.deliveredAt = now;
            }
        }

        // Append to status audit trail
        if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
        order.statusHistory.push({ status: newStatus, timestamp: new Date() });

        let codPaymentSettled = false;
        if (
            newStatus === ORDER_STATUS.DELIVERED &&
            normalizedPaymentMethod === PAYMENT_METHODS.COD &&
            order.paymentStatus !== PAYMENT_STATUS.PAID
        ) {
            const paidAt = new Date();
            order.paymentStatus = PAYMENT_STATUS.PAID;
            order.isPaid = true;
            order.paidAt = paidAt;
            order.statusHistory.push({
                status: ORDER_STATUS.DELIVERED,
                timestamp: paidAt,
                note: "COD payment confirmed at delivery",
            });
            codPaymentSettled = true;
        }

        await order.save();
        emitOrderStatusUpdated(order);
        if (codPaymentSettled) {
            emitPaymentUpdated(order);
        }
        return order;
    }

    async cancelOrderByAdmin(orderId, cancelReason = "") {
        const order = await Order.findById(orderId);
        if (!order) throw new ApiError(404, "Order not found");

        if (!String(cancelReason).trim()) {
            throw new ApiError(400, "Cancel reason is required");
        }

        if (
            ["Delivered", "Cancelled", "Returned"].includes(order.orderStatus)
        ) {
            throw new ApiError(400, `Order is already ${order.orderStatus}`);
        }

        // Restore stock for each item
        const stockUpdatePromises = order.items.map((item) =>
            Book.updateOne(
                { _id: item.bookId },
                { $inc: { stock: item.quantity } },
            ),
        );
        await Promise.all(stockUpdatePromises);

        order.orderStatus = "Cancelled";
        order.cancelReason = String(cancelReason).trim();
        if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
        order.statusHistory.push({
            status: "Cancelled",
            timestamp: new Date(),
            note: order.cancelReason,
        });

        if (order.paymentStatus === PAYMENT_STATUS.PAID) {
            order.paymentStatus = PAYMENT_STATUS.REFUNDED;
        }

        await order.save();
        emitOrderStatusUpdated(order);
        if (order.paymentStatus === PAYMENT_STATUS.REFUNDED) {
            emitPaymentUpdated(order);
        }
        return order;
    }

    async createShipment(orderId) {
        const order = await Order.findById(orderId);
        if (!order) throw new ApiError(404, "Order not found");

        if (!["Packed", "Confirmed"].includes(order.orderStatus)) {
            throw new ApiError(400, "Order must be Confirmed or Packed to create a shipment");
        }

        const shipmentRes = await delhiveryService.createShipment(order);

        order.shipping = {
            courier: "Delhivery",
            awb: shipmentRes.awb,
            trackingUrl: shipmentRes.trackingUrl,
            pickupScheduled: shipmentRes.pickupScheduled,
            shippedAt: new Date(),
        };

        order.orderStatus = ORDER_STATUS.SHIPPED;
        if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
        order.statusHistory.push({
            status: ORDER_STATUS.SHIPPED,
            timestamp: new Date(),
            note: `Shipment Created. AWB: ${shipmentRes.awb}`,
        });

        await order.save();
        emitOrderStatusUpdated(order);
        return order;
    }

    async approveReplacement(orderId) {
        const order = await Order.findById(orderId);
        if (!order) throw new ApiError(404, "Order not found");

        if (order.orderStatus !== ORDER_STATUS.REPLACEMENT_REQUESTED) {
            throw new ApiError(400, "No replacement requested for this order");
        }

        order.orderStatus = ORDER_STATUS.REPLACEMENT_APPROVED;
        order.replacement.replacementStatus = "Approved";

        if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
        order.statusHistory.push({
            status: ORDER_STATUS.REPLACEMENT_APPROVED,
            timestamp: new Date(),
            note: "Admin approved the replacement request.",
        });

        await order.save();
        emitOrderStatusUpdated(order);
        emitReplacementUpdated(order);
        return order;
    }

    async rejectReplacement(orderId, reason) {
        const order = await Order.findById(orderId);
        if (!order) throw new ApiError(404, "Order not found");

        if (order.orderStatus !== ORDER_STATUS.REPLACEMENT_REQUESTED) {
            throw new ApiError(400, "No replacement requested for this order");
        }

        const trimmedReason = String(reason || "").trim();
        if (!trimmedReason) {
            throw new ApiError(400, "Replacement rejection reason is required");
        }

        order.orderStatus = ORDER_STATUS.REPLACEMENT_REJECTED;
        order.replacement.replacementStatus = "Rejected";
        order.replacement.replacementRejectedAt = new Date();
        order.replacement.replacementRejectionReason = trimmedReason;

        if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
        order.statusHistory.push({
            status: ORDER_STATUS.REPLACEMENT_REJECTED,
            timestamp: new Date(),
            note: `Admin rejected replacement: ${trimmedReason}`,
        });

        await order.save();
        emitOrderStatusUpdated(order);
        emitReplacementUpdated(order);
        return order;
    }

    // ================= USERS =================

    async getAllUsers(req) {
        const { page, limit, skip, sort } = getPaginationOptions(req);

        const filter = {};
        if (req.query.role) filter.role = req.query.role;
        if (req.query.blocked) filter.isBlocked = req.query.blocked === "true";
        const includeDeleted = req.query.includeDeleted === "true";

        let userQuery = User.find(filter).select("-password");
        if (includeDeleted) {
            userQuery = userQuery.setOptions({ _recursed: true });
        }

        const [users, total] = await Promise.all([
            userQuery.sort(sort).skip(skip).limit(limit),
            includeDeleted
                ? User.countDocuments(filter).setOptions({ _recursed: true })
                : User.countDocuments(filter),
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
            { returnDocument: "after" },
        ).select("-password");

        if (!user) throw new ApiError(404, "User not found");
        return user;
    }

    async unblockUser(userId) {
        const user = await User.findByIdAndUpdate(
            userId,
            { isBlocked: false },
            { returnDocument: "after" },
        ).select("-password");

        if (!user) throw new ApiError(404, "User not found");
        return user;
    }

    async deleteUser(userId, adminId) {
        if (userId.toString() === adminId.toString()) {
            throw new ApiError(403, "Admin cannot delete themselves");
        }
        const user = await User.findByIdAndDelete(userId);
        if (!user) throw new ApiError(404, "User not found");
        return { message: "User deleted successfully" };
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
