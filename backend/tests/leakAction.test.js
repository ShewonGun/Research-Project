// Tests for the AI micro-leak valve response settings (utils/modelLeakDetection.js).
import { test } from "node:test";
import assert from "node:assert/strict";
import { leakAction, leakThrottlePercent, shouldActOnLeak, shouldShutOff } from "../utils/modelLeakDetection.js";

const withEnv = (vars, fn) => {
    const saved = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
    for (const [k, v] of Object.entries(vars)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    try {
        fn();
    } finally {
        for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    }
};
const now = Date.parse("2026-10-20T10:00:00Z");
const fresh = new Date(now - 30 * 1000);

test("off by default: micro-leaks only alert", () =>
    withEnv({ MODEL_LEAK_ACTION: undefined }, () => {
        assert.equal(leakAction(), null);
        assert.equal(shouldActOnLeak({ action: leakAction(), score: 0.99, lastFlow: 0.4, lastReadingAt: fresh, now }), null);
    }));

test("throttle / close when confident and water is still flowing", () =>
    withEnv({ MODEL_LEAK_ACTION: "throttle", MODEL_LEAK_MIN_SCORE: undefined }, () => {
        assert.equal(leakAction(), "throttle");
        assert.equal(shouldActOnLeak({ action: "throttle", score: 0.85, lastFlow: 0.4, lastReadingAt: fresh, now }), "throttle");
        assert.equal(shouldActOnLeak({ action: "close", score: 0.85, lastFlow: 0.4, lastReadingAt: fresh, now }), "close");
        assert.equal(shouldActOnLeak({ action: "throttle", score: 0.7, lastFlow: 0.4, lastReadingAt: fresh, now }), null, "below 0.8");
        assert.equal(shouldActOnLeak({ action: "throttle", score: 0.9, lastFlow: 0, lastReadingAt: fresh, now }), null, "water stopped");
        assert.equal(shouldActOnLeak({ action: "throttle", score: 0.9, lastFlow: 0.4, lastReadingAt: new Date(now - 5 * 60 * 1000), now }), null, "stale reading");
    }));

test("settings: unknown action → off; throttle percent 1–99, default 30", () => {
    withEnv({ MODEL_LEAK_ACTION: "maybe" }, () => assert.equal(leakAction(), null));
    withEnv({ MODEL_LEAK_THROTTLE_PERCENT: undefined }, () => assert.equal(leakThrottlePercent(), 30));
    withEnv({ MODEL_LEAK_THROTTLE_PERCENT: "40" }, () => assert.equal(leakThrottlePercent(), 40));
    withEnv({ MODEL_LEAK_THROTTLE_PERCENT: "100" }, () => assert.equal(leakThrottlePercent(), 30));
});

test("burst shut-off rule unchanged", () =>
    withEnv({ MODEL_SHUTOFF_MIN_SCORE: undefined }, () => {
        assert.equal(shouldShutOff({ enabled: true, score: 0.75, lastFlow: 3.4, lastReadingAt: fresh, now }), true);
        assert.equal(shouldShutOff({ enabled: false, score: 0.99, lastFlow: 3.4, lastReadingAt: fresh, now }), false);
        assert.equal(shouldShutOff({ enabled: true, score: 0.75, lastFlow: 1.0, lastReadingAt: fresh, now }), false);
    }));
