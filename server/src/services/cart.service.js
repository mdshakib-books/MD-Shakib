import Cart from "../models/cart.model.js";
import Book from "../models/book.model.js";
import { ApiError } from "../utils/ApiError.js";

class CartService {
    async getCart(userId) {
        let cart = await Cart.findOne({ userId }).lean();

        if (!cart) {
            // Return empty structure if cart not yet materialized
            return { userId, items: [] };
        }

        return cart;
    }

    async addToCart(userId, bookId, quantity) {
        const book = await Book.findById(bookId).lean();
        if (!book || !book.isActive) {
            throw new ApiError(404, "Book is not available");
        }

        if (book.stock < quantity) {
            throw new ApiError(400, `Only ${book.stock} left in stock`);
        }

        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({
                userId,
                items: [{ bookId, quantity, price: book.price }],
            });
        } else {
            const itemIndex = cart.items.findIndex(
                (item) => item.bookId.toString() === bookId.toString(),
            );

            if (itemIndex > -1) {
                // Update existing item
                const newQuantity = cart.items[itemIndex].quantity + quantity;

                if (book.stock < newQuantity) {
                    throw new ApiError(
                        400,
                        `Cannot add more. Only ${book.stock} left in stock`,
                    );
                }

                cart.items[itemIndex].quantity = newQuantity;
                cart.items[itemIndex].price = book.price; // Update price snapshot to latest when modifying
            } else {
                // Add new item
                cart.items.push({ bookId, quantity, price: book.price });
            }
        }

        await cart.save();
        return cart;
    }

    async updateCartItem(userId, bookId, quantity) {
        const cart = await Cart.findOne({ userId });
        if (!cart) throw new ApiError(404, "Cart not found");

        const itemIndex = cart.items.findIndex(
            (item) => item.bookId.toString() === bookId.toString(),
        );

        if (itemIndex === -1) {
            throw new ApiError(404, "Item not found in cart");
        }

        // Validate stock
        const book = await Book.findById(bookId).lean();
        if (!book) throw new ApiError(404, "Book not found");

        if (book.stock < quantity) {
            throw new ApiError(400, `Only ${book.stock} left in stock`);
        }

        cart.items[itemIndex].quantity = quantity;
        cart.items[itemIndex].price = book.price; // Snapshot latest price
        await cart.save();

        return cart;
    }

    async removeCartItem(userId, bookId) {
        const cart = await Cart.findOne({ userId });
        if (!cart) throw new ApiError(404, "Cart not found");

        cart.items = cart.items.filter(
            (item) => item.bookId.toString() !== bookId.toString(),
        );

        await cart.save();
        return cart;
    }

    async clearCart(userId) {
        const cart = await Cart.findOne({ userId });

        if (cart) {
            cart.items = [];
            await cart.save();
        }

        return { userId, items: [] };
    }
}

export default new CartService();
