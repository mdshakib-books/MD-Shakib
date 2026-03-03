import mongoose from "mongoose";
import dotenv from "dotenv";
import connectDB from "../src/config/db.js";

// Models (to clear existing data)
import User from "../src/models/user.model.js";
import Book from "../src/models/book.model.js";
import Address from "../src/models/address.model.js";
import Cart from "../src/models/cart.model.js";
import Order from "../src/models/order.model.js";
import Payment from "../src/models/payment.model.js";

// Seed Scripts
import { seedUsers } from "./users.seed.js";
import { seedBooks } from "./books.seed.js";
import { seedAddresses } from "./addresses.seed.js";
import { seedCarts } from "./carts.seed.js";
import { seedOrders } from "./orders.seed.js";
import { seedPayments } from "./payments.seed.js";

// Load env vars
dotenv.config({ path: "./.env" });

const runSeeder = async () => {
    try {
        await connectDB();
        console.log("---------------------------------------");
        console.log("🚀 Starting Seeding Process");
        console.log("---------------------------------------");

        // Provide optional toggle to wipe entire db via argument --clear
        if (process.argv.includes("--clear")) {
            console.log("⚠️  Clearing existing database collections...");
            await Order.deleteMany();
            await Payment.deleteMany();
            await Cart.deleteMany();
            await Address.deleteMany();
            await Book.deleteMany();
            await User.deleteMany();
            console.log("🧹 Database Cleared.");
            console.log("---------------------------------------");
        }

        // 1. Seed Users
        const { adminUser, normalUsers } = await seedUsers();

        // 2. Seed Books
        const books = await seedBooks();

        // 3. Combine user objects for downstream relations
        const allUsers = [adminUser, ...normalUsers];

        // 4. Seed Addresses
        const addresses = await seedAddresses(allUsers);

        // 5. Seed Carts
        await seedCarts(allUsers, books);

        // 6. Seed Orders (with real book/address/user relations & stock reduction)
        const orders = await seedOrders(allUsers, books, addresses);

        // 7. Seed Payments (Mocking Razorpay triggers)
        await seedPayments(orders);

        console.log("---------------------------------------");
        console.log("🎉 Seeding Completed Successfully.");
        console.log("---------------------------------------");
        process.exit();
    } catch (error) {
        console.error("❌ Error running seeders:", error);
        process.exit(1);
    }
};

runSeeder();
