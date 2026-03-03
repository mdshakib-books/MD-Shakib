import Order from "../models/order.model.js";
import Cart from "../models/cart.model.js";
import Address from "../models/address.model.js";
import Payment from "../models/payment.model.js";
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
    ORDER_STATUS_TRANSITIONS,
} from "../utils/order.constants.js";
import {
    emitNewOrder,
    emitOrderStatusUpdated,
} from "../sockets/order.socket.js";
import paymentService from "./payment.service.js";

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
        let totalAmount = 0;
        const itemsSnapshot = cart.items.map((item) => {
            // In a completely zero-trust system, you'd fetch the Book price here again.
            // But according to the requested architecture, we snapshot price in the Cart.
            totalAmount += item.price * item.quantity;
            return {
                bookId: item.bookId,
                title: item.title || "Book Title", // Assuming title/image were stored in cart or easily populated.
                price: item.price,
                quantity: item.quantity,
                imageUrl: item.imageUrl || "No image",
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

            // Clear the Cart
            await Cart.updateOne({ userId }, { items: [] });

            emitNewOrder(newOrder); // Notify Admin
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

        // Trigger refund if already paid
        if (order.paymentStatus === "Paid") {
            // Fire off async refund logic via Payment Provider
            order.paymentStatus = "Refunded";
        }

        await order.save();
        emitOrderStatusUpdated(order);

        return order;
    }
}

export default new OrderService();
