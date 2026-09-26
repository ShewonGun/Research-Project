import { useState, useEffect, useCallback } from "react";
import { FiUserPlus, FiUsers, FiShield, FiHome, FiDownload } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import { exportCsv, dateStamp } from "../../lib/exportCsv.js";
import AddAdminModal from "../../Components/AdminComponents/AddAdminModal.jsx";
import ConfirmationBox from "../../Components/SharedComponents/ConfirmationBox.jsx";
import Pagination from "../../Components/SharedComponents/Pagination.jsx";
import WaterLoader from "../../Components/SharedComponents/WaterLoader.jsx";
import StatTile from "../../Components/SharedComponents/StatTile.jsx";
import SearchInput from "../../Components/SharedComponents/SearchInput.jsx";
import { StaggerGrid, StaggerItem } from "../../Components/SharedComponents/Motion.jsx";
import { useToast } from "../../Context/ToastContext.jsx";

const PAGE_SIZE = 5;

const filters = [
    { key: "all", label: "All" },
    { key: "user", label: "Households" },
    { key: "admin", label: "Admins" },
];

const Users = () => {
    const toast = useToast();
    const me = JSON.parse(localStorage.getItem("user") || "null");
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [page, setPage] = useState(1);
    const [addOpen, setAddOpen] = useState(false);
    const [deleting, setDeleting] = useState(null);
    const [deleteLoading, setDeleteLoading] = useState(false);

    useEffect(() => setPage(1), [filter, search]);

    const load = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const data = await apiFetch("/api/users");
            setUsers(data.users || []);
        } catch (err) {
            if (!silent) toast.error(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, [toast]);

    useEffect(() => {
        load();
    }, [load]);

    const confirmDelete = async () => {
        if (!deleting) return;
        setDeleteLoading(true);
        try {
            await apiFetch(`/api/users/${deleting._id}`, { method: "DELETE" });
            setDeleting(null);
            await load(true);
            toast.success("User deleted.");
        } catch (err) {
            toast.error(err.message);
        } finally {
            setDeleteLoading(false);
        }
    };

    const q = search.trim().toLowerCase();
    const shown = users
        .filter((u) => filter === "all" || u.role === filter)
        .filter((u) => !q || [u.name, u.email, u.phone].some((v) => v?.toLowerCase().includes(q)));
    const paged = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const admins = users.filter((u) => u.role === "admin").length;
    const households = users.length - admins;

    if (loading) return <WaterLoader center />;

    const exportUsers = () => {
        const rows = users.map((u) => ({
            name: u.name || "",
            email: u.email || "",
            role: u.role === "admin" ? "Admin" : "Household",
            phone: u.phone || "",
            joined: u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "",
        }));
        if (exportCsv(`users-${dateStamp()}.csv`, rows)) toast.success(`Exported ${rows.length} users.`);
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between gap-2">
                <div>
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Users</h1>
                    <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Households and admins on the platform.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={exportUsers}
                        disabled={users.length === 0}
                        className="flex shrink-0 items-center gap-1.5 rounded-sm border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                    >
                        <FiDownload className="h-4 w-4" /> <span className="hidden sm:inline">Export CSV</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => setAddOpen(true)}
                        className="flex items-center gap-1.5 rounded-sm bg-sky-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-sky-700"
                    >
                        <FiUserPlus className="h-4 w-4" /> <span className="hidden sm:inline">New admin</span>
                    </button>
                </div>
            </div>

            {/* Summary tiles */}
            <StaggerGrid className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StaggerItem><StatTile label="Total users" value={users.length} icon={FiUsers} tone="sky" /></StaggerItem>
                <StaggerItem><StatTile label="Households" value={households} icon={FiHome} tone="emerald" /></StaggerItem>
                <StaggerItem><StatTile label="Admins" value={admins} icon={FiShield} tone="violet" /></StaggerItem>
            </StaggerGrid>

            {/* Filter + search */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <div className="inline-flex flex-wrap gap-1 rounded-sm bg-slate-100 p-1 dark:bg-slate-800/80">
                    {filters.map((f) => (
                        <button
                            key={f.key}
                            type="button"
                            onClick={() => setFilter(f.key)}
                            className={`rounded-sm px-3 py-1 text-xs font-medium transition ${
                                filter === f.key
                                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <SearchInput value={search} onChange={setSearch} placeholder="Search by name, email, or phone…" className="w-full sm:w-64" />
            </div>

            {/* Table */}
            {shown.length === 0 ? (
                <div className="mt-6 rounded-lg border border-dashed border-slate-300 py-14 text-center dark:border-slate-700">
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        {q ? `No users match "${search}".` : "No users here."}
                    </p>
                </div>
            ) : (
                <>
                {/* Cards (mobile) */}
                <div className="mt-4 space-y-3 md:hidden">
                    {paged.map((u) => (
                        <div key={u._id} className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                            <div className="flex items-start justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                        {(u.name || "?").slice(0, 1).toUpperCase()}
                                    </span>
                                    <div className="min-w-0">
                                        <p className="truncate font-medium text-slate-900 dark:text-white">
                                            {u.name}
                                            {u._id === me?._id && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                                        </p>
                                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                                    </div>
                                </div>
                                <span
                                    className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                        u.role === "admin"
                                            ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400"
                                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                    }`}
                                >
                                    {u.role === "admin" ? "Admin" : "Household"}
                                </span>
                            </div>

                            <div className="mt-3 space-y-2 text-sm">
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Contact</span>
                                    <span className="text-slate-700 dark:text-slate-300">{u.phone || "—"}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span className="text-xs text-slate-500 dark:text-slate-400">Joined</span>
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                                    </span>
                                </div>
                            </div>

                            {u._id !== me?._id && (
                                <div className="mt-3 border-t border-slate-100 pt-3 text-right dark:border-slate-800">
                                    <button
                                        type="button"
                                        onClick={() => setDeleting(u)}
                                        className="text-xs font-medium text-red-600 hover:text-red-500 dark:text-red-400"
                                    >
                                        Delete
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Table (desktop) */}
                <div className="mt-4 hidden overflow-x-auto rounded-sm border border-slate-200 md:block dark:border-slate-800">
                    <table className="w-full min-w-140 text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                                <th className="px-4 py-2.5 font-medium">User</th>
                                <th className="px-4 py-2.5 font-medium">Role</th>
                                <th className="px-4 py-2.5 font-medium">Contact</th>
                                <th className="px-4 py-2.5 font-medium">Joined</th>
                                <th className="px-4 py-2.5 text-right font-medium">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paged.map((u) => (
                                <tr key={u._id} className="border-b border-slate-100 transition-colors last:border-0 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2.5">
                                            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-300">
                                                {(u.name || "?").slice(0, 1).toUpperCase()}
                                            </span>
                                            <div className="min-w-0">
                                                <p className="truncate font-medium text-slate-900 dark:text-white">
                                                    {u.name}
                                                    {u._id === me?._id && (
                                                        <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>
                                                    )}
                                                </p>
                                                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                                                u.role === "admin"
                                                    ? "bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-400"
                                                    : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                            }`}
                                        >
                                            {u.role === "admin" ? "Admin" : "Household"}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{u.phone || "—"}</td>
                                    <td className="px-4 py-3 text-xs text-slate-500 dark:text-slate-400">
                                        {u.createdAt ? new Date(u.createdAt).toLocaleDateString() : "—"}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        {u._id !== me?._id && (
                                            <button
                                                type="button"
                                                onClick={() => setDeleting(u)}
                                                className="text-xs font-medium text-red-600 hover:text-red-500 dark:text-red-400"
                                            >
                                                Delete
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
            )}

            <Pagination page={page} pageSize={PAGE_SIZE} total={shown.length} onChange={setPage} />

            <AddAdminModal open={addOpen} onClose={() => setAddOpen(false)} onSaved={() => load(true)} />

            <ConfirmationBox
                open={!!deleting}
                title="Delete user"
                message={deleting ? `Delete "${deleting.name}" (${deleting.email})? This cannot be undone.` : ""}
                confirmText="Delete"
                tone="danger"
                loading={deleteLoading}
                onConfirm={confirmDelete}
                onCancel={() => setDeleting(null)}
            />
        </div>
    );
};

export default Users;
