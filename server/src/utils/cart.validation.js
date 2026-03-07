import Joi from "joi";

export const addToCartSchema = Joi.object({
    bookId: Joi.string().trim().optional(),
    productId: Joi.string().trim().optional(),
    quantity: Joi.number().integer().min(1).required(),
})
    .or("bookId", "productId")
    .messages({
        "object.missing": "bookId is required",
    });

export const updateCartSchema = Joi.object({
    quantity: Joi.number().integer().min(1).required(),
});
