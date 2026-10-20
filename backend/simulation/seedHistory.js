/**
 * Write several days of realistic SAMPLE history for a device, from a generated readings CSV,
 * so the usage forecast (and the Usage page) can be checked without waiting weeks.
 *
 *   node simulation/seedHistory.js <readings.csv> [--device ESP32-A1] [--until 2026-10-15T13:00:00+05:30] [--after <ISO time>] [--bill] [--dry-run]
 *
 * The CSV comes from the loop-calibrated household generator (same columns as the database):
 *   python edge-ai/data/loop_household/generate_dataset.py --no-anomalies --start 2026-10-02 --end 2026-10-15 \
 *          --seed 20261015 --out edge-ai/data/loop_household/out_a1
 *
 * - Only rows up to --until are written (nothing after it, and never "now" unless you say so).
 *   --after <ISO time> skips rows at or before that moment, to continue where an earlier run stopped.
 * - Rows are tagged `synthetic: true`. NOTHING is deleted, by this script or when it ends. Existing
 *   (real) readings on those days are left exactly as they are; sample rows are simply added.
 * - Written straight into the readings collection: billing, quota and the valve are NOT touched —
 *   unless --bill is given: then the litres are charged exactly as live readings would be
 *     postpaid → added to the open bill (its cycle start is moved back to the first sample if the
 *                cycle started later; refused if that would overlap an already closed bill),
 *     prepaid  → taken off the active plan's balance (low → throttled, empty → closed, as live).
 *   The dry run shows the bill / balance before and after.
 * - Refuses to run twice for the same range (it would double the data) — see the check below.
 * - To remove the sample rows later:  db.readings.deleteMany({ synthetic: true })
 */
import dotenv from "dotenv";
dotenv.config();
import fs from "fs";
import readline from "readline";
import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Bill from "../models/Bill.js";
import Subscription from "../models/Subscription.js";
import { getOrOpenBill } from "../utils/postpaid.js";
import { accruePostpaid, enforceQuota } from "../controllers/readingController.js";

const args = process.argv.slice(2);
const csvPath = args[0];
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);
const deviceId = opt("--device", "ESP32-A1");
const until = new Date(opt("--until", ""));
const after = opt("--after", null) ? new Date(opt("--after")) : null;
const dryRun = args.includes("--dry-run");
const charge = args.includes("--bill");

if (!csvPath || csvPath.startsWith("--") || Number.isNaN(until.getTime())) {
    console.error("Usage: node simulation/seedHistory.js <readings.csv> --until <ISO time with offset> [--device ESP32-A1] [--after <ISO time>] [--bill] [--dry-run]");
    process.exit(1);
}
if (until > new Date()) {
    console.error("--until is in the future; refusing.");
    process.exit(1);
}

// Stream the CSV: timestamp,device,flowRate,volume,... → rows up to `until`.
const rows = [];
const rl = readline.createInterface({ input: fs.createReadStream(csvPath) });
let header = true;
for await (const line of rl) {
    if (header) {
        header = false;
        continue;
    }
    const c = line.split(",");
    const ts = new Date(c[0]);
    if (ts > until || (after && ts <= after)) continue;
    rows.push({ timestamp: ts, flowRate: +c[2], volume: +c[3] });
}
if (!rows.length) {
    console.error("No rows at or before --until.");
    process.exit(1);
}
rows.sort((a, b) => a.timestamp - b.timestamp);
const first = rows[0].timestamp, last = rows[rows.length - 1].timestamp;

// Per-local-day litres, for the summary.
const day = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(d);
const perDay = {};
for (const r of rows) perDay[day(r.timestamp)] = (perDay[day(r.timestamp)] || 0) + r.volume;

console.log(`${rows.length.toLocaleString()} readings, ${first.toISOString()} -> ${last.toISOString()}  (${Object.keys(perDay).length} days)`);
console.log("Litres per local day:", Object.fromEntries(Object.entries(perDay).map(([k, v]) => [k, +v.toFixed(0)])));

await mongoose.connect(process.env.MONGODB_URI);
try {
    const device = await Device.findOne({ deviceId });
    if (!device) throw new Error(`Device ${deviceId} not found.`);

    const already = await Reading.countDocuments({ device: device._id, synthetic: true, timestamp: { $gte: first, $lte: last } });
    if (already > 0) throw new Error(`${already} sample readings already exist for ${deviceId} in this range — refusing to add them twice.`);
    const real = await Reading.countDocuments({ device: device._id, synthetic: { $ne: true }, timestamp: { $gte: first, $lte: last } });
    console.log(`${deviceId}: ${real} real readings already in this range (left untouched).`);

    // --bill: check what charging these litres would do before writing anything.
    const litres = rows.reduce((s, r) => s + r.volume, 0);
    let billing = null;
    if (charge) {
        if (device.billingMode === "postpaid") {
            const closedAfter = await Bill.findOne({ device: device._id, status: { $ne: "open" }, periodEnd: { $gt: first } }).sort({ periodEnd: -1 });
            if (closedAfter) {
                throw new Error(`A closed bill ends at ${closedAfter.periodEnd.toISOString()}, after the first sample — use --after ${closedAfter.periodEnd.toISOString()} so no usage is billed twice.`);
            }
            const open = await Bill.findOne({ device: device._id, status: "open" });
            const start = open && open.periodStart < first ? open.periodStart : first;
            const before = open ? open.volumeUsed : 0;
            billing = { mode: "postpaid", start, moveStart: !open || open.periodStart > first };
            console.log(`--bill (postpaid): open bill ${before.toFixed(1)} L -> ${(before + litres).toFixed(1)} L; cycle start ${start.toISOString()}${open && open.periodStart > first ? ` (moved back from ${open.periodStart.toISOString()})` : ""}.`);
        } else {
            const sub = await Subscription.findOne({ device: device._id, status: "active" });
            if (!sub) throw new Error("Prepaid device has no active plan — nothing to charge. Buy a plan first (or drop --bill).");
            if (sub.startedAt > first) console.log(`Note: the plan started ${sub.startedAt.toISOString()}, after the first sample; all ${litres.toFixed(0)} L are still taken off it.`);
            billing = { mode: "prepaid" };
            console.log(`--bill (prepaid): balance ${sub.volumeRemaining.toFixed(1)} L -> ${Math.max(0, sub.volumeRemaining - litres).toFixed(1)} L of ${sub.volumeTotal} L.`);
        }
    }

    if (dryRun) {
        console.log("\n--dry-run: nothing written.");
    } else {
        const BATCH = 5000;
        for (let i = 0; i < rows.length; i += BATCH) {
            await Reading.insertMany(rows.slice(i, i + BATCH).map((r) => ({ device: device._id, ...r, synthetic: true })), { ordered: false });
            process.stdout.write(`\rwritten ${Math.min(i + BATCH, rows.length).toLocaleString()} / ${rows.length.toLocaleString()}`);
        }
        console.log(`\nDone. Sample readings are tagged synthetic:true; nothing was deleted.`);
        if (billing?.mode === "postpaid") {
            const bill = await getOrOpenBill(device);
            if (billing.moveStart) {
                bill.periodStart = billing.start;
                await bill.save();
            }
            await accruePostpaid(device, litres);
            console.log(`Charged ${litres.toFixed(1)} L to the open bill.`);
        } else if (billing?.mode === "prepaid") {
            await enforceQuota(device, litres);
            console.log(`Took ${litres.toFixed(1)} L off the plan (valve: ${device.adminValveState}).`);
        }
    }
} catch (err) {
    console.error("Failed:", err.message);
    process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
