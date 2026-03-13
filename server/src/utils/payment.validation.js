import Joi from "joi";

export const createPaymentIntentSchema = Joi.object({
    orderId: Joi.string().required().trim(),
    idempotencyKey: Joi.string().trim().max(128).optional(),
});

export const verifyPaymentSchema = Joi.object({
    razorpay_order_id: Joi.string().required().trim(),
    razorpay_payment_id: Joi.string().required().trim(),
    razorpay_signature: Joi.string().required().trim(),
});

export const retryPaymentSchema = Joi.object({
    orderId: Joi.string().required().trim(),
    idempotencyKey: Joi.string().trim().max(128).optional(),
});

export const handlePaymentFailureSchema = Joi.object({
    paymentId: Joi.string().optional().trim(),
    razorpayOrderId: Joi.string().optional().trim(),
    orderId: Joi.string().optional().trim(),
    reason: Joi.string().trim().allow("", null).optional(),
}).or("paymentId", "razorpayOrderId", "orderId");
