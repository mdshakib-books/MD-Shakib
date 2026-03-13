import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { errorHandler } from "./src/middlewares/error.middleware.js";
import auditLog from "./src/middlewares/audit.middleware.js";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();

// Tell Express to trust the Render proxy to fix rate-limit errors
app.set("trust proxy", 1);

// Security Headers
app.use(helmet());

app.use(
    cors({
        origin: [
            process.env.CORS_ORIGIN,
            "http://localhost:5173",
            "http://127.0.0.1:5173",
        ].filter(Boolean),
        credentials: true,
    }),
);

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 1000, // relaxed limit for local dev
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

app.use(
    express.json({
        limit: "16kb",
        verify: (req, _res, buf) => {
            if (buf?.length) {
                req.rawBody = buf.toString("utf8");
            }
        },
    }),
);
app.use(express.urlencoded({ extended: true, limit: "16kb" }));
app.use(express.static("public"));
app.use(cookieParser());
app.use(auditLog);

// routes import
import userRouter from "./src/routes/user.routes.js";
import orderRouter from "./src/routes/order.routes.js";
import adminRouter from "./src/routes/admin.routes.js";
import bookRouter from "./src/routes/book.routes.js";
import addressRouter from "./src/routes/address.routes.js";
import cartRouter from "./src/routes/cart.routes.js";
import paymentRouter from "./src/routes/payment.routes.js";
import deliveryRouter from "./src/routes/delivery.routes.js";

// routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/orders", orderRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/books", bookRouter);
app.use("/api/v1/addresses", addressRouter);
app.use("/api/v1/cart", cartRouter);
app.use("/api/v1/payments", paymentRouter);
app.use("/api/v1/payment", paymentRouter); // Backward-compatible singular alias
app.use("/api/v1/delhivery", deliveryRouter);

// Error Handling Middleware (Global Error Handler)
app.use(errorHandler);

export { app };
