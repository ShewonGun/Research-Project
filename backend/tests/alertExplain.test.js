// Tests for the alert explanation helpers (utils/alertExplain.js) — pure, no database.
import { test } from "node:test";
import assert from "node:assert/strict";
import { explainWindow, perMinute, explainFacts, IDLE_LPM } from "../utils/alertExplain.js";

const MIN = 60 * 1000;
const T0 = new Date("2026-10-20T00:00:00Z").getTime();

// One reading every ~6 s for `minutes` minutes from `startMin`, at `flow` L/min.
const readings = (startMin, minutes, flow) => {
    const out = [];
    for (let m = 0; m < minutes; m++)
        for (let s = 0; s < 60; s += 6)
            out.push({ timestamp: new Date(T0 + (startMin + m) * MIN + s * 1000), flowRate: flow, volume: (flow / 60) * 6 });
    return out;
};

test("perMinute averages flow and sums litres per minute", () => {
    const p = perMinute(readings(0, 2, 3));
    assert.equal(p.length, 2);
    assert.equal(p[0].flow, 3);
    assert.ok(Math.abs(p[0].litres - 3) < 1e-6); // 3 L/min for one minute
});

test("window: 3 h before, until resolved, capped at 6 h after and at now", () => {
    const start = new Date(T0 + 300 * MIN);
    const w = explainWindow({ startedAt: start, resolvedAt: new Date(T0 + 330 * MIN) }, new Date(T0 + 1000 * MIN));
    assert.equal(w.from.getTime(), T0 + 120 * MIN);
    assert.equal(w.to.getTime(), T0 + 330 * MIN);
    const open = explainWindow({ startedAt: start }, new Date(T0 + 2000 * MIN));
    assert.equal(open.to.getTime(), T0 + 660 * MIN); // 6 h cap
    const fresh = explainWindow({ startedAt: start }, new Date(T0 + 310 * MIN));
    assert.equal(fresh.to.getTime(), T0 + 310 * MIN); // never after now
});

test("facts: a trickle that never stops", () => {
    // idle until minute 100, then a 0.5 L/min trickle; alert raised at minute 190
    const pts = perMinute([...readings(0, 100, 0), ...readings(100, 120, 0.5)]);
    const f = explainFacts({ message: "Possible micro-leak (confidence 93%)" }, pts, new Date(T0 + 190 * MIN));
    assert.equal(f.nonStopMinutesAtAlert, 91); // minutes 100..190
    assert.equal(f.idleMinutesLastHour, 0);
    assert.equal(f.minFlowLastHour, 0.5);
    assert.equal(f.confidence, 93);
    assert.ok(f.minFlowLastHour >= IDLE_LPM);
});

test("facts: normal use with idle gaps is not 'non-stop'", () => {
    const pts = perMinute([...readings(0, 10, 3), ...readings(10, 50, 0), ...readings(60, 2, 3)]);
    const f = explainFacts({ message: "" }, pts, new Date(T0 + 61 * MIN));
    assert.equal(f.nonStopMinutesAtAlert, 2);
    assert.equal(f.idleMinutesLastHour, 50);
    assert.equal(f.confidence, null);
});

test("facts: a long gap in readings ends the non-stop run", () => {
    const pts = perMinute([...readings(0, 30, 3), ...readings(40, 10, 3)]); // 10 missing minutes
    const f = explainFacts({}, pts, new Date(T0 + 49 * MIN));
    assert.equal(f.nonStopMinutesAtAlert, 10);
});
