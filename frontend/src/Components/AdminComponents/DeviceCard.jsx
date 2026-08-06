import { useState } from "react";
import { FiTrash2, FiCpu, FiExternalLink } from "react-icons/fi";
import ConnectionDetailModal from "./ConnectionDetailModal.jsx";

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
    const [detailOpen, setDetailOpen] = useState(false);

    return (
        <div className="overflow-hidden rounded-sm border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            {/* Top accent line */}
            <div className="h-0.5 bg-linear-to-r from-cyan-500 to-blue-600" />

            <div className="flex flex-col p-4">
            {/* Header */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
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
                        <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{device.name || "Water Meter"}</h3>
                        <p className="mt-0.5 truncate font-mono text-xs text-slate-400 dark:text-slate-500">{device.deviceId}</p>
                    </div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${valveStyles[device.effectiveValveState]}`}>
                    {device.effectiveValveState}
                    {device.effectiveValveState === "throttled" ? ` ${device.throttlePercent}%` : ""}
                </span>
            </div>

            {/* Key facts */}
            <div className="mt-4 grid grid-cols-2 gap-2">
                <Meta label="Owner" value={device.owner?.name || "Unassigned"} muted={!device.owner} />
                <Meta label="Billing" value={device.billingMode} capitalize />
                <Meta label="Location" value={device.location || "—"} />
                <Meta label="Last seen" value={relativeTime(device.lastSeen)} />
            </div>

            {/* Footer */}
            <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 dark:border-slate-800">
                <button
                    type="button"
                    onClick={() => setDetailOpen(true)}
                    className="flex items-center gap-1.5 text-xs font-medium text-sky-600 transition hover:text-sky-500 dark:text-sky-400"
                >
                    View details <FiExternalLink className="h-3.5 w-3.5" />
                </button>
                <button
                    type="button"
                    onClick={() => onDelete(device)}
                    aria-label="Delete device"
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                    <FiTrash2 className="h-3.5 w-3.5" />
                </button>
            </div>

            <ConnectionDetailModal
                open={detailOpen}
                device={device}
                onClose={() => setDetailOpen(false)}
                onUpdated={onUpdated}
            />
            </div>
        </div>
    );
};

const Meta = ({ label, value, muted, capitalize }) => (
    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-800 dark:bg-slate-800/30">
        <p className="text-[11px] text-slate-400 dark:text-slate-500">{label}</p>
        <p
            className={`mt-0.5 truncate text-xs font-medium ${capitalize ? "capitalize " : ""}${
                muted ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-300"
            }`}
        >
            {value}
        </p>
    </div>
);

export default DeviceCard;
