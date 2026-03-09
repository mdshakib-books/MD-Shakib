import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import RegistrationOtp from "../models/registrationOtp.model.js";
import { ApiError } from "../utils/ApiError.js";
import { hashPassword, comparePassword } from "../utils/hashPassword.js";
import {
    generateAccessToken,
    generateRefreshToken,
} from "../utils/generateToken.js";
import { ERROR_MESSAGES } from "../utils/user.constants.js";
import {
    sendOtp,
    sendRegistrationOtp as sendRegistrationOtpMail,
} from "../utils/mail.js";

class UserService {
    async createUser(userData) {
        const existingUser = await User.findOne({ email: userData.email });
        if (existingUser) {
            throw new ApiError(409, ERROR_MESSAGES.USER_EXISTS);
        }

        const hashedPassword = await hashPassword(userData.password);
        const user = await User.create({
            ...userData,
            password: hashedPassword,
        });

        const userObj = user.toObject();
        delete userObj.password;
        return userObj;
    }

    async login(email, password) {
        const user = await User.findOne({ email });
        if (!user) throw new ApiError(401, ERROR_MESSAGES.INVALID_CREDENTIALS);
        if (user.isBlocked)
            throw new ApiError(403, ERROR_MESSAGES.ACCOUNT_BLOCKED);

        const isPasswordValid = await comparePassword(password, user.password);
        if (!isPasswordValid)
            throw new ApiError(401, ERROR_MESSAGES.INVALID_CREDENTIALS);

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const userObj = user.toObject();
        delete userObj.password;

        return { user: userObj, accessToken, refreshToken };
    }

    async updateProfile(userId, updateData) {
        const user = await User.findByIdAndUpdate(
            userId,
            { $set: updateData },
            { new: true, runValidators: true },
        ).select("-password");

        if (!user) throw new ApiError(404, ERROR_MESSAGES.USER_NOT_FOUND);
        return user;
    }

    async changePassword(userId, oldPassword, newPassword) {
        const user = await User.findById(userId);
        if (!user) throw new ApiError(404, ERROR_MESSAGES.USER_NOT_FOUND);

        const isPasswordValid = await comparePassword(
            oldPassword,
            user.password,
        );
        if (!isPasswordValid) throw new ApiError(400, "Invalid old password");

        user.password = await hashPassword(newPassword);
        await user.save();
        return true;
    }

    async deleteAccount(userId) {
        const user = await User.findByIdAndUpdate(
            userId,
            {
                isDeleted: true,
                deletedAt: new Date(),
                isBlocked: true,
            },
            { new: true },
        );
        if (!user) throw new ApiError(404, ERROR_MESSAGES.USER_NOT_FOUND);
        return true;
    }

    // ── OTP-based Forgot Password ─────────────────────────────────────────────

    async sendOtp(email) {
        const user = await User.findOne({ email });
        if (!user) throw new ApiError(404, "No account found with this email.");

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000);
        user.resetOtp = otp;
        user.otpExpires = new Date(Date.now() + 5 * 60 * 1000); // 5 min
        user.isOtpVerified = false;
        await user.save();

        await sendOtp(email, otp);
        return true;
    }

    async verifyOtp(email, otp) {
        const user = await User.findOne({ email });
        if (!user) throw new ApiError(404, "User not found.");

        if (!user.resetOtp || user.resetOtp !== Number(otp)) {
            throw new ApiError(400, "Invalid OTP. Please try again.");
        }

        if (!user.otpExpires || user.otpExpires < new Date()) {
            // Clear stale OTP
            user.resetOtp = null;
            user.otpExpires = null;
            await user.save();
            throw new ApiError(
                400,
                "OTP has expired. Please request a new one.",
            );
        }

        user.isOtpVerified = true;
        await user.save();
        return true;
    }

    async resetPasswordOtp(email, newPassword) {
        const user = await User.findOne({ email });
        if (!user) throw new ApiError(404, "User not found.");

        if (!user.isOtpVerified) {
            throw new ApiError(
                400,
                "OTP not verified. Please complete OTP verification first.",
            );
        }

        // Hash and save new password
        user.password = await hashPassword(newPassword);

        // Clear all OTP fields
        user.resetOtp = null;
        user.otpExpires = null;
        user.isOtpVerified = false;
        await user.save();

        // Generate auth tokens for auto-login
        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const userObj = user.toObject();
        delete userObj.password;

        return { user: userObj, accessToken, refreshToken };
    }

    async refreshAccessToken(token) {
        try {
            const decoded = jwt.verify(
                token,
                process.env.REFRESH_TOKEN_SECRET || "fallback_refresh_secret",
            );
            const user = await User.findById(decoded._id).select("-password");
            if (!user) throw new ApiError(404, ERROR_MESSAGES.USER_NOT_FOUND);
            if (user.isBlocked)
                throw new ApiError(403, ERROR_MESSAGES.ACCOUNT_BLOCKED);

            const accessToken = generateAccessToken(user);
            const refreshToken = generateRefreshToken(user);

            return { user, accessToken, refreshToken };
        } catch (error) {
            throw new ApiError(401, "Invalid or expired refresh token");
        }
    }

    async sendRegistrationOtp(email) {
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            throw new ApiError(
                409,
                "Email is already registered. Please login.",
            );
        }

        // Rate limiting — max 3 OTP requests per 10 minutes
        const existing = await RegistrationOtp.findOne({ email });
        if (existing) {
            const windowMs = 10 * 60 * 1000; // 10 min
            const elapsed =
                Date.now() - new Date(existing.rateLimitWindowStart).getTime();
            if (elapsed < windowMs && existing.otpSentCount >= 3) {
                const waitMin = Math.ceil((windowMs - elapsed) / 60000);
                throw new ApiError(
                    429,
                    `Too many OTP requests. Please wait ${waitMin} minute(s).`,
                );
            }
        }

        const otp = Math.floor(100000 + Math.random() * 900000);
        const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        // Build update — MongoDB rejects mixing $inc and a plain key for the same field
        const updateDoc = existing
            ? {
                  // Returning user: increment the counter, reset everything else
                  $set: { otp, expiresAt, verified: false, attempts: 0 },
                  $inc: { otpSentCount: 1 },
              }
            : {
                  // First-time: initialise all fields with $set only (no $inc)
                  $set: {
                      otp,
                      expiresAt,
                      verified: false,
                      attempts: 0,
                      otpSentCount: 1,
                      rateLimitWindowStart: new Date(),
                  },
              };

        await RegistrationOtp.findOneAndUpdate({ email }, updateDoc, {
            upsert: true,
            returnDocument: "after",
        });

        await sendRegistrationOtpMail(email, otp);
    }

    async verifyRegistrationOtp(email, otp) {
        const record = await RegistrationOtp.findOne({ email });
        if (!record) {
            throw new ApiError(404, "OTP not found. Please request a new one.");
        }

        if (new Date() > record.expiresAt) {
            throw new ApiError(
                400,
                "OTP has expired. Please request a new one.",
            );
        }

        if (record.attempts >= 5) {
            throw new ApiError(
                429,
                "Too many wrong attempts. Please request a new OTP.",
            );
        }

        if (record.otp !== Number(otp)) {
            record.attempts += 1;
            await record.save();
            const remaining = 5 - record.attempts;
            throw new ApiError(
                400,
                `Incorrect OTP. ${remaining} attempt(s) remaining.`,
            );
        }

        // Mark verified — doc is cleaned up in registerUser or by TTL
        record.verified = true;
        await record.save();
    }
}

export default new UserService();
