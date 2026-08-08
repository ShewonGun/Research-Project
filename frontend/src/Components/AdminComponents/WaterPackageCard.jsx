import { FiEdit2, FiTrash2 } from "react-icons/fi";

const formatVolume = (liters) => `${Number(liters).toLocaleString()} L`;

const WaterPackageCard = ({ pkg, onEdit, onDelete }) => {
    return (
        <div className="group overflow-hidden rounded-sm border border-slate-200 bg-white transition hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700">
            {/* Top accent line */}
            <div className="h-0.5 bg-linear-to-r from-cyan-500 to-blue-600" />

            <div className="p-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <h3 className="truncate text-sm font-medium text-slate-900 dark:text-white">{pkg.name}</h3>
                    {pkg.description && (
                        <p className="mt-0.5 truncate text-xs text-slate-500 dark:text-slate-400">{pkg.description}</p>
                    )}
                </div>
                <span
                    className={`inline-flex shrink-0 items-center gap-1 text-xs font-medium ${
                        pkg.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-slate-400 dark:text-slate-500"
                    }`}
                >
                    <span className={`h-1.5 w-1.5 rounded-full ${pkg.isActive ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`} />
                    {pkg.isActive ? "Active" : "Inactive"}
                </span>
            </div>

            {/* Price */}
            <div className="mt-4 flex items-baseline gap-1">
                <span className="text-xs font-medium text-slate-400 dark:text-slate-500">Rs.</span>
                <span className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                    {pkg.price.toLocaleString()}
                </span>
            </div>

            {/* Meta */}
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {formatVolume(pkg.volumeLiters)} · {pkg.validityDays} days
            </p>

            {/* Actions */}
            <div className="mt-4 flex items-center justify-end gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => onEdit(pkg)}
                    aria-label="Edit"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                    <FiEdit2 className="h-3 w-3" />
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(pkg)}
                    aria-label="Delete"
                    className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                    <FiTrash2 className="h-3 w-3" />
                </button>
            </div>
            </div>
        </div>
    );
};

export default WaterPackageCard;
