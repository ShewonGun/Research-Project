// Explain an alert from the flow around it: a per-minute flow series plus a few plain facts the
// app turns into sentences ("water had been flowing non-stop for 2 h 15 min").
// Pure functions — the controller fetches the readings.

export const IDLE_LPM = 0.1; // a minute below this mean flow counts as "water stopped" (same as the leak model)
export const BEFORE_MIN = 180; // minutes of flow shown before the alert started
export const MAX_AFTER_MIN = 360; // at most this many minutes shown after it started
const MAX_GAP_MIN = 3; // more missing minutes than this in a row ends a "non-stop" run

const MIN_MS = 60 * 1000;

// The window of flow to show: 3 h before the alert, until it was resolved (or now), at most 6 h after.
export const explainWindow = (alert, now = new Date()) => {
    const start = new Date(alert.startedAt || alert.createdAt);
    const endCap = new Date(start.getTime() + MAX_AFTER_MIN * MIN_MS);
    const end = new Date(Math.min((alert.resolvedAt ? new Date(alert.resolvedAt) : now).getTime(), endCap.getTime(), now.getTime()));
    return { from: new Date(start.getTime() - BEFORE_MIN * MIN_MS), start, to: end };
};

// Readings → one point per minute that has readings: { t (ms), flow (mean L/min), litres }.
export const perMinute = (readings) => {
    const bins = new Map();
    for (const r of readings) {
        const t = Math.floor(new Date(r.timestamp).getTime() / MIN_MS) * MIN_MS;
        const b = bins.get(t) || { t, sum: 0, n: 0, litres: 0 };
        b.sum += Number(r.flowRate) || 0;
        b.n += 1;
        b.litres += Number(r.volume) || 0;
        bins.set(t, b);
    }
    return [...bins.values()]
        .sort((a, b) => a.t - b.t)
        .map((b) => ({ t: b.t, flow: +(b.sum / b.n).toFixed(3), litres: +b.litres.toFixed(3) }));
};

// Minutes water had been flowing without stopping, counting back from `at`.
const nonStopMinutes = (points, at) => {
    const before = points.filter((p) => p.t <= at).reverse();
    if (!before.length || before[0].flow < IDLE_LPM) return 0;
    let first = before[0].t;
    let prev = before[0].t;
    for (const p of before) {
        if (p.flow < IDLE_LPM || (prev - p.t) / MIN_MS > MAX_GAP_MIN + 1) break;
        first = p.t;
        prev = p.t;
    }
    return Math.round((at - first) / MIN_MS) + 1;
};

// The facts behind an alert, from its per-minute flow.
export const explainFacts = (alert, points, start) => {
    const s = new Date(start).getTime();
    const lastHour = points.filter((p) => p.t >= s - 60 * MIN_MS && p.t <= s);
    const during = points.filter((p) => p.t >= s);
    const conf = /confidence (\d+)%/.exec(alert.message || "");
    return {
        nonStopMinutesAtAlert: nonStopMinutes(points, s),
        minFlowLastHour: lastHour.length ? Math.min(...lastHour.map((p) => p.flow)) : null,
        idleMinutesLastHour: lastHour.filter((p) => p.flow < IDLE_LPM).length,
        litresSinceStart: +during.reduce((sum, p) => sum + p.litres, 0).toFixed(1),
        peakFlow: points.length ? Math.max(...points.map((p) => p.flow)) : null,
        confidence: conf ? Number(conf[1]) : null,
    };
};
