import mongoose from "mongoose";
import User from "./src/models/user.model.js";
import Address from "./src/models/address.model.js";
import Cart from "./src/models/cart.model.js";
import Book from "./src/models/book.model.js";
import dotenv from "dotenv";
import axios from "axios";

dotenv.config();

async function runTest() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        const user = await User.findOne({});
        if (!user) {
            console.log("No user found.");
            process.exit(0);
        }
        
        // Generate Token
        const token = user.generateAccessToken();
        
        // Find Address
        const address = await Address.findOne({ userId: user._id });
        const addressId = address ? address._id.toString() : "000000000000000000000000";

        // Place order
        console.log("Placing order...");
        try {
            const res = await axios.post("http://localhost:8000/api/v1/orders", {
                addressId,
                paymentMethod: "COD",
                idempotencyKey: "test12345" + Math.random()
            }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            console.log("SUCCESS:", res.data);
        } catch (err) {
            console.log("ERROR STATUS:", err.response?.status);
            console.log("ERROR MESSAGE:", err.response?.data?.message);
            console.log("ERROR FULL:", JSON.stringify(err.response?.data));
        }

        process.exit(0);
    } catch (error) {
        console.error("Script error:", error);
        process.exit(1);
    }
}
runTest();
