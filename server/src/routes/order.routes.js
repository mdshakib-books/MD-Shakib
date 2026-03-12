import { Router } from "express";
import {
    createOrder,
    getMyOrders,
    getOrderById,
    cancelOrder,
    requestReplacement,
} from "../controllers/order.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
    createOrderSchema,
    cancelOrderSchema,
} from "../utils/order.validation.js";

const router = Router();

router.use(verifyJWT);

router.post("/", validate(createOrderSchema), createOrder);
router.get("/", getMyOrders);
router.get("/:id", getOrderById);
router.patch("/:id/cancel", validate(cancelOrderSchema), cancelOrder);
router.post("/:id/replacement", requestReplacement);

export default router;
