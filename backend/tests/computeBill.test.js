// Tests for utils/computeBill.js — run with: npm test   (Node's built-in test runner)
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBill, runningPeriodDays } from "../utils/computeBill.js";
import { NWSDB_DOMESTIC_2024 } from "../models/Tariff.js";
import { buildBillEstimate } from "../utils/usageForecast.js";

// The computeBill that shipped BEFORE the optional VAT / service tiers / pro-rating, copied
// verbatim, so we can prove a tariff that doesn't use the new options prices exactly as before.
const round2 = (n) => Math.round(n * 100) / 100;
const originalComputeBill = (liters, tariff) => {
    const unitLiters = tariff?.unitLiters || 1000;
    const fixedCharge = tariff?.fixedCharge || 0;
    const units = Math.max(0, (liters || 0) / unitLiters);

    // Ascending by upper bound; null (open-ended) always sorts last.
    const tiers = [...(tariff?.tiers || [])].sort(
        (a, b) => (a.maxUnits ?? Infinity) - (b.maxUnits ?? Infinity)
    );

    const breakdown = [];
    let usageCharge = 0;
    let lower = 0; // lower bound of the current block, in units

    for (const tier of tiers) {
        if (units <= lower) break;
        const upper = tier.maxUnits ?? Infinity;
        const blockUnits = Math.min(units, upper) - lower;
        if (blockUnits > 0) {
            const cost = blockUnits * tier.rate;
            usageCharge += cost;
            breakdown.push({
                from: lower,
                to: upper === Infinity ? null : upper,
                units: round2(blockUnits),
                rate: tier.rate,
                cost: round2(cost),
            });
        }
        lower = upper;
    }

    return {
        units: round2(units),
        usageCharge: round2(usageCharge),
        fixedCharge,
        amount: round2(usageCharge + fixedCharge),
        breakdown,
    };
};

const OLD_DEFAULT = {
    unitLiters: 1000,
    fixedCharge: 0,
    tiers: [
        { maxUnits: 5, rate: 2 }, { maxUnits: 10, rate: 20 }, { maxUnits: 15, rate: 40 },
        { maxUnits: 25, rate: 60 }, { maxUnits: null, rate: 100 },
    ],
};
const CUSTOM = { unitLiters: 1000, fixedCharge: 250, tiers: [{ maxUnits: 8, rate: 35.5 }, { maxUnits: null, rate: 80 }] };

test("tariffs without the new options price exactly as before", () => {
    for (const tariff of [OLD_DEFAULT, CUSTOM, { ...OLD_DEFAULT, unitLiters: 500 }]) {
        for (let liters = 0; liters <= 60000; liters += 137) {
            const { vat, ...now } = computeBill(liters, tariff);
            assert.deepEqual(now, originalComputeBill(liters, tariff), `liters ${liters}`);
            assert.equal(vat, 0);
            // a billing period is ignored by tariffs that don't pro-rate
            const { vat: v2, ...withPeriod } = computeBill(liters, tariff, { periodDays: 31 });
            assert.deepEqual(withPeriod, originalComputeBill(liters, tariff));
        }
    }
});

test("NWSDB tariff reproduces real 30-day bills", () => {
    // units → [water charge, service charge] on real NWSDB bills with a 30-day period
    const real = { 5: [250, 300], 10: [600, 300], 15: [1050, 300], 18: [1350, 400], 20: [1550, 400],
                   25: [2150, 500], 30: [2900, 600], 40: [4600, 1500], 50: [6550, 3000] };
    for (const [units, [water, service]] of Object.entries(real)) {
        const b = computeBill(Number(units) * 1000, NWSDB_DOMESTIC_2024, { periodDays: 30 });
        assert.equal(b.usageCharge, water, `water for ${units} units`);
        assert.equal(b.fixedCharge, service, `service for ${units} units`);
        assert.equal(b.vat, round2((water + service) * 0.18));
        assert.equal(b.amount, round2((water + service) * 1.18));
    }
});

test("NWSDB tariff pro-rates by billing days like real bills", () => {
    // real bills (the most common charge for each units/days pair in the NWSDB data):
    // [units, days, water, service]
    for (const [units, days, water, service] of [
        [8, 29, 463.33, 290], [8, 31, 456.67, 310], [12, 29, 790, 290], [12, 31, 770, 310], [12, 32, 760, 320],
        [18, 29, 1365, 386.67], [18, 31, 1335, 413.33], [18, 32, 1320, 426.67], [22, 29, 1818.33, 483.33],
        [22, 31, 1761.67, 516.67], [22, 32, 1733.33, 533.33], [27, 29, 2503.33, 580], [27, 31, 2396.67, 620],
        [27, 32, 2333.33, 533.33], [35, 31, 3676.67, 1550],
    ]) {
        const b = computeBill(units * 1000, NWSDB_DOMESTIC_2024, { periodDays: days });
        assert.ok(Math.abs(b.usageCharge - water) <= 0.01, `water ${units}u/${days}d: ${b.usageCharge} vs ${water}`);
        assert.ok(Math.abs(b.fixedCharge - service) <= 0.01, `service ${units}u/${days}d: ${b.fixedCharge} vs ${service}`);
    }
});

test("a cycle in progress is priced as part of a full cycle", () => {
    const start = new Date("2026-10-01T00:00:00Z");
    assert.equal(runningPeriodDays(start, 30, new Date("2026-10-03T00:00:00Z")), 30);
    assert.equal(runningPeriodDays(start, 30, new Date("2026-11-05T00:00:00Z")), 35);
});

test("bill estimate uses the tariff over the projected cycle", () => {
    const now = new Date("2026-10-11T06:00:00Z");
    const forecast = Array.from({ length: 7 }, () => ({ litres: 500, low: 400, high: 600 }));
    const args = { volumeUsed: 5000, periodStart: new Date("2026-10-01T00:00:00Z"), forecast, usedToday: 100, now,
                   timeZone: "Asia/Colombo", computeBill };
    const old = buildBillEstimate({ ...args, tariff: OLD_DEFAULT });
    const nwsdb = buildBillEstimate({ ...args, tariff: NWSDB_DOMESTIC_2024 });
    assert.ok(nwsdb.amount.low <= nwsdb.amount.mid && nwsdb.amount.mid <= nwsdb.amount.high);
    assert.ok(nwsdb.amount.mid > old.amount.mid, "real tariff is far above the placeholder");
    assert.ok(nwsdb.vat > 0 && old.vat === 0);
});
