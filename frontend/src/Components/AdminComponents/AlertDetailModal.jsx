import { AnimatePresence, motion } from "motion/react";
import {
    FiX,
    FiAlertOctagon,
    FiAlertTriangle,
    FiCpu,
    FiActivity,
    FiClock,
    FiDroplet,
    FiSlash,
    FiSliders,
    FiMessageSquare,
    FiLoader,
    FiCheckCircle,
    FiEye,
} from "react-icons/fi";
import AlertExplanation from "../SharedComponents/AlertExplanation.jsx";
import { useModalDismiss } from "../SharedComponents/useModalDismiss.js";

const severityChip = {
    critical: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    warning: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};
const statusStyles = {
    active: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400",
    acknowledged: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400",
    resolved: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400",
};
// What the system did to the supply when it raised the alert.
const actionInfo = {
    "valve-closed": { icon: FiSlash, label: "Supply closed automatically", cls: "text-red-600 dark:text-red-400" },
    "valve-throttled": { icon: FiSliders, label: "Supply throttled automatically", cls: "text-amber-600 dark:text-amber-400" },
    "auto-resolved": { icon: FiCheckCircle, label: "Cleared by the detector when the flow returned to normal", cls: "text-emerald-600 dark:text-emerald-400" },
};

const dateTime = (d) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "—");
const duration = (from, to) => {
    if (!from) return "—";
    const min = Math.max(0, Math.round((new Date(to || Date.now()) - new Date(from)) / 60000));
    if (min < 60) return `${min} min`;
    if (min < 1440) return `${Math.floor(min / 60)} h ${min % 60} min`;
    return `${Math.floor(min / 1440)} d ${Math.floor((min % 1440) / 60)} h`;
};

const Fact = ({ icon: Icon, label, value }) => (
    <div className="min-w-0 rounded-md border border-slate-100 bg-white p-2.5 dark:border-slate-800/60 dark:bg-slate-900">
        <p className="flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500">
            {Icon && <Icon className="h-3 w-3" />}
            {label}
        </p>
        <p className="mt-1 truncate text-xs font-semibold text-slate-700 dark:text-slate-200">{value}</p>
    </div>
);

const Section = ({ title, children }) => (
    <div className="mt-3 rounded-md border border-slate-100 bg-slate-50/60 p-4 dark:border-slate-800/60 dark:bg-slate-800/20">
        <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">{title}</p>
        {children}
    </div>
);

/* Full details of one leak alert for the admin: what was detected, on which device, what the system
   did, the household's answer, the timeline, and the flow around it (the same "Why?" view households see).
   Actions are the Alerts page's own (acknowledge / resolve), passed in. */
const AlertDetailModal = ({ alert, onClose, onAcknowledge, onResolve, pending }) => {
    const open = !!alert;
    const panelRef = useModalDismiss(open, onClose);

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
                    onClick={onClose}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                >
                    <motion.div
                        ref={panelRef}
                        tabIndex={-1}
                        role="dialog"
                        aria-modal="true"
                        aria-label="Alert details"
                        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-sm border border-slate-200 bg-white shadow-xl outline-none dark:border-slate-800 dark:bg-slate-900"
                        onClick={(e) => e.stopPropagation()}
                        initial={{ opacity: 0, scale: 0.96, y: 12 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.97, y: 8 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                        <Body alert={alert} onClose={onClose} onAcknowledge={onAcknowledge} onResolve={onResolve} pending={pending} />
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

const Body = ({ alert: a, onClose, onAcknowledge, onResolve, pending }) => {
    const burst = a.type === "burst";
    const action = actionInfo[a.autoAction];
    const fb = a.userFeedback;
    const started = a.startedAt || a.createdAt;
    const busy = (key) => pending?.has(key);

    const timeline = [
        { label: "Detected", at: started },
        a.acknowledgedAt && { label: "Acknowledged", at: a.acknowledgedAt },
        fb?.at && { label: fb.label === "normal-use" ? "Household: \"It was me\"" : "Household: \"Yes, a leak\"", at: fb.at },
        a.resolvedAt && { label: a.autoAction === "auto-resolved" ? "Cleared by the detector" : "Resolved", at: a.resolvedAt },
    ].filter(Boolean);

    return (
        <div className="overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 z-10 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${severityChip[a.severity]}`}>
                            {burst ? <FiAlertOctagon className="h-5 w-5" /> : <FiAlertTriangle className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0">
                            <h2 className="flex items-center gap-1.5 text-base font-semibold text-slate-900 dark:text-white">
                                {burst ? "Burst" : "Micro-leak"}
                                {a.source === "model" && (
                                    <span className="inline-flex items-center gap-1 rounded-md bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-400">
                                        <FiCpu className="h-3 w-3" /> AI model
                                    </span>
                                )}
                            </h2>
                            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                                {a.device?.name || "Unknown device"}
                                <span className="ml-1 font-mono text-slate-400 dark:text-slate-500">{a.device?.deviceId}</span>
                            </p>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                        <span className={`rounded-md px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyles[a.status]}`}>{a.status}</span>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close"
                            className="flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                        >
                            <FiX className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            <div className="p-5">
                {a.message && <p className="text-sm text-slate-600 dark:text-slate-300">{a.message}</p>}

                {/* Key facts */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    <Fact icon={FiActivity} label="Severity" value={a.severity === "critical" ? "Critical" : "Warning"} />
                    <Fact icon={FiDroplet} label="Flow at detection" value={a.flowRate != null ? `${a.flowRate.toFixed(2)} L/min` : "—"} />
                    <Fact icon={FiCpu} label="Detected by" value={a.source === "model" ? "AI model" : "Flow rule"} />
                    <Fact icon={FiClock} label="Detected" value={dateTime(started)} />
                    <Fact icon={FiClock} label={a.resolvedAt ? "Lasted" : "Open for"} value={duration(started, a.resolvedAt)} />
                    <Fact icon={FiEye} label="Status" value={a.status.charAt(0).toUpperCase() + a.status.slice(1)} />
                </div>

                {/* What the system did */}
                {action && (
                    <div className={`mt-3 flex items-center gap-2 rounded-md border border-slate-100 bg-white px-3 py-2 text-xs font-medium dark:border-slate-800/60 dark:bg-slate-900 ${action.cls}`}>
                        <action.icon className="h-3.5 w-3.5 shrink-0" />
                        {action.label}
                    </div>
                )}

                {/* Household feedback */}
                <Section title="Household's answer">
                    {fb?.label ? (
                        <div className="flex items-start gap-2 text-xs">
                            <FiMessageSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
                            <div>
                                <p className="font-medium text-slate-700 dark:text-slate-200">
                                    {fb.label === "normal-use" ? "\"It was me\": normal use, not a leak" : "\"Yes, a leak\": confirmed by the household"}
                                </p>
                                {fb.note && <p className="mt-0.5 text-slate-500 dark:text-slate-400">"{fb.note}"</p>}
                                <p className="mt-0.5 text-slate-400 dark:text-slate-500">
                                    {dateTime(fb.at)}
                                    {fb.role === "admin" ? " · by an admin" : ""}
                                </p>
                            </div>
                        </div>
                    ) : (
                        <p className="text-xs text-slate-400 dark:text-slate-500">No answer yet.</p>
                    )}
                </Section>

                {/* Timeline */}
                <Section title="Timeline">
                    <ol className="space-y-1.5">
                        {timeline.map((t) => (
                            <li key={t.label} className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-slate-600 dark:text-slate-300">{t.label}</span>
                                <span className="text-slate-400 dark:text-slate-500">{dateTime(t.at)}</span>
                            </li>
                        ))}
                    </ol>
                </Section>

                {/* Flow around the alert + reasons */}
                <AlertExplanation alertId={a._id} />

                {/* Actions */}
                {a.status !== "resolved" && (
                    <div className="mt-4 flex items-center justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                        {a.status === "active" && (
                            <button
                                type="button"
                                onClick={() => onAcknowledge(a._id)}
                                disabled={busy(`ack-${a._id}`)}
                                className="flex items-center gap-1.5 rounded-sm border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                                {busy(`ack-${a._id}`) && <FiLoader className="h-3 w-3 animate-spin" />}
                                Acknowledge
                            </button>
                        )}
                        {a.status !== "resolved" && (
                            <button
                                type="button"
                                onClick={() => onResolve(a._id)}
                                disabled={busy(`res-${a._id}`)}
                                className="flex items-center gap-1.5 rounded-sm bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50"
                            >
                                {busy(`res-${a._id}`) && <FiLoader className="h-3 w-3 animate-spin" />}
                                Resolve
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default AlertDetailModal;
