import express from "express";
import { ingestReading, getReadings, getUsage, getNetworkUsage } from "../controllers/readingController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public: devices push telemetry (identified by deviceId in the body).
router.post("/", ingestReading);

// Private: query telemetry.
router.get("/", protect, getReadings);
router.get("/network-usage", protect, authorize("admin"), getNetworkUsage);
router.get("/usage", protect, getUsage);

export default router;
