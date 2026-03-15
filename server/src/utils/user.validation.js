import Joi from "joi";

const STRONG_PASSWORD_REGEX =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/;

const STRONG_PASSWORD_RULE =
    "Password must be min 6 chars with uppercase, lowercase, number & special character";

const strongPasswordSchema = Joi.string()
    .required()
    .pattern(STRONG_PASSWORD_REGEX)
    .messages({
        "string.empty": "Password is required",
        "string.pattern.base": STRONG_PASSWORD_RULE,
    });

export const registerSchema = Joi.object({
    name: Joi.string().required().trim(),
    email: Joi.string().email().required().trim().lowercase(),
    password: strongPasswordSchema,
    phone: Joi.string().optional().allow(""),
});

export const loginSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    password: Joi.string().required(),
});

export const updateProfileSchema = Joi.object({
    name: Joi.string().optional().trim(),
    phone: Joi.string().optional().allow(""),
});

export const changePasswordSchema = Joi.object({
    oldPassword: Joi.string().required(),
    newPassword: strongPasswordSchema,
});

export const forgotPasswordSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
});

export const sendOtpSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
});

export const verifyOtpSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    otp: Joi.number().integer().min(100000).max(999999).required(),
});

export const resetPasswordOtpSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    newPassword: strongPasswordSchema,
});

// Registration email OTP schemas (reuse same shape as password OTP)
export const sendRegistrationOtpSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
});

export const verifyRegistrationOtpSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    otp: Joi.number().integer().min(100000).max(999999).required(),
});
