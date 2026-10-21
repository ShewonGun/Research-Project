/**
 * Print the time of a device's newest reading (read-only) — the --after value for seedHistory.js.
 *
 *   node simulation/lastReading.js ESP32-A3
 *
 * Prints the time in Sri Lanka time with offset (e.g. 2026-10-20T15:29:04+05:30), or "none".
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";

const deviceId = process.argv[2];
if (!deviceId) {
    console.error("Usage: node simulation/lastReading.js <deviceId>");
    process.exit(1);
}
await mongoose.connect(process.env.MONGODB_URI);
try {
    const device = await Device.findOne({ deviceId });
    if (!device) throw new Error(`Device ${deviceId} not found.`);
    const r = await Reading.findOne({ device: device._id }).sort({ timestamp: -1 }).select("timestamp").lean();
    if (!r) console.log("none");
    else {
        // Sri Lanka is UTC+05:30 all year (no daylight saving).
        const local = new Date(r.timestamp.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 19);
        console.log(`${local}+05:30`);
    }
} catch (err) {
    console.error(err.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
