import dotenv from "dotenv";
import connectDB from "./src/config/db.js";
import { app } from "./app.js";
import http from "http";
import { initializeSocket } from "./src/config/socket.js";

dotenv.config({
    path: "./.env",
});

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
                    console.error(
                        "Please stop the other process or set a different PORT in your .env file.",
                    );
                    process.exit(1);
                } else {
                    // rethrow unexpected errors so they can be logged by nodemon
                    throw err;
                }
            });
    })
    .catch((err) => {
        console.log("MONGO db connection failed !!! ", err);
    });
