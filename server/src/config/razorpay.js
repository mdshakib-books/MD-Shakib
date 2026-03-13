import Razorpay from "razorpay";
import { ApiError } from "../utils/ApiError.js";

const hasRazorpayKeys = Boolean(
    process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET,
);

const razorpayInstance = hasRazorpayKeys
    ? new Razorpay({
          key_id: process.env.RAZORPAY_KEY_ID,
          key_secret: process.env.RAZORPAY_KEY_SECRET,
      })
    : null;

export const isRazorpayConfigured = () => hasRazorpayKeys;

export const getRazorpayInstance = () => {
    if (!razorpayInstance) {
        throw new ApiError(
            500,
            "Payment gateway is not configured. Please contact support.",
        );
    }

    return razorpayInstance;
};

export { razorpayInstance };
