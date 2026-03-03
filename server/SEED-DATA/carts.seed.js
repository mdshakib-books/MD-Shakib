import Cart from "../src/models/cart.model.js";

export const seedCarts = async (users, books) => {
    console.log("Seeding Carts...");

    // Give Bob Wilson a cart with 2 items
    const bobCart = await Cart.create({
        userId: users[2]._id,
        items: [
            {
                bookId: books[0]._id, // The Silent Patient
                price: books[0].price,
                quantity: 1,
            },
            {
                bookId: books[1]._id, // Atomic Habits
                price: books[1].price,
                quantity: 2,
            },
        ],
    });

    console.log(`✅ Seeded 1 Cart for Bob Wilson.`);
    return [bobCart];
};
