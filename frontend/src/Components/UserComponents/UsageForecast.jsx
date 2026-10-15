import { useEffect, useState } from "react";
import { FiTrendingUp, FiClock, FiFileText, FiInfo } from "react-icons/fi";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ErrorBar, ResponsiveContainer } from "recharts";
import { apiFetch } from "../../lib/api.js";
import { browserTimeZone } from "../../lib/dayKey.js";
import { useChartTheme } from "../SharedComponents/chartTheme.js";

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });
const dateText = (d) => new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

/* Model-based usage forecast: next 7 days (with range), plus the prepaid run-out date or the
   postpaid bill estimate from GET /api/forecast. Falls back to `fallback` (the old naive text)
   if the forecast service is unavailable or the device has too little history. */
const UsageForecast = ({ deviceId, fallback }) => {
    const t = useChartTheme();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);

    useEffect(() => {
        let cancelled = false;
        setData(null);
        setError(null);
        apiFetch(`/api/forecast?device=${deviceId}&tz=${encodeURIComponent(browserTimeZone())}`)
            .then((d) => !cancelled && setData(d))
            .catch((e) => !cancelled && setError(e.message));
        return () => {
            cancelled = true;
        };
    }, [deviceId]);

    const card = (body) => (
        <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                    <FiTrendingUp className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Forecast</p>
                {data?.available && (
                    <span className="ml-auto rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {data.method === "model" ? "AI model" : "Average"}
                    </span>
                )}
            </div>
            {body}
        </div>
    );

    if (!data && !error) return card(<p className="mt-3 text-sm text-slate-400">Loading forecast…</p>);
    if (error || !data.available) {
        // Service down / not enough history → keep the simple estimate the page had before.
        return (
            <div>
                {fallback}
                <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {error || data.message}
                </p>
            </div>
        );
    }

    const rows = data.forecast.map((f, i) => ({
        label: i === 0 ? "Today" : dayLabel(f.day),
        litres: f.litres,
        err: [Math.max(0, f.litres - f.low), Math.max(0, f.high - f.litres)],
        low: f.low,
        high: f.high,
    }));
    const weekTotal = data.forecast.reduce((s, f) => s + f.litres, 0);

    const runOut = data.runOut;
    const bill = data.billEstimate;

    return card(
        <>
            <div className="mt-3 flex items-baseline justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">Next 7 days (with 80% range)</span>
                <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{weekTotal.toFixed(0)} L expected</span>
            </div>
            <ResponsiveContainer width="100%" height={130} className="mt-2">
                <BarChart data={rows} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} interval={0} />
                    <YAxis hide domain={[0, "auto"]} />
                    <Tooltip
                        cursor={{ fill: t.grid }}
                        formatter={(v, _n, p) => [`${Number(v).toFixed(0)} L (range ${p.payload.low.toFixed(0)}–${p.payload.high.toFixed(0)})`, "Forecast"]}
                        {...t.tooltip}
                    />
                    <Bar dataKey="litres" fill="#0ea5e9" radius={[3, 3, 0, 0]} maxBarSize={28}>
                        <ErrorBar dataKey="err" width={4} strokeWidth={1.5} stroke={t.tick} />
                    </Bar>
                </BarChart>
            </ResponsiveContainer>

            {data.billingMode === "postpaid" ? (
                bill ? (
                    <div className="mt-4 flex items-start gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-800/50">
                        <FiFileText className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                        <div className="text-sm text-slate-600 dark:text-slate-300">
                            Projected bill this cycle:{" "}
                            <span className="font-semibold text-slate-900 dark:text-white">{money(bill.amount.mid)}</span>
                            <span className="text-xs text-slate-400"> (likely {money(bill.amount.low)} – {money(bill.amount.high)})</span>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {bill.volumeUsedSoFar.toFixed(0)} L used so far, about {bill.projectedLitres.mid.toFixed(0)} L by {dateText(bill.cycleEnd)} (
                                {Math.ceil(bill.daysLeftInCycle)} days left, assuming a {bill.assumedCycleDays}-day cycle).
                            </p>
                        </div>
                    </div>
                ) : (
                    <p className="mt-4 text-sm text-slate-500">No open billing cycle yet.</p>
                )
            ) : runOut ? (
                <div className="mt-4 flex items-start gap-3 rounded-md bg-slate-50 p-3 dark:bg-slate-800/50">
                    <FiClock className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    <div className="text-sm text-slate-600 dark:text-slate-300">
                        Your balance of <span className="font-semibold text-slate-900 dark:text-white">{runOut.balanceLitres.toFixed(0)} L</span> will last about{" "}
                        <span className="font-semibold text-sky-600 dark:text-sky-400">
                            {runOut.daysLeft.toFixed(1)} {runOut.daysLeft === 1 ? "day" : "days"}
                        </span>
                        {" "}— around {dateText(runOut.date)}.
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                            {runOut.limitedBy === "expiry"
                                ? "Your plan expires before the water runs out."
                                : `Between ${dateText(runOut.earliest)} (heavy use) and ${dateText(runOut.latest)} (light use).`}
                        </p>
                    </div>
                </div>
            ) : (
                <p className="mt-4 text-sm text-slate-500">Buy a plan to see how long your water balance will last.</p>
            )}

            {data.method === "average" && (
                <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                    <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    Based on only {data.daysUsed} days of usage — the forecast improves as your history grows.
                </p>
            )}
        </>
    );
};

export default UsageForecast;
