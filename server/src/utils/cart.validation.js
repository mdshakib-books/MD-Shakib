import Joi from "joi";

export const addToCartSchema = Joi.object({
    bookId: Joi.string().required().trim(),
    quantity: Joi.number().min(1).required(),
});

export const updateCartSchema = Joi.object({
    quantity: Joi.number().min(1).required(),
});
