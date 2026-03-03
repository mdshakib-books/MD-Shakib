import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import addressService from "../services/address.service.js";

export const addAddress = asyncHandler(async (req, res) => {
    const address = await addressService.addAddress(req.user._id, req.body);
    return res
        .status(201)
        .json(new ApiResponse(201, address, "Address added successfully"));
});

export const getUserAddresses = asyncHandler(async (req, res) => {
    const addresses = await addressService.getUserAddresses(req.user._id);
    return res
        .status(200)
        .json(
            new ApiResponse(200, addresses, "Addresses retrieved successfully"),
        );
});

export const updateAddress = asyncHandler(async (req, res) => {
    const address = await addressService.updateAddress(
        req.user._id,
        req.params.id,
        req.body,
    );
    return res
        .status(200)
        .json(new ApiResponse(200, address, "Address updated successfully"));
});

export const deleteAddress = asyncHandler(async (req, res) => {
    await addressService.deleteAddress(req.user._id, req.params.id);
    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Address deleted successfully"));
});

export const setDefaultAddress = asyncHandler(async (req, res) => {
    const address = await addressService.setDefaultAddress(
        req.user._id,
        req.params.id,
    );
    return res
        .status(200)
        .json(new ApiResponse(200, address, "Default address updated"));
});
