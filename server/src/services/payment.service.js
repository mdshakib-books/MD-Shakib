import Payment from "../models/payment.model.js";
import Order from "../models/order.model.js";
import Cart from "../models/cart.model.js";
import { ApiError } from "../utils/ApiError.js";
import crypto from "crypto";
import { PAYMENT_STATUS } from "../utils/payment.constants.js";
import { ORDER_STATUS } from "../utils/order.constants.js";
import {
    emitNewOrder,
    emitPaymentSuccess,
    emitPaymentFailed,
} from "../sockets/order.socket.js";
import { restoreStock } from "../utils/stock.util.js";

class PaymentService {
    async createPaymentIntent(orderId, amount, userId) {
        // Pseudo-code for Razorpay/Stripe initialization
        // const options = {
        //   amount: amount * 100, // smallest currency unit
        //   currency: "INR",
        //   receipt: `receipt_${orderId}`
        // };
        // const order = await razorpayInstance.orders.create(options);

        const mockupPaymentId = `pay_${crypto.randomBytes(8).toString("hex")}`; // Placeholder

        // Log the intent inside the DB Payment Table
        const intent = await Payment.create({
            orderId,
            userId,
            paymentId: mockupPaymentId,
            amount,
            currency: "INR",
            status: PAYMENT_STATUS.PENDING,
            provider: "MockProvider",
        });

        return {
            id: intent.paymentId,
            clientSecret: "mock_client_secret_xyz",
        };
    }

    async verifyPaymentWebhook(payload) {
        // Verify Razorpay Signature using HMAC-SHA256
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } =
            payload;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            throw new ApiError(400, "Missing required webhook fields");
        }

        const webhookSecret =
            process.env.RAZORPAY_WEBHOOK_SECRET || "test_secret";
        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            console.error("Invalid webhook signature");
            throw new ApiError(
                401,
                "Invalid payment signature. Webhook rejected.",
            );
        }

        // Find payment record
        const payment = await Payment.findOne({
            paymentId: razorpay_payment_id,
        });
        if (!payment)
            throw new ApiError(
                404,
                "Payment intent not found in internal system",
            );

        const order = await Order.findById(payment.orderId);
        if (!order) throw new ApiError(404, "Linked order not found");

        // Update statuses
        payment.status = PAYMENT_STATUS.PAID;
        payment.verifiedAt = new Date();
        await payment.save();

        order.paymentStatus = "Paid";
        order.isPaid = true;
        order.paidAt = new Date();
        order.orderStatus = ORDER_STATUS.PAID;
        await order.save();

        // Clear user cart since it is fully successfully paid now
        await Cart.updateOne({ userId: order.userId }, { items: [] });

        // Emit live events
        emitPaymentSuccess(order._id);
        emitNewOrder(order);

        return true;
    }

    async handlePaymentFailure(paymentId, reason) {
        const payment = await Payment.findOne({ paymentId });
        if (!payment) throw new ApiError(404, "Payment intent not found");

        payment.status = PAYMENT_STATUS.FAILED;
        await payment.save();

        const order = await Order.findById(payment.orderId);
        if (order) {
            order.paymentStatus = "Failed";
            await order.save();

            // Since it failed completely, restore the stocks we blocked at creation!
            await restoreStock(order.items);

            emitPaymentFailed(order._id, reason);
        }

        return true;
    }
}

export default new PaymentService();
