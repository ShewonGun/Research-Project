import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { FiTrash2, FiDroplet, FiSliders, FiSlash, FiCpu, FiArrowRight, FiUser } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
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

const relativeTime = (date) => {
    if (!date) return "never";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

const DeviceCard = ({ device, onDelete, onUpdated }) => {
    const [usage, setUsage] = useState(null);
    const [sub, setSub] = useState(null);
    const [ownerOpen, setOwnerOpen] = useState(false);
    const [busy, setBusy] = useState(false);
    const [throttlePct, setThrottlePct] = useState(device.throttlePercent < 100 ? device.throttlePercent : 50);

    const loadUsage = useCallback(async () => {
        try {
            const data = await apiFetch(`/api/readings/usage?device=${device._id}&days=7`);
            setUsage(data);
        } catch {
            setUsage({ daily: [], total: 0 });
        }
    }, [device._id]);

    const loadSub = useCallback(async () => {
        try {
            const data = await apiFetch(`/api/subscriptions?device=${device._id}`);
            setSub((data.subscriptions || [])[0] || null);
        } catch {
            setSub(null);
        }
    }, [device._id]);

    useEffect(() => {
        loadUsage();
        loadSub();
        // Keep usage + balance live while telemetry streams in.
        const id = setInterval(() => {
            loadUsage();
            loadSub();
        }, 8000);
        return () => clearInterval(id);
    }, [loadUsage, loadSub]);

    const setValve = async (state, pct) => {
        setBusy(true);
        try {
            const body = state === "throttled" ? { state, throttlePercent: pct } : { state };
            const data = await apiFetch(`/api/devices/${device._id}/valve`, { method: "PUT", body });
            onUpdated?.(data.device);
        } catch {
            /* surfaced by parent on reload; keep card responsive */
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
            /* surfaced by parent on reload */
        } finally {
            setBusy(false);
        }
    };

    const postpaid = device.billingMode === "postpaid";

    return (
        <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                    {/* Device icon tile with presence dot */}
                    <div className="relative shrink-0">
                        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                            <FiCpu className="h-4 w-4" />
                        </span>
                        <span
                            className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white dark:ring-slate-900 ${
                                device.status === "online" ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"
                            }`}
                            title={device.status}
                        />
                    </div>
                    <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {device.name || "Water Meter"}
                        </h3>
                        <p className="mt-0.5 truncate font-mono text-xs text-slate-400 dark:text-slate-500">
                            {device.deviceId}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={() => onDelete(device)}
                    aria-label="Delete device"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                    <FiTrash2 className="h-3.5 w-3.5" />
                </button>
            </div>

            {/* Meta */}
            <div className="mt-3 flex items-center justify-between">
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {device.location || "—"} · seen {relativeTime(device.lastSeen)}
                </p>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${valveStyles[device.effectiveValveState]}`}>
                    {device.effectiveValveState}
                    {device.effectiveValveState === "throttled" ? ` ${device.throttlePercent}%` : ""}
                </span>
            </div>

            {/* Owner */}
            <div className="mt-2 flex items-center justify-between text-xs">
                <span className="flex min-w-0 items-center gap-1.5 text-slate-500 dark:text-slate-400">
                    <FiUser className="h-3.5 w-3.5 shrink-0" />
                    {device.owner?.name ? (
                        <span className="truncate text-slate-700 dark:text-slate-300">{device.owner.name}</span>
                    ) : (
                        <span className="text-slate-400 dark:text-slate-500">Unassigned</span>
                    )}
                </span>
                <button
                    type="button"
                    onClick={() => setOwnerOpen(true)}
                    className="shrink-0 font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                >
                    {device.owner ? "Reassign" : "Assign"}
                </button>
            </div>

            {/* Billing mode */}
            <div className="mt-2 flex items-center justify-between text-xs">
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

            {/* 7-day usage chart */}
            <UsageChart daily={usage?.daily} total={usage?.total} />

            {/* Prepaid balance / postpaid note */}
            <BalanceSection sub={sub} postpaid={postpaid} />

            {/* Valve controls — provider gate */}
            <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Provider gate</p>
                    {device.userValveState === "closed" && (
                        <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Customer tap off</span>
                    )}
                </div>

                {/* Segmented control */}
                <div className="grid grid-cols-3 gap-1 rounded-sm bg-slate-100 p-1 dark:bg-slate-800/80">
                    {valveSegments.map(({ key, label, icon: Icon, active }) => {
                        const isActive = device.adminValveState === key;
                        return (
                            <button
                                key={key}
                                type="button"
                                disabled={busy}
                                onClick={() => setValve(key, key === "throttled" ? throttlePct : undefined)}
                                className={`flex items-center justify-center gap-1.5 rounded-sm py-1.5 text-xs font-medium transition disabled:opacity-50 ${
                                    isActive
                                        ? `bg-white shadow-sm dark:bg-slate-900 ${active}`
                                        : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                }`}
                            >
                                <Icon className="h-3.5 w-3.5" />
                                {label}
                            </button>
                        );
                    })}
                </div>

                {/* Throttle slider — only when throttling */}
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
                        <span className="w-9 text-right text-xs font-semibold text-amber-600 dark:text-amber-400">
                            {throttlePct}%
                        </span>
                    </div>
                )}
            </div>

            <AssignOwnerModal
                open={ownerOpen}
                device={device}
                onClose={() => setOwnerOpen(false)}
                onAssigned={(updated) => onUpdated?.(updated)}
            />
        </div>
    );
};

/* ---- Prepaid balance bar / manage link (or postpaid note) ---- */
const BalanceSection = ({ sub, postpaid }) => {
    const active = sub && sub.status === "active";
    const ratio = active ? Math.max(0, Math.min(1, sub.volumeRemaining / sub.volumeTotal)) : 0;
    const low = active && ratio < 0.1;

    if (postpaid) {
        return (
            <div className="mt-3 flex items-center justify-between">
                <span className="text-xs text-slate-400 dark:text-slate-500">Postpaid — billed monthly</span>
                <Link
                    to="/dashboard/billing"
                    className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                >
                    Billing <FiArrowRight className="h-3.5 w-3.5" />
                </Link>
            </div>
        );
    }

    return (
        <div className="mt-3">
            {active ? (
                <>
                    <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-400 dark:text-slate-500">Prepaid balance</span>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {sub.volumeRemaining.toFixed(0)} / {sub.volumeTotal.toLocaleString()} L
                        </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div
                            className={`h-full rounded-full transition-all ${low ? "bg-amber-500" : "bg-sky-500"}`}
                            style={{ width: `${ratio * 100}%` }}
                        />
                    </div>
                </>
            ) : (
                <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                        {sub ? `Plan ${sub.status}` : "No active plan"}
                    </span>
                    <Link
                        to="/dashboard/subscriptions"
                        className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                    >
                        Manage <FiArrowRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            )}
        </div>
    );
};

export default DeviceCard;
