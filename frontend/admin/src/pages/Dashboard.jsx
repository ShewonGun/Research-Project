import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FiPackage, FiCheckCircle, FiPauseCircle, FiArrowRight } from "react-icons/fi";
import { apiFetch } from "../lib/api.js";

const Dashboard = () => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const [stats, setStats] = useState({ total: 0, active: 0, inactive: 0 });

    useEffect(() => {
        apiFetch("/api/water-packages")
            .then((data) => {
                const list = data.packages || [];
                const active = list.filter((p) => p.isActive).length;
                setStats({ total: list.length, active, inactive: list.length - active });
            })
            .catch(() => {});
    }, []);

    return (
        <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                Welcome{user?.name ? `, ${user.name}` : ""}.
            </h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
                A quick overview of your water management console.
            </p>

            {/* Stats */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <StatCard
                    label="Total packages"
                    value={stats.total}
                    icon={FiPackage}
                    tone="sky"
                />
                <StatCard
                    label="Active packages"
                    value={stats.active}
                    icon={FiCheckCircle}
                    tone="emerald"
                />
                <StatCard
                    label="Inactive packages"
                    value={stats.inactive}
                    icon={FiPauseCircle}
                    tone="amber"
                />
            </div>

            {/* Quick action */}
            <Link
                to="/dashboard/packages"
                className="mt-3 flex items-center justify-between rounded-lg border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-700"
            >
                <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Manage water packages</p>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        Create, edit, and remove prepaid plans.
                    </p>
                </div>
                <FiArrowRight className="h-4 w-4 text-slate-400" />
            </Link>
        </div>
    );
};

const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};

const StatCard = ({ label, value, icon: Icon, tone }) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
                <Icon className="h-4 w-4" />
            </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </div>
);

export default Dashboard;
