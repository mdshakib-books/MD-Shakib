import Payment from "../models/payment.model.js";
import Order from "../models/order.model.js";
import { ApiError } from "../utils/ApiError.js";
import crypto from "crypto";
import mongoose from "mongoose";
import {
    PAYMENT_PROVIDERS,
    PAYMENT_STATUS,
} from "../utils/payment.constants.js";
import {
    ORDER_STATUS,
    PAYMENT_METHODS,
    normalizePaymentMethod,
} from "../utils/order.constants.js";
import {
    emitOrderStatusUpdated,
    emitPaymentSuccess,
    emitPaymentFailed,
    emitPaymentUpdated,
    emitOrderPaid,
} from "../sockets/order.socket.js";
import { getRazorpayInstance, isRazorpayConfigured } from "../config/razorpay.js";

const REUSABLE_INTENT_TTL_MS = 20 * 60 * 1000;
class PaymentService {
    _assertGatewayReady() {
        if (!isRazorpayConfigured()) {
            throw new ApiError(
                500,
                "Payment gateway is not configured. Please contact support.",
            );
        }
    }

    _safeEqual(left, right) {
        const leftBuffer = Buffer.from(String(left || ""));
        const rightBuffer = Buffer.from(String(right || ""));

        if (leftBuffer.length !== rightBuffer.length) {
            return false;
        }

        return crypto.timingSafeEqual(leftBuffer, rightBuffer);
    }

    _isRecentPaymentIntent(paymentDoc) {
        if (!paymentDoc?.createdAt) return false;
        const ageMs = Date.now() - new Date(paymentDoc.createdAt).getTime();
        return ageMs <= REUSABLE_INTENT_TTL_MS;
    }

    async _findOrderForUser(orderId, userId) {
        const order = await Order.findOne({ _id: orderId, userId });
        if (!order) {
            throw new ApiError(404, "Order not found");
        }

        if (normalizePaymentMethod(order.paymentMethod) !== PAYMENT_METHODS.ONLINE) {
            throw new ApiError(
                400,
                "Payment intent is available only for online prepaid orders",
            );
        }

        if (order.paymentStatus === PAYMENT_STATUS.PAID || order.isPaid) {
            throw new ApiError(400, "Payment is already completed for this order");
        }

        if (
            [ORDER_STATUS.CANCELLED, ORDER_STATUS.RETURNED].includes(
                order.orderStatus,
            )
        ) {
            throw new ApiError(400, "Cannot create payment intent for this order");
        }

        return order;
    }

    async _markPaymentAsPaid({
        payment,
        order,
        razorpayOrderId,
        razorpayPaymentId,
        signature = "",
        verifiedAt = new Date(),
        source = "verify",
        eventId = "",
    }) {
        let paymentChanged = false;

        if (!payment.providerOrderId) {
            payment.providerOrderId = razorpayOrderId || payment.paymentId;
            paymentChanged = true;
        }

        if (payment.status !== PAYMENT_STATUS.PAID) {
            payment.status = PAYMENT_STATUS.PAID;
            paymentChanged = true;
        }

        if (razorpayPaymentId && payment.providerPaymentId !== razorpayPaymentId) {
            payment.providerPaymentId = razorpayPaymentId;
            paymentChanged = true;
        }

        if (signature && payment.signature !== signature) {
            payment.signature = signature;
            paymentChanged = true;
        }

        if (!payment.verifiedAt) {
            payment.verifiedAt = verifiedAt;
            paymentChanged = true;
        }

        if (eventId && !payment.webhookEventIds.includes(eventId)) {
            payment.webhookEventIds.push(eventId);
            paymentChanged = true;
        }

        if (payment.failureReason) {
            payment.failureReason = "";
            paymentChanged = true;
        }

        if (paymentChanged) {
            await payment.save();
        }

        let orderChanged = false;
        if (order.paymentStatus !== PAYMENT_STATUS.PAID) {
            order.paymentStatus = PAYMENT_STATUS.PAID;
            orderChanged = true;
        }

        if (!order.isPaid) {
            order.isPaid = true;
            orderChanged = true;
        }

        if (!order.paidAt) {
            order.paidAt = verifiedAt;
            orderChanged = true;
        }

        if (razorpayOrderId && order.razorpayOrderId !== razorpayOrderId) {
            order.razorpayOrderId = razorpayOrderId;
            orderChanged = true;
        }

        if (
            razorpayPaymentId &&
            order.razorpayPaymentId !== razorpayPaymentId
        ) {
            order.razorpayPaymentId = razorpayPaymentId;
            orderChanged = true;
        }

        const orderMethod = normalizePaymentMethod(order.paymentMethod);
        if (
            orderMethod === PAYMENT_METHODS.ONLINE &&
            order.orderStatus === ORDER_STATUS.PENDING
        ) {
            order.orderStatus = ORDER_STATUS.CONFIRMED;
            if (!Array.isArray(order.statusHistory)) {
                order.statusHistory = [];
            }
            order.statusHistory.push({
                status: ORDER_STATUS.CONFIRMED,
                timestamp: verifiedAt,
                note: `Payment captured via ${source}`,
            });
            orderChanged = true;
        }

        if (orderChanged) {
            await order.save();
        }

        emitPaymentUpdated(order);
        emitOrderStatusUpdated(order);
        emitPaymentSuccess(order._id, {
            paymentId: razorpayPaymentId,
            paymentStatus: order.paymentStatus,
            source,
        });
        emitOrderPaid(order, {
            paymentId: razorpayPaymentId,
            razorpayOrderId,
            source,
        });

        return order;
    }

    async _markPaymentAsFailed({
        payment,
        order,
        reason = "Payment failed",
        eventId = "",
    }) {
        let paymentChanged = false;

        if (!payment.providerOrderId && payment.paymentId) {
            payment.providerOrderId = payment.paymentId;
            paymentChanged = true;
        }

        if (payment.status !== PAYMENT_STATUS.FAILED) {
            payment.status = PAYMENT_STATUS.FAILED;
            paymentChanged = true;
        }

        if (reason && payment.failureReason !== reason) {
            payment.failureReason = reason;
            paymentChanged = true;
        }

        if (eventId && !payment.webhookEventIds.includes(eventId)) {
            payment.webhookEventIds.push(eventId);
            paymentChanged = true;
        }

        if (paymentChanged) {
            await payment.save();
        }

        if (order && order.paymentStatus !== PAYMENT_STATUS.PAID) {
            let orderChanged = false;
            if (order.paymentStatus !== PAYMENT_STATUS.FAILED) {
                order.paymentStatus = PAYMENT_STATUS.FAILED;
                orderChanged = true;
            }

            if (order.isPaid) {
                order.isPaid = false;
                orderChanged = true;
            }

            if (orderChanged) {
                await order.save();
            }

            emitPaymentUpdated(order);
            emitPaymentFailed(order._id, reason, {
                razorpayOrderId: payment.providerOrderId || payment.paymentId,
            });
        }

        return true;
    }

    async createRazorpayOrder(orderId, amount, userId, idempotencyKey = "") {
        this._assertGatewayReady();

        const order = await this._findOrderForUser(orderId, userId);
        const payableAmount = Number(order.totalAmount);

        if (!Number.isFinite(payableAmount) || payableAmount <= 0) {
            throw new ApiError(400, "Invalid payable amount for order");
        }

        if (amount !== undefined && Number(amount) !== payableAmount) {
            // Frontend amount is ignored by design; server order total is source of truth.
            console.warn(
                `[PaymentIntent] Amount mismatch for order ${order._id}. Client: ${amount}, Server: ${payableAmount}`,
            );
        }

        const normalizedIdempotencyKey = String(idempotencyKey || "").trim();

        if (normalizedIdempotencyKey) {
            const duplicateAttempt = await Payment.findOne({
                orderId: order._id,
                userId,
                idempotencyKey: normalizedIdempotencyKey,
            }).lean();

            if (duplicateAttempt) {
                if (duplicateAttempt.status === PAYMENT_STATUS.PAID) {
                    throw new ApiError(
                        400,
                        "Payment is already completed for this order",
                    );
                }
                return {
                    orderId: order._id,
                    paymentRecordId: duplicateAttempt._id,
                    razorpayOrderId:
                        duplicateAttempt.providerOrderId ||
                        duplicateAttempt.paymentId,
                    amount: Math.round(duplicateAttempt.amount * 100),
                    currency: duplicateAttempt.currency || "INR",
                    keyId: process.env.RAZORPAY_KEY_ID,
                    reused: true,
                    paymentStatus: duplicateAttempt.status,
                };
            }
        }

        const reusableIntent = await Payment.findOne({
            orderId: order._id,
            userId,
            provider: PAYMENT_PROVIDERS.RAZORPAY,
            status: PAYMENT_STATUS.PENDING,
        }).sort({ createdAt: -1 });

        if (reusableIntent && this._isRecentPaymentIntent(reusableIntent)) {
            return {
                orderId: order._id,
                paymentRecordId: reusableIntent._id,
                razorpayOrderId:
                    reusableIntent.providerOrderId ||
                    reusableIntent.paymentId,
                amount: Math.round(reusableIntent.amount * 100),
                currency: reusableIntent.currency || "INR",
                keyId: process.env.RAZORPAY_KEY_ID,
                reused: true,
                paymentStatus: reusableIntent.status,
            };
        }

        if (reusableIntent && !this._isRecentPaymentIntent(reusableIntent)) {
            reusableIntent.status = PAYMENT_STATUS.FAILED;
            reusableIntent.failureReason = "Payment intent expired";
            await reusableIntent.save();
        }

        const razorpayOrder = await getRazorpayInstance().orders.create({
            amount: Math.round(payableAmount * 100),
            currency: "INR",
            receipt: `order_${order._id}_${Date.now()}`.slice(0, 40),
            notes: {
                orderId: order._id.toString(),
                userId: userId.toString(),
            },
        });

        const paymentDoc = await Payment.create({
            orderId: order._id,
            userId,
            paymentId: razorpayOrder.id,
            providerOrderId: razorpayOrder.id,
            amount: payableAmount,
            currency: razorpayOrder.currency || "INR",
            status: PAYMENT_STATUS.PENDING,
            provider: PAYMENT_PROVIDERS.RAZORPAY,
            idempotencyKey: normalizedIdempotencyKey || undefined,
        });

        order.razorpayOrderId = razorpayOrder.id;
        order.paymentStatus = PAYMENT_STATUS.PENDING;
        order.isPaid = false;
        order.paidAt = null;
        await order.save();

        emitPaymentUpdated(order);

        return {
            orderId: order._id,
            paymentRecordId: paymentDoc._id,
            razorpayOrderId: razorpayOrder.id,
            amount: razorpayOrder.amount,
            currency: razorpayOrder.currency || "INR",
            keyId: process.env.RAZORPAY_KEY_ID,
            reused: false,
            paymentStatus: paymentDoc.status,
        };
    }

    async createPaymentIntent(orderId, amount, userId, idempotencyKey = "") {
        return this.createRazorpayOrder(orderId, amount, userId, idempotencyKey);
    }

    async verifyRazorpayPayment(signaturePayload = {}) {
        this._assertGatewayReady();

        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        } = signaturePayload;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            throw new ApiError(400, "Missing required payment verification fields");
        }

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        if (!this._safeEqual(expectedSignature, razorpay_signature)) {
            throw new ApiError(400, "Invalid payment signature");
        }

        let payment = await Payment.findOne({
            providerOrderId: razorpay_order_id,
        });
        if (!payment) {
            payment = await Payment.findOne({
                paymentId: razorpay_order_id,
            });
        }

        if (!payment) {
            throw new ApiError(404, "Payment intent not found");
        }

        const order = await Order.findById(payment.orderId);
        if (!order) {
            throw new ApiError(404, "Linked order not found");
        }

        if (payment.status === PAYMENT_STATUS.PAID && order.paymentStatus === PAYMENT_STATUS.PAID) {
            return {
                success: true,
                alreadyVerified: true,
                orderId: order._id,
                paymentStatus: order.paymentStatus,
                razorpayOrderId: order.razorpayOrderId,
                razorpayPaymentId: order.razorpayPaymentId,
            };
        }

        const razorpayPayment = await getRazorpayInstance().payments.fetch(
            razorpay_payment_id,
        );

        if (!razorpayPayment || razorpayPayment.order_id !== razorpay_order_id) {
            throw new ApiError(400, "Payment reference mismatch");
        }

        if (razorpayPayment.status !== "captured") {
            throw new ApiError(
                400,
                `Payment is not captured yet (current status: ${razorpayPayment.status})`,
            );
        }

        await this._markPaymentAsPaid({
            payment,
            order,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
            signature: razorpay_signature,
            verifiedAt: new Date(),
            source: "verify",
        });

        return {
            success: true,
            orderId: order._id,
            paymentStatus: PAYMENT_STATUS.PAID,
            orderStatus: order.orderStatus,
            razorpayOrderId: razorpay_order_id,
            razorpayPaymentId: razorpay_payment_id,
        };
    }

    async verifyPayment(razorpay_order_id, razorpay_payment_id, razorpay_signature) {
        return this.verifyRazorpayPayment({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        });
    }

    async verifyPaymentWebhook(payload, signature, rawBody = "", eventId = "") {
        this._assertGatewayReady();

        if (!signature) {
            throw new ApiError(400, "Missing webhook signature");
        }

        const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
        if (!webhookSecret) {
            throw new ApiError(500, "Razorpay webhook secret is not configured");
        }

        const bodyToVerify =
            typeof rawBody === "string" && rawBody.length > 0
                ? rawBody
                : JSON.stringify(payload || {});

        const expectedSignature = crypto
            .createHmac("sha256", webhookSecret)
            .update(bodyToVerify)
            .digest("hex");

        if (!this._safeEqual(expectedSignature, signature)) {
            throw new ApiError(401, "Invalid webhook signature");
        }

        const eventName = payload?.event || "unknown";
        const paymentEntity = payload?.payload?.payment?.entity;
        const orderEntity = payload?.payload?.order?.entity;

        const razorpayOrderId = paymentEntity?.order_id || orderEntity?.id;
        const razorpayPaymentId = paymentEntity?.id;

        if (!razorpayOrderId) {
            return { processed: true, ignored: true, event: eventName };
        }

        let payment = await Payment.findOne({
            providerOrderId: razorpayOrderId,
        });

        if (!payment) {
            const order = await Order.findOne({ razorpayOrderId });
            if (!order) {
                return {
                    processed: true,
                    ignored: true,
                    event: eventName,
                    reason: "order_not_found",
                };
            }

            payment = await Payment.create({
                orderId: order._id,
                userId: order.userId,
                paymentId: razorpayOrderId,
                providerOrderId: razorpayOrderId,
                amount: Number(order.totalAmount) || 0,
                currency: (orderEntity?.currency || "INR").toUpperCase(),
                status: PAYMENT_STATUS.PENDING,
                provider: PAYMENT_PROVIDERS.RAZORPAY,
            });
        }

        if (eventId && payment.webhookEventIds.includes(eventId)) {
            return {
                processed: true,
                duplicate: true,
                event: eventName,
                orderId: payment.orderId,
            };
        }

        const order = await Order.findById(payment.orderId);
        if (!order) {
            payment.failureReason =
                "Payment event received but linked order is missing";
            if (eventId) {
                payment.webhookEventIds.push(eventId);
            }
            await payment.save();
            return {
                processed: true,
                event: eventName,
                warning: "linked_order_missing",
            };
        }

        if (["payment.captured", "order.paid"].includes(eventName)) {
            await this._markPaymentAsPaid({
                payment,
                order,
                razorpayOrderId,
                razorpayPaymentId,
                verifiedAt: new Date(),
                source: "webhook",
                eventId,
            });
        } else if (eventName === "payment.failed") {
            const failureReason =
                paymentEntity?.error_description ||
                paymentEntity?.error_reason ||
                "Payment failed";

            await this._markPaymentAsFailed({
                payment,
                order,
                reason: failureReason,
                eventId,
            });
        } else if (eventId) {
            payment.webhookEventIds.push(eventId);
            await payment.save();
        }

        return {
            processed: true,
            event: eventName,
            orderId: order._id,
            paymentStatus: order.paymentStatus,
        };
    }

    async handlePaymentFailure(paymentIdentifier, reason) {
        let paymentRef = paymentIdentifier;
        let failureReason = reason;
        let explicitOrderId = "";

        if (paymentIdentifier && typeof paymentIdentifier === "object") {
            paymentRef =
                paymentIdentifier.razorpayOrderId ||
                paymentIdentifier.paymentId ||
                paymentIdentifier.providerOrderId ||
                paymentIdentifier.orderId;
            explicitOrderId = String(paymentIdentifier.orderId || "").trim();
            failureReason =
                paymentIdentifier.reason ||
                paymentIdentifier.error_description ||
                reason;
        }

        if (!paymentRef) {
            throw new ApiError(400, "Payment reference is required");
        }

        const paymentLookups = [
            { providerOrderId: paymentRef },
            { paymentId: paymentRef },
            { providerPaymentId: paymentRef },
        ];

        if (mongoose.Types.ObjectId.isValid(paymentRef)) {
            paymentLookups.push({ orderId: paymentRef });
        }

        if (explicitOrderId && mongoose.Types.ObjectId.isValid(explicitOrderId)) {
            paymentLookups.push({ orderId: explicitOrderId });
        }

        const payment = await Payment.findOne({
            $or: paymentLookups,
        });

        if (!payment) {
            throw new ApiError(404, "Payment intent not found");
        }

        const order = await Order.findById(payment.orderId);
        await this._markPaymentAsFailed({
            payment,
            order,
            reason: String(failureReason || "Payment failed"),
        });

        return {
            success: true,
            orderId: payment.orderId,
            paymentStatus: PAYMENT_STATUS.FAILED,
        };
    }

    async retryPaymentIntent(orderId, userId, idempotencyKey = "") {
        const order = await this._findOrderForUser(orderId, userId);

        if (order.paymentStatus === PAYMENT_STATUS.PAID) {
            throw new ApiError(400, "Payment already completed for this order");
        }

        const intent = await this.createRazorpayOrder(
            order._id,
            order.totalAmount,
            userId,
            idempotencyKey,
        );

        if (order.paymentStatus !== PAYMENT_STATUS.PENDING) {
            order.paymentStatus = PAYMENT_STATUS.PENDING;
            order.isPaid = false;
            order.paidAt = null;
            await order.save();
            emitPaymentUpdated(order);
        }

        return intent;
    }
}

export default new PaymentService();
