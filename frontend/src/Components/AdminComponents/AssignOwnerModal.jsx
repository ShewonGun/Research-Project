import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";

// Assign / reassign a device to a household (admin only).
const AssignOwnerModal = ({ open, device, onClose, onAssigned }) => {
    const [households, setHouseholds] = useState([]);
    const [ownerId, setOwnerId] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!open) return;
        setError("");
        setOwnerId(device?.owner?._id || "");
        apiFetch("/api/users?role=user")
            .then((d) => setHouseholds(d.users || []))
            .catch((e) => setError(e.message));
    }, [open, device]);

    if (!open) return null;

    const save = async (e) => {
        e.preventDefault();
        setSaving(true);
        setError("");
        try {
            const data = await apiFetch(`/api/devices/${device._id}`, {
                method: "PUT",
                body: { owner: ownerId || null },
            });
            onAssigned?.(data.device);
            onClose?.();
        } catch (err) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-sm rounded-sm border border-slate-200 bg-white p-5 shadow-xl dark:border-slate-800 dark:bg-slate-900"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">Assign owner</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label="Close"
                    >
                        <FiX className="h-4 w-4" />
                    </button>
                </div>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {device?.name || device?.deviceId}
                </p>

                {error && (
                    <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-950/50 dark:text-red-400">
                        {error}
                    </div>
                )}

                <form onSubmit={save} className="mt-4 space-y-3">
                    <div>
                        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Household</label>
                        <select
                            value={ownerId}
                            onChange={(e) => setOwnerId(e.target.value)}
                            className="w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:focus:bg-slate-800"
                        >
                            <option value="">Unassigned</option>
                            {households.map((h) => (
                                <option key={h._id} value={h._id}>{h.name} ({h.email})</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                        <button
                            type="button"
                            onClick={onClose}
                            className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={saving}
                            className="rounded-md bg-sky-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700 disabled:opacity-60"
                        >
                            {saving ? "Saving…" : "Save"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default AssignOwnerModal;
