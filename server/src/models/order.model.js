import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
    {
        bookId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Book",
            required: true,
        },
        title: {
            type: String,
            required: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        imageUrl: {
            type: String,
            required: true,
        },
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
                validator: function (v) {
                    return v && v.length > 0;
                },
                message: "Order items cannot be empty.",
            },
        },
        address: {
            type: addressSnapshotSchema,
            required: true,
        },
        totalAmount: {
            type: Number,
            required: true,
            min: 0,
        },
        paymentMethod: {
            type: String,
            required: true,
            enum: ["COD", "Online"],
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
                "Paid",
                "Packed",
                "Shipped",
                "Delivered",
                "Cancelled",
                "Returned",
            ],
            default: "Pending",
            index: true,
        },
        isPaid: {
            type: Boolean,
            required: true,
            default: false,
        },
        paidAt: {
            type: Date,
        },
        deliveredAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
    },
);

orderSchema.index({ createdAt: -1 });

const Order = mongoose.model("Order", orderSchema);
export default Order;
