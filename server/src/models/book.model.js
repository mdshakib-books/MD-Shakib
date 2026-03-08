import mongoose from "mongoose";

const bookSchema = new mongoose.Schema(
    {
        title: { type: String, required: true, trim: true },
        author: { type: String, required: true, trim: true },
        description: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0, index: true },
        stock: { type: Number, required: true, min: 0 },
        discount: { type: Number, default: 0, min: 0, max: 100 },
        category: {
            type: String,
            required: true,
            trim: true,
            enum: ["Quran", "Hadith", "Fiqh", "History", "Biography", "Other"],
            index: true,
        },
        // New product detail fields (optional — null if not provided)
        language: { type: String, trim: true, default: null },
        pages: { type: Number, min: 1, default: null },
        publisher: { type: String, trim: true, default: null },
        publishedDate: { type: Date, default: null },
        // Legacy single-image field (backward-compatible; mirrors coverImage)
        imageUrl: { type: String, required: true, trim: true },
        // Multi-image support (max 5 uploaded via admin)
        images: { type: [String], default: [] },
        // The primary display image; set to images[0] on first upload
        coverImage: { type: String, default: "" },
        isActive: {
            type: Boolean,
            required: true,
            default: true,
            index: true,
        },
    },
    { timestamps: true },
);

// Text indexes for optimized search on title and author
bookSchema.index({ title: "text", author: "text" });
bookSchema.index({ category: 1 });

const Book = mongoose.model("Book", bookSchema);
export default Book;
