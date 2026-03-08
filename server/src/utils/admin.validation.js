import Joi from "joi";

export const createBookSchema = Joi.object({
    title: Joi.string().required().trim(),
    author: Joi.string().required().trim(),
    description: Joi.string().required().trim(),
    price: Joi.number().min(0).required(),
    stock: Joi.number().min(0).required(),
    discount: Joi.number().min(0).max(100).optional(),
    category: Joi.string().required().trim(),
    language: Joi.string().optional().trim().allow("", null),
    pages: Joi.number().min(1).optional().allow("", null),
    publisher: Joi.string().optional().trim().allow("", null),
    publishedDate: Joi.date().optional().allow("", null),
    // imageUrl is no longer manually required in req.body, as we extract it via multer/cloudinary
    imageUrl: Joi.string().uri().optional().trim(),
    isActive: Joi.boolean().optional(),
});

export const updateBookSchema = Joi.object({
    title: Joi.string().optional().trim(),
    author: Joi.string().optional().trim(),
    description: Joi.string().optional().trim(),
    price: Joi.number().min(0).optional(),
    stock: Joi.number().min(0).optional(),
    discount: Joi.number().min(0).max(100).optional(),
    category: Joi.string().optional().trim(),
    language: Joi.string().optional().trim().allow("", null),
    pages: Joi.number().min(1).optional().allow("", null),
    publisher: Joi.string().optional().trim().allow("", null),
    publishedDate: Joi.date().optional().allow("", null),
    imageUrl: Joi.string().uri().optional().trim(),
    isActive: Joi.boolean().optional(),
});

export const updateStockSchema = Joi.object({
    stock: Joi.number().min(0).required(),
});

export const updateOrderStatusSchema = Joi.object({
    status: Joi.string()
        .valid(
            "Pending",
            "Paid",
            "Packed",
            "Shipped",
            "Delivered",
            "Cancelled",
            "Returned",
        )
        .required(),
});

export const blockUserSchema = Joi.object({
    reason: Joi.string().optional().trim(), // Optional reason for the audit/logs
});
