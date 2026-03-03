import mongoose from "mongoose";

const cartItemSchema = new mongoose.Schema(
    {
        bookId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Book",
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 1,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    { _id: false },
);

const cartSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            unique: true, // Will create an index automatically
        },
        items: {
            type: [cartItemSchema],
            required: true,
            default: [],
        },
    },
    {
        timestamps: { createdAt: false, updatedAt: true }, // Usually carts don't heavily rely on createdAt, but we'll include timestamps true to match requirement
    },
);

// Re-enabling createdAt as requested in generic terms, although cart mostly updates
cartSchema.set("timestamps", true);

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;
