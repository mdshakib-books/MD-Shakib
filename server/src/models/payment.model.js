import mongoose from "mongoose";
import { PAYMENT_PROVIDERS, PAYMENT_STATUS } from "../utils/payment.constants.js";

const paymentSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true,
            index: true,
        },
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        paymentId: {
            type: String,
            required: true,
            unique: true,
        },
        providerOrderId: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        providerPaymentId: {
            type: String,
            unique: true,
            sparse: true,
            index: true,
        },
        signature: {
            type: String,
            default: "",
        },
        idempotencyKey: {
            type: String,
            trim: true,
            index: true,
        },
        amount: {
            type: Number,
            required: true,
            min: 0,
        },
        currency: {
            type: String,
            required: true,
            default: "INR",
            uppercase: true,
        },
        status: {
            type: String,
            required: true,
            enum: Object.values(PAYMENT_STATUS),
            default: PAYMENT_STATUS.PENDING,
        },
        provider: {
            type: String,
            required: true,
            enum: Object.values(PAYMENT_PROVIDERS),
            default: PAYMENT_PROVIDERS.RAZORPAY,
        },
        failureReason: {
            type: String,
            default: "",
        },
        verifiedAt: {
            type: Date,
        },
        webhookEventIds: {
            type: [String],
            default: [],
        },
    },
    {
        timestamps: true,
    },
);

paymentSchema.index({ orderId: 1, userId: 1, createdAt: -1 });
paymentSchema.index({ orderId: 1, status: 1 });
paymentSchema.index(
    { orderId: 1, idempotencyKey: 1 },
    { unique: true, sparse: true },
);

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
