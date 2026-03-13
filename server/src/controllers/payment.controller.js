import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import paymentService from "../services/payment.service.js";

export const createOnlinePaymentIntent = asyncHandler(async (req, res) => {
    const { orderId, idempotencyKey } = req.body;

    const intent = await paymentService.createRazorpayOrder(
        orderId,
        undefined,
        req.user._id,
        idempotencyKey,
    );

    return res
        .status(201)
        .json(new ApiResponse(201, intent, "Payment intent created"));
});

export const verifyRazorpayPayment = asyncHandler(async (req, res) => {
    const result = await paymentService.verifyRazorpayPayment(req.body);

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Payment verified successfully"));
});

export const verifyPaymentWebhook = asyncHandler(async (req, res) => {
    const signature = String(req.headers["x-razorpay-signature"] || "");
    const eventId = String(req.headers["x-razorpay-event-id"] || "");

    const result = await paymentService.verifyPaymentWebhook(
        req.body,
        signature,
        req.rawBody || "",
        eventId,
    );

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Webhook processed"));
});

export const handlePaymentFailure = asyncHandler(async (req, res) => {
    const result = await paymentService.handlePaymentFailure(req.body);

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Payment failure recorded"));
});

export const retryPayment = asyncHandler(async (req, res) => {
    const { orderId, idempotencyKey } = req.body;
    const result = await paymentService.retryPaymentIntent(
        orderId,
        req.user._id,
        idempotencyKey,
    );

    return res
        .status(200)
        .json(new ApiResponse(200, result, "Payment intent retried"));
});
