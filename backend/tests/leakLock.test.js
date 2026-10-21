// Tests for the pre-viva fixes: a leak that holds the valve isn't undone by billing events, no
// duplicate AI alert right after "Mark fixed", confirmed leaks stay open, and a cycle opened moments
// ago isn't billed. No database: model calls are replaced by in-memory stand-ins.
import { test } from "node:test";
import assert from "node:assert/strict";
import Alert from "../models/Alert.js";
import Bill from "../models/Bill.js";
import Reading from "../models/Reading.js";
import { valveLockQuery } from "../utils/leakLock.js";
import { restoreIfClear, closeCycle } from "../utils/postpaid.js";
import { applyBillingMode } from "../utils/billingMode.js";
import { scoreDevice, recentlyResolvedQuery, resolvedGraceMinutes } from "../utils/modelLeakDetection.js";

const stub = async (obj, fns, run) => {
    const saved = Object.fromEntries(Object.keys(fns).map((k) => [k, obj[k]]));
    Object.assign(obj, fns);
    try {
        return await run();
    } finally {
        Object.assign(obj, saved);
    }
};
const device = (o = {}) => ({ _id: "d1", owner: "u1", adminValveState: "closed", throttlePercent: 0, saved: 0, async save() { this.saved++; }, ...o });

test("lock query: open alerts that closed or throttled the valve", () => {
    const q = valveLockQuery("d1");
    assert.deepEqual(q.status, { $in: ["active", "acknowledged"] });
    assert.deepEqual(q.autoAction, { $in: ["valve-closed", "valve-throttled"] });
});

test("paying the last bill does not reopen a valve a leak closed — but does otherwise", async () => {
    const held = device();
    await stub(Alert, { exists: async () => ({ _id: "a1" }) }, () => stub(Bill, { countDocuments: async () => 0 }, () => restoreIfClear(held)));
    assert.equal(held.adminValveState, "closed");
    const free = device();
    await stub(Alert, { exists: async () => null }, () => stub(Bill, { countDocuments: async () => 0 }, () => restoreIfClear(free)));
    assert.equal(free.adminValveState, "open");
});

test("switching to postpaid keeps a leak-held valve closed", async () => {
    const held = device({ billingMode: "prepaid" });
    await stub(Alert, { exists: async () => ({ _id: "a1" }) }, () => applyBillingMode(held, "postpaid"));
    assert.equal(held.billingMode, "postpaid");
    assert.equal(held.adminValveState, "closed");
    const free = device({ billingMode: "prepaid" });
    await stub(Alert, { exists: async () => null }, () => applyBillingMode(free, "postpaid"));
    assert.equal(free.adminValveState, "open");
});

test("a cycle opened less than a day ago is not billed (billing run twice)", async () => {
    const young = { volumeUsed: 500, periodStart: new Date(Date.now() - 2 * 3600 * 1000), save: async () => assert.fail("must not close") };
    const r = await stub(Bill, { findOne: async () => young, create: async () => assert.fail("must not open") }, () => closeCycle({ _id: "d1", owner: "u1" }, null));
    assert.equal(r, null);
});

test("grace after 'Mark fixed': person-resolved model alerts of the same type, default 12 min", () => {
    const before = process.env.ALERT_RESOLVED_GRACE_MIN;
    try {
        delete process.env.ALERT_RESOLVED_GRACE_MIN;
        assert.equal(resolvedGraceMinutes(), 12);
        process.env.ALERT_RESOLVED_GRACE_MIN = "0";
        assert.equal(resolvedGraceMinutes(), 0);
        delete process.env.ALERT_RESOLVED_GRACE_MIN;
        const now = Date.parse("2026-10-21T10:00:00Z");
        const q = recentlyResolvedQuery("d1", "burst", now);
        assert.equal(q.status, "resolved");
        assert.equal(q.source, "model");
        assert.deepEqual(q.autoAction, { $ne: "auto-resolved" });
        assert.equal(q.resolvedAt.$gte.toISOString(), "2026-10-21T09:48:00.000Z");
    } finally {
        if (before === undefined) delete process.env.ALERT_RESOLVED_GRACE_MIN;
        else process.env.ALERT_RESOLVED_GRACE_MIN = before;
    }
});

// scoreDevice with a fake model verdict and stubbed database calls.
const sweep = async ({ verdict, open = null, exists = null }) => {
    const created = [];
    const now = Date.now();
    const rows = Array.from({ length: 60 }, (_, i) => ({ timestamp: new Date(now - (60 - i) * 6000), flowRate: 0.4, volume: 0.04 }));
    const chain = { sort: () => chain, select: () => chain, lean: async () => rows };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ ready: true, ...verdict }) });
    try {
        await stub(Reading, { find: () => chain }, () =>
            stub(Alert, { findOne: async (q) => (q.type === "micro-leak" ? open : null), exists: async (q) => (q.status === "resolved" ? exists : null), create: async (d) => created.push(d) }, () =>
                scoreDevice("http://model", device({ adminValveState: "open", throttlePercent: 100 }))
            )
        );
    } finally {
        globalThis.fetch = realFetch;
    }
    return created;
};

test("no new AI alert right after a person resolved one (the model's alarm is still latched)", async () => {
    const created = await sweep({ verdict: { micro_leak: { active: true, score: 0.95 } }, exists: { _id: "resolved-just-now" } });
    assert.equal(created.length, 0);
    const fresh = await sweep({ verdict: { micro_leak: { active: true, score: 0.95 } }, exists: null });
    assert.equal(fresh.length, 1, "without a recent resolve the alert is raised as before");
});

test("a leak the household confirmed is not auto-resolved when the alarm goes quiet", async () => {
    const confirmed = { status: "acknowledged", autoAction: null, userFeedback: { label: "real-leak" }, saved: 0, async save() { this.saved++; } };
    await sweep({ verdict: { micro_leak: { active: false, score: 0.1 } }, open: confirmed });
    assert.equal(confirmed.status, "acknowledged");
    assert.equal(confirmed.saved, 0);
    const plain = { status: "active", autoAction: null, saved: 0, async save() { this.saved++; } };
    await sweep({ verdict: { micro_leak: { active: false, score: 0.1 } }, open: plain });
    assert.equal(plain.status, "resolved", "an unanswered alert still clears itself as before");
    assert.equal(plain.autoAction, "auto-resolved");
});

test("an alert stays open while the score is still high, even if a dip restarted the alarm's count", async () => {
    const open = { status: "active", autoAction: null, saved: 0, async save() { this.saved++; } };
    await sweep({ verdict: { micro_leak: { active: false, score: 0.99, threshold: 0.9 } }, open });
    assert.equal(open.status, "active");
    assert.equal(open.saved, 0);
    await sweep({ verdict: { micro_leak: { active: false, score: 0.2, threshold: 0.9 } }, open });
    assert.equal(open.status, "resolved", "once the score drops it clears as before");
});
