// Tests for nextBlockInfo / liveEstimate (utils/computeBill.js) — "you're N units from the next price block".
import { test } from "node:test";
import assert from "node:assert/strict";
import { computeBill, nextBlockInfo, liveEstimate } from "../utils/computeBill.js";
import { NWSDB_DOMESTIC_2024 } from "../models/Tariff.js";

const OLD_DEFAULT = {
    unitLiters: 1000,
    fixedCharge: 0,
    tiers: [{ maxUnits: 5, rate: 2 }, { maxUnits: 10, rate: 20 }, { maxUnits: 15, rate: 40 }, { maxUnits: 25, rate: 60 }, { maxUnits: null, rate: 100 }],
};

test("NWSDB: 13 units in a 30-day cycle is 2 units from the 100 LKR block", () => {
    const n = nextBlockInfo(13000, NWSDB_DOMESTIC_2024, { periodDays: 30 });
    assert.equal(n.rate, 90); // blocks 50 / 70 / 90 / 100 … per unit (limits 5, 10, 15, 20 …)
    assert.equal(n.nextRate, 100);
    assert.equal(n.unitsToNext, 2);
    assert.equal(n.litresToNext, 2000);
    assert.deepEqual(n.service, { now: 300, next: 400, unitsToNext: 2 }); // service tier also steps at 15 units
});

test("NWSDB pro-rating: block limits scale with a 31-day period", () => {
    const n = nextBlockInfo(13000, NWSDB_DOMESTIC_2024, { periodDays: 31 });
    assert.ok(Math.abs(n.unitsToNext - (15 - 13 * 30 / 31) * 31 / 30) < 0.01); // 2.5 units
});

test("old tariff without pro-rating; top block → null", () => {
    const n = nextBlockInfo(12500, OLD_DEFAULT);
    assert.equal(n.rate, 40);
    assert.equal(n.nextRate, 60);
    assert.equal(n.unitsToNext, 2.5);
    assert.equal(n.service, null);
    assert.equal(nextBlockInfo(30000, OLD_DEFAULT), null);
    assert.equal(nextBlockInfo(5000, { tiers: [] }), null);
});

test("liveEstimate = computeBill + nextBlock (bill amounts unchanged)", () => {
    for (const [l, t, o] of [[18000, NWSDB_DOMESTIC_2024, { periodDays: 31 }], [12500, OLD_DEFAULT, {}]]) {
        const { nextBlock, ...rest } = liveEstimate(l, t, o);
        assert.deepEqual(rest, computeBill(l, t, o));
        assert.ok(nextBlock);
    }
});
