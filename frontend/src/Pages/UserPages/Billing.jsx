import { useState } from "react";
import { FiFileText, FiDroplet, FiClock, FiAlertTriangle, FiCheckCircle } from "react-icons/fi";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import { useToast } from "../../Context/ToastContext.jsx";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";

const statusStyles = {
    unpaid: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    overdue: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
    open: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const Billing = () => {
    const { device, mode, bill, estimate, bills, loading, payBill } = useMyWater();
    const toast = useToast();
    const [payingId, setPayingId] = useState(null);

    if (loading) return <WaterLoader center />;
    if (!device) return <NoDevice />;

    if (mode !== "postpaid") {
        return (
            <div>
                <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Billing</h1>
                <p className="mt-4 rounded-sm border border-slate-200 bg-white p-5 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    Your connection is <span className="font-medium text-slate-700 dark:text-slate-300">prepaid</span> — you top up in advance.
                    Manage it on the <span className="font-medium">Plans</span> tab.
                </p>
            </div>
        );
    }

    const outstanding = bills.filter((b) => b.status === "unpaid" || b.status === "overdue");
    const past = bills.filter((b) => b.status === "paid");

    const pay = async (id) => {
        setPayingId(id);
        try {
            await payBill(id);
            toast.success("Payment successful. Full flow restored.");
        } catch (e) {
            toast.error(e.message);
        } finally {
            setPayingId(null);
        }
    };

    return (
        <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Billing</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                Postpaid connection — use water now, pay your monthly bill.
            </p>

            {/* Current cycle */}
            <div className="mt-5 rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiFileText className="h-4 w-4" />
                    </span>
                    <span className="text-sm font-medium text-slate-500 dark:text-slate-400">This month so far</span>
                </div>
                <div className="mt-4 flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">
                        {money(estimate?.amount)}
                    </span>
                    <span className="text-sm text-slate-400 dark:text-slate-500">estimated</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                        <FiDroplet className="h-3.5 w-3.5" />
                        {(bill?.volumeUsed || 0).toFixed(0)} L used ({estimate?.units ?? 0} units)
                    </span>
                    {bill?.periodStart && (
                        <span className="flex items-center gap-1">
                            <FiClock className="h-3.5 w-3.5" />
                            Since {new Date(bill.periodStart).toLocaleDateString()}
                        </span>
                    )}
                </div>
                <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                    An estimate at the current tariff. You'll be billed when the cycle closes.
                </p>
            </div>

            {/* Outstanding bills */}
            {outstanding.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Amount due</h2>
                    <div className="mt-3 space-y-3">
                        {outstanding.map((b) => (
                            <div
                                key={b._id}
                                className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="text-base font-semibold text-slate-900 dark:text-white">{money(b.amount)}</span>
                                            <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[b.status]}`}>
                                                {b.status === "overdue" && <FiAlertTriangle className="mr-0.5 inline h-3 w-3" />}
                                                {b.status}
                                            </span>
                                        </div>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                            {b.units} units · {b.periodStart && new Date(b.periodStart).toLocaleDateString()}
                                            {b.periodEnd && ` – ${new Date(b.periodEnd).toLocaleDateString()}`}
                                        </p>
                                        {b.dueDate && (
                                            <p className={`mt-0.5 text-xs ${b.status === "overdue" ? "text-red-600 dark:text-red-400" : "text-slate-400 dark:text-slate-500"}`}>
                                                Due {new Date(b.dueDate).toLocaleDateString()}
                                            </p>
                                        )}
                                    </div>
                                    <button
                                        type="button"
                                        disabled={payingId === b._id}
                                        onClick={() => pay(b._id)}
                                        className="shrink-0 rounded-md bg-sky-600 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
                                    >
                                        {payingId === b._id ? "Paying…" : "Pay now"}
                                    </button>
                                </div>
                                {b.status === "overdue" && (
                                    <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/40 dark:text-red-300">
                                        This bill is overdue — your supply is being restricted and will be cut off if it stays unpaid. Pay now to restore full flow.
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* History */}
            {past.length > 0 && (
                <div className="mt-6">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Paid bills</h2>
                    <div className="mt-3 overflow-hidden rounded-sm border border-slate-200 dark:border-slate-800">
                        {past.map((b) => (
                            <div
                                key={b._id}
                                className="flex items-center justify-between border-b border-slate-100 bg-white px-4 py-3 last:border-0 dark:border-slate-800 dark:bg-slate-900"
                            >
                                <div className="min-w-0">
                                    <p className="truncate text-sm font-medium text-slate-900 dark:text-white">{money(b.amount)}</p>
                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                        {b.units} units · paid {b.paidAt && new Date(b.paidAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles.paid}`}>
                                    <FiCheckCircle className="mr-0.5 inline h-3 w-3" />
                                    paid
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Billing;
