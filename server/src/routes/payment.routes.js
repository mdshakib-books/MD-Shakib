import { Router } from "express";
import {
    createOnlinePaymentIntent,
    verifyPaymentWebhook,
    handlePaymentFailure,
} from "../controllers/payment.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
    createPaymentIntentSchema,
    verifyPaymentWebhookSchema,
} from "../utils/payment.validation.js";

const router = Router();

// Public webhook
router.post(
    "/webhook",
    validate(verifyPaymentWebhookSchema),
    verifyPaymentWebhook,
);

// Protected routes
router.use(verifyJWT);
router.post(
    "/create-intent",
    validate(createPaymentIntentSchema),
    createOnlinePaymentIntent,
);
router.post("/failure", handlePaymentFailure);

export default router;
