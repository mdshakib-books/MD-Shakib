import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import userService from "../services/user.service.js";

export const registerUser = asyncHandler(async (req, res) => {
    const user = await userService.createUser(req.body);

    // Audit log
    if (req.auditLog) {
        await req.auditLog("CREATE", "User", user._id, {}, user);
    }

    return res
        .status(201)
        .json(new ApiResponse(201, user, "User registered successfully"));
});

export const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const { user, accessToken, refreshToken } = await userService.login(
        email,
        password,
    );

    // Audit log login
    if (req.auditLog) {
        await req.auditLog("LOGIN", "User", user._id, {}, { email });
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)
        .json(
            new ApiResponse(
                200,
                { user, accessToken, refreshToken },
                "User logged in successfully",
            ),
        );
});

export const logoutUser = asyncHandler(async (req, res) => {
    // Audit log logout
    if (req.auditLog) {
        await req.auditLog("LOGOUT", "User", req.user._id, {}, {});
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    };

    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});

export const refreshToken = asyncHandler(async (req, res) => {
    const { refreshToken: token } = req.body;

    if (!token) {
        throw new ApiError(401, "Refresh token is required");
    }

    const {
        user,
        accessToken,
        refreshToken: newRefreshToken,
    } = await userService.refreshAccessToken(token);

    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { user, accessToken, refreshToken: newRefreshToken },
                "Token refreshed successfully",
            ),
        );
});

export const getProfile = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "User profile fetched"));
});

export const updateProfile = asyncHandler(async (req, res) => {
    const oldUser = (await req.user.toObject?.()) || req.user;
    const updatedUser = await userService.updateProfile(req.user._id, req.body);

    // Audit log
    if (req.auditLog) {
        await req.auditLog(
            "UPDATE",
            "User",
            req.user._id,
            oldUser,
            updatedUser,
        );
    }

    return res
        .status(200)
        .json(
            new ApiResponse(200, updatedUser, "Profile updated successfully"),
        );
});

export const changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;
    await userService.changePassword(req.user._id, oldPassword, newPassword);

    // Audit log
    if (req.auditLog) {
        await req.auditLog(
            "UPDATE",
            "User",
            req.user._id,
            { password: "***" },
            { password: "***" },
        );
    }

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password changed successfully"));
});

export const deleteAccount = asyncHandler(async (req, res) => {
    await userService.deleteAccount(req.user._id);

    // Audit log soft delete
    if (req.auditLog) {
        await req.auditLog(
            "SOFT_DELETE",
            "User",
            req.user._id,
            { user: req.user },
            {},
        );
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
    };
    return res
        .status(200)
        .clearCookie("accessToken", options)
        .clearCookie("refreshToken", options)
        .json(new ApiResponse(200, {}, "Account soft deleted successfully"));
});

export const forgotPassword = asyncHandler(async (req, res) => {
    const { email } = req.body;
    const resetToken = await userService.generatePasswordResetToken(email);
    return res
        .status(200)
        .json(
            new ApiResponse(
                200,
                { resetToken },
                "Password reset token created",
            ),
        );
});

export const resetPassword = asyncHandler(async (req, res) => {
    const { token, newPassword } = req.body;
    await userService.resetPassword(token, newPassword);
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Password reset successfully"));
});
