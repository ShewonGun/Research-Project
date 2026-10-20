import mongoose from "mongoose";
import Alert from "../models/Alert.js";
import Reading from "../models/Reading.js";
import { emitAlertChanged } from "../config/socket.js";
import { IDLE_LPM, explainWindow, perMinute, explainFacts } from "../utils/alertExplain.js";

// Households see their own device alerts; admins see everything.
const ownershipFilter = (req) => (req.user.role === "admin" ? {} : { user: req.user._id });

// List alerts (newest first), optionally filtered by device / status.
// @route   GET /api/alerts?device=<id>&status=active
// @access  Private
export const getAlerts = async (req, res) => {
    try {
        const filter = { ...ownershipFilter(req) };
        if (req.query.device && mongoose.isValidObjectId(req.query.device)) filter.device = req.query.device;
        if (req.query.status) filter.status = { $in: String(req.query.status).split(",") };

        const alerts = await Alert.find(filter)
            .populate("device", "name deviceId")
            .sort({ createdAt: -1 })
            .limit(Math.min(Number(req.query.limit) || 100, 500));

        return res.json({ count: alerts.length, alerts });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

const setStatus = async (req, res, status, extra = {}) => {
    const alert = await Alert.findOne({ _id: req.params.id, ...ownershipFilter(req) });
    if (!alert) return res.status(404).json({ message: "Alert not found" });
    if (alert.status === "resolved") return res.status(409).json({ message: "Alert already resolved" });

    alert.status = status;
    Object.assign(alert, extra);
    await alert.save();
    emitAlertChanged(status, { userId: alert.user, deviceId: alert.device });
    return res.json({ alert });
};

// Mark an alert as seen.
// @route   PUT /api/alerts/:id/acknowledge
// @access  Private
export const acknowledgeAlert = (req, res) =>
    setStatus(req, res, "acknowledged", { acknowledgedAt: new Date() }).catch((e) =>
        res.status(500).json({ message: "Server error", error: e.message })
    );

// Why was this alert raised? The flow around it (per minute) and a few facts for the app to explain.
// Read-only: nothing about the alert changes.
// @route   GET /api/alerts/:id/explain
// @access  Private
export const explainAlert = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ message: "Alert not found" });
        const alert = await Alert.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!alert) return res.status(404).json({ message: "Alert not found" });

        const { from, start, to } = explainWindow(alert);
        const readings = await Reading.find({ device: alert.device, timestamp: { $gte: from, $lte: to } })
            .select("timestamp flowRate volume -_id")
            .sort({ timestamp: 1 })
            .lean();
        const points = perMinute(readings);
        return res.json({
            type: alert.type,
            source: alert.source,
            window: { from, start, to },
            idleLpm: IDLE_LPM,
            points,
            facts: points.length ? explainFacts(alert, points, start) : null,
        });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Mark an alert as resolved (the leak was fixed / handled).
// @route   PUT /api/alerts/:id/resolve
// @access  Private
export const resolveAlert = (req, res) =>
    setStatus(req, res, "resolved", { resolvedAt: new Date() }).catch((e) =>
        res.status(500).json({ message: "Server error", error: e.message })
    );
