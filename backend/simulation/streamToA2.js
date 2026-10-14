/**
 * Send loop-scale sample data to device ESP32-A2 and watch the leak model catch it.
 *
 *   node simulation/streamToA2.js <scenario> [--minutes 30] [--no-topup] [--no-backfill] [--device ESP32-A2]
 *
 *   scenario: normal   healthy household use only          (expect NO alert)
 *             trickle  steady 0.4 L/min leak               (expect micro-leak alert)
 *             cistern  leaking cistern, pump refills 2–4 min (expect micro-leak alert)
 *             burst    pump running non-stop               (expect burst alert)
 *
 * 1. BACKFILL: writes ~2.5 h of history ending now straight into the database (so the model
 *    has data to judge immediately; leak scenarios start the anomaly 90 min / burst 40 min
 *    before now). Skip with --no-backfill.
 * 2. LIVE: then POSTs a reading every ~6 s to /api/readings exactly like the firmware, for
 *    --minutes (default 30), continuing the scenario — so the frontend's live chart moves
 *    and the backend's model sweep raises the alert.
 *
 * Needs the backend running (API_URL / PORT from .env) and the model service + LEAK_MODEL_URL
 * for alerts. Live posts go through the real billing gate, so by default the script first
 * tops up the device's latest subscription (active, full, valid 30 days) and reopens its
 * gate; --no-topup leaves billing alone (an expired plan will then close the valve).
 * Ctrl+C to stop early.
 * Test data only: this writes fake readings into the device's history.
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Subscription from "../models/Subscription.js";

const SCENARIOS = ["normal", "trickle", "cistern", "burst"];
const args = process.argv.slice(2);
const scenario = args[0];
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const deviceId = opt("--device", "ESP32-A2");
const liveMinutes = Number(opt("--minutes", 30));
const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;

if (!SCENARIOS.includes(scenario)) {
    console.error(`Usage: node simulation/streamToA2.js <${SCENARIOS.join("|")}> [--minutes 30] [--no-topup] [--no-backfill]`);
    process.exit(1);
}

const rand = (a, b) => a + Math.random() * (b - a);
const PUMP = 3.5;
const PAST = 150 * 60; // seconds of history
const TOTAL = PAST + (liveMinutes + 5) * 60;

// True flow (L/min) for every second from -PAST .. +live; index i = second (i - PAST) from now.
const flow = new Float64Array(TOTAL);
for (let t = rand(60, 600); t < TOTAL; t += rand(600, 2100)) {
    const len = rand(20, 120), lvl = rand(3.2, 3.8);
    for (let s = Math.floor(t); s < Math.min(TOTAL, t + len); s++) flow[s] = lvl; // healthy use
}
const leakStart = PAST - 90 * 60;
if (scenario === "trickle") for (let s = leakStart; s < TOTAL; s++) flow[s] += 0.4;
if (scenario === "cistern")
    for (let t = leakStart; t < TOTAL; t += rand(120, 240)) {
        const end = Math.min(TOTAL, t + rand(8, 18));
        for (let s = Math.floor(t); s < end; s++) flow[s] = Math.max(flow[s], 0.9 * PUMP);
    }
if (scenario === "burst") for (let s = PAST - 40 * 60; s < TOTAL; s++) flow[s] = PUMP * (1 + rand(-0.03, 0.03));

const sample = (sec) => {
    const f = flow[Math.max(0, Math.min(TOTAL - 1, Math.floor(sec)))];
    const noisy = f > 0 ? Math.max(0, f + rand(-0.07, 0.07)) : 0;
    const flowRate = +noisy.toFixed(2);
    return { flowRate, volume: +((flowRate * 5.8) / 60).toFixed(4) };
};

await mongoose.connect(process.env.MONGODB_URI);
const device = await Device.findOne({ deviceId });
if (!device) {
    console.error(`Device ${deviceId} not found.`);
    await mongoose.disconnect();
    process.exit(1);
}

// Live posts go through the real billing gate: an expired / used-up subscription would
// close the device's valve on the first reading. Unless --no-topup, make the latest
// subscription active, full and valid for 30 days, and reopen the provider gate.
if (!args.includes("--no-topup")) {
    const sub = await Subscription.findOne({ device: device._id }).sort({ createdAt: -1 });
    if (sub) {
        sub.status = "active";
        sub.volumeRemaining = sub.volumeTotal;
        sub.expiresAt = new Date(Date.now() + 30 * 24 * 3600 * 1000);
        await sub.save();
        device.adminValveState = "open";
        device.throttlePercent = 100;
        await device.save();
        console.log(`Topped up ${deviceId}: subscription active, ${sub.volumeTotal} L, valid 30 days, gate open.`);
    }
}

if (!args.includes("--no-backfill")) {
    const now = Date.now();
    const rows = [];
    for (let t = 0; t < PAST; t += rand(5.6, 6.4)) {
        rows.push({ device: device._id, timestamp: new Date(now - (PAST - t) * 1000), ...sample(t) });
    }
    await Reading.insertMany(rows);
    device.status = "online";
    device.lastSeen = new Date();
    await device.save();
    console.log(`Backfilled ${rows.length} readings (last ${PAST / 3600} h) for ${deviceId}, scenario "${scenario}".`);
}
await mongoose.disconnect();

console.log(`Streaming live to ${API_URL} for ${liveMinutes} min — Ctrl+C to stop.`);
const startedAt = Date.now();
let sent = 0;
while (Date.now() - startedAt < liveMinutes * 60 * 1000) {
    const secNow = PAST + (Date.now() - startedAt) / 1000;
    const body = { deviceId, ...sample(secNow) };
    try {
        const res = await fetch(`${API_URL}/api/readings`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        const j = await res.json().catch(() => ({}));
        sent++;
        if (sent % 10 === 1) console.log(`#${sent} ${body.flowRate} L/min → ${res.status} valve:${j.valveState ?? "?"}`);
    } catch (err) {
        console.error(`Post failed: ${err.message} (is the backend running?)`);
    }
    await new Promise((r) => setTimeout(r, rand(5600, 6400)));
}
console.log("Done.");
