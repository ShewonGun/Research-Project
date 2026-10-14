import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Alert from "../models/Alert.js";
import { emitAlertChanged } from "../config/socket.js";

// ML leak detector (edge-ai/service). Once a minute, for every online device, send the
// last HISTORY_MS of readings to the Python model service and raise / clear alerts from
// its verdict. Complements the rule-based detector (utils/leakDetection.js) — the rules
// can't see a slow leak on the loop's ~3.5 L/min pump, the model can.
//
// ALERT ONLY: the model never closes the valve (that stays with the 30 L/min burst rule
// until the model has been validated on real data).
// Off unless LEAK_MODEL_URL is set (e.g. http://localhost:8001).
const HISTORY_MS = 12 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 1000;
const TYPE_OF = { micro_leak: "micro-leak", burst: "burst" };

const MESSAGE = {
    "micro-leak": "Possible leak (AI model) — flow pattern looks like a continuous leak.",
    burst: "Possible burst (AI model) — flow has been running non-stop far longer than normal use.",
};

const openModelAlert = (deviceId, type) =>
    Alert.findOne({ device: deviceId, type, source: "model", status: { $in: ["active", "acknowledged"] } });

export const scoreDevice = async (baseUrl, device) => {
    const since = new Date(Date.now() - HISTORY_MS);
    const readings = await Reading.find({ device: device._id, timestamp: { $gte: since } })
        .sort({ timestamp: 1 })
        .select("timestamp flowRate volume")
        .lean();
    if (readings.length < 10) return;

    const res = await fetch(`${baseUrl}/score`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            readings: readings.map((r) => ({ timestamp: r.timestamp.toISOString(), flowRate: r.flowRate, volume: r.volume })),
        }),
        signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) throw new Error(`model service ${res.status}`);
    const verdict = await res.json();
    if (!verdict.ready) return;

    for (const [key, type] of Object.entries(TYPE_OF)) {
        const v = verdict[key];
        if (!v) continue;
        const open = await openModelAlert(device._id, type);
        if (v.active && !open) {
            await Alert.create({
                device: device._id,
                user: device.owner,
                type,
                severity: type === "burst" ? "critical" : "warning",
                source: "model",
                flowRate: readings[readings.length - 1].flowRate,
                message: `${MESSAGE[type]} (confidence ${Math.round(v.score * 100)}%)`,
                startedAt: new Date(),
            });
            emitAlertChanged("active", { userId: device.owner, deviceId: device._id });
        } else if (!v.active && open) {
            open.status = "resolved";
            open.resolvedAt = new Date();
            open.autoAction = "auto-resolved";
            await open.save();
            emitAlertChanged("resolved", { userId: device.owner, deviceId: device._id });
        }
    }
};

export const sweepModelDetection = async (baseUrl) => {
    const devices = await Device.find({ status: "online" });
    for (const d of devices) {
        try {
            await scoreDevice(baseUrl, d);
        } catch (err) {
            console.error(`Model leak detection (${d.deviceId}): ${err.message}`);
        }
    }
};

export const startModelLeakDetection = () => {
    const baseUrl = process.env.LEAK_MODEL_URL;
    if (!baseUrl) return null;
    console.log(`Model leak detection on → ${baseUrl}`);
    let running = false;
    const timer = setInterval(async () => {
        if (running) return; // never overlap sweeps
        running = true;
        try {
            await sweepModelDetection(baseUrl);
        } finally {
            running = false;
        }
    }, SWEEP_EVERY_MS);
    timer.unref?.();
    return timer;
};
