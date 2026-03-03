import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import cartService from "../services/cart.service.js";

export const getCart = asyncHandler(async (req, res) => {
    const cart = await cartService.getCart(req.user._id);
    return res
        .status(200)
        .json(new ApiResponse(200, cart, "Cart retrieved successfully"));
});

export const addToCart = asyncHandler(async (req, res) => {
    const { bookId, quantity } = req.body;
    const cart = await cartService.addToCart(req.user._id, bookId, quantity); // add to cart service already handles adding/updating
    return res
        .status(200)
        .json(new ApiResponse(200, cart, "Item added to cart"));
});

export const updateCartItem = asyncHandler(async (req, res) => {
    const cart = await cartService.updateCartItem(
        req.user._id,
        req.params.bookId,
        req.body.quantity,
    );
    return res
        .status(200)
        .json(new ApiResponse(200, cart, "Cart item updated"));
});

export const removeCartItem = asyncHandler(async (req, res) => {
    const cart = await cartService.removeCartItem(
        req.user._id,
        req.params.bookId,
    );
    return res
        .status(200)
        .json(new ApiResponse(200, cart, "Item removed from cart"));
});

export const clearCart = asyncHandler(async (req, res) => {
    const cart = await cartService.clearCart(req.user._id);
    return res
        .status(200)
        .json(new ApiResponse(200, cart, "Cart cleared successfully"));
});
