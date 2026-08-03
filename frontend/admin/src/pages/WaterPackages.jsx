import { useState, useEffect, useCallback } from "react";
import { FiPlus } from "react-icons/fi";
import { apiFetch } from "../lib/api.js";
import WaterPackageCard from "../components/WaterPackageCard.jsx";
import AddWaterPackageModal from "../components/AddWaterPackageModal.jsx";
import ConfirmationBox from "../components/ConfirmationBox.jsx";

const WaterPackages = () => {
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [modalOpen, setModalOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [deleting, setDeleting] = useState(null); // package pending delete confirmation
    const [deleteLoading, setDeleteLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const data = await apiFetch("/api/water-packages");
            setPackages(data.packages || []);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const openCreate = () => {
        setEditing(null);
        setModalOpen(true);
    };

    const openEdit = (pkg) => {
        setEditing(pkg);
        setModalOpen(true);
    };

    const confirmDelete = async () => {
        if (!deleting) return;
        setDeleteLoading(true);
        try {
            await apiFetch(`/api/water-packages/${deleting._id}`, { method: "DELETE" });
            setDeleting(null);
            await load();
        } catch (err) {
            setError(err.message);
        } finally {
            setDeleteLoading(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Water Packages</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                        Manage prepaid water plans.
                    </p>
                </div>
                <button
                    type="button"
                    onClick={openCreate}
                    className="flex items-center gap-1.5 rounded-sm bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
                >
                    <FiPlus className="h-4 w-4" /> New package
                </button>
            </div>

            {error && (
                <div className="mt-5 rounded-md bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
                    {error}
                </div>
            )}

            {loading ? (
                <p className="mt-8 text-sm text-slate-500 dark:text-slate-400">Loading…</p>
            ) : packages.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                    <p className="text-sm text-slate-500 dark:text-slate-400">No packages yet.</p>
                    <button
                        type="button"
                        onClick={openCreate}
                        className="mt-2 text-sm font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400"
                    >
                        Create your first package
                    </button>
                </div>
            ) : (
                <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-5">
                    {packages.map((pkg) => (
                        <WaterPackageCard key={pkg._id} pkg={pkg} onEdit={openEdit} onDelete={setDeleting} />
                    ))}
                </div>
            )}

            <AddWaterPackageModal
                open={modalOpen}
                editing={editing}
                onClose={() => setModalOpen(false)}
                onSaved={load}
            />

            <ConfirmationBox
                open={!!deleting}
                title="Delete package"
                message={deleting ? `Delete "${deleting.name}"? This cannot be undone.` : ""}
                confirmText="Delete"
                tone="danger"
                loading={deleteLoading}
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
};

export default WaterPackages;
