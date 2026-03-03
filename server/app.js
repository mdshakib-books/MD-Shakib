import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "./src/middlewares/error.middleware.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();

// Security Headers
app.use(helmet());

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 200, // limit per IP
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

app.use(
    cors({
        origin: function (origin, callback) {
            if (!origin) return callback(null, true);
            const allowedOrigin = process.env.CORS_ORIGIN || "*";
            if (allowedOrigin === "*" || origin === allowedOrigin) {
                return callback(null, true);
            }
            return callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    }),
);

app.use(express.json({ limit: "16kb" }));
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());

// routes import
import userRouter from "./src/routes/user.routes.js";
import orderRouter from "./src/routes/order.routes.js";
import adminRouter from "./src/routes/admin.routes.js";
import bookRouter from "./src/routes/book.routes.js";
import addressRouter from "./src/routes/address.routes.js";
import cartRouter from "./src/routes/cart.routes.js";
import paymentRouter from "./src/routes/payment.routes.js";

// routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/books", bookRouter);
app.use("/api/v1/addresses", addressRouter);
app.use("/api/v1/cart", cartRouter);
app.use("/api/v1/payments", paymentRouter);

// Error Handling Middleware (Global Error Handler)
app.use(errorHandler);

export { app };
