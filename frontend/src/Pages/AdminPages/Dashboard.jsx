import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FiPackage, FiCheckCircle, FiCpu, FiWifi, FiArrowRight } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";

const Dashboard = () => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const [stats, setStats] = useState({
        totalPackages: 0,
        activePackages: 0,
        totalDevices: 0,
        onlineDevices: 0,
    });

    useEffect(() => {
        Promise.all([
            apiFetch("/api/water-packages").catch(() => ({ packages: [] })),
            apiFetch("/api/devices").catch(() => ({ devices: [] })),
        ]).then(([pkgData, devData]) => {
            const packages = pkgData.packages || [];
            const devices = devData.devices || [];
            setStats({
                totalPackages: packages.length,
                activePackages: packages.filter((p) => p.isActive).length,
                totalDevices: devices.length,
                onlineDevices: devices.filter((d) => d.status === "online").length,
            });
        });
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
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Total packages" value={stats.totalPackages} icon={FiPackage} tone="sky" />
                <StatCard label="Active packages" value={stats.activePackages} icon={FiCheckCircle} tone="emerald" />
                <StatCard label="Total devices" value={stats.totalDevices} icon={FiCpu} tone="violet" />
                <StatCard label="Online devices" value={stats.onlineDevices} icon={FiWifi} tone="amber" />
            </div>

            {/* Quick actions */}
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <QuickAction
                    to="/dashboard/packages"
                    title="Manage water packages"
                    subtitle="Create, edit, and remove prepaid plans."
                />
                <QuickAction
                    to="/dashboard/devices"
                    title="Monitor devices"
                    subtitle="Track meters and control valves remotely."
                />
            </div>
        </div>
    );
};

const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
};

const StatCard = ({ label, value, icon: Icon, tone }) => (
    <div className="rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
            <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
                <Icon className="h-4 w-4" />
            </span>
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
    </div>
);

const QuickAction = ({ to, title, subtitle }) => (
    <Link
        to={to}
        className="flex items-center justify-between rounded-sm border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-sky-700"
    >
        <div>
            <p className="text-sm font-medium text-slate-900 dark:text-white">{title}</p>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        <FiArrowRight className="h-4 w-4 text-slate-400" />
    </Link>
);

export default Dashboard;
