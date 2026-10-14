/**
 * One-shot check that the leak MODEL detects both burst and micro-leaks, using loop-like
 * sample data on device ESP32-A2 (never A1).
 *
 *   node simulation/modelCheckA2.js [--keep burst|trickle|cistern|normal] [--device ESP32-A2]
 *
 * For each scenario — normal (control), trickle, cistern, burst — it:
 *   1. clears A2's readings from the last 4 h (test data only),
 *   2. writes 2.5 h of loop-like history ending now,
 *   3. asks the model service for a verdict (same code path the backend sweep uses),
 *   4. checks the right alert appeared (and none for "normal"), then removes the test data.
 * `--keep <scenario>` leaves that scenario's readings + alert in place (and runs only it) so
 * you can look at the Alerts page / live chart.
 *
 * Needs: model service running, LEAK_MODEL_URL (default http://localhost:8001).
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Alert from "../models/Alert.js";
import { scoreDevice } from "../utils/modelLeakDetection.js";
import { SCENARIOS, buildScenario, backfillRows } from "./loopScenario.js";

const args = process.argv.slice(2);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const deviceId = opt("--device", "ESP32-A2");
const keep = opt("--keep", null);
const url = process.env.LEAK_MODEL_URL || "http://localhost:8001";
const PAST = 150 * 60;
const EXPECT = { normal: null, trickle: "micro-leak", cistern: "micro-leak", burst: "burst" };

if (deviceId === "ESP32-A1") {
    console.error("Refusing to write test data to ESP32-A1 (the real device).");
    process.exit(1);
}
if (keep && !SCENARIOS.includes(keep)) {
    console.error(`--keep must be one of ${SCENARIOS.join(", ")}`);
    process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const device = await Device.findOne({ deviceId });
if (!device) {
    console.error(`Device ${deviceId} not found.`);
    await mongoose.disconnect();
    process.exit(1);
}

try {
    const health = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000) }).then((r) => r.json());
    console.log(`Model service OK (${health.model}) at ${url}\n`);
} catch {
    console.error(`Model service not reachable at ${url} — start it first (cd edge-ai/service; python -m uvicorn app:app --port 8001).`);
    await mongoose.disconnect();
    process.exit(1);
}

const clear = async () => {
    await Reading.deleteMany({ device: device._id, timestamp: { $gte: new Date(Date.now() - 4 * 3600 * 1000) } });
    await Alert.deleteMany({ device: device._id, source: "model" });
};

const results = [];
for (const scenario of keep ? [keep] : SCENARIOS) {
    await clear();
    const { sample } = buildScenario(scenario, PAST);
    await Reading.insertMany(backfillRows(device._id, sample, PAST));
    device.status = "online";
    device.lastSeen = new Date();
    await device.save();

    await scoreDevice(url, device);
    const raised = (await Alert.find({ device: device._id, source: "model" })).map((a) => a.type);
    const want = EXPECT[scenario];
    const ok = want ? raised.includes(want) : raised.length === 0;
    results.push({ scenario, expected: want || "no alert", raised: raised.join(", ") || "none", result: ok ? "PASS" : "FAIL" });
    console.log(`${scenario.padEnd(8)} expected ${(want || "no alert").padEnd(10)} got ${(raised.join(", ") || "none").padEnd(10)} ${ok ? "PASS" : "FAIL"}`);
    if (!keep) await clear();
}

if (keep) console.log(`\nKept "${keep}" data on ${deviceId}. Check the Alerts page; the backend sweep keeps it active while it is recent.`);
else console.log(`\n${results.filter((r) => r.result === "PASS").length}/${results.length} passed. Test data removed.`);
await mongoose.disconnect();
process.exitCode = results.every((r) => r.result === "PASS") ? 0 : 1;
