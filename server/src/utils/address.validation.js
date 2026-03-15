import Joi from "joi";

const ADDRESS_TYPE_VALUES = ["Home", "Office", "Other"];

export const createAddressSchema = Joi.object({
    fullName: Joi.string().required().trim(),
    phone: Joi.string().required().trim(),
    pincode: Joi.string().required().trim(),
    state: Joi.string().required().trim(),
    city: Joi.string().required().trim(),
    houseNo: Joi.string().required().trim(),
    area: Joi.string().required().trim(),
    landmark: Joi.string().optional().allow("").trim(),
    addressType: Joi.string()
        .valid(...ADDRESS_TYPE_VALUES)
        .optional()
        .default("Home"),
    isDefault: Joi.boolean().optional().default(false),
});

export const updateAddressSchema = Joi.object({
    fullName: Joi.string().optional().trim(),
    phone: Joi.string().optional().trim(),
    pincode: Joi.string().optional().trim(),
    state: Joi.string().optional().trim(),
    city: Joi.string().optional().trim(),
    houseNo: Joi.string().optional().trim(),
    area: Joi.string().optional().trim(),
    landmark: Joi.string().optional().allow("").trim(),
    addressType: Joi.string()
        .valid(...ADDRESS_TYPE_VALUES)
        .optional(),
    isDefault: Joi.boolean().optional(),
});
