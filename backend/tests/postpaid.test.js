// Tests for closing a postpaid cycle (utils/postpaid.js) — no database needed: the Bill model's
// two calls are replaced by in-memory stand-ins for the duration of each test.
import { test } from "node:test";
import assert from "node:assert/strict";
import Bill from "../models/Bill.js";
import { closeCycle } from "../utils/postpaid.js";
import { computeBill } from "../utils/computeBill.js";
import { NWSDB_DOMESTIC_2024 } from "../models/Tariff.js";

const DAY = 24 * 60 * 60 * 1000;
const OLD_DEFAULT = {
    unitLiters: 1000,
    fixedCharge: 0,
    tiers: [
        { maxUnits: 5, rate: 2 }, { maxUnits: 10, rate: 20 }, { maxUnits: 15, rate: 40 },
        { maxUnits: 25, rate: 60 }, { maxUnits: null, rate: 100 },
    ],
};

const withFakeBills = async (open, fn) => {
    const findOne = Bill.findOne, create = Bill.create;
    const created = [];
    Bill.findOne = async () => open;
    Bill.create = async (doc) => created.push(doc);
    try {
        return await fn(created);
    } finally {
        Bill.findOne = findOne;
        Bill.create = create;
    }
};
const fakeOpenBill = (litres, days) => ({ volumeUsed: litres, periodStart: new Date(Date.now() - days * DAY), save: async () => {} });

test("closing a cycle with the old tariff gives the same bill as before", async () => {
    const open = fakeOpenBill(15000, 30);
    await withFakeBills(open, async (created) => {
        const bill = await closeCycle({ _id: "d1", owner: "u1" }, OLD_DEFAULT);
        const expected = computeBill(15000, OLD_DEFAULT);
        assert.equal(bill.amount, expected.amount);           // 310: 5×2 + 5×20 + 5×40
        assert.equal(bill.amount, 310);
        assert.equal(bill.vat, 0);
        assert.equal(bill.status, "unpaid");
        assert.equal(created.length, 1, "a new open cycle is started");
    });
});

test("closing a 31-day cycle with the NWSDB tariff pro-rates and adds VAT", async () => {
    const open = fakeOpenBill(18000, 31);
    await withFakeBills(open, async () => {
        const bill = await closeCycle({ _id: "d1", owner: "u1" }, NWSDB_DOMESTIC_2024);
        // real NWSDB bill for 18 units over 31 days: water 1,335.00 + service 413.33 (+18 % VAT)
        assert.ok(Math.abs(bill.usageCharge - 1335) <= 0.05, `water ${bill.usageCharge}`);
        assert.ok(Math.abs(bill.fixedCharge - 413.33) <= 0.05, `service ${bill.fixedCharge}`);
        assert.ok(Math.abs(bill.vat - (1335 + 413.33) * 0.18) <= 0.05, `vat ${bill.vat}`);
        assert.ok(Math.abs(bill.amount - (1335 + 413.33) * 1.18) <= 0.05, `amount ${bill.amount}`);
    });
});
