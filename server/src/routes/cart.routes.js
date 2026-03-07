import { Router } from "express";
import {
    getCart,
    addToCart,
    updateCartItem,
    removeCartItem,
    clearCart,
    mergeCart,
} from "../controllers/cart.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import { addToCartSchema, updateCartSchema } from "../utils/cart.validation.js";

const router = Router();

// All cart routes are authenticated
router.use(verifyJWT);

router.get("/", getCart);
router.post("/add", validate(addToCartSchema), addToCart);
router.patch("/update/:bookId", validate(updateCartSchema), updateCartItem);
router.delete("/remove/:bookId", removeCartItem);
router.delete("/clear", clearCart);
router.post("/merge", mergeCart);

export default router;
