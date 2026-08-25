import Reading from "../models/Reading.js";
import Alert from "../models/Alert.js";

// Rule-based leak detector (a clean seam for a future edge-AI model to slot into).
//
//   BURST      — flow ≥ BURST_LPM. A pipe break: raise a critical alert and
//                instantly shut the provider gate to prevent flooding.
//   MICRO-LEAK — flow inside [MICRO_MIN, MICRO_MAX] sustained with NO idle for
//                MICRO_WINDOW_MS. A slow continuous trickle.
//
// Behavioural false-alarm suppression: normal use / tank refills sit above the
// micro band and below the burst threshold, so they never trigger; a micro-leak
// only fires when the trickle is *continuous* (any idle reading breaks it), and
// once genuine idle flow returns an active micro-leak auto-resolves.
export const BURST_LPM = 30;
const MICRO_MIN = 0.15;
const MICRO_MAX = 2.5;
const MICRO_WINDOW_MS = 60 * 1000; // trickle must persist at least ~1 min
const MICRO_MIN_SAMPLES = 12; // …across at least this many samples

// Is there already an open (active/acknowledged) alert of this type?
const openAlert = (deviceId, type) =>
    Alert.findOne({ device: deviceId, type, status: { $in: ["active", "acknowledged"] } });

// Analyse the latest sample. Mutates + saves `device` on burst (auto shut-off).
// Returns the created Alert, or null. Assumes the current reading is already
// stored (so the recent-window query includes it). `readingAt` is the triggering
// reading's timestamp — recorded as the anomaly onset so detection latency
// (createdAt − startedAt) is measurable.
export const runLeakDetection = async (device, flowRate, readingAt = new Date()) => {
    // ---- Burst ----
    if (flowRate >= BURST_LPM) {
        if (await openAlert(device._id, "burst")) return null;

        device.adminValveState = "closed";
        device.throttlePercent = 0;
        await device.save();

        return Alert.create({
            device: device._id,
            user: device.owner,
            type: "burst",
            severity: "critical",
            flowRate,
            autoAction: "valve-closed",
            startedAt: readingAt,
            message: `Burst detected — ${flowRate.toFixed(1)} L/min. Supply was automatically shut off to prevent flooding.`,
        });
    }

    // ---- Micro-leak ----
    if (flowRate >= MICRO_MIN && flowRate <= MICRO_MAX) {
        if (await openAlert(device._id, "micro-leak")) return null;

        const since = new Date(Date.now() - MICRO_WINDOW_MS);
        const recent = await Reading.find({ device: device._id, timestamp: { $gte: since } })
            .sort({ timestamp: 1 })
            .select("flowRate timestamp");

        if (recent.length < MICRO_MIN_SAMPLES) return null;

        const span = new Date(recent[recent.length - 1].timestamp) - new Date(recent[0].timestamp);
        const allTrickle = recent.every((r) => r.flowRate >= MICRO_MIN && r.flowRate <= MICRO_MAX);

        if (allTrickle && span >= MICRO_WINDOW_MS * 0.8) {
            return Alert.create({
                device: device._id,
                user: device.owner,
                type: "micro-leak",
                severity: "warning",
                flowRate,
                message: `Possible micro-leak — a continuous trickle of ~${flowRate.toFixed(
                    1
                )} L/min for over ${Math.round(span / 60000)} min with no idle periods.`,
                startedAt: new Date(recent[0].timestamp),
            });
        }
        return null;
    }

    // ---- Genuine idle → clear any standing micro-leak suspicion ----
    if (flowRate < MICRO_MIN) {
        await Alert.updateMany(
            { device: device._id, type: "micro-leak", status: "active" },
            { status: "resolved", resolvedAt: new Date(), autoAction: "auto-resolved" }
        );
    }

    return null;
};
