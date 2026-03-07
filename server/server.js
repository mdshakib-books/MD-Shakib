import dotenv from "dotenv";
import connectDB from "./src/config/db.js";
import { configureCloudinary } from "./src/config/cloudinary.config.js";
import { app } from "./app.js";
import http from "http";
import { initializeSocket } from "./src/config/socket.js";

// dotenv.config({
//     path: "./.env",
// });
// For Production
dotenv.config();


// Initialize Cloudinary configuration
configureCloudinary();

const server = http.createServer(app);

// Initialize Socket.io
initializeSocket(server);

connectDB()
    .then(() => {
        const PORT = process.env.PORT || 8000;

        server
            .listen(PORT, () => {
                console.log(`⚙️  Server is running at port : ${PORT}`);
            })
            .on("error", (err) => {
                if (err.code === "EADDRINUSE") {
                    console.error(`⚠️  Port ${PORT} is already in use.`);
                    process.exit(1);
                } else {
                    throw err;
                }
            });

        // ✅ ADD THIS HERE
        process.on("SIGINT", () => {
            console.log("🛑 Server shutting down...");
            server.close(() => {
                process.exit(0);
            });
        });
    })
    .catch((err) => {
        console.error("❌ MongoDB connection failed:", err.message);
        process.exit(1);
    });
