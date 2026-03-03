import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import paymentService from "../services/payment.service.js";

export const createOnlinePaymentIntent = asyncHandler(async (req, res) => {
    const { orderId, amount } = req.body; // In production, never trust 'amount' from client, re-calculate it in service

    const intent = await paymentService.createPaymentIntent(
        orderId,
        amount,
        req.user._id,
    );

    return res
        .status(201)
        .json(new ApiResponse(201, intent, "Payment intent generated"));
});

/**
 * Webhook intended for external service hitting our API
 * It receives RazorPay/Stripe payloads
 */
export const verifyPaymentWebhook = asyncHandler(async (req, res) => {
    await paymentService.verifyPaymentWebhook(req.body);

    // Return simple 200 OK for Webhook caller (No complex JSON, just acknowledge)
    return res.status(200).send("Webhook Processed");
});

export const handlePaymentFailure = asyncHandler(async (req, res) => {
    const { paymentId, reason } = req.body;
    await paymentService.handlePaymentFailure(paymentId, reason);

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Payment failure registered"));
});
