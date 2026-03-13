import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
    {
        bookId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Book",
            required: true,
        },
        title: { type: String, required: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
        imageUrl: { type: String, required: true },
    },
    { _id: false },
);

const addressSnapshotSchema = new mongoose.Schema(
    {
        fullName: { type: String, required: true, trim: true },
        phone: { type: String, required: true, trim: true },
        pincode: { type: String, required: true, trim: true },
        state: { type: String, required: true, trim: true },
        city: { type: String, required: true, trim: true },
        houseNo: { type: String, required: true, trim: true },
        area: { type: String, required: true, trim: true },
        landmark: { type: String, trim: true },
    },
    { _id: false },
);

// Tracks each status change with timestamp
const statusHistorySchema = new mongoose.Schema(
    {
        status: { type: String, required: true },
        timestamp: { type: Date, default: Date.now },
        note: { type: String, default: "" },
    },
    { _id: false },
);

// Shipping details
const shippingSchema = new mongoose.Schema(
    {
        courier: { type: String, default: "Delhivery" },
        awb: { type: String },
        trackingUrl: { type: String },
        pickupScheduled: { type: Boolean, default: false },
        shippedAt: { type: Date },
        deliveredAt: { type: Date },
    },
    { _id: false }
);

// Replacement details
const replacementSchema = new mongoose.Schema(
    {
        replacementRequested: { type: Boolean, default: false },
        replacementStatus: {
            type: String,
            enum: [
                "None",
                "Requested",
                "Approved",
                "Rejected",
                "Replacement Shipped",
                "Replacement Delivered",
            ],
            default: "None",
        },
        replacementReason: { type: String },
        replacementRequestedAt: { type: Date },
        replacementRejectedAt: { type: Date },
        replacementRejectionReason: { type: String, default: "" },
    },
    { _id: false }
);

const orderSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },
        items: {
            type: [orderItemSchema],
            required: true,
            validate: {
                validator: (v) => v && v.length > 0,
                message: "Order items cannot be empty.",
            },
        },
        address: { type: addressSnapshotSchema, required: true },
        totalAmount: { type: Number, required: true, min: 0 },
        paymentMethod: {
            type: String,
            required: true,
            enum: ["COD", "ONLINE", "Online"],
            set: (value) => {
                const normalized = String(value || "")
                    .trim()
                    .toUpperCase();
                if (normalized === "COD") return "COD";
                if (normalized === "ONLINE") return "ONLINE";
                return value;
            },
        },
        paymentStatus: {
            type: String,
            required: true,
            enum: ["Pending", "Paid", "Failed", "Refunded"],
            default: "Pending",
            index: true,
        },
        orderStatus: {
            type: String,
            required: true,
            enum: [
                "Pending",
                "Confirmed",
                "Packed",
                "Shipped",
                "Out for Delivery",
                "Delivered",
                "Cancelled",
                "Replacement Requested",
                "Replacement Approved",
                "Replacement Rejected",
                "Replacement Shipped",
                "Replacement Delivered",
                "Returned",
            ],
            default: "Pending",
            index: true,
        },
        // Full audit trail of every status change
        statusHistory: {
            type: [statusHistorySchema],
            default: [],
        },
        shipping: { type: shippingSchema, default: () => ({}) },
        replacement: { type: replacementSchema, default: () => ({}) },
        cancelReason: { type: String, default: "" },
        isPaid: { type: Boolean, required: true, default: false },
        paidAt: { type: Date },
        deliveredAt: { type: Date },
        razorpayOrderId: { type: String },
        razorpayPaymentId: { type: String },
    },
    { timestamps: true },
);

orderSchema.index({ createdAt: -1 });

// Auto-push the initial "Pending" status entry on creation
orderSchema.pre("save", function () {
    if (this.isNew && this.statusHistory.length === 0) {
        this.statusHistory.push({ status: "Pending", timestamp: new Date() });
    }
});

const Order = mongoose.model("Order", orderSchema);
export default Order;
