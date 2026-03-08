import Joi from "joi";

export const registerSchema = Joi.object({
    name: Joi.string().required().trim(),
    email: Joi.string().email().required().trim().lowercase(),
    password: Joi.string().min(6).required(),
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
    newPassword: Joi.string().min(6).required(),
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
    newPassword: Joi.string().min(6).required(),
});

// Registration email OTP schemas (reuse same shape as password OTP)
export const sendRegistrationOtpSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
});

export const verifyRegistrationOtpSchema = Joi.object({
    email: Joi.string().email().required().trim().lowercase(),
    otp: Joi.number().integer().min(100000).max(999999).required(),
});
