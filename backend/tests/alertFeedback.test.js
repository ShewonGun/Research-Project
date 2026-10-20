// Tests for "It was me" / "Yes, a leak" (PUT /api/alerts/:id/feedback) and the model-alert pause.
// No database: Alert.findOne is replaced by an in-memory stand-in for each test.
import { test } from "node:test";
import assert from "node:assert/strict";
import Alert from "../models/Alert.js";
import { feedbackAlert } from "../controllers/alertController.js";
import { snoozeMinutes, snoozeQuery } from "../utils/modelLeakDetection.js";

const ID = "64b7f0c2a1b2c3d4e5f60718";
const USER = { _id: "64b7f0c2a1b2c3d4e5f60001", role: "user" };

const fakeAlert = (status) => ({ _id: ID, user: USER._id, device: "d1", status, saved: 0, async save() { this.saved++; } });

// Run the handler with a stubbed Alert.findOne; returns { code, body, alert, filter }.
const call = async (alert, body, user = USER) => {
    const original = Alert.findOne;
    let filter = null;
    Alert.findOne = async (f) => ((filter = f), alert);
    const res = { code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    try {
        await feedbackAlert({ params: { id: ID }, body, user }, res);
    } finally {
        Alert.findOne = original;
    }
    return { code: res.code, body: res.body, alert, filter };
};

test("'It was me' resolves an open alert and records the label", async () => {
    const { code, alert, filter } = await call(fakeAlert("active"), { label: "normal-use", note: "filling the tank" });
    assert.equal(code, 200);
    assert.equal(alert.status, "resolved");
    assert.ok(alert.resolvedAt instanceof Date);
    assert.equal(alert.userFeedback.label, "normal-use");
    assert.equal(alert.userFeedback.note, "filling the tank");
    assert.equal(alert.saved, 1);
    assert.equal(filter.user, USER._id, "households can only label their own alerts");
});

test("'Yes, a leak' keeps the alert open and marks it seen", async () => {
    const { code, alert } = await call(fakeAlert("active"), { label: "real-leak" });
    assert.equal(code, 200);
    assert.equal(alert.status, "acknowledged");
    assert.equal(alert.userFeedback.label, "real-leak");
});

test("an already resolved alert can still be labelled without changing its status", async () => {
    const { code, alert } = await call(fakeAlert("resolved"), { label: "real-leak" });
    assert.equal(code, 200);
    assert.equal(alert.status, "resolved");
    assert.equal(alert.userFeedback.label, "real-leak");
});

test("bad label → 400, unknown alert → 404, admins label any alert", async () => {
    assert.equal((await call(fakeAlert("active"), { label: "maybe" })).code, 400);
    assert.equal((await call(null, { label: "normal-use" })).code, 404);
    const admin = await call(fakeAlert("active"), { label: "normal-use" }, { _id: "a1", role: "admin" });
    assert.equal(admin.code, 200);
    assert.equal(admin.filter.user, undefined);
    assert.equal(admin.alert.userFeedback.role, "admin");
});

test("model-alert pause: 60 min by default, configurable, model alerts of the same type only", () => {
    const before = process.env.ALERT_SNOOZE_MIN;
    try {
        delete process.env.ALERT_SNOOZE_MIN;
        assert.equal(snoozeMinutes(), 60);
        process.env.ALERT_SNOOZE_MIN = "15";
        assert.equal(snoozeMinutes(), 15);
        process.env.ALERT_SNOOZE_MIN = "0";
        assert.equal(snoozeMinutes(), 0);
        process.env.ALERT_SNOOZE_MIN = "abc";
        assert.equal(snoozeMinutes(), 60);
        const now = Date.parse("2026-10-20T10:00:00Z");
        const q = snoozeQuery("d1", "burst", now);
        assert.equal(q.source, "model");
        assert.equal(q.type, "burst");
        assert.equal(q["userFeedback.label"], "normal-use");
        assert.equal(q["userFeedback.at"].$gte.toISOString(), "2026-10-20T09:00:00.000Z");
    } finally {
        if (before === undefined) delete process.env.ALERT_SNOOZE_MIN;
        else process.env.ALERT_SNOOZE_MIN = before;
    }
});
