import { useState, useEffect, useCallback } from "react";
import { FiAlertOctagon, FiAlertTriangle, FiCheckCircle, FiShield } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import { useToast } from "../../Context/ToastContext.jsx";

const PAGE_SIZE = 5;

const relativeTime = (date) => {
    if (!date) return "";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

const severityChip = {
    critical: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};
const statusStyles = {
    active: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    acknowledged: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};
const filters = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "acknowledged", label: "Acknowledged" },
    { key: "resolved", label: "Resolved" },
];

const Alerts = () => {
    const toast = useToast();
    const [alerts, setAlerts] = useState([]);
    const [filter, setFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);

    useEffect(() => setPage(1), [filter]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch("/api/alerts?limit=200");
            setAlerts(data.alerts || []);
        } catch (err) {
            if (!silent) toast.error(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
        const id = setInterval(() => load(true), 8000);
        return () => clearInterval(id);
    }, [load]);

    const run = async (fn, successMsg) => {
        try {
            await fn();
            await load();
            if (successMsg) toast.success(successMsg);
        } catch (e) {
            toast.error(e.message);
        }
    };
    const acknowledge = (id) => run(() => apiFetch(`/api/alerts/${id}/acknowledge`, { method: "PUT" }), "Alert acknowledged.");
    const resolve = (id) => run(() => apiFetch(`/api/alerts/${id}/resolve`, { method: "PUT" }), "Alert resolved.");
    const reopen = (deviceId) => run(() => apiFetch(`/api/devices/${deviceId}/valve`, { method: "PUT", body: { state: "open" } }), "Supply reopened.");

    const shown = filter === "all" ? alerts : alerts.filter((a) => a.status === filter);
    const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const activeCount = alerts.filter((a) => a.status === "active").length;
    const resolvedCount = alerts.filter((a) => a.status === "resolved").length;

    if (loading) return <WaterLoader center />;

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Leak Alerts</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Burst and micro-leak detections across the network.</p>
                </div>
            </div>

            {/* Summary tiles */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Tile label="Active alerts" value={activeCount} icon={FiAlertTriangle} tone="red" />
                <Tile label="Resolved" value={resolvedCount} icon={FiCheckCircle} tone="emerald" />
                <Tile label="Total" value={alerts.length} icon={FiShield} tone="sky" />
            </div>

            {/* Filter */}
            <div className="mt-5 flex flex-wrap gap-1">
                {filters.map((f) => (
                    <button
                        key={f.key}
                        type="button"
                        onClick={() => setFilter(f.key)}
                        className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                            filter === f.key
                                ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400"
                                : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Table */}
            {shown.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                    <FiCheckCircle className="mx-auto h-8 w-8 text-emerald-500" />
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No {filter === "all" ? "" : `${filter} `}alerts.</p>
                </div>
            ) : (
                <>
                {/* Cards (mobile) */}
                <div className="mt-4 space-y-3 md:hidden">
                    {paged.map((a) => {
                        const burst = a.type === "burst";
                        return (
                            <div key={a._id} className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${severityChip[a.severity]}`}>
                                            {burst ? <FiAlertOctagon className="h-4 w-4" /> : <FiAlertTriangle className="h-4 w-4" />}
                                        </span>
                                        <div className="min-w-0">
                                            <p className="font-medium text-slate-900 dark:text-white">{burst ? "Burst" : "Micro-leak"}</p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">{relativeTime(a.createdAt)}</p>
                                        </div>
                                    </div>
                                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[a.status]}`}>
                                        {a.status}
                                    </span>
                                </div>

                                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">{a.message}</p>

                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Device</span>
                                        <span className="truncate pl-2 text-right text-slate-700 dark:text-slate-300">
                                            {a.device?.name || "—"}
                                            <span className="ml-1 font-mono text-xs text-slate-400 dark:text-slate-500">{a.device?.deviceId}</span>
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Flow</span>
                                        <span className="text-slate-700 dark:text-slate-300">{a.flowRate != null ? `${a.flowRate.toFixed(1)} L/min` : "—"}</span>
                                    </div>
                                </div>

                                {(a.status === "active" || a.status !== "resolved" || (burst && a.autoAction === "valve-closed" && a.device?._id)) && (
                                    <div className="mt-3 flex items-center justify-end gap-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                                        {a.status === "active" && (
                                            <button type="button" onClick={() => acknowledge(a._id)} className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                                                Acknowledge
                                            </button>
                                        )}
                                        {a.status !== "resolved" && (
                                            <button type="button" onClick={() => resolve(a._id)} className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400">
                                                Resolve
                                            </button>
                                        )}
                                        {burst && a.autoAction === "valve-closed" && a.status === "resolved" && a.device?._id && (
                                            <button type="button" onClick={() => reopen(a.device._id)} className="text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                                                Reopen
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Table (desktop) */}
                <div className="mt-4 hidden overflow-x-auto rounded-sm border border-slate-200 md:block dark:border-slate-800">
                    <table className="w-full min-w-200 text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                <th className="px-4 py-2.5 font-medium">Alert</th>
                                <th className="px-4 py-2.5 font-medium">Device</th>
                                <th className="px-4 py-2.5 font-medium">Flow</th>
                                <th className="px-4 py-2.5 font-medium">Detected</th>
                                <th className="px-4 py-2.5 font-medium">Status</th>
                                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.map((a) => {
                                const burst = a.type === "burst";
                                return (
                                    <tr key={a._id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2.5">
                                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${severityChip[a.severity]}`}>
                                                    {burst ? <FiAlertOctagon className="h-4 w-4" /> : <FiAlertTriangle className="h-4 w-4" />}
                                                </span>
                                                <div className="min-w-0">
                                                    <p className="font-medium text-slate-900 dark:text-white">{burst ? "Burst" : "Micro-leak"}</p>
                                                    <p className="max-w-xs truncate text-xs text-slate-400 dark:text-slate-500">{a.message}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900 dark:text-white">{a.device?.name || "—"}</p>
                                            <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{a.device?.deviceId}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                            {a.flowRate != null ? `${a.flowRate.toFixed(1)} L/min` : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">{relativeTime(a.createdAt)}</td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[a.status]}`}>
                                                {a.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center justify-end gap-3">
                                                {a.status === "active" && (
                                                    <button type="button" onClick={() => acknowledge(a._id)} className="text-xs font-medium text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white">
                                                        Acknowledge
                                                    </button>
                                                )}
                                                {a.status !== "resolved" && (
                                                    <button type="button" onClick={() => resolve(a._id)} className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400">
                                                        Resolve
                                                    </button>
                                                )}
                                                {burst && a.autoAction === "valve-closed" && a.status === "resolved" && a.device?._id && (
                                                    <button type="button" onClick={() => reopen(a.device._id)} className="text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400" title="Restore supply after inspecting">
                                                        Reopen
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                </>
            )}

            <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onChange={setPage} />
        </div>
    );
};

const tones = {
    red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
};

const Tile = ({ label, value, icon: Icon, tone }) => (
    <div className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
                <Icon className="h-4 w-4" />
            </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </div>
);

export default Alerts;
