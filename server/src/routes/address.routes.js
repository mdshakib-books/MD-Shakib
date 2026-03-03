import { Router } from "express";
import {
    addAddress,
    updateAddress,
    deleteAddress,
    getUserAddresses,
    setDefaultAddress,
} from "../controllers/address.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
import {
    createAddressSchema,
    updateAddressSchema,
} from "../utils/address.validation.js";

const router = Router();

// All address routes are authenticated
router.use(verifyJWT);

router.post("/", validate(createAddressSchema), addAddress);
router.get("/", getUserAddresses);
router.patch("/:id", validate(updateAddressSchema), updateAddress);
router.delete("/:id", deleteAddress);
router.patch("/:id/default", setDefaultAddress);

export default router;
