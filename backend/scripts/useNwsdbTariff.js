/**
 * Switch the active postpaid tariff to the real NWSDB domestic tariff (or back).
 *
 *   node scripts/useNwsdbTariff.js            make NWSDB_DOMESTIC_2024 the active tariff
 *   node scripts/useNwsdbTariff.js --revert   re-activate the tariff that was active before
 *   node scripts/useNwsdbTariff.js --show     print the active tariff, change nothing
 *
 * Nothing is deleted: the previous tariff is only marked inactive, so --revert restores it
 * exactly. Bills already closed keep their stored amounts; the new tariff prices open cycles,
 * live estimates, forecasts and future bill runs.
 *
 * The NWSDB tariff (models/Tariff.js) was derived from 2,098 real bills and reproduces 95 % of
 * water charges and 97.5 % of service charges to the rupee (check: node scripts/checkNwsdbTariff.js).
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

const main = async () => {
    const mode = process.argv.includes("--revert") ? "revert" : process.argv.includes("--show") ? "show" : "apply";
    await mongoose.connect(process.env.MONGODB_URI);
    const active = await Tariff.findOne({ isActive: true }).sort({ updatedAt: -1 });
    console.log("Active now:", describe(active));

    if (mode === "apply") {
        if (active?.name === NWSDB_DOMESTIC_2024.name) {
            console.log("The NWSDB tariff is already active — nothing to do.");
        } else {
            await Tariff.updateMany({ isActive: true }, { $set: { isActive: false } });
            const t = await Tariff.create({ ...NWSDB_DOMESTIC_2024, isActive: true });
            console.log("Activated:", describe(t));
            console.log("Previous tariff kept (inactive); undo with: node scripts/useNwsdbTariff.js --revert");
        }
    } else if (mode === "revert") {
        const previous = await Tariff.findOne({ name: { $ne: NWSDB_DOMESTIC_2024.name } }).sort({ updatedAt: -1 });
        if (!previous) {
            console.log("No earlier tariff found — nothing to revert to.");
        } else {
            await Tariff.updateMany({ isActive: true }, { $set: { isActive: false } });
            previous.isActive = true;
            await previous.save();
            console.log("Re-activated:", describe(previous));
        }
    }
    await mongoose.disconnect();
};

main().catch((e) => {
    console.error("ERR", e.message);
    process.exit(1);
});
