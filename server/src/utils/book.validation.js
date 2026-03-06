import Joi from "joi";

export const searchSchema = Joi.object({
    query: Joi.string().optional().trim(),
    q: Joi.string().optional().trim(), // Keep for backwards compatibility
    category: Joi.string().optional().trim(),
    page: Joi.number().min(1).optional(),
    limit: Joi.number().min(1).max(50).optional(),
    sort: Joi.string().optional().trim(),
    minPrice: Joi.number().min(0).optional(),
    maxPrice: Joi.number().min(0).optional(),
});
