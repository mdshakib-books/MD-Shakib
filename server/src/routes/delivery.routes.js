import { Router } from "express";
import {
    handleDelhiveryWebhook,
    checkServiceability,
    trackShipment,
} from "../controllers/delivery.controller.js";

const router = Router();

router.get("/serviceability", checkServiceability);
router.get("/track/:awb", trackShipment);

// Endpoint for Delhivery to send tracking updates
router.post("/webhook", handleDelhiveryWebhook);

export default router;
