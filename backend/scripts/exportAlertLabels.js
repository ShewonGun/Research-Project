/**
 * Export the households' "It was me" / "Yes, a leak" answers as REAL labelled data for the leak model.
 *
 *   node scripts/exportAlertLabels.js --device ESP32-A1 [--out ../edge-ai/data/real] [--hours-before 3]
 *
 * Writes (git-ignored folder edge-ai/data/real/):
 *   <device>_readings.csv    timestamp, flowRate, volume — readings around every labelled alert
 *   <device>_events.csv      start, end, type, label — alerts answered "Yes, a leak" (real leaks)
 *   <device>_normal_use.csv  start, end, type, source — alerts answered "It was me" (real false alarms)
 * and prints a summary: how many model alerts households confirmed vs marked as normal use.
 *
 * Use with the training script (edge-ai/leak_detection):
 *   python train_leak_model.py --real ../data/real/ESP32-A1_readings.csv --real-events ../data/real/ESP32-A1_events.csv
 * Minutes inside a "normal use" alert stay labelled normal, so they count as false alarms if flagged.
 *
 * Read-only on the database. Never prints the connection string.
 */
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import Device from "../models/Device.js";
import Alert from "../models/Alert.js";
import Reading from "../models/Reading.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, dflt) => (args.includes(name) ? args[args.indexOf(name) + 1] : dflt);
const deviceId = opt("--device", null);
const outDir = path.resolve(opt("--out", path.join(here, "../../edge-ai/data/real")));
const hoursBefore = Number(opt("--hours-before", 3));
const MODEL_LABEL = { burst: "burst", "micro-leak": "micro_leak" }; // label names used by leakdetect.py
const HOUR = 60 * 60 * 1000;

if (!deviceId) {
    console.error("Usage: node scripts/exportAlertLabels.js --device <deviceId> [--out <folder>] [--hours-before 3]");
    process.exit(1);
}

const csv = (rows, cols) => [cols.join(","), ...rows.map((r) => cols.map((c) => (r[c] instanceof Date ? r[c].toISOString() : r[c] ?? "")).join(","))].join("\n") + "\n";

const main = async () => {
    await mongoose.connect(process.env.MONGODB_URI);
    const device = await Device.findOne({ deviceId });
    if (!device) throw new Error(`Device ${deviceId} not found`);

    const alerts = await Alert.find({ device: device._id, "userFeedback.label": { $exists: true } }).sort({ startedAt: 1 }).lean();
    if (!alerts.length) {
        console.log(`No labelled alerts for ${deviceId} yet.`);
        return;
    }
    const span = (a) => ({ start: new Date(a.startedAt || a.createdAt), end: new Date(a.resolvedAt || a.userFeedback.at) });

    const leaks = alerts.filter((a) => a.userFeedback.label === "real-leak").map((a) => ({ ...span(a), type: a.type, label: MODEL_LABEL[a.type] }));
    const normal = alerts.filter((a) => a.userFeedback.label === "normal-use").map((a) => ({ ...span(a), type: a.type, source: a.source }));

    // Readings around every labelled alert (merged windows, so nothing is exported twice).
    const windows = alerts
        .map((a) => ({ from: new Date(span(a).start - hoursBefore * HOUR), to: span(a).end }))
        .sort((x, y) => x.from - y.from)
        .reduce((acc, w) => {
            const last = acc[acc.length - 1];
            if (last && w.from <= last.to) last.to = new Date(Math.max(last.to, w.to));
            else acc.push({ ...w });
            return acc;
        }, []);
    const readings = [];
    for (const w of windows) {
        const rows = await Reading.find({ device: device._id, timestamp: { $gte: w.from, $lte: w.to } }).select("timestamp flowRate volume -_id").sort({ timestamp: 1 }).lean();
        readings.push(...rows);
    }

    fs.mkdirSync(outDir, { recursive: true });
    const file = (suffix) => path.join(outDir, `${deviceId}_${suffix}.csv`);
    fs.writeFileSync(file("readings"), csv(readings, ["timestamp", "flowRate", "volume"]));
    fs.writeFileSync(file("events"), csv(leaks, ["start", "end", "type", "label"]));
    fs.writeFileSync(file("normal_use"), csv(normal, ["start", "end", "type", "source"]));

    const model = alerts.filter((a) => a.source === "model");
    const modelNormal = model.filter((a) => a.userFeedback.label === "normal-use").length;
    console.log(`${deviceId}: ${alerts.length} labelled alerts — ${leaks.length} real leaks, ${normal.length} normal use; ${readings.length} readings in ${windows.length} window(s).`);
    if (model.length) console.log(`Model alerts: ${model.length} labelled, ${modelNormal} marked normal use (${((100 * modelNormal) / model.length).toFixed(0)}%).`);
    console.log(`Written to ${outDir}`);
};

main()
    .catch((e) => {
        console.error(e.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
