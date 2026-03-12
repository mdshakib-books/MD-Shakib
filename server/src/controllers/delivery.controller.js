import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import Order from "../models/order.model.js";
import { ORDER_STATUS } from "../utils/order.constants.js";
import delhiveryService from "../services/delhivery.service.js";
import {
    emitOrderStatusUpdated,
    emitPaymentUpdated,
} from "../sockets/order.socket.js";

export const checkServiceability = asyncHandler(async (req, res) => {
    const { pincode } = req.query;
    if (!pincode) {
        return res
            .status(400)
            .json(new ApiResponse(400, {}, "pincode query param is required"));
    }

    const data = await delhiveryService.checkServiceability(pincode);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Serviceability fetched successfully"));
});

export const trackShipment = asyncHandler(async (req, res) => {
    const { awb } = req.params;
    if (!awb) {
        return res
            .status(400)
            .json(new ApiResponse(400, {}, "awb route param is required"));
    }

    const data = await delhiveryService.trackShipment(awb);
    return res
        .status(200)
        .json(new ApiResponse(200, data, "Tracking data fetched successfully"));
});

// Webhook endpoint for Delhivery updates
export const handleDelhiveryWebhook = asyncHandler(async (req, res) => {
    // Delhivery typically POSTs data regarding shipment status events
    // Assuming JSON payload for standard webhook
    const payload = req.body;

    // Based on generic structural example in instructions:
    const awb = payload?.awb || payload?.Shipment?.AWB;
    const trackingStatus = payload?.status || payload?.Shipment?.Status?.Status;
    
    if (!awb || !trackingStatus) {
        return res.status(400).send("Invalid Webhook Payload");
    }

    const order = await Order.findOne({ "shipping.awb": awb });
    if (!order) {
        return res.status(404).send("Order not found with this AWB");
    }

    let newStatus = order.orderStatus;
    
    // Map Delhivery status to internal order status
    // Example statuses: 'In Transit', 'Out for Delivery', 'Delivered', 'RTO Delivered'
    const statusText = trackingStatus.toLowerCase();
    
    if (statusText.includes("delivered")) {
        newStatus = ORDER_STATUS.DELIVERED;
        if (!order.shipping) order.shipping = {};
        order.shipping.deliveredAt = new Date();
    } else if (statusText.includes("out for delivery")) {
        newStatus = ORDER_STATUS.OUT_FOR_DELIVERY;
    } else if (statusText.includes("in transit") || statusText.includes("shipped") || statusText.includes("dispatched")) {
        newStatus = ORDER_STATUS.SHIPPED;
    }

    if (newStatus !== order.orderStatus) {
        order.orderStatus = newStatus;
        if (newStatus === ORDER_STATUS.DELIVERED) {
            order.deliveredAt = new Date();
            if (order.paymentMethod === "COD" && order.paymentStatus !== "Paid") {
                order.paymentStatus = "Paid";
                order.isPaid = true;
                order.paidAt = new Date();
                order.statusHistory.push({
                    status: ORDER_STATUS.DELIVERED,
                    timestamp: new Date(),
                    note: "COD payment confirmed at delivery",
                });
            }
        }
        order.statusHistory.push({
            status: newStatus,
            timestamp: new Date(),
            note: `Courier Update: ${trackingStatus}`,
        });
        await order.save();
        emitOrderStatusUpdated(order);
        if (newStatus === ORDER_STATUS.DELIVERED && order.paymentMethod === "COD") {
            emitPaymentUpdated(order);
        }
    }

    return res.status(200).send("Webhook Processed");
});
