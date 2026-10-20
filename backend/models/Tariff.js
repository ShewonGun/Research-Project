import mongoose from "mongoose";

// One rising-block tier. `maxUnits` is the upper bound of the block, in units
// (1 unit = `unitLiters`). The final block uses maxUnits = null (unbounded).
// `rate` is the MARGINAL price per unit for consumption that falls in this block.
const tierSchema = new mongoose.Schema(
    {
        maxUnits: { type: Number, default: null }, // null → open-ended top block
        rate: { type: Number, required: true, min: 0 }, // LKR per unit
    },
    { _id: false }
);

/**
 * Postpaid tariff (NWSDB-style rising-block domestic tariff). A single active
 * tariff drives every postpaid bill; admins edit it. Consumption is converted
 * to units (litres / unitLiters) and charged marginally across the blocks, plus
 * a flat monthly service charge.
 */
// Optional service-charge tier: the charge applies up to `maxUnits` of consumption (per
// proRataDays when the tariff pro-rates). null → open-ended top tier.
const serviceTierSchema = new mongoose.Schema(
    {
        maxUnits: { type: Number, default: null },
        charge: { type: Number, required: true, min: 0 }, // LKR
    },
    { _id: false }
);

const tariffSchema = new mongoose.Schema(
    {
        name: { type: String, default: "NWSDB Domestic", trim: true },
        // Litres per billing unit (1 unit = 1 m³ = 1000 L).
        unitLiters: { type: Number, default: 1000, min: 1 },
        // Flat monthly service charge in LKR.
        fixedCharge: { type: Number, default: 0, min: 0 },
        // Rising blocks, ascending by maxUnits (null last).
        tiers: {
            type: [tierSchema],
            default: [
                { maxUnits: 5, rate: 2 },
                { maxUnits: 10, rate: 20 },
                { maxUnits: 15, rate: 40 },
                { maxUnits: 25, rate: 60 },
                { maxUnits: null, rate: 100 },
            ],
        },
        // ── Optional (NWSDB-style); unset = the simple tariff above, priced exactly as before ──
        // Service charge by consumption tier instead of the flat fixedCharge.
        serviceTiers: { type: [serviceTierSchema], default: [] },
        // VAT on (usage + service charge), e.g. 0.18. Included in the bill amount.
        vatRate: { type: Number, default: 0, min: 0, max: 1 },
        // Pro-rating: blocks and charges are defined per this many days and scaled to the
        // billing period's length (NWSDB uses 30). 0 = no pro-rating.
        proRataDays: { type: Number, default: 0, min: 0 },
        // Only the active tariff is used for new bills.
        isActive: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    },
    { timestamps: true }
);

const Tariff = mongoose.model("Tariff", tariffSchema);

// The active tariff; a database without one starts on the real NWSDB domestic tariff.
export const getActiveTariff = async () => {
    let tariff = await Tariff.findOne({ isActive: true }).sort({ updatedAt: -1 });
    if (!tariff) tariff = await Tariff.create({ ...NWSDB_DOMESTIC_2024, isActive: true });
    return tariff;
};

// NWSDB domestic tariff in force since ~Oct 2024, derived from 2,098 real bills
// (edge-ai/data/nwsdb): reproduces 99.8 % of water charges and 100 % of service charges to the
// rupee (node scripts/checkNwsdbTariff.js). Per 30 days, pro-rated to the billing period; VAT 18 %. Apply it with
// `node scripts/useNwsdbTariff.js` (and `--revert` to go back).
export const NWSDB_DOMESTIC_2024 = {
    name: "NWSDB Domestic (from Oct 2024)",
    unitLiters: 1000,
    fixedCharge: 300, // lowest service tier; shown in the admin tariff panel
    tiers: [
        { maxUnits: 5, rate: 50 },
        { maxUnits: 10, rate: 70 },
        { maxUnits: 15, rate: 90 },
        { maxUnits: 20, rate: 100 },
        { maxUnits: 25, rate: 120 },
        { maxUnits: 30, rate: 150 },
        { maxUnits: 40, rate: 170 },
        { maxUnits: 50, rate: 195 },
        { maxUnits: 75, rate: 225 },
        { maxUnits: null, rate: 250 },
    ],
    serviceTiers: [
        { maxUnits: 15, charge: 300 },
        { maxUnits: 20, charge: 400 },
        { maxUnits: 25, charge: 500 },
        { maxUnits: 30, charge: 600 },
        { maxUnits: 40, charge: 1500 },
        { maxUnits: 50, charge: 3000 },
        { maxUnits: 75, charge: 3500 },
        { maxUnits: 100, charge: 4000 },
        { maxUnits: null, charge: 4500 },
    ],
    vatRate: 0.18,
    proRataDays: 30,
};

export default Tariff;
