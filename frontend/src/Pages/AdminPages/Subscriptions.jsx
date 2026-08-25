import { useState, useEffect, useCallback } from "react";
import { FiPlus, FiCreditCard, FiZap, FiDollarSign, FiDownload } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { exportCsv, dateStamp } from "../../lib/exportCsv.js";
import AssignSubscriptionModal from "../../Components/AdminComponents/AssignSubscriptionModal.jsx";
import ConfirmationBox from "../../Components/SharedComponents/ConfirmationBox.jsx";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import { useToast } from "../../Context/ToastContext.jsx";

const PAGE_SIZE = 5;

const filters = [
    { key: "all", label: "All" },
    { key: "active", label: "Active" },
    { key: "exhausted", label: "Exhausted" },
    { key: "expired", label: "Expired" },
    { key: "cancelled", label: "Cancelled" },
];

const statusStyles = {
    active: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    exhausted: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    expired: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    cancelled: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const Subscriptions = () => {
    const toast = useToast();
    const [subs, setSubs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [page, setPage] = useState(1);
    const [assignOpen, setAssignOpen] = useState(false);
    const [cancelling, setCancelling] = useState(null);
    const [cancelLoading, setCancelLoading] = useState(false);

    useEffect(() => setPage(1), [filter]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch("/api/subscriptions");
            setSubs(data.subscriptions || []);
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

    const confirmCancel = async () => {
        if (!cancelling) return;
        setCancelLoading(true);
        try {
            await apiFetch(`/api/subscriptions/${cancelling._id}`, { method: "DELETE" });
            setCancelling(null);
            await load();
            toast.success("Subscription cancelled.");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setCancelLoading(false);
        }
    };

    const shown = filter === "all" ? subs : subs.filter((s) => s.status === filter);
    const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const activeSubs = subs.filter((s) => s.status === "active");
    const totalRemaining = activeSubs.reduce((sum, s) => sum + s.volumeRemaining, 0);
    const revenue = subs.reduce((sum, s) => sum + (s.price || 0), 0);

    if (loading) return <WaterLoader center />;

    const exportSubs = () => {
        const rows = subs.map((s) => ({
            connection: s.device?.name || "",
            device_id: s.device?.deviceId || "",
            package: s.package?.name || "",
            status: s.status,
            volume_remaining_l: s.volumeRemaining ?? "",
            volume_total_l: s.volumeTotal ?? "",
            price: s.price ?? "",
            created_at: s.createdAt ? new Date(s.createdAt).toISOString().slice(0, 10) : "",
            expires_at: s.expiresAt ? new Date(s.expiresAt).toISOString().slice(0, 10) : "",
        }));
        if (exportCsv(`subscriptions-${dateStamp()}.csv`, rows)) toast.success(`Exported ${rows.length} subscriptions.`);
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Subscriptions</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Prepaid plans across all devices.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={exportSubs}
                        disabled={subs.length === 0}
                        className="flex shrink-0 items-center gap-1.5 rounded-sm border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <FiDownload className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setAssignOpen(true)}
                        className="flex items-center gap-1.5 rounded-sm bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
                    >
                        <FiPlus className="h-4 w-4" /> <span className="hidden sm:inline">Assign package</span>
                    </button>
                </div>
            </div>

            {/* Summary tiles */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Tile label="Active plans" value={activeSubs.length} icon={FiCreditCard} tone="emerald" />
                <Tile label="Prepaid volume left" value={`${totalRemaining.toFixed(0)} L`} icon={FiZap} tone="sky" />
                <Tile label="Total revenue" value={`Rs. ${revenue.toLocaleString()}`} icon={FiDollarSign} tone="violet" />
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
                    <p className="text-sm text-slate-500 dark:text-slate-400">No subscriptions here.</p>
                </div>
            ) : (
                <>
                {/* Cards (mobile) */}
                <div className="mt-4 space-y-3 md:hidden">
                    {paged.map((s) => {
                        const ratio = Math.max(0, Math.min(1, s.volumeRemaining / s.volumeTotal));
                        const low = s.status === "active" && ratio < 0.1;
                        return (
                            <div key={s._id} className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-slate-900 dark:text-white">{s.device?.name || "—"}</p>
                                        <p className="truncate font-mono text-xs text-slate-400 dark:text-slate-500">{s.device?.deviceId}</p>
                                    </div>
                                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[s.status]}`}>
                                        {s.status}
                                    </span>
                                </div>

                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Package</span>
                                        <span className="text-slate-700 dark:text-slate-300">{s.package?.name || "—"}</span>
                                    </div>
                                    <div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs text-slate-500 dark:text-slate-400">Balance</span>
                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                                {s.volumeRemaining.toFixed(0)}/{s.volumeTotal.toLocaleString()} L
                                            </span>
                                        </div>
                                        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                            <div
                                                className={`h-full rounded-full ${low ? "bg-amber-500" : s.status === "active" ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-600"}`}
                                                style={{ width: `${ratio * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Expires</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "—"}
                                        </span>
                                    </div>
                                </div>

                                {s.status === "active" && (
                                    <div className="mt-3 border-t border-slate-100 pt-3 text-right dark:border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => setCancelling(s)}
                                            className="text-xs font-medium text-red-600 hover:text-red-500 dark:text-red-400"
                                        >
                                            Cancel plan
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Table (desktop) */}
                <div className="mt-4 hidden overflow-x-auto rounded-sm border border-slate-200 md:block dark:border-slate-800">
                    <table className="w-full min-w-160 text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                <th className="px-4 py-2.5 font-medium">Device</th>
                                <th className="px-4 py-2.5 font-medium">Package</th>
                                <th className="px-4 py-2.5 font-medium">Balance</th>
                                <th className="px-4 py-2.5 font-medium">Status</th>
                                <th className="px-4 py-2.5 font-medium">Expires</th>
                                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.map((s) => {
                                const ratio = Math.max(0, Math.min(1, s.volumeRemaining / s.volumeTotal));
                                const low = s.status === "active" && ratio < 0.1;
                                return (
                                    <tr key={s._id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900 dark:text-white">{s.device?.name || "—"}</p>
                                            <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{s.device?.deviceId}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{s.package?.name || "—"}</td>
                                        <td className="px-4 py-3">
                                            <div className="flex items-center gap-2">
                                                <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                                    <div
                                                        className={`h-full rounded-full ${low ? "bg-amber-500" : s.status === "active" ? "bg-sky-500" : "bg-slate-300 dark:bg-slate-600"}`}
                                                        style={{ width: `${ratio * 100}%` }}
                                                    />
                                                </div>
                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                    {s.volumeRemaining.toFixed(0)}/{s.volumeTotal.toLocaleString()} L
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[s.status]}`}>
                                                {s.status}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                            {s.expiresAt ? new Date(s.expiresAt).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {s.status === "active" && (
                                                <button
                                                    type="button"
                                                    onClick={() => setCancelling(s)}
                                                    className="text-xs font-medium text-red-600 hover:text-red-500 dark:text-red-400"
                                                >
                                                    Cancel
                                                </button>
                                            )}
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

            <AssignSubscriptionModal open={assignOpen} onClose={() => setAssignOpen(false)} onAssigned={load} />

            <ConfirmationBox
                open={!!cancelling}
                title="Cancel subscription"
                message={cancelling ? `Cancel the plan on "${cancelling.device?.name || cancelling.device?.deviceId}"? This closes the valve.` : ""}
                confirmText="Cancel plan"
                tone="danger"
                loading={cancelLoading}
                onConfirm={confirmCancel}
                onCancel={() => setCancelling(null)}
            />
        </div>
    );
};

const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
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

export default Subscriptions;
