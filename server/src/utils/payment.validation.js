import Joi from "joi";

export const createPaymentIntentSchema = Joi.object({
    orderId: Joi.string().required().trim(),
    amount: Joi.number().min(0).required(),
});

export const retryPaymentSchema = Joi.object({
    orderId: Joi.string().required().trim(),
});

export const verifyPaymentWebhookSchema = Joi.object({
    razorpay_order_id: Joi.string().required(),
    razorpay_payment_id: Joi.string().required(),
    razorpay_signature: Joi.string().required(),
}).unknown(true); // Allow other provider webhook payloads if expanding later
