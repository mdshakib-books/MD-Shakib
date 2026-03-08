import mongoose from "mongoose";

const registrationOtpSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },
        otp: {
            type: Number,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
            index: { expires: 0 }, // TTL — MongoDB auto-deletes expired docs
        },
        verified: {
            type: Boolean,
            default: false,
        },
        attempts: {
            type: Number,
            default: 0,
        },
        // For rate-limiting: track how many OTPs have been sent in the last 10 min
        otpSentCount: {
            type: Number,
            default: 1,
        },
        rateLimitWindowStart: {
            type: Date,
            default: Date.now,
        },
    },
    { timestamps: true },
);

const RegistrationOtp = mongoose.model(
    "RegistrationOtp",
    registrationOtpSchema,
);
export default RegistrationOtp;
