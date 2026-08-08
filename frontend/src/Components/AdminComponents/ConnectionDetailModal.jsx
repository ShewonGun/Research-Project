import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { FiX, FiDroplet, FiSliders, FiSlash, FiCpu, FiUser, FiArrowRight, FiAlertOctagon, FiAlertTriangle } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import FlowChart from "../SharedComponents/FlowChart.jsx";
import UsageChart from "../SharedComponents/UsageChart.jsx";
import AssignOwnerModal from "./AssignOwnerModal.jsx";

const valveSegments = [
    { key: "open", label: "Open", icon: FiDroplet, active: "text-emerald-700 dark:text-emerald-400" },
    { key: "throttled", label: "Throttle", icon: FiSliders, active: "text-amber-700 dark:text-amber-400" },
    { key: "closed", label: "Close", icon: FiSlash, active: "text-red-600 dark:text-red-400" },
];
const valveStyles = {
    open: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    closed: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    throttled: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
};
const alertChip = {
    critical: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};
const alertStatus = {
    active: "text-red-600 dark:text-red-400",
    acknowledged: "text-amber-600 dark:text-amber-400",
    resolved: "text-emerald-600 dark:text-emerald-400",
};

const relativeTime = (date) => {
    if (!date) return "never";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

// Full detail / control view for one connection (device), shown in a modal.
const ConnectionDetailModal = ({ open, device, onClose, onUpdated }) => {
    const toast = useToast();
    const [sub, setSub] = useState(null);
    const [usage, setUsage] = useState(null);
    const [alerts, setAlerts] = useState([]);
    const [ownerOpen, setOwnerOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [throttlePct, setThrottlePct] = useState(50);

    const load = useCallback(async () => {
        if (!device) return;
        const [s, u, a] = await Promise.all([
            apiFetch(`/api/subscriptions?device=${device._id}`).catch(() => ({ subscriptions: [] })),
            apiFetch(`/api/readings/usage?device=${device._id}&days=7`).catch(() => ({ daily: [], total: 0 })),
            apiFetch(`/api/alerts?device=${device._id}&limit=5`).catch(() => ({ alerts: [] })),
        ]);
        setSub((s.subscriptions || [])[0] || null);
        setUsage(u);
        setAlerts(a.alerts || []);
    }, [device]);

    useEffect(() => {
        if (!open) return;
        setThrottlePct(device?.throttlePercent < 100 ? device.throttlePercent : 50);
        load();
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, [open, device, load]);

    if (!open || !device) return null;

    const setValve = async (state, pct) => {
        setBusy(true);
        try {
            const body = state === "throttled" ? { state, throttlePercent: pct } : { state };
            const data = await apiFetch(`/api/devices/${device._id}/valve`, { method: "PUT", body });
            onUpdated?.(data.device);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setBusy(false);
        }
    };

    const setBillingMode = async (billingMode) => {
        if (billingMode === device.billingMode) return;
        setBusy(true);
        try {
            const data = await apiFetch(`/api/devices/${device._id}`, { method: "PUT", body: { billingMode } });
            onUpdated?.(data.device);
        } catch {
            /* parent reload surfaces errors */
        } finally {
            setBusy(false);
        }
    };

    const postpaid = device.billingMode === "postpaid";
    // Supply can't be reopened while a leak is unresolved (backend enforces this too).
    const hasOpenLeak = alerts.some((a) => a.status === "active" || a.status === "acknowledged");
    const active = sub && sub.status === "active";
    const ratio = active ? Math.max(0, Math.min(1, sub.volumeRemaining / sub.volumeTotal)) : 0;
    const low = active && ratio < 0.1;

    return (
        <>
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm" onClick={onClose}>
                <div
                    className="max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-sm border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                    onClick={(e) => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-3">
                            <div className="relative shrink-0">
                                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                    <FiCpu className="h-5 w-5" />
                                </span>
                                <span
                                    className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                                        device.status === "online" ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                                    }`}
                                />
                            </div>
                            <div className="min-w-0">
                                <h2 className="truncate text-base font-semibold text-slate-900 dark:text-white">{device.name || "Water Meter"}</h2>
                                <p className="truncate font-mono text-xs text-slate-400 dark:text-slate-500">{device.deviceId}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${valveStyles[device.effectiveValveState]}`}>
                                {device.effectiveValveState}
                                {device.effectiveValveState === "throttled" ? ` ${device.throttlePercent}%` : ""}
                            </span>
                            <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200">
                                <FiX className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Live flow */}
                    <FlowChart deviceId={device._id} bare />

                    {/* 7-day usage */}
                    <UsageChart daily={usage?.daily} total={usage?.total} />

                    {/* Facts */}
                    <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <Meta label="Owner" value={device.owner?.name || "Unassigned"} muted={!device.owner} />
                        <Meta label="Billing" value={device.billingMode} capitalize />
                        <Meta label="Location" value={device.location || "—"} />
                        <Meta label="Status" value={device.status} capitalize />
                        <Meta label="Last seen" value={relativeTime(device.lastSeen)} />
                        <Meta label="Registered" value={device.createdAt ? new Date(device.createdAt).toLocaleDateString() : "—"} />
                    </div>

                    {/* Balance */}
                    {postpaid ? (
                        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4 dark:border-slate-800">
                            <span className="text-xs text-slate-400 dark:text-slate-500">Postpaid — billed monthly</span>
                            <Link to="/dashboard/billing" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                                Billing <FiArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    ) : (
                        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                            {active ? (
                                <>
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-xs text-slate-400 dark:text-slate-500">Prepaid balance</span>
                                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                                            {sub.volumeRemaining.toFixed(0)} / {sub.volumeTotal.toLocaleString()} L
                                        </span>
                                    </div>
                                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                        <div className={`h-full rounded-full ${low ? "bg-amber-500" : "bg-sky-500"}`} style={{ width: `${ratio * 100}%` }} />
                                    </div>
                                </>
                            ) : (
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-400 dark:text-slate-500">{sub ? `Plan ${sub.status}` : "No active plan"}</span>
                                    <Link to="/dashboard/subscriptions" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                                        Manage <FiArrowRight className="h-3.5 w-3.5" />
                                    </Link>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Provider gate */}
                    <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Provider gate</p>
                            {device.userValveState === "closed" && (
                                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Customer tap off</span>
                            )}
                        </div>
                        <div className="grid grid-cols-3 gap-1 rounded-sm bg-slate-100 p-1 dark:bg-slate-800/80">
                            {valveSegments.map(({ key, label, icon: Icon, active: activeCls }) => {
                                const isActive = device.adminValveState === key;
                                // While a leak is unresolved, only "Close" stays available.
                                const locked = hasOpenLeak && key !== "closed";
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        disabled={busy || locked}
                                        onClick={() => setValve(key, key === "throttled" ? throttlePct : undefined)}
                                        className={`flex items-center justify-center gap-1.5 rounded-sm py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                            isActive ? `bg-white shadow-sm dark:bg-slate-900 ${activeCls}` : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                        }`}
                                    >
                                        <Icon className="h-3.5 w-3.5" />
                                        {label}
                                    </button>
                                );
                            })}
                        </div>
                        {hasOpenLeak && (
                            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                                <FiAlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                                Supply is locked while a leak is unresolved. Mark the alert as fixed to restore it.
                            </p>
                        )}
                        {device.adminValveState === "throttled" && (
                            <div className="mt-3 flex items-center gap-3">
                                <input
                                    type="range"
                                    min="1"
                                    max="99"
                                    value={throttlePct}
                                    disabled={busy}
                                    onChange={(e) => setThrottlePct(Number(e.target.value))}
                                    onMouseUp={(e) => setValve("throttled", Number(e.target.value))}
                                    onTouchEnd={(e) => setValve("throttled", Number(e.target.value))}
                                    onKeyUp={(e) => setValve("throttled", Number(e.target.value))}
                                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200 accent-amber-500 dark:bg-slate-700"
                                />
                                <span className="w-9 text-right text-xs font-semibold text-amber-600 dark:text-amber-400">{throttlePct}%</span>
                            </div>
                        )}
                    </div>

                    {/* Recent alerts */}
                    {alerts.length > 0 && (
                        <div className="mt-4 border-t border-slate-100 pt-4 dark:border-slate-800">
                            <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Recent alerts</p>
                            <ul className="space-y-2">
                                {alerts.map((a) => {
                                    const burst = a.type === "burst";
                                    return (
                                        <li key={a._id} className="flex items-center gap-2.5">
                                            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${alertChip[a.severity]}`}>
                                                {burst ? <FiAlertOctagon className="h-3.5 w-3.5" /> : <FiAlertTriangle className="h-3.5 w-3.5" />}
                                            </span>
                                            <span className="flex-1 truncate text-xs text-slate-600 dark:text-slate-300">{burst ? "Burst" : "Micro-leak"}</span>
                                            <span className={`text-[11px] font-medium capitalize ${alertStatus[a.status]}`}>{a.status}</span>
                                            <span className="text-[11px] text-slate-400 dark:text-slate-500">{relativeTime(a.createdAt)}</span>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}

                    {/* Manage: owner + billing */}
                    <div className="mt-4 space-y-2.5 border-t border-slate-100 pt-4 dark:border-slate-800">
                        <div className="flex items-center justify-between text-xs">
                            <span className="flex min-w-0 items-center gap-1.5 text-slate-500 dark:text-slate-400">
                                <FiUser className="h-3.5 w-3.5 shrink-0" />
                                {device.owner?.name ? (
                                    <span className="truncate text-slate-700 dark:text-slate-300">{device.owner.name}</span>
                                ) : (
                                    <span className="text-slate-400 dark:text-slate-500">Unassigned</span>
                                )}
                            </span>
                            <button type="button" onClick={() => setOwnerOpen(true)} className="shrink-0 font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                                {device.owner ? "Reassign" : "Assign"}
                            </button>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-500 dark:text-slate-400">Billing</span>
                            <div className="flex gap-1 rounded-sm bg-slate-100 p-0.5 dark:bg-slate-800/80">
                                {["prepaid", "postpaid"].map((m) => (
                                    <button
                                        key={m}
                                        type="button"
                                        disabled={busy}
                                        onClick={() => setBillingMode(m)}
                                        className={`rounded-sm px-2 py-0.5 font-medium capitalize transition disabled:opacity-50 ${
                                            device.billingMode === m
                                                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                                                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                        }`}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Nested owner modal (sibling so its clicks don't bubble to the detail overlay) */}
            <AssignOwnerModal
                open={ownerOpen}
                device={device}
                onClose={() => setOwnerOpen(false)}
                onAssigned={(updated) => onUpdated?.(updated)}
            />
        </>
    );
};

const Meta = ({ label, value, muted, capitalize }) => (
    <div className="min-w-0">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{label}</p>
        <p className={`mt-0.5 truncate text-xs font-medium ${capitalize ? "capitalize " : ""}${muted ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-300"}`}>
            {value}
        </p>
    </div>
);

export default ConnectionDetailModal;
