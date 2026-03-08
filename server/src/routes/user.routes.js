import { Router } from "express";
import {
    registerUser,
    loginUser,
    logoutUser,
    refreshToken,
    getProfile,
    updateProfile,
    changePassword,
    deleteAccount,
    sendOTP,
    verifyOTP,
    resetPassword,
    sendRegistrationOTP,
    verifyRegistrationOTP,
} from "../controllers/user.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
    registerSchema,
    loginSchema,
    updateProfileSchema,
    changePasswordSchema,
    sendOtpSchema,
    verifyOtpSchema,
    resetPasswordOtpSchema,
    sendRegistrationOtpSchema,
    verifyRegistrationOtpSchema,
} from "../utils/user.validation.js";

const router = Router();

// Public routes
router.post("/register", validate(registerSchema), registerUser);
router.post("/login", validate(loginSchema), loginUser);
router.post("/refresh-token", refreshToken);

// OTP-based password reset (replaces old token-based flow)
router.post("/send-otp", validate(sendOtpSchema), sendOTP);
router.post("/verify-otp", validate(verifyOtpSchema), verifyOTP);
router.post("/reset-password", validate(resetPasswordOtpSchema), resetPassword);

// Registration email OTP
router.post(
    "/send-registration-otp",
    validate(sendRegistrationOtpSchema),
    sendRegistrationOTP,
);
router.post(
    "/verify-registration-otp",
    validate(verifyRegistrationOtpSchema),
    verifyRegistrationOTP,
);

// Secured routes
router.use(verifyJWT);

router.post("/logout", logoutUser);
router.get("/profile", getProfile);
router.patch("/profile", validate(updateProfileSchema), updateProfile);
router.patch(
    "/change-password",
    validate(changePasswordSchema),
    changePassword,
);
router.delete("/account", deleteAccount);

export default router;
