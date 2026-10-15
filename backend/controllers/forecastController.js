import mongoose from "mongoose";
import Device from "../models/Device.js";
import Reading from "../models/Reading.js";
import Subscription from "../models/Subscription.js";
import Bill from "../models/Bill.js";
import { getActiveTariff } from "../models/Tariff.js";
import { computeBill } from "../utils/computeBill.js";
import { resolveTimeZone } from "../utils/dayWindow.js";
import { localDayKey, buildRunOut, buildBillEstimate, DAY_MS } from "../utils/usageForecast.js";

// Usage forecast for one device: the next 7 days of litres (with an 80 % range) from the model
// service, plus — by billing mode — the prepaid run-out date or the postpaid bill estimate.
//
// The service (edge-ai/service, same URL as the leak model) gets the household's own recent daily
// totals every time, so the forecast follows its latest usage; nothing is retrained here.
const HISTORY_DAYS = 14; // days of history the model uses
const DEFAULT_TZ = "Asia/Colombo"; // the model was trained on Sri Lanka local days

const serviceUrl = () => process.env.ML_SERVICE_URL || process.env.LEAK_MODEL_URL;

// Confirm the requesting user owns the device (admins bypass).
const canAccessDevice = async (req, deviceId) => {
    if (!mongoose.isValidObjectId(deviceId)) return null;
    const filter = req.user.role === "admin" ? { _id: deviceId } : { _id: deviceId, owner: req.user._id };
    return Device.findOne(filter);
};

// Litres and reading counts per LOCAL day over the last `days` days (today included).
const dailyTotals = async (deviceObjId, days, timeZone) => {
    const since = new Date(Date.now() - (days + 2) * DAY_MS);
    const rows = await Reading.aggregate([
        { $match: { device: deviceObjId, timestamp: { $gte: since } } },
        { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp", timezone: timeZone } }, litres: { $sum: "$volume" }, n: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, { litres: r.litres, n: r.n }]));
};

// @route   GET /api/forecast?device=<id>&tz=Asia/Colombo
// @access  Private (owner or admin)
export const getForecast = async (req, res) => {
    try {
        const base = serviceUrl();
        if (!base) return res.status(503).json({ available: false, message: "Forecast service is not configured (set LEAK_MODEL_URL / ML_SERVICE_URL)." });

        const device = await canAccessDevice(req, req.query.device);
        if (!device) return res.status(404).json({ message: "Device not found" });

        const timeZone = resolveTimeZone(req.query.tz || DEFAULT_TZ);
        const now = new Date();
        const todayKey = localDayKey(now, timeZone);
        const yesterdayKey = localDayKey(new Date(now.getTime() - DAY_MS), timeZone);

        const totals = await dailyTotals(device._id, HISTORY_DAYS + 1, timeZone);
        const usedToday = totals[todayKey]?.litres || 0;
        // Complete days only; a day the device sent nothing is "unknown", not zero litres.
        const history = Object.entries(totals)
            .filter(([day, t]) => day < todayKey && t.n > 0)
            .map(([day, t]) => ({ day, litres: +t.litres.toFixed(3) }));

        let result;
        try {
            const r = await fetch(`${base}/forecast`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ lastDay: yesterdayKey, history }),
                signal: AbortSignal.timeout(15000),
            });
            if (!r.ok) throw new Error(`service ${r.status}`);
            result = await r.json();
        } catch (err) {
            return res.status(503).json({ available: false, message: `Forecast service unreachable (${err.message}).` });
        }

        if (!result.ready) {
            return res.json({
                available: false,
                reason: result.reason,
                message: `Not enough usage history yet (${result.daysUsed} day(s) with data; at least 3 are needed).`,
                daysUsed: result.daysUsed,
            });
        }

        // forecast[0] is TODAY (the day after the last complete day).
        const forecast = result.forecast;
        const response = {
            available: true,
            device: device._id,
            timeZone,
            method: result.method, // "model" (>= 7 of the last 14 days have data) or "average" (fewer)
            daysUsed: result.daysUsed,
            usedToday: +usedToday.toFixed(2),
            forecast,
            billingMode: device.billingMode,
            asOf: now,
        };

        if (device.billingMode === "postpaid") {
            const bill = await Bill.findOne({ device: device._id, status: "open" });
            response.billEstimate = bill
                ? buildBillEstimate({
                      volumeUsed: bill.volumeUsed,
                      periodStart: bill.periodStart,
                      forecast,
                      usedToday,
                      now,
                      timeZone,
                      tariff: await getActiveTariff(),
                      computeBill,
                  })
                : null;
        } else {
            const sub = await Subscription.findOne({ device: device._id, status: "active" });
            response.runOut = sub
                ? buildRunOut({ balance: sub.volumeRemaining, expiresAt: sub.expiresAt, forecast, usedToday, now, timeZone })
                : null;
        }
        return res.json(response);
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
