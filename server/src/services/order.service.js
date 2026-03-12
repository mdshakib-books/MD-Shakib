import Order from "../models/order.model.js";
import Cart from "../models/cart.model.js";
import Address from "../models/address.model.js";
import Payment from "../models/payment.model.js";
import Book from "../models/book.model.js";
import { ApiError } from "../utils/ApiError.js";
import { checkAndSetIdempotency } from "../utils/idempotency.util.js";
import { validateAndReduceStock, restoreStock } from "../utils/stock.util.js";
import {
    buildPaginatedResponse,
    getPaginationOptions,
} from "../utils/pagination.js";
import {
    ORDER_STATUS,
    PAYMENT_METHODS,
} from "../utils/order.constants.js";
import {
    emitNewOrder,
    emitOrderStatusUpdated,
    emitPaymentUpdated,
    emitReplacementUpdated,
} from "../sockets/order.socket.js";
import paymentService from "./payment.service.js";
import User from "../models/user.model.js";
import { sendOrderConfirmationMail } from "../utils/mail.js";

class OrderService {
    async createOrder(userId, addressId, paymentMethod, idempotencyKey) {
        if (!checkAndSetIdempotency(idempotencyKey)) {
            throw new ApiError(
                409,
                "Duplicate request detected. Order is already being processed.",
            );
        }

        // 1. Fetch dependencies
        const cart = await Cart.findOne({ userId });
        if (!cart || cart.items.length === 0) {
            throw new ApiError(400, "Cart is empty");
        }

        const address = await Address.findOne({ _id: addressId, userId });
        if (!address) {
            throw new ApiError(404, "Address not found");
        }

        // 2. Snapshot address
        const addressSnapshot = {
            fullName: address.fullName,
            phone: address.phone,
            pincode: address.pincode,
            state: address.state,
            city: address.city,
            houseNo: address.houseNo,
            area: address.area,
            landmark: address.landmark,
        };

        // 3. Atomically Revalidate and Reduce Stock
        await validateAndReduceStock(cart.items);

        // 4. Calculate total amount safely on backend using snapshot prices generated at cart-add time
        const bookIds = cart.items.map((item) => item.bookId);
        const books = await Book.find({ _id: { $in: bookIds } })
            .select("_id title imageUrl isActive")
            .lean();
        const bookMap = new Map(books.map((book) => [String(book._id), book]));

        let totalAmount = 0;
        const itemsSnapshot = cart.items.map((item) => {
            const book = bookMap.get(String(item.bookId));
            totalAmount += item.price * item.quantity;
            return {
                bookId: item.bookId,
                title: book?.title || "Book",
                price: item.price,
                quantity: item.quantity,
                imageUrl:
                    book?.imageUrl ||
                    "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=120",
            };
        });

        // 5. Create Order record
        const orderData = {
            userId,
            items: itemsSnapshot,
            address: addressSnapshot,
            totalAmount,
            paymentMethod,
            orderStatus: ORDER_STATUS.PENDING,
            paymentStatus: "Pending",
            isPaid: false,
        };

        const newOrder = await Order.create(orderData);

        // 6. Handle Payment Method branches
        let responseData = { order: newOrder };

        if (paymentMethod === PAYMENT_METHODS.COD) {
            // COD implicitly means order is placed
            newOrder.paymentStatus = "Pending";
            await newOrder.save();
        } else if (paymentMethod === PAYMENT_METHODS.ONLINE) {
            // Initialize Razorpay/Stripe intent
            try {
                const intent = await paymentService.createPaymentIntent(
                    newOrder._id,
                    totalAmount,
                    userId,
                );
                responseData.clientSecret = intent.clientSecret;
                responseData.paymentSessionId = intent.id;
            } catch (error) {
                // Oh no, payment provider failed. Let's not fail the whole order, but return gracefully
                // so the user can 'Retry Payment'
                console.error(
                    "Failed to initialize payment gateway intent",
                    error,
                );
            }
        }

        // Notify Admin dashboard for both COD and Online orders
        emitNewOrder(newOrder);

        // Clear the cart after successful order creation
        await Cart.updateOne({ userId }, { items: [] });

        // Send order confirmation email (fire-and-forget)
        try {
            const user = await User.findById(userId)
                .select("name email")
                .lean();
            if (user) {
                sendOrderConfirmationMail(user, newOrder).catch((e) =>
                    console.error("Order email error:", e),
                );
            }
        } catch (e) {
            console.error("Could not fetch user for order email:", e);
        }

        return responseData;
    }

    async getMyOrders(req) {
        const { page, limit, skip, sort } = getPaginationOptions(req);

        const filter = { userId: req.user._id };

        const [orders, total] = await Promise.all([
            Order.find(filter).sort(sort).skip(skip).limit(limit).lean(),
            Order.countDocuments(filter),
        ]);

        return buildPaginatedResponse(orders, total, page, limit);
    }

    async getOrderById(orderId, userId) {
        const order = await Order.findOne({ _id: orderId, userId }).lean();
        if (!order) throw new ApiError(404, "Order not found");

        const payment = await Payment.findOne({ orderId }).lean();
        return { order, payment };
    }

    async cancelOrder(orderId, userId, reason) {
        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) throw new ApiError(404, "Order not found");

        if (
            ["Shipped", "Delivered", "Cancelled", "Returned"].includes(
                order.orderStatus,
            )
        ) {
            throw new ApiError(
                400,
                `Cannot cancel an order that is already ${order.orderStatus}`,
            );
        }

        // Restore stock atomically
        await restoreStock(order.items);

        order.orderStatus = ORDER_STATUS.CANCELLED;
        order.cancelReason = String(reason || "").trim();
        if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
        order.statusHistory.push({
            status: ORDER_STATUS.CANCELLED,
            timestamp: new Date(),
            note: order.cancelReason || "Cancelled by user",
        });

        // Trigger refund if already paid
        if (order.paymentStatus === "Paid") {
            // Fire off async refund logic via Payment Provider
            order.paymentStatus = "Refunded";
        }

        await order.save();
        emitOrderStatusUpdated(order);
        if (order.paymentStatus === "Refunded") {
            emitPaymentUpdated(order);
        }

        return order;
    }

    async requestReplacement(orderId, userId, reason) {
        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) throw new ApiError(404, "Order not found");

        if (order.orderStatus !== ORDER_STATUS.DELIVERED) {
            throw new ApiError(400, "Replacements can only be requested for Delivered orders");
        }

        // Check 7 day policy
        const deliveredDate = order.shipping?.deliveredAt || order.updatedAt;
        const daysSinceDelivery = (new Date() - new Date(deliveredDate)) / (1000 * 60 * 60 * 24);
        if (daysSinceDelivery > 7) {
            throw new ApiError(400, "Replacement can only be requested within 7 days of delivery");
        }

        order.orderStatus = ORDER_STATUS.REPLACEMENT_REQUESTED;
        order.replacement = {
            replacementRequested: true,
            replacementStatus: "Requested",
            replacementReason: reason,
            replacementRequestedAt: new Date(),
        };

        if (!Array.isArray(order.statusHistory)) order.statusHistory = [];
        order.statusHistory.push({
            status: ORDER_STATUS.REPLACEMENT_REQUESTED,
            timestamp: new Date(),
            note: reason,
        });

        await order.save();
        emitOrderStatusUpdated(order);
        emitReplacementUpdated(order);
        return order;
    }
}

export default new OrderService();
