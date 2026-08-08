import { useState, useEffect, useCallback } from "react";
import { FiPlus, FiTrash2, FiPlayCircle, FiSave, FiDollarSign, FiCheckCircle, FiFileText, FiEdit2, FiX } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import ConfirmationBox from "../../Components/SharedComponents/ConfirmationBox.jsx";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";

const PAGE_SIZE = 5;

const statusStyles = {
    open: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    unpaid: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    overdue: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Billing = () => {
    const toast = useToast();
    const [tariff, setTariff] = useState(null);
    const [bills, setBills] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [confirmRun, setConfirmRun] = useState(false);
    const [running, setRunning] = useState(false);
    const [page, setPage] = useState(1);
    const [editing, setEditing] = useState(false);
    const [snapshot, setSnapshot] = useState(null);

    const startEdit = () => {
        setSnapshot(tariff);
        setEditing(true);
    };
    const cancelEdit = () => {
        if (snapshot) setTariff(snapshot);
        setEditing(false);
    };

    const load = useCallback(async () => {
        try {
            const [t, b] = await Promise.all([
                apiFetch("/api/tariff"),
                apiFetch("/api/bills").catch(() => ({ bills: [] })),
            ]);
            setTariff(t.tariff);
            setBills(b.bills || []);
        } catch (e) {
            toast.error(e.message);
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
    }, [load]);

    const setField = (key, value) => setTariff((t) => ({ ...t, [key]: value }));
    const setTier = (i, key, value) =>
        setTariff((t) => ({ ...t, tiers: t.tiers.map((tier, idx) => (idx === i ? { ...tier, [key]: value } : tier)) }));
    const addTier = () => setTariff((t) => ({ ...t, tiers: [...t.tiers, { maxUnits: null, rate: 0 }] }));
    const removeTier = (i) => setTariff((t) => ({ ...t, tiers: t.tiers.filter((_, idx) => idx !== i) }));

    const saveTariff = async () => {
        setSaving(true);
        try {
            const payload = {
                name: tariff.name,
                unitLiters: Number(tariff.unitLiters),
                fixedCharge: Number(tariff.fixedCharge),
                tiers: tariff.tiers.map((t) => ({
                    maxUnits: t.maxUnits === null || t.maxUnits === "" ? null : Number(t.maxUnits),
                    rate: Number(t.rate),
                })),
            };
            const data = await apiFetch("/api/tariff", { method: "PUT", body: payload });
            setTariff(data.tariff);
            setEditing(false);
            toast.success("Tariff saved.");
        } catch (e) {
            toast.error(e.message);
        } finally {
            setSaving(false);
        }
    };

    const runBilling = async () => {
        setRunning(true);
        try {
            const data = await apiFetch("/api/bills/run", { method: "POST" });
            toast.success(`Generated ${data.count} bill${data.count === 1 ? "" : "s"} totalling ${money(data.total)}.`);
            await load();
        } catch (e) {
            toast.error(e.message);
        } finally {
            setRunning(false);
            setConfirmRun(false);
        }
    };

    const markPaid = async (id) => {
        try {
            await apiFetch(`/api/bills/${id}/pay`, { method: "PUT" });
            await load();
            toast.success("Bill marked paid.");
        } catch (e) {
            toast.error(e.message);
        }
    };

    if (loading) return <WaterLoader center />;

    const outstanding = bills.filter((b) => b.status === "unpaid" || b.status === "overdue");
    const outstandingTotal = outstanding.reduce((s, b) => s + (b.amount || 0), 0);
    const collected = bills.filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount || 0), 0);
    const paged = bills.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    return (
        <div>
            {/* Header */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Postpaid Billing</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Set the NWSDB tariff and close monthly cycles into payable bills.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setConfirmRun(true)}
                    className="flex shrink-0 items-center justify-center gap-1.5 rounded-sm bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 sm:w-auto"
                >
                    <FiPlayCircle className="h-4 w-4" />
                    Run billing
                </button>
            </div>

            {/* Summary tiles */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Tile label="Outstanding" value={money(outstandingTotal)} icon={FiDollarSign} tone="red" />
                <Tile label="Collected" value={money(collected)} icon={FiCheckCircle} tone="emerald" />
                <Tile label="Open bills" value={outstanding.length} icon={FiFileText} tone="sky" />
            </div>

            {/* Tariff editor */}
            {tariff && (
                <div className="mt-5 rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Tariff</h2>
                        {!editing ? (
                            <button
                                type="button"
                                onClick={startEdit}
                                className="flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                                <FiEdit2 className="h-3.5 w-3.5" /> Edit
                            </button>
                        ) : (
                            <button
                                type="button"
                                onClick={cancelEdit}
                                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                            >
                                <FiX className="h-3.5 w-3.5" /> Cancel
                            </button>
                        )}
                    </div>

                    {editing ? (
                        <>
                            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                                <Field label="Name">
                                    <input value={tariff.name || ""} onChange={(e) => setField("name", e.target.value)} className={inputCls} />
                                </Field>
                                <Field label="Litres per unit">
                                    <input type="number" value={tariff.unitLiters} onChange={(e) => setField("unitLiters", e.target.value)} className={inputCls} />
                                </Field>
                                <Field label="Fixed charge (Rs.)">
                                    <input type="number" value={tariff.fixedCharge} onChange={(e) => setField("fixedCharge", e.target.value)} className={inputCls} />
                                </Field>
                            </div>

                            {/* Tiers */}
                            <div className="mt-5">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Rising blocks (marginal, per unit)</p>
                                    <button type="button" onClick={addTier} className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                                        <FiPlus className="h-3.5 w-3.5" /> Add block
                                    </button>
                                </div>
                                <div className="space-y-2">
                                    {tariff.tiers.map((tier, i) => {
                                        const last = i === tariff.tiers.length - 1;
                                        return (
                                            <div
                                                key={i}
                                                className="flex flex-col gap-3 rounded-md border border-slate-200 p-3 sm:flex-row sm:items-end dark:border-slate-800"
                                            >
                                                <label className="flex flex-1 flex-col gap-1">
                                                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                                        {last ? "Above (units)" : "Up to (units)"}
                                                    </span>
                                                    <input
                                                        type="number"
                                                        placeholder={last ? "∞ (no cap)" : "units"}
                                                        value={tier.maxUnits ?? ""}
                                                        onChange={(e) => setTier(i, "maxUnits", e.target.value === "" ? null : e.target.value)}
                                                        className={`w-full ${inputCls}`}
                                                    />
                                                </label>
                                                <label className="flex flex-1 flex-col gap-1">
                                                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Rate (Rs. / unit)</span>
                                                    <input
                                                        type="number"
                                                        value={tier.rate}
                                                        onChange={(e) => setTier(i, "rate", e.target.value)}
                                                        className={`w-full ${inputCls}`}
                                                    />
                                                </label>
                                                <button
                                                    type="button"
                                                    onClick={() => removeTier(i)}
                                                    aria-label="Remove block"
                                                    className="flex h-9 w-9 shrink-0 items-center justify-center self-end rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                                >
                                                    <FiTrash2 className="h-4 w-4" />
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="mt-5 flex items-center gap-3">
                                <button
                                    type="button"
                                    onClick={saveTariff}
                                    disabled={saving}
                                    className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-60 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                                >
                                    <FiSave className="h-4 w-4" />
                                    {saving ? "Saving…" : "Save tariff"}
                                </button>
                                <button
                                    type="button"
                                    onClick={cancelEdit}
                                    className="text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                                >
                                    Cancel
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            {/* Read-only summary */}
                            <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
                                <ReadField label="Name" value={tariff.name || "—"} />
                                <ReadField label="Litres per unit" value={Number(tariff.unitLiters).toLocaleString()} />
                                <ReadField label="Fixed charge" value={`Rs. ${Number(tariff.fixedCharge).toLocaleString()}`} />
                            </div>

                            <div className="mt-5">
                                <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">Rising blocks (marginal, per unit)</p>
                                <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                                    {tariff.tiers.map((tier, i) => {
                                        const last = i === tariff.tiers.length - 1;
                                        const prev = i === 0 ? 0 : tariff.tiers[i - 1].maxUnits;
                                        return (
                                            <div
                                                key={i}
                                                className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5 text-sm last:border-0 dark:border-slate-800"
                                            >
                                                <span className="text-slate-600 dark:text-slate-300">
                                                    {last
                                                        ? `Above ${prev} units`
                                                        : i === 0
                                                          ? `Up to ${tier.maxUnits} units`
                                                          : `${prev}–${tier.maxUnits} units`}
                                                </span>
                                                <span className="font-medium text-slate-900 dark:text-white">Rs. {Number(tier.rate).toLocaleString()} / unit</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* Recent bills */}
            <div className="mt-6">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent bills</h2>
                {bills.length === 0 ? (
                    <div className="mt-3 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                        <p className="text-sm text-slate-500 dark:text-slate-400">No bills yet. Run billing to close the first cycles.</p>
                    </div>
                ) : (
                    <>
                    {/* Cards (mobile) */}
                    <div className="mt-3 space-y-3 md:hidden">
                        {paged.map((b) => (
                            <div key={b._id} className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-slate-900 dark:text-white">{b.device?.name || "—"}</p>
                                        <p className="truncate font-mono text-xs text-slate-400 dark:text-slate-500">{b.device?.deviceId}</p>
                                    </div>
                                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[b.status]}`}>{b.status}</span>
                                </div>

                                <div className="mt-3 space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Amount</span>
                                        <span className="text-slate-700 dark:text-slate-300">
                                            {b.status === "open" ? `${(b.volumeUsed || 0).toFixed(0)} L so far` : money(b.amount)}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Units</span>
                                        <span className="text-slate-700 dark:text-slate-300">{b.units != null ? b.units : "—"}</span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">Due</span>
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {b.dueDate ? new Date(b.dueDate).toLocaleDateString() : "—"}
                                        </span>
                                    </div>
                                </div>

                                {(b.status === "unpaid" || b.status === "overdue") && (
                                    <div className="mt-3 border-t border-slate-100 pt-3 text-right dark:border-slate-800">
                                        <button
                                            type="button"
                                            onClick={() => markPaid(b._id)}
                                            className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                                        >
                                            Mark paid
                                        </button>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Table (desktop) */}
                    <div className="mt-3 hidden overflow-x-auto rounded-sm border border-slate-200 md:block dark:border-slate-800">
                        <table className="w-full min-w-160 text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                    <th className="px-4 py-2.5 font-medium">Device</th>
                                    <th className="px-4 py-2.5 font-medium">Amount</th>
                                    <th className="px-4 py-2.5 font-medium">Units</th>
                                    <th className="px-4 py-2.5 font-medium">Due</th>
                                    <th className="px-4 py-2.5 font-medium">Status</th>
                                    <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {paged.map((b) => (
                                    <tr key={b._id} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                                        <td className="px-4 py-3">
                                            <p className="font-medium text-slate-900 dark:text-white">{b.device?.name || "—"}</p>
                                            <p className="font-mono text-xs text-slate-400 dark:text-slate-500">{b.device?.deviceId}</p>
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                                            {b.status === "open" ? (
                                                <span className="text-slate-400 dark:text-slate-500">{(b.volumeUsed || 0).toFixed(0)} L so far</span>
                                            ) : (
                                                money(b.amount)
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{b.units != null ? b.units : "—"}</td>
                                        <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                            {b.dueDate ? new Date(b.dueDate).toLocaleDateString() : "—"}
                                        </td>
                                        <td className="px-4 py-3">
                                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[b.status]}`}>{b.status}</span>
                                        </td>
                                        <td className="px-4 py-3 text-right">
                                            {(b.status === "unpaid" || b.status === "overdue") && (
                                                <button
                                                    type="button"
                                                    onClick={() => markPaid(b._id)}
                                                    className="text-xs font-medium text-emerald-600 hover:text-emerald-500 dark:text-emerald-400"
                                                >
                                                    Mark paid
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    </>
                )}
                <Pagination page={page} pageSize={PAGE_SIZE} total={bills.length} onChange={setPage} />
            </div>

            <ConfirmationBox
                open={confirmRun}
                title="Run billing?"
                message="This closes the current cycle for every postpaid device and issues payable bills at the saved tariff."
                confirmText="Run billing"
                tone="primary"
                loading={running}
                onConfirm={runBilling}
                onCancel={() => setConfirmRun(false)}
            />
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
        <p className="mt-2 text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </div>
);

const inputCls =
    "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const Field = ({ label, children }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

const ReadField = ({ label, value }) => (
    <div>
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
        <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">{value}</p>
    </div>
);

export default Billing;
