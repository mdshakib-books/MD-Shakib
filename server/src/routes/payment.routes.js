import { Router } from "express";
import {
    createOnlinePaymentIntent,
    verifyRazorpayPayment,
    verifyPaymentWebhook,
    handlePaymentFailure,
    retryPayment,
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
    createPaymentIntentSchema,
    verifyPaymentSchema,
    handlePaymentFailureSchema,
    retryPaymentSchema,
} from "../utils/payment.validation.js";

const router = Router();

// Public webhook
router.post(
    "/webhook",
    verifyPaymentWebhook,
);

// Protected routes
router.use(verifyJWT);
router.post(
    "/create-intent",
    validate(createPaymentIntentSchema),
    createOnlinePaymentIntent,
);
router.post("/verify", validate(verifyPaymentSchema), verifyRazorpayPayment);
router.post("/failure", validate(handlePaymentFailureSchema), handlePaymentFailure);
router.post("/retry", validate(retryPaymentSchema), retryPayment);

export default router;
