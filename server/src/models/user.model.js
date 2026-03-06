import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
            index: true,
        },
        password: {
            type: String,
            required: true,
        },
        role: {
            type: String,
            required: true,
            enum: ["user", "admin"],
            default: "user",
            index: true,
        },
        phone: {
            type: String,
            trim: true,
        },
        isBlocked: {
            type: Boolean,
            required: true,
            default: false,
        },
        isDeleted: {
            type: Boolean,
            default: false,
            index: true,
        },
        deletedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    },
);

// Middleware to exclude soft-deleted records by default
userSchema.pre(/^find/, function () {
    if (this.options._recursed) {
        return;
    }
    this.where({ isDeleted: { $ne: true } });
});

const User = mongoose.model("User", userSchema);
export default User;
