import mongoose from "mongoose";
import Reading from "../models/Reading.js";
import Device from "../models/Device.js";
import Subscription from "../models/Subscription.js";
import { getOrOpenBill, applyPostpaidEnforcement } from "../utils/postpaid.js";
import { runLeakDetection } from "../utils/leakDetection.js";

// Throttle flow to this % once the prepaid balance drops below LOW_BALANCE_RATIO.
const LOW_BALANCE_RATIO = 0.1;
const LOW_BALANCE_THROTTLE = 50;

// Draw the sample's volume down against the device's active subscription and
// enforce the PROVIDER GATE: throttle when the balance is low, close when it's
// out or the plan has expired. Returns the (possibly updated) device.
const enforceQuota = async (device, consumedVolume) => {
    const sub = await Subscription.findOne({ device: device._id, status: "active" });
    if (!sub) return device;

    // Expired plan → stop service.
    if (sub.expiresAt && sub.expiresAt < new Date()) {
        sub.status = "expired";
        await sub.save();
        device.adminValveState = "closed";
        device.throttlePercent = 0;
        await device.save();
        return device;
    }

    sub.volumeRemaining = Math.max(0, sub.volumeRemaining - (consumedVolume || 0));

    if (sub.volumeRemaining <= 0) {
        // Quota exhausted → close the provider gate.
        sub.status = "exhausted";
        device.adminValveState = "closed";
        device.throttlePercent = 0;
        await device.save();
    } else if (sub.volumeRemaining < sub.volumeTotal * LOW_BALANCE_RATIO && device.adminValveState === "open") {
        // Low balance → proportional throttling (drought-equity), not a hard cut-off.
        device.adminValveState = "throttled";
        device.throttlePercent = LOW_BALANCE_THROTTLE;
        await device.save();
    }

    await sub.save();
    return device;
};

// Postpaid: no balance to draw down — accrue the sample's volume onto the open
// billing cycle, then enforce the gate against any overdue bills.
const accruePostpaid = async (device, consumedVolume) => {
    const bill = await getOrOpenBill(device);
    bill.volumeUsed += consumedVolume || 0;
    await bill.save();
    return applyPostpaidEnforcement(device);
};

// Ingest a telemetry sample from a device
// @route   POST /api/readings
// @access  Public (device) — identified by deviceId, not a user token
export const ingestReading = async (req, res) => {
    try {
        const { deviceId, flowRate, volume, timestamp } = req.body;

        if (!deviceId || flowRate === undefined) {
            return res.status(400).json({ message: "deviceId and flowRate are required" });
        }

        const device = await Device.findOne({ deviceId });
        if (!device) {
            return res.status(404).json({ message: "Unknown device" });
        }

        const readingAt = timestamp ? new Date(timestamp) : new Date();
        await Reading.create({
            device: device._id,
            flowRate,
            volume: volume ?? 0,
            timestamp: readingAt,
        });

        // Mark the device online and record the heartbeat.
        device.status = "online";
        device.lastSeen = new Date();
        await device.save();

        // Route consumption by billing mode: prepaid draws down the balance;
        // postpaid accrues to the monthly bill. Both enforce the provider gate.
        if (device.billingMode === "postpaid") {
            await accruePostpaid(device, volume ?? 0);
        } else {
            await enforceQuota(device, volume ?? 0);
        }

        // Analyse the flow stream for leaks/bursts (may auto-shut on a burst).
        // Pass the reading's timestamp as the anomaly-onset for latency metrics.
        await runLeakDetection(device, flowRate, readingAt);

        // Return the EFFECTIVE valve command (both provider gate + household tap).
        return res.status(201).json({
            valveState: device.effectiveValveState,
            throttlePercent: device.effectiveThrottle,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Confirm the requesting user owns the device (admins bypass).
const canAccessDevice = async (req, deviceId) => {
    if (!mongoose.isValidObjectId(deviceId)) return null;
    const filter = req.user.role === "admin" ? { _id: deviceId } : { _id: deviceId, owner: req.user._id };
    return Device.findOne(filter);
};

// Recent readings for a device
// @route   GET /api/readings?device=<id>&limit=100
// @access  Private
export const getReadings = async (req, res) => {
    try {
        const { device: deviceId, limit } = req.query;
        const device = await canAccessDevice(req, deviceId);
        if (!device) return res.status(404).json({ message: "Device not found" });

        const readings = await Reading.find({ device: device._id })
            .sort({ timestamp: -1 })
            .limit(Math.min(Number(limit) || 100, 1000));

        return res.json({ count: readings.length, readings });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Network-wide daily usage (all devices) over the last N days
// @route   GET /api/readings/network-usage?days=7
// @access  Private (admin)
export const getNetworkUsage = async (req, res) => {
    try {
        const windowDays = Math.min(Number(req.query.days) || 7, 90);
        const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

        const daily = await Reading.aggregate([
            { $match: { timestamp: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                    volume: { $sum: "$volume" },
                },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: "$_id", volume: 1 } },
        ]);

        const total = daily.reduce((sum, d) => sum + d.volume, 0);
        return res.json({ days: windowDays, total, daily });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Daily usage totals for a device over the last N days
// @route   GET /api/readings/usage?device=<id>&days=7
// @access  Private
export const getUsage = async (req, res) => {
    try {
        const { device: deviceId, days } = req.query;
        const device = await canAccessDevice(req, deviceId);
        if (!device) return res.status(404).json({ message: "Device not found" });

        const windowDays = Math.min(Number(days) || 7, 90);
        const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

        const daily = await Reading.aggregate([
            { $match: { device: device._id, timestamp: { $gte: since } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
                    volume: { $sum: "$volume" },
                },
            },
            { $sort: { _id: 1 } },
            { $project: { _id: 0, date: "$_id", volume: 1 } },
        ]);

        const total = daily.reduce((sum, d) => sum + d.volume, 0);
        return res.json({ device: device._id, days: windowDays, total, daily });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
