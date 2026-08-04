import { FiDroplet, FiClock, FiZap, FiCheck } from "react-icons/fi";

// A creative prepaid-plan card: a gradient "water" header shows the litres with
// a wave cutting into the body, then the price, per-litre value, validity, and a
// buy button. `highlight` badges the best-value plan.
const PlanCard = ({ pkg, disabled, buying, highlight, onBuy }) => {
    const perLiter = pkg.volumeLiters ? pkg.price / pkg.volumeLiters : 0;

    return (
        <div
            className={`group relative flex flex-col overflow-hidden rounded-md bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-slate-900 ${
                highlight
                    ? "ring-2 ring-sky-400 dark:ring-sky-500"
                    : "ring-1 ring-slate-200 dark:ring-slate-800"
            }`}
        >
            {highlight && (
                <span className="absolute right-3 top-3 z-10 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-sky-600 shadow-sm dark:bg-slate-900/80 dark:text-sky-400">
                    Best value
                </span>
            )}

            {/* Water header */}
            <div className="relative h-24 overflow-hidden bg-linear-to-br from-sky-500 to-cyan-500">
                <FiDroplet className="pointer-events-none absolute -right-3 -top-4 h-24 w-24 text-white/15" />
                <div className="relative flex h-full flex-col justify-center px-4">
                    <p className="truncate text-xs font-medium text-white/80">{pkg.name}</p>
                    <div className="mt-0.5 flex items-baseline gap-1 text-white">
                        <span className="text-3xl font-bold tracking-tight">{pkg.volumeLiters.toLocaleString()}</span>
                        <span className="text-sm font-medium text-white/80">litres</span>
                    </div>
                </div>
                {/* Wave cut into the body */}
                <svg className="absolute inset-x-0 bottom-0 h-4 w-full text-white dark:text-slate-900" viewBox="0 0 200 20" preserveAspectRatio="none">
                    <path d="M0,20 L0,11 q25,-11 50,0 t50,0 t50,0 t50,0 L200,20 Z" fill="currentColor" />
                </svg>
            </div>

            {/* Body */}
            <div className="flex flex-1 flex-col p-4">
                <div className="flex items-baseline gap-1">
                    <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Rs.</span>
                    <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{pkg.price.toLocaleString()}</span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="flex items-center gap-1">
                        <FiClock className="h-3.5 w-3.5" />
                        {pkg.validityDays} days
                    </span>
                    <span className="flex items-center gap-1">
                        <FiZap className="h-3.5 w-3.5" />
                        Rs {perLiter.toFixed(2)}/L
                    </span>
                </div>

                <button
                    type="button"
                    disabled={disabled || buying}
                    onClick={onBuy}
                    className={`mt-4 flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition disabled:cursor-not-allowed ${
                        disabled
                            ? "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
                            : "bg-linear-to-r from-sky-600 to-cyan-600 text-white shadow-sm shadow-sky-600/20 hover:brightness-105 disabled:opacity-60"
                    }`}
                >
                    {buying ? (
                        "Processing…"
                    ) : disabled ? (
                        <>
                            <FiCheck className="h-4 w-4" /> Current plan active
                        </>
                    ) : (
                        "Buy plan"
                    )}
                </button>
            </div>
        </div>
    );
};

export default PlanCard;
