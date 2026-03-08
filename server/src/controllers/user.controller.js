import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import userService from "../services/user.service.js";

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
};

/* ───────────────── REGISTER ───────────────── */

export const registerUser = asyncHandler(async (req, res) => {
    const { email } = req.body;

    const RegistrationOtp = (await import("../models/registrationOtp.model.js"))
        .default;

    const otpRecord = await RegistrationOtp.findOne({
        email: email.toLowerCase().trim(),
    });

    if (!otpRecord || !otpRecord.verified) {
        throw new ApiError(
            403,
            "Email not verified. Please verify your email first.",
        );
    }

    const user = await userService.createUser(req.body);

    await RegistrationOtp.deleteOne({ email: email.toLowerCase().trim() });

    if (req.auditLog) {
        await req.auditLog("CREATE", "User", user._id, {}, user);
    }

    return res
        .status(201)
        .json(new ApiResponse(201, user, "User registered successfully"));
});

/* ───────────────── LOGIN ───────────────── */

export const loginUser = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    const { user, accessToken, refreshToken } = await userService.login(
        email,
        password,
    );

    if (req.auditLog) {
        await req.auditLog("LOGIN", "User", user._id, {}, { email });
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(
            new ApiResponse(
                200,
                { user, accessToken, refreshToken },
                "User logged in successfully",
            ),
        );
});

/* ───────────────── LOGOUT ───────────────── */

export const logoutUser = asyncHandler(async (req, res) => {
    if (req.auditLog) {
        await req.auditLog("LOGOUT", "User", req.user._id, {}, {});
    }

    const options = {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };

    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(new ApiResponse(200, {}, "User logged out successfully"));
});

/* ───────────────── REFRESH TOKEN ───────────────── */

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

/* ───────────────── PROFILE ───────────────── */

export const getProfile = asyncHandler(async (req, res) => {
    return res
        .status(200)
        .json(new ApiResponse(200, req.user, "User profile fetched"));
});

export const updateProfile = asyncHandler(async (req, res) => {
    const oldUser = (await req.user.toObject?.()) || req.user;

    const updatedUser = await userService.updateProfile(req.user._id, req.body);

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

/* ───────────────── CHANGE PASSWORD ───────────────── */

export const changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    await userService.changePassword(req.user._id, oldPassword, newPassword);

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

/* ───────────────── DELETE ACCOUNT ───────────────── */

export const deleteAccount = asyncHandler(async (req, res) => {
    await userService.deleteAccount(req.user._id);

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
        sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    };
    return res
        .status(200)
        .clearCookie("accessToken", cookieOptions)
        .clearCookie("refreshToken", cookieOptions)
        .json(new ApiResponse(200, {}, "Account soft deleted successfully"));
});

/* ───────────────── PASSWORD RESET OTP ───────────────── */

export const sendOTP = asyncHandler(async (req, res) => {
    const { email } = req.body;

    await userService.sendOtp(email);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "OTP sent to your email successfully"));
});

export const verifyOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    await userService.verifyOtp(email, otp);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "OTP verified successfully"));
});

export const resetPassword = asyncHandler(async (req, res) => {
    const { email, newPassword } = req.body;

    const { user, accessToken, refreshToken } =
        await userService.resetPasswordOtp(email, newPassword);

    return res
        .status(200)
        .cookie("accessToken", accessToken, cookieOptions)
        .cookie("refreshToken", refreshToken, cookieOptions)
        .json(
            new ApiResponse(
                200,
                { user, accessToken, refreshToken },
                "Password reset successfully",
            ),
        );
});

/* ───────────────── REGISTRATION OTP ───────────────── */

export const sendRegistrationOTP = asyncHandler(async (req, res) => {
    const { email } = req.body;

    await userService.sendRegistrationOtp(email);

    return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "OTP sent to your email for verification"),
        );
});

export const verifyRegistrationOTP = asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    await userService.verifyRegistrationOtp(email, otp);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Email verified successfully"));
});
