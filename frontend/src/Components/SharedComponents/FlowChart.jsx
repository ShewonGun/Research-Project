import { useState, useEffect, useCallback } from "react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { FiActivity } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useChartTheme } from "./chartTheme.js";

// Live flow-rate area chart: polls the device's recent readings and draws
// flow rate (L/min) over the last ~1 minute of samples.
// `bare` omits the outer card wrapper so it can be embedded inside another card.
const FlowChart = ({ deviceId, bare = false }) => {
    const t = useChartTheme();
    const [data, setData] = useState([]);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(`/api/readings?device=${deviceId}&limit=60`);
            const series = (res.readings || [])
                .slice()
                .reverse()
                .map((r, i) => ({
                    i,
                    flow: Number(r.flowRate) || 0,
                    time: new Date(r.timestamp).toLocaleTimeString(),
                }));
            setData(series);
        } catch {
            /* keep last frame on transient errors */
        }
    }, [deviceId]);

    useEffect(() => {
        load();
        const id = setInterval(load, 5000);
        return () => clearInterval(id);
    }, [load]);

    const current = data.length ? data[data.length - 1].flow : 0;
    const flowing = current > 0.1;

    const body = (
        <>
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiActivity className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">Live flow</span>
                </div>
                <div className="flex items-center gap-1.5">
                    <span className={`h-2 w-2 rounded-full ${flowing ? "animate-pulse bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                    <span className="text-sm font-semibold text-slate-900 dark:text-white">{current.toFixed(1)}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">L/min</span>
                </div>
            </div>

            {data.length >= 2 ? (
                <ResponsiveContainer width="100%" height={110} className="mt-3">
                    <AreaChart data={data} margin={{ top: 6, right: 6, left: 6, bottom: 0 }}>
                        <defs>
                            <linearGradient id="flowFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="#0ea5e9" stopOpacity={0.35} />
                                <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="i" hide />
                        <YAxis hide domain={[0, "auto"]} />
                        <Tooltip
                            formatter={(v) => [`${Number(v).toFixed(1)} L/min`, "Flow"]}
                            labelFormatter={(_, p) => p?.[0]?.payload?.time || ""}
                            {...t.tooltip}
                        />
                        <Area type="monotone" dataKey="flow" stroke="#0ea5e9" strokeWidth={2} fill="url(#flowFill)" isAnimationActive={false} dot={false} />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <p className="mt-6 mb-4 text-center text-xs text-slate-400 dark:text-slate-500">Waiting for live readings…</p>
            )}
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">Most recent {data.length} samples · updates live</p>
        </>
    );

    if (bare) return <div className="mt-3">{body}</div>;

    return <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">{body}</div>;
};

export default FlowChart;
