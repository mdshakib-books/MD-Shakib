import Book from "../models/book.model.js";
import mongoose from "mongoose";
import { ApiError } from "./ApiError.js";

/**
 * Atomically revalidates and reduces stock for a list of cart items using MongoDB Transactions
 */
export const validateAndReduceStock = async (items) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        for (const item of items) {
            const result = await Book.findOneAndUpdate(
                {
                    _id: item.bookId,
                    stock: { $gte: item.quantity },
                    isActive: true,
                },
                { $inc: { stock: -item.quantity } },
                { new: true, session },
            );

            if (!result) {
                // Insufficient stock or inactive book found
                throw new ApiError(
                    400,
                    `Insufficient stock or inactive book for item ID: ${item.bookId}`,
                );
            }
        }

        await session.commitTransaction();
        return true;
    } catch (error) {
        await session.abortTransaction();
        if (error instanceof ApiError) {
            throw error;
        }
        throw new ApiError(
            500,
            "An error occurred while validating and reducing stock.",
        );
    } finally {
        session.endSession();
    }
};

/**
 * Atomically restores stock when an order is cancelled
 */
export const restoreStock = async (items) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        for (const item of items) {
            await Book.updateOne(
                { _id: item.bookId },
                { $inc: { stock: item.quantity } },
                { session },
            );
        }
        await session.commitTransaction();
        return true;
    } catch (error) {
        await session.abortTransaction();
        throw new ApiError(500, "Failed to restore stock atomically.");
    } finally {
        session.endSession();
    }
};
