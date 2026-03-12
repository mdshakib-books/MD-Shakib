import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import orderService from "../services/order.service.js";

export const createOrder = asyncHandler(async (req, res) => {
    const { addressId, paymentMethod, idempotencyKey } = req.body;
    const result = await orderService.createOrder(
        req.user._id,
        addressId,
        paymentMethod,
        idempotencyKey,
    );
    return res
        .status(201)
        .json(new ApiResponse(201, result, "Order initiated securely"));
});

export const getMyOrders = asyncHandler(async (req, res) => {
    const orders = await orderService.getMyOrders(req);
    return res
        .status(200)
        .json(new ApiResponse(200, orders, "My orders retrieved successfully"));
});

export const getOrderById = asyncHandler(async (req, res) => {
    const data = await orderService.getOrderById(req.params.id, req.user._id);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Order details fetched safely"));
});

export const cancelOrder = asyncHandler(async (req, res) => {
    const result = await orderService.cancelOrder(
        req.params.id,
        req.user._id,
        req.body.reason,
    );
    return res
        .status(200)
        .json(new ApiResponse(200, result, "Order cancelled efficiently"));
});

export const requestReplacement = asyncHandler(async (req, res) => {
    const result = await orderService.requestReplacement(
        req.params.id,
        req.user._id,
        req.body.reason,
    );
    return res
        .status(200)
        .json(new ApiResponse(200, result, "Replacement requested gracefully"));
});
