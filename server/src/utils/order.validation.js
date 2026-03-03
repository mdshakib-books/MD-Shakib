import Joi from "joi";
import { PAYMENT_METHODS } from "./order.constants.js";

export const createOrderSchema = Joi.object({
    addressId: Joi.string().required().trim(),
    paymentMethod: Joi.string()
        .valid(PAYMENT_METHODS.COD, PAYMENT_METHODS.ONLINE)
        .required(),
    idempotencyKey: Joi.string().required().trim(), // Required to prevent dupe submissions
});

export const cancelOrderSchema = Joi.object({
    reason: Joi.string().optional().trim(),
});
