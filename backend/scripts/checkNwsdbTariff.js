/**
 * Check the backend's bill calculation (utils/computeBill.js) with the NWSDB tariff against
 * REAL NWSDB bills (edge-ai/data/nwsdb/nwsdb_monthly.csv): for every normal bill since the
 * Oct 2024 tariff, price its units over its billing period and compare with what NWSDB charged.
 *
 *   node scripts/checkNwsdbTariff.js
 *
 * No database needed.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { computeBill } from "../utils/computeBill.js";
import { NWSDB_DOMESTIC_2024 } from "../models/Tariff.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const csv = path.resolve(here, "../../edge-ai/data/nwsdb/nwsdb_monthly.csv");
const [header, ...lines] = fs.readFileSync(csv, "utf8").trim().split(/\r?\n/);
const cols = header.split(",");
const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [cols[i], v])));

const bills = rows.filter(
    (r) => r.b_type === "N" && r.period_days !== "" && r.bill_month >= "2024-11" && Number(r.concession || 0) === 0
);
let water = 0, service = 0, total1 = 0, total1pct = 0;
const errors = [];
for (const r of bills) {
    const p = computeBill(Number(r.units) * 1000, NWSDB_DOMESTIC_2024, { periodDays: Number(r.period_days) });
    const realTotal = Number(r.water_charge) + Number(r.service_charge) + Number(r.vat_water);
    if (Math.abs(p.usageCharge - Number(r.water_charge)) <= 1) water++;
    if (Math.abs(p.fixedCharge - Number(r.service_charge)) <= 1) service++;
    const err = Math.abs(p.amount - realTotal);
    if (err <= 1) total1++;
    if (err <= 0.01 * realTotal + 1) total1pct++;
    errors.push(err);
}
errors.sort((a, b) => a - b);
const pct = (n) => `${((100 * n) / bills.length).toFixed(1)}%`;
console.log(`Real NWSDB bills checked: ${bills.length} (normal bills since Nov 2024, no concession)`);
console.log(`  water charge within LKR 1:   ${pct(water)}`);
console.log(`  service charge within LKR 1: ${pct(service)}`);
console.log(`  total (incl. VAT) within LKR 1: ${pct(total1)}, within 1%: ${pct(total1pct)}`);
console.log(`  median |total error|: LKR ${errors[Math.floor(errors.length / 2)].toFixed(2)}, 95th percentile: LKR ${errors[Math.floor(errors.length * 0.95)].toFixed(2)}`);
