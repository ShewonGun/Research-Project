import { useEffect, useState, useCallback } from "react";
import { FiTarget, FiEdit2, FiTrash2, FiCheck, FiX, FiZap, FiInfo } from "react-icons/fi";
import { BarChart, Bar, Cell, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from "recharts";
import { apiFetch } from "../../lib/api.js";
import { browserTimeZone } from "../../lib/dayKey.js";
import { useToast } from "../../Context/ToastContext.jsx";
import { useChartTheme } from "../SharedComponents/chartTheme.js";

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const dayLabel = (iso) => new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { weekday: "short" });

const STATE = {
    on_track: { label: "On track", cls: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400", bar: "bg-emerald-500" },
    at_risk: { label: "Close to your goal", cls: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400", bar: "bg-amber-500" },
    over: { label: "Over your goal", cls: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400", bar: "bg-red-500" },
    unknown: { label: "Tracking", cls: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300", bar: "bg-sky-500" },
};
const BAR = { under: "#10b981", near: "#f59e0b", over: "#ef4444" };

/* Daily water-use goal: set a target, see today and the week's forecast against it, plus a few tips.
   Data from GET /api/goals; saved with PUT, removed with DELETE. */
const GoalCard = ({ deviceId }) => {
    const t = useChartTheme();
    const toast = useToast();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [editing, setEditing] = useState(false);
    const [value, setValue] = useState("");
    const [saving, setSaving] = useState(false);

    const load = useCallback(() => {
        return apiFetch(`/api/goals?device=${deviceId}&tz=${encodeURIComponent(browserTimeZone())}`)
            .then((d) => {
                setData(d);
                setError(null);
            })
            .catch((e) => setError(e.message));
    }, [deviceId]);

    useEffect(() => {
        setData(null);
        load();
        const id = setInterval(load, 5 * 60 * 1000);
        return () => clearInterval(id);
    }, [load]);

    const save = async () => {
        setSaving(true);
        try {
            await apiFetch("/api/goals", { method: "PUT", body: { device: deviceId, dailyLitres: Number(value) } });
            setEditing(false);
            toast.success("Daily goal saved.");
            await load();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const remove = async () => {
        try {
            await apiFetch(`/api/goals?device=${deviceId}`, { method: "DELETE" });
            setEditing(false);
            toast.success("Goal removed.");
            await load();
        } catch (e) {
            toast.error(e.message);
        }
    };

    const startEdit = (initial) => {
        setValue(String(initial ?? ""));
        setEditing(true);
    };

    const shell = (body) => (
        <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                    <FiTarget className="h-4 w-4" />
                </span>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">Daily goal</p>
                {data?.goal && !editing && (
                    <button type="button" onClick={() => startEdit(data.goal)} className="ml-auto flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white">
                        <FiEdit2 className="h-3.5 w-3.5" /> Edit
                    </button>
                )}
            </div>
            {body}
        </div>
    );

    const editor = (
        <div className="mt-3">
            <label className="text-xs text-slate-500 dark:text-slate-400" htmlFor="goal-input">
                Litres per day
            </label>
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <input
                    id="goal-input"
                    type="number"
                    min="10"
                    max="5000"
                    step="5"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="w-28 rounded-sm border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                />
                <button type="button" onClick={save} disabled={saving || !value} className="flex items-center gap-1 rounded-sm bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                    <FiCheck className="h-3.5 w-3.5" /> Save
                </button>
                <button type="button" onClick={() => setEditing(false)} className="flex items-center gap-1 rounded-sm border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                    <FiX className="h-3.5 w-3.5" /> Cancel
                </button>
                {data?.goal && (
                    <button type="button" onClick={remove} className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-600">
                        <FiTrash2 className="h-3.5 w-3.5" /> Remove goal
                    </button>
                )}
            </div>
            {data?.suggestedLitres && (
                <button type="button" onClick={() => setValue(String(data.suggestedLitres))} className="mt-2 text-xs text-sky-600 hover:underline dark:text-sky-400">
                    Suggested: {data.suggestedLitres} L (about 10% below your usual day)
                </button>
            )}
        </div>
    );

    if (error) return shell(<p className="mt-3 text-sm text-slate-400">Goal tracking is unavailable right now ({error}).</p>);
    if (!data) return shell(<p className="mt-3 text-sm text-slate-400">Loading…</p>);

    // No goal yet.
    if (!data.goal) {
        return shell(
            editing ? (
                editor
            ) : (
                <div className="mt-3">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        Set a daily target to see whether you are on track today and which days this week are likely to go over.
                    </p>
                    <button type="button" onClick={() => startEdit(data.suggestedLitres)} className="mt-3 rounded-sm bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700">
                        Set a goal{data.suggestedLitres ? ` (suggested ${data.suggestedLitres} L)` : ""}
                    </button>
                </div>
            )
        );
    }

    const { goal, progress, outlook, streak, impact, tips } = data;
    const st = STATE[progress.state] || STATE.unknown;
    const rows = outlook.map((o, i) => ({ label: i === 0 ? "Today" : dayLabel(o.day), litres: o.litres, status: o.status }));

    return shell(
        editing ? (
            editor
        ) : (
            <>
                <div className="mt-3 flex items-baseline justify-between gap-2">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                        <span className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{progress.usedToday.toFixed(0)}</span> of {goal} L today
                    </p>
                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${st.cls}`}>{st.label}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="progressbar" aria-valuenow={Math.round(progress.usedPct)} aria-valuemin={0} aria-valuemax={100}>
                    <div className={`h-full rounded-full ${st.bar}`} style={{ width: `${progress.usedPct}%` }} />
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {progress.expectedToday != null ? `Expected by midnight: about ${progress.expectedToday.toFixed(0)} L` : "No forecast yet — tracking today's use only"}
                    {streak.daysCounted > 0 && ` · ${streak.underLast7} of ${streak.daysCounted} recent days under goal${streak.streak > 1 ? ` · ${streak.streak}-day streak` : ""}`}
                </p>

                {rows.length > 0 && (
                    <>
                        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">Forecast against your goal</p>
                        <ResponsiveContainer width="100%" height={110} className="mt-1">
                            <BarChart data={rows} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                                <XAxis dataKey="label" tick={{ fontSize: 10, fill: t.tick }} tickLine={false} axisLine={false} interval={0} />
                                <YAxis hide domain={[0, (max) => Math.max(max, goal * 1.2)]} />
                                <Tooltip cursor={{ fill: t.grid }} formatter={(v) => [`${Number(v).toFixed(0)} L (goal ${goal} L)`, "Forecast"]} {...t.tooltip} />
                                <ReferenceLine y={goal} stroke="#64748b" strokeDasharray="4 3" />
                                <Bar dataKey="litres" radius={[3, 3, 0, 0]} maxBarSize={26}>
                                    {rows.map((r, i) => (
                                        <Cell key={i} fill={BAR[r.status]} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </>
                )}

                {impact && (
                    <div className="mt-3 rounded-md bg-slate-50 p-3 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
                        {impact.kind === "balance" ? (
                            <>At your goal, your {impact.balanceLitres.toFixed(0)} L balance lasts about <span className="font-semibold">{impact.daysAtGoal.toFixed(1)} days</span> (about {impact.daysAtForecast.toFixed(1)} at the forecast rate).</>
                        ) : impact.saving > 0 ? (
                            <>Keeping to your goal could lower this cycle's bill by about <span className="font-semibold">{money(impact.saving)}</span>.</>
                        ) : (
                            <>At your goal rate, this cycle's bill would be about {money(impact.atGoal)}.</>
                        )}
                    </div>
                )}

                {tips.length > 0 && (
                    <ul className="mt-3 space-y-1.5">
                        {tips.map((tip) => (
                            <li key={tip.kind} className="flex items-start gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                                <FiZap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" />
                                {tip.text}
                            </li>
                        ))}
                    </ul>
                )}
                {data.forecastMethod === "average" && (
                    <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-400 dark:text-slate-500">
                        <FiInfo className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Forecast based on limited history; it will improve over time.
                    </p>
                )}
            </>
        )
    );
};

export default GoalCard;
