import { FiAlertTriangle } from "react-icons/fi";

const ConfirmationBox = ({
    open,
    title = "Are you sure?",
    message,
    confirmText = "Confirm",
    cancelText = "Cancel",
    tone = "danger",
    loading = false,
    onConfirm,
    onCancel,
}) => {
    if (!open) return null;

    const confirmCls =
        tone === "danger"
            ? "bg-red-600 hover:bg-red-700"
            : "bg-sky-600 hover:bg-sky-700";

    const iconCls =
        tone === "danger"
            ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
            : "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400";

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
            onClick={onCancel}
        >
            <div
                className="w-full max-w-xs rounded-sm border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${iconCls}`}>
                        <FiAlertTriangle className="h-5 w-5" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h2>
                        {message && (
                            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{message}</p>
                        )}
                    </div>
                </div>

                <div className="mt-5 flex justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={loading}
                        className="rounded-sm px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 disabled:opacity-60 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        {cancelText}
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={loading}
                        className={`rounded-sm px-3.5 py-1.5 text-sm font-medium text-white transition disabled:opacity-60 ${confirmCls}`}
                    >
                        {loading ? "Please wait…" : confirmText}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ConfirmationBox;
