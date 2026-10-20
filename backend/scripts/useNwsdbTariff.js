/**
 * Make the real NWSDB domestic tariff the only postpaid tariff in the database.
 *
 *   node scripts/useNwsdbTariff.js            activate NWSDB_DOMESTIC_2024 and DELETE every other tariff
 *   node scripts/useNwsdbTariff.js --dry-run  show what would change, change nothing
 *   node scripts/useNwsdbTariff.js --show     print the active tariff, change nothing
 *
 * Old tariffs (e.g. the early Rs 2/unit demo tariff) are removed. Bills already closed keep their
 * stored amounts — they don't refer to a tariff — and the NWSDB tariff prices open cycles, live
 * estimates, forecasts and future bill runs.
 *
 * The NWSDB tariff (models/Tariff.js) was derived from 2,098 real bills and reproduces 99.8 % of
 * water charges and 100 % of service charges to the rupee (check: node scripts/checkNwsdbTariff.js).
 * Uses MONGODB_URI from .env.
 */
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Tariff, { NWSDB_DOMESTIC_2024 } from "../models/Tariff.js";

const describe = (t) =>
    t
        ? `"${t.name}" — blocks ${t.tiers.map((x) => `${x.maxUnits ?? "∞"}:${x.rate}`).join(" ")}, ` +
          `service ${t.serviceTiers?.length ? t.serviceTiers.map((x) => `${x.maxUnits ?? "∞"}:${x.charge}`).join(" ") : t.fixedCharge}, ` +
          `VAT ${Math.round((t.vatRate || 0) * 100)}%, pro-rata ${t.proRataDays || "off"}`
        : "(none)";

const isNwsdb = (t) => t.name === NWSDB_DOMESTIC_2024.name;

const main = async () => {
    const show = process.argv.includes("--show");
    const dryRun = process.argv.includes("--dry-run");
    await mongoose.connect(process.env.MONGODB_URI);
    const active = await Tariff.findOne({ isActive: true }).sort({ updatedAt: -1 });
    console.log("Active now:", describe(active));
    if (show) return;

    const all = await Tariff.find().sort({ updatedAt: -1 });
    const keep = active && isNwsdb(active) ? active : all.find(isNwsdb) || null;
    const remove = all.filter((t) => !keep || !t._id.equals(keep._id));

    console.log(keep ? `Keep: ${describe(keep)}` : "Create: the NWSDB tariff");
    for (const t of remove) console.log(`Delete: ${describe(t)}${t.isActive ? " (active)" : ""}`);
    if (dryRun) {
        console.log("--dry-run: nothing changed.");
        return;
    }

    const nwsdb = keep || (await Tariff.create({ ...NWSDB_DOMESTIC_2024, isActive: true }));
    if (!nwsdb.isActive) {
        nwsdb.isActive = true;
        await nwsdb.save();
    }
    if (remove.length) await Tariff.deleteMany({ _id: { $in: remove.map((t) => t._id) } });
    console.log(`Done. Active: ${describe(nwsdb)}; ${remove.length} old tariff(s) deleted.`);
};

main()
    .catch((e) => {
        console.error("ERR", e.message);
        process.exitCode = 1;
    })
    .finally(() => mongoose.disconnect());
