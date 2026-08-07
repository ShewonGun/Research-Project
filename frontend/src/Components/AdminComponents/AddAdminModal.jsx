import { useState, useEffect } from "react";
import { FiX } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { useToast } from "../../Context/ToastContext.jsx";
import PasswordInput from "../SharedComponents/PasswordInput.jsx";

const empty = { name: "", email: "", password: "", phone: "" };

// Create a new admin account (admin-only endpoint).
const AddAdminModal = ({ open, onClose, onSaved }) => {
    const toast = useToast();
    const [form, setForm] = useState(empty);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setForm(empty);
    }, [open]);

    if (!open) return null;

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            await apiFetch("/api/users/admins", { method: "POST", body: form });
            onSaved?.();
            onClose?.();
            toast.success("Admin account created.");
        } catch (err) {
            toast.error(err.message);
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
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">New admin</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label="Close"
                    >
                        <FiX className="h-4 w-4" />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="mt-4 space-y-3">
                    <Field label="Full name">
                        <input type="text" required value={form.name} onChange={set("name")} className={inputCls} placeholder="Jane Perera" />
                    </Field>
                    <Field label="Email">
                        <input type="email" required value={form.email} onChange={set("email")} className={inputCls} placeholder="admin@aquaflow.lk" />
                    </Field>
                    <Field label="Password">
                        <PasswordInput required minLength={6} value={form.password} onChange={set("password")} className={inputCls} placeholder="••••••••" />
                    </Field>
                    <Field label="Phone (optional)">
                        <input type="text" value={form.phone} onChange={set("phone")} className={inputCls} placeholder="0771234567" />
                    </Field>

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
                            {saving ? "Creating…" : "Create admin"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

const inputCls =
    "w-full rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/15 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-800";

const Field = ({ label, children }) => (
    <div>
        <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
        {children}
    </div>
);

export default AddAdminModal;
