import jwt from "jsonwebtoken";
import User from "../models/user.model.js";
import { ApiError } from "../utils/ApiError.js";
import { hashPassword, comparePassword } from "../utils/hashPassword.js";
import {
    generateAccessToken,
    generateRefreshToken,
} from "../utils/generateToken.js";
import { ERROR_MESSAGES } from "../utils/user.constants.js";

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
                isBlocked: true, // Also block account
            },
            { new: true },
        );
        if (!user) throw new ApiError(404, ERROR_MESSAGES.USER_NOT_FOUND);
        return true;
    }

    async generatePasswordResetToken(email) {
        const user = await User.findOne({ email });
        if (!user) throw new ApiError(404, ERROR_MESSAGES.USER_NOT_FOUND);

        // Using existing JWT capability for temporary password reset token
        const resetToken = generateAccessToken(user);
        return resetToken;
    }

    async resetPassword(token, newPassword) {
        try {
            const decoded = jwt.verify(
                token,
                process.env.ACCESS_TOKEN_SECRET || "fallback_access_secret",
            );
            const user = await User.findById(decoded._id);
            if (!user) throw new ApiError(404, ERROR_MESSAGES.USER_NOT_FOUND);

            user.password = await hashPassword(newPassword);
            await user.save();
            return true;
        } catch (error) {
            throw new ApiError(400, "Invalid or expired reset token");
        }
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
}

export default new UserService();
