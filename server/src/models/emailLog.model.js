import mongoose from "mongoose";

const emailLogSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            default: null,
            index: true,
        },
        recipient: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        eventType: {
            type: String,
            required: true,
            trim: true,
            index: true,
        },
        status: {
            type: String,
            enum: ["queued", "sent", "failed"],
            required: true,
            index: true,
        },
        providerResponse: {
            type: String,
            default: "",
        },
        timestamp: {
            type: Date,
            default: Date.now,
            index: true,
        },
    },
    { timestamps: true },
);

const EmailLog = mongoose.model("EmailLog", emailLogSchema);
export default EmailLog;
