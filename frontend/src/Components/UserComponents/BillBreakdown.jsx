import { useEffect, useState } from "react";
import { FiTrendingUp, FiLayers } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { browserTimeZone } from "../../lib/dayKey.js";

const money = (n) => `Rs. ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const units = (n) => `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 1 })} unit${Number(n) === 1 ? "" : "s"}`;

const PARTS = [
    { key: "usageCharge", label: "Water charge", color: "bg-sky-500" },
    { key: "fixedCharge", label: "Service charge", color: "bg-indigo-400" },
    { key: "vat", label: "VAT", color: "bg-slate-400" },
];

/* The running bill in plain words: what it's made of (stacked bar), how far it is from the next
   price block, and the estimate at the end of the cycle (from the usage forecast, if available). */
const BillBreakdown = ({ estimate, deviceId }) => {
    const [cycleEnd, setCycleEnd] = useState(null);

    useEffect(() => {
        let cancelled = false;
        apiFetch(`/api/forecast?device=${deviceId}&tz=${encodeURIComponent(browserTimeZone())}`)
            .then((d) => !cancelled && setCycleEnd(d?.available ? d.billEstimate : null))
            .catch(() => !cancelled && setCycleEnd(null)); // no forecast → just leave that line out
        return () => {
            cancelled = true;
        };
    }, [deviceId]);

    if (!estimate) return null;
    const total = PARTS.reduce((s, p) => s + (estimate[p.key] || 0), 0);
    const parts = PARTS.filter((p) => (estimate[p.key] || 0) > 0);
    const nb = estimate.nextBlock;
    const serviceSameStep = nb?.service && Math.abs(nb.service.unitsToNext - nb.unitsToNext) < 0.01;

    return (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
            {total > 0 && (
                <div>
                    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label="Bill breakdown">
                        {parts.map((p) => (
                            <div key={p.key} className={p.color} style={{ width: `${(100 * estimate[p.key]) / total}%` }} />
                        ))}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
                        {parts.map((p) => (
                            <span key={p.key} className="inline-flex items-center gap-1.5">
                                <span className={`h-2 w-2 rounded-full ${p.color}`} />
                                {p.label} <span className="font-medium text-slate-900 dark:text-white">{money(estimate[p.key])}</span>
                            </span>
                        ))}
                    </div>
                </div>
            )}

            {nb && (
                <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <FiLayers className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    <span>
                        You're <span className="font-semibold text-slate-900 dark:text-white">{units(nb.unitsToNext)}</span> (
                        {nb.litresToNext.toLocaleString()} L) away from the next price block: each unit then costs {money(nb.nextRate)} instead of{" "}
                        {money(nb.rate)}.
                        {serviceSameStep && ` The service charge also rises from ${money(nb.service.now)} to ${money(nb.service.next)} there.`}
                        {nb.service && !serviceSameStep && ` The service charge rises from ${money(nb.service.now)} to ${money(nb.service.next)} in ${units(nb.service.unitsToNext)}.`}
                    </span>
                </p>
            )}

            {cycleEnd && (
                <p className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <FiTrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-sky-600 dark:text-sky-400" />
                    <span>
                        Bill so far: <span className="font-semibold text-slate-900 dark:text-white">{money(estimate.amount)}</span>, estimated at cycle end:{" "}
                        <span className="font-semibold text-slate-900 dark:text-white">
                            {money(cycleEnd.amount.low)} – {money(cycleEnd.amount.high)}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            {" "}
                            (by {new Date(cycleEnd.cycleEnd).toLocaleDateString(undefined, { day: "numeric", month: "short" })}, from your usage forecast)
                        </span>
                    </span>
                </p>
            )}
        </div>
    );
};

export default BillBreakdown;
