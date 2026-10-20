import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Alert from "../models/Alert.js";
import { emitAlertChanged, emitDeviceChanged } from "../config/socket.js";
import { VALVE_ACTIONS } from "./leakLock.js";

// ML leak detector (edge-ai/service). Once a minute, for every online device, send the
// last HISTORY_MS of readings to the Python model service and raise / clear alerts from
// its verdict. Complements the rule-based detector (utils/leakDetection.js) — the rules
// can't see a slow leak on the loop's ~3.5 L/min pump, the model can.
//
// By default the model only ALERTS. Set MODEL_AUTO_SHUTOFF=true in .env to let a confident burst
// verdict also close the provider valve (the 30 L/min rule, which can't fire on the loop's
// ~3.5 L/min pump, remains the only other automatic shut-off). A shut-off needs ALL of:
//   - the burst alarm is active (the model has seen flow run non-stop for ~20 minutes),
//   - its score is at least MODEL_SHUTOFF_MIN_SCORE (default 0.7),
//   - the pump is still running now (latest reading >= 2 L/min and under 2 minutes old) —
//     closing the valve after the flow already stopped would only cut water for no reason.
// A shut-off alert is never auto-resolved: like the rule-based burst it must be marked fixed
// by a person (the existing safety lock then lets the supply be restored).
//
// Micro-leaks: by default alert only. MODEL_LEAK_ACTION=throttle reduces the provider gate to
// MODEL_LEAK_THROTTLE_PERCENT (default 30 %) — the proportional response for micro-leaks — and
// MODEL_LEAK_ACTION=close shuts it. Either needs the micro-leak alarm active with a score of at least
// MODEL_LEAK_MIN_SCORE (default 0.8) and water still flowing now (latest reading > 0.05 L/min and under
// 2 minutes old). Like a burst shut-off, such an alert is never auto-resolved.
// Off unless LEAK_MODEL_URL is set (e.g. http://localhost:8001).
const HISTORY_MS = 12 * 60 * 60 * 1000;
const SWEEP_EVERY_MS = 60 * 1000;
const TYPE_OF = { micro_leak: "micro-leak", burst: "burst" };

const MESSAGE = {
    "micro-leak": "Possible leak (AI model) — flow pattern looks like a continuous leak.",
    burst: "Possible burst (AI model) — flow has been running non-stop far longer than normal use.",
};

const SHUTOFF_MIN_FLOW_LPM = 2.0;
const SHUTOFF_MAX_READING_AGE_MS = 2 * 60 * 1000;
export const autoShutoffEnabled = () => ["1", "true", "yes", "on"].includes(String(process.env.MODEL_AUTO_SHUTOFF || "").toLowerCase());
const shutoffMinScore = () => Number(process.env.MODEL_SHUTOFF_MIN_SCORE) || 0.7;

// Should this burst verdict close the valve? (pure — easy to test)
export const shouldShutOff = ({ enabled, score, lastFlow, lastReadingAt, now = Date.now() }) =>
    enabled && score >= shutoffMinScore() && lastFlow >= SHUTOFF_MIN_FLOW_LPM && now - new Date(lastReadingAt).getTime() <= SHUTOFF_MAX_READING_AGE_MS;

// Micro-leak response from the settings: "throttle" | "close" | null (pure — easy to test).
export const leakAction = () => {
    const v = String(process.env.MODEL_LEAK_ACTION || "off").toLowerCase();
    return v === "throttle" || v === "close" ? v : null;
};
const leakMinScore = () => Number(process.env.MODEL_LEAK_MIN_SCORE) || 0.8;
export const leakThrottlePercent = () => {
    const p = Math.round(Number(process.env.MODEL_LEAK_THROTTLE_PERCENT));
    return p >= 1 && p <= 99 ? p : 30;
};
const LEAK_MIN_FLOW_LPM = 0.05;
export const shouldActOnLeak = ({ action, score, lastFlow, lastReadingAt, now = Date.now() }) =>
    action && score >= leakMinScore() && lastFlow > LEAK_MIN_FLOW_LPM && now - new Date(lastReadingAt).getTime() <= SHUTOFF_MAX_READING_AGE_MS
        ? action
        : null;


// Reduce the provider gate (never opens it, never raises an existing lower throttle).
const throttleValve = async (device, percent) => {
    if (device.adminValveState === "closed") return;
    device.throttlePercent = device.adminValveState === "throttled" ? Math.min(device.throttlePercent ?? 100, percent) : percent;
    device.adminValveState = "throttled";
    await device.save();
    emitDeviceChanged(device);
};

const leakActionMessage = (act, score) =>
    `Leak detected by the AI model (confidence ${Math.round(score * 100)}%) — water has not stopped for far longer than normal use. ${
        act === "close" ? "Supply was automatically shut off" : `Supply was automatically reduced to ${leakThrottlePercent()}%`
    } to limit water loss until the leak is fixed.`;

const closeValve = async (device) => {
    device.adminValveState = "closed";
    device.throttlePercent = 0;
    await device.save();
    emitDeviceChanged(device);
};

const burstShutoffMessage = (score) =>
    `Burst detected by the AI model (confidence ${Math.round(score * 100)}%) — flow has been running non-stop far longer than normal use. Supply was automatically shut off to prevent flooding.`;

// "It was me": after a household marks a model alert as normal use, the model raises no new alert of
// that type on that device for ALERT_SNOOZE_MIN minutes (default 60), so the same water use isn't
// flagged again a minute later. Model alerts only — the rule-based detector is never paused.
const DEFAULT_SNOOZE_MIN = 60;
export const snoozeMinutes = () => {
    const v = Number(process.env.ALERT_SNOOZE_MIN);
    return Number.isFinite(v) && v >= 0 ? v : DEFAULT_SNOOZE_MIN;
};
export const snoozeQuery = (deviceId, type, now = Date.now()) => ({
    device: deviceId,
    type,
    source: "model",
    "userFeedback.label": "normal-use",
    "userFeedback.at": { $gte: new Date(now - snoozeMinutes() * 60 * 1000) },
});
const snoozed = async (deviceId, type) => snoozeMinutes() > 0 && !!(await Alert.exists(snoozeQuery(deviceId, type)));

// After a person marks a model alert fixed (or answers it), the model service still reports the
// alarm as active for its latch time (LATCH_MIN = 10 min in edge-ai/service/app.py). Raising a new
// alert then would be a duplicate — and would block restoring the supply (safety lock) — so the same
// type isn't raised again on that device within ALERT_RESOLVED_GRACE_MIN minutes (default 12) of a
// person resolving one. A leak that really continues is raised again after that.
export const resolvedGraceMinutes = () => {
    const raw = process.env.ALERT_RESOLVED_GRACE_MIN;
    const v = Number(raw);
    return raw !== undefined && raw !== "" && Number.isFinite(v) && v >= 0 ? v : 12;
};
export const recentlyResolvedQuery = (deviceId, type, now = Date.now()) => ({
    device: deviceId,
    type,
    source: "model",
    status: "resolved",
    autoAction: { $ne: "auto-resolved" }, // resolved by a person, not cleared by the detector
    resolvedAt: { $gte: new Date(now - resolvedGraceMinutes() * 60 * 1000) },
});
const recentlyResolved = async (deviceId, type) => resolvedGraceMinutes() > 0 && !!(await Alert.exists(recentlyResolvedQuery(deviceId, type)));

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
        const last = readings[readings.length - 1];
        const shut = type === "burst" && shouldShutOff({ enabled: autoShutoffEnabled(), score: v.score, lastFlow: last.flowRate, lastReadingAt: last.timestamp });
        // What to do with the valve: bursts close it (MODEL_AUTO_SHUTOFF), micro-leaks per MODEL_LEAK_ACTION.
        const act =
            type === "burst"
                ? shut
                    ? "close"
                    : null
                : shouldActOnLeak({ action: leakAction(), score: v.score, lastFlow: last.flowRate, lastReadingAt: last.timestamp });
        const applyAction = async () => {
            if (act === "close") await closeValve(device);
            else if (act === "throttle") await throttleValve(device, leakThrottlePercent());
        };
        const actionMessage = () => (type === "burst" ? burstShutoffMessage(v.score) : leakActionMessage(act, v.score));
        const autoActionOf = () => (act === "close" ? "valve-closed" : act === "throttle" ? "valve-throttled" : null);
        if (v.active && !open) {
            if ((await snoozed(device._id, type)) || (await recentlyResolved(device._id, type))) continue;
            await applyAction();
            await Alert.create({
                device: device._id,
                user: device.owner,
                type,
                severity: type === "burst" ? "critical" : "warning",
                source: "model",
                flowRate: last.flowRate,
                message: act ? actionMessage() : `${MESSAGE[type]} (confidence ${Math.round(v.score * 100)}%)`,
                autoAction: autoActionOf(),
                startedAt: new Date(),
            });
            emitAlertChanged("active", { userId: device.owner, deviceId: device._id });
        } else if (v.active && open && act && !VALVE_ACTIONS.includes(open.autoAction)) {
            // An alert-only burst / leak became confident enough (or the setting was switched on): escalate.
            await applyAction();
            open.autoAction = autoActionOf();
            open.message = actionMessage();
            await open.save();
            emitAlertChanged("active", { userId: device.owner, deviceId: device._id });
        } else if (!v.active && open && !VALVE_ACTIONS.includes(open.autoAction) && open.userFeedback?.label !== "real-leak") {
            // (A leak the household confirmed stays open until someone marks it fixed.)
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
        } catch (err) {
            // e.g. the database is briefly unreachable — log it and try again next minute,
            // never let it crash the server.
            console.error(`Model leak detection sweep: ${err.message}`);
        } finally {
            running = false;
        }
    }, SWEEP_EVERY_MS);
    timer.unref?.();
    return timer;
};
