import mongoose from "mongoose";

const bookSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },
        author: {
            type: String,
            required: true,
            trim: true,
        },
        description: {
            type: String,
            required: true,
            trim: true,
        },
        price: {
            type: Number,
            required: true,
            min: 0,
            index: true,
        },
        stock: {
            type: Number,
            required: true,
            min: 0,
        },
        discount: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        category: {
            type: String,
            required: true,
            trim: true,
        },
        imageUrl: {
            type: String,
            required: true,
            trim: true,
        },
        isActive: {
            type: Boolean,
            required: true,
            default: true,
            index: true,
        },
    },
    {
        timestamps: true,
    },
);

// Text indexes for optimized search on title and author
bookSchema.index({ title: "text", author: "text" });
// Category index for filtering
bookSchema.index({ category: 1 });
// Price and category indexed via schema field definitions

const Book = mongoose.model("Book", bookSchema);
export default Book;
