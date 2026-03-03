import mongoose from "mongoose";

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
        },
        paymentId: {
            type: String,
            required: true,
            unique: true,
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
        },
        status: {
            type: String,
            required: true,
        },
        provider: {
            type: String,
            required: true,
        },
    },
    {
        timestamps: true,
    },
);

const Payment = mongoose.model("Payment", paymentSchema);
export default Payment;
