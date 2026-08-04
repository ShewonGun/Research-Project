import { useState, useEffect, useCallback } from "react";
import { FiPlus, FiTrash2, FiPlayCircle, FiSave } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import ConfirmationBox from "../../Components/SharedComponents/ConfirmationBox.jsx";

const statusStyles = {
    open: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
    unpaid: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    overdue: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Billing = () => {
    const [tariff, setTariff] = useState(null);
    const [bills, setBills] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState("");
    const [error, setError] = useState("");
    const [confirmRun, setConfirmRun] = useState(false);
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState("");

    const load = useCallback(async () => {
        try {
            const [t, b] = await Promise.all([
                apiFetch("/api/tariff"),
                apiFetch("/api/bills").catch(() => ({ bills: [] })),
            ]);
            setTariff(t.tariff);
            setBills(b.bills || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, []);

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
        setError("");
        setSavedMsg("");
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
            setSavedMsg("Tariff saved.");
        } catch (e) {
            setError(e.message);
        } finally {
            setSaving(false);
        }
    };

    const runBilling = async () => {
        setRunning(true);
        setError("");
        setRunResult("");
        try {
            const data = await apiFetch("/api/bills/run", { method: "POST" });
            setRunResult(`Generated ${data.count} bill${data.count === 1 ? "" : "s"} totalling ${money(data.total)}.`);
            await load();
        } catch (e) {
            setError(e.message);
        } finally {
            setRunning(false);
            setConfirmRun(false);
        }
    };

    const markPaid = async (id) => {
        try {
            await apiFetch(`/api/bills/${id}/pay`, { method: "PUT" });
            await load();
        } catch (e) {
            setError(e.message);
        }
    };

    if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;

    return (
        <div className="max-w-4xl">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Postpaid Billing</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Set the NWSDB tariff and close monthly cycles into payable bills.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => setConfirmRun(true)}
                    className="flex shrink-0 items-center gap-1.5 rounded-md bg-sky-600 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                    <FiPlayCircle className="h-4 w-4" />
                    Run billing
                </button>
            </div>

            {error && (
                <div className="mt-4 rounded-md bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
                    {error}
                </div>
            )}
            {runResult && (
                <div className="mt-4 rounded-md bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                    {runResult}
                </div>
            )}

            {/* Tariff editor */}
            {tariff && (
                <div className="mt-5 rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Tariff</h2>

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
                                    <div key={i} className="flex items-center gap-3 text-sm">
                                        <span className="w-24 shrink-0 text-xs text-slate-500 dark:text-slate-400">
                                            {last ? "above" : "up to"}
                                        </span>
                                        <input
                                            type="number"
                                            placeholder={last ? "∞" : "units"}
                                            value={tier.maxUnits ?? ""}
                                            onChange={(e) => setTier(i, "maxUnits", e.target.value === "" ? null : e.target.value)}
                                            className={`w-24 ${inputCls}`}
                                        />
                                        <span className="text-xs text-slate-400 dark:text-slate-500">units @ Rs.</span>
                                        <input
                                            type="number"
                                            value={tier.rate}
                                            onChange={(e) => setTier(i, "rate", e.target.value)}
                                            className={`w-24 ${inputCls}`}
                                        />
                                        <span className="text-xs text-slate-400 dark:text-slate-500">/ unit</span>
                                        <button
                                            type="button"
                                            onClick={() => removeTier(i)}
                                            className="ml-auto flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                                        >
                                            <FiTrash2 className="h-3.5 w-3.5" />
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
                        {savedMsg && <span className="text-xs text-emerald-600 dark:text-emerald-400">{savedMsg}</span>}
                    </div>
                </div>
            )}

            {/* Recent bills */}
            <div className="mt-6">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Recent bills</h2>
                {bills.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">No bills yet. Run billing to close the first cycles.</p>
                ) : (
                    <div className="mt-3 overflow-hidden rounded-sm border border-slate-200 dark:border-slate-800">
                        {bills.map((b) => (
                            <div
                                key={b._id}
                                className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-3 last:border-0 dark:border-slate-800 dark:bg-slate-900"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                        {b.device?.name || "Device"} <span className="font-mono text-xs text-slate-400">{b.device?.deviceId}</span>
                                    </p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        {b.status === "open"
                                            ? `${(b.volumeUsed || 0).toFixed(0)} L this cycle`
                                            : `${money(b.amount)} · ${b.units} units${b.dueDate ? ` · due ${new Date(b.dueDate).toLocaleDateString()}` : ""}`}
                                    </p>
                                </div>
                                <div className="flex shrink-0 items-center gap-2">
                                    <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[b.status]}`}>
                                        {b.status}
                                    </span>
                                    {(b.status === "unpaid" || b.status === "overdue") && (
                                        <button
                                            type="button"
                                            onClick={() => markPaid(b._id)}
                                            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                        >
                                            Mark paid
                                        </button>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
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

const inputCls =
    "rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-sky-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white";

const Field = ({ label, children }) => (
    <label className="flex flex-col gap-1.5">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{label}</span>
        {children}
    </label>
);

export default Billing;
