import Cart from "../models/cart.model.js";
import Book from "../models/book.model.js";
import { ApiError } from "../utils/ApiError.js";

class CartService {
    serializeCart(cartDoc) {
        if (!cartDoc) return { userId: null, items: [] };

        return {
            _id: cartDoc._id,
            userId: cartDoc.userId,
            items: (cartDoc.items || []).map((item) => {
                const bookObj =
                    item.bookId && typeof item.bookId === "object"
                        ? item.bookId
                        : null;
                const bookId = bookObj?._id || item.bookId;
                const title = item.title || bookObj?.title || "Unknown Book";
                const imageUrl =
                    item.imageUrl ||
                    bookObj?.imageUrl ||
                    "https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=crop&q=80&w=120";

                return {
                    bookId: bookId?.toString?.() || String(bookId),
                    title,
                    imageUrl,
                    quantity: Number(item.quantity) || 1,
                    price: Number(item.price) || 0,
                };
            }),
        };
    }

    async getCartWithBookDetails(userId) {
        return Cart.findOne({ userId })
            .populate("items.bookId", "title imageUrl isActive stock")
            .lean();
    }

    async getCart(userId) {
        const cart = await this.getCartWithBookDetails(userId);

        if (!cart) {
            // Return empty structure if cart not yet materialized
            return { userId, items: [] };
        }

        return this.serializeCart(cart);
    }

    async addToCart(userId, bookId, quantity) {
        const qty = Number(quantity);
        if (!bookId) throw new ApiError(400, "bookId is required");
        if (!Number.isInteger(qty) || qty < 1) {
            throw new ApiError(400, "Quantity must be at least 1");
        }

        const book = await Book.findById(bookId).lean();
        if (!book || !book.isActive) {
            throw new ApiError(404, "Book is not available");
        }

        if (book.stock < qty) {
            throw new ApiError(400, `Only ${book.stock} left in stock`);
        }

        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({
                userId: userId,
                items: [{ bookId, quantity: qty, price: book.price }],
            });
        } else {
            const itemIndex = cart.items.findIndex(
                (item) => item.bookId.toString() === bookId.toString(),
            );

            if (itemIndex > -1) {
                // Update existing item
                const newQuantity = Number(cart.items[itemIndex].quantity) + qty;

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
                cart.items.push({ bookId, quantity: qty, price: book.price });
            }
        }

        await cart.save();
        const updatedCart = await this.getCartWithBookDetails(userId);
        return this.serializeCart(updatedCart);
    }

    async updateCartItem(userId, bookId, quantity) {
        const qty = Number(quantity);
        if (!Number.isInteger(qty) || qty < 1) {
            throw new ApiError(400, "Quantity must be at least 1");
        }

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

        if (book.stock < qty) {
            throw new ApiError(400, `Only ${book.stock} left in stock`);
        }

        cart.items[itemIndex].quantity = qty;
        cart.items[itemIndex].price = book.price; // Snapshot latest price
        await cart.save();

        const updatedCart = await this.getCartWithBookDetails(userId);
        return this.serializeCart(updatedCart);
    }

    async removeCartItem(userId, bookId) {
        const cart = await Cart.findOne({ userId });
        if (!cart) throw new ApiError(404, "Cart not found");

        cart.items = cart.items.filter(
            (item) => item.bookId.toString() !== bookId.toString(),
        );

        await cart.save();
        const updatedCart = await this.getCartWithBookDetails(userId);
        return this.serializeCart(updatedCart);
    }

    async clearCart(userId) {
        const cart = await Cart.findOne({ userId });

        if (cart) {
            cart.items = [];
            await cart.save();
        }

        return { userId: userId.toString(), items: [] };
    }

    async mergeCart(userId, guestItems) {
        if (!guestItems || guestItems.length === 0) {
            return this.getCart(userId);
        }

        let cart = await Cart.findOne({ userId });

        if (!cart) {
            cart = new Cart({ userId, items: [] });
        }

        for (const guestItem of guestItems) {
            const { bookId, quantity, price } = guestItem;

            // Validate that the book still exists and is active
            const book = await Book.findById(bookId).lean();
            if (!book || !book.isActive) continue; // Skip invalid books silently

            const itemIndex = cart.items.findIndex(
                (item) => item.bookId.toString() === bookId.toString(),
            );

            if (itemIndex > -1) {
                // Merge quantities — cap at available stock
                const mergedQty = Number(cart.items[itemIndex].quantity) + Number(quantity || 0);
                cart.items[itemIndex].quantity = Math.min(
                    mergedQty,
                    book.stock,
                );
                cart.items[itemIndex].price = book.price; // Refresh to latest price
            } else {
                // Add new item from guest cart
                const safeQty = Math.min(quantity, book.stock);
                if (safeQty > 0) {
                    cart.items.push({
                        bookId,
                        quantity: Number(safeQty),
                        price: book.price,
                    });
                }
            }
        }

        await cart.save();
        const updatedCart = await this.getCartWithBookDetails(userId);
        return this.serializeCart(updatedCart);
    }
}

export default new CartService();
