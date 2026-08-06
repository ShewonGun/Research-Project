import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { FiWifi, FiAlertTriangle, FiCreditCard, FiDollarSign, FiArrowRight, FiAlertOctagon, FiCheckCircle } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";
import UsageChart from "../../Components/SharedComponents/UsageChart.jsx";

const money = (n) => `Rs. ${Number(n || 0).toLocaleString()}`;
const relativeTime = (date) => {
    if (!date) return "";
    const s = Math.floor((Date.now() - new Date(date)) / 1000);
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
};

const Dashboard = () => {
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const [data, setData] = useState({
        devices: [],
        alerts: [],
        subs: [],
        bills: [],
        usage: { daily: [], total: 0 },
    });

    const load = useCallback(async () => {
        const [devs, alerts, subs, bills, usage] = await Promise.all([
            apiFetch("/api/devices").catch(() => ({ devices: [] })),
            apiFetch("/api/alerts?limit=200").catch(() => ({ alerts: [] })),
            apiFetch("/api/subscriptions").catch(() => ({ subscriptions: [] })),
            apiFetch("/api/bills").catch(() => ({ bills: [] })),
            apiFetch("/api/readings/network-usage?days=7").catch(() => ({ daily: [], total: 0 })),
        ]);
        setData({
            devices: devs.devices || [],
            alerts: alerts.alerts || [],
            subs: subs.subscriptions || [],
            bills: bills.bills || [],
            usage,
        });
    }, []);

    useEffect(() => {
        load();
        const id = setInterval(load, 8000);
        return () => clearInterval(id);
    }, [load]);

    const { devices, alerts, subs, bills, usage } = data;
    const online = devices.filter((d) => d.status === "online").length;
    const activeLeaks = alerts.filter((a) => a.status === "active").length;
    const activePlans = subs.filter((s) => s.status === "active").length;
    const outstanding = bills
        .filter((b) => b.status === "unpaid" || b.status === "overdue")
        .reduce((sum, b) => sum + (b.amount || 0), 0);
    const recentAlerts = alerts.slice(0, 5);

    return (
        <div>
            {/* Header */}
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Welcome{user?.name ? `, ${user.name}` : ""}.</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Live overview of your water network.</p>

            {/* Stat tiles */}
            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard label="Online meters" value={`${online}/${devices.length}`} icon={FiWifi} tone="emerald" />
                <StatCard label="Active leaks" value={activeLeaks} icon={FiAlertTriangle} tone={activeLeaks > 0 ? "red" : "slate"} to="/dashboard/alerts" />
                <StatCard label="Active plans" value={activePlans} icon={FiCreditCard} tone="sky" to="/dashboard/subscriptions" />
                <StatCard label="Outstanding" value={money(outstanding)} icon={FiDollarSign} tone="amber" to="/dashboard/billing" />
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
                {/* Network consumption */}
                <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:col-span-2">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Network consumption</p>
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                            {(usage.total || 0).toFixed(0)} L · 7 days
                        </span>
                    </div>
                    <UsageChart daily={usage.daily} total={usage.total} />
                </div>

                {/* Recent alerts */}
                <div className="flex flex-col rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">Recent alerts</p>
                        <Link to="/dashboard/alerts" className="flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                            View all <FiArrowRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>

                    {recentAlerts.length === 0 ? (
                        <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
                            <FiCheckCircle className="h-7 w-7 text-emerald-500" />
                            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">No alerts — network is healthy.</p>
                        </div>
                    ) : (
                        <ul className="mt-3 space-y-3">
                            {recentAlerts.map((a) => {
                                const burst = a.type === "burst";
                                return (
                                    <li key={a._id} className="flex items-start gap-2.5">
                                        <span
                                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                                                a.severity === "critical"
                                                    ? "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400"
                                                    : "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400"
                                            }`}
                                        >
                                            {burst ? <FiAlertOctagon className="h-3.5 w-3.5" /> : <FiAlertTriangle className="h-3.5 w-3.5" />}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                                                {burst ? "Burst" : "Micro-leak"}
                                                <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">{a.device?.deviceId}</span>
                                            </p>
                                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                                {a.status} · {relativeTime(a.createdAt)}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            </div>
        </div>
    );
};

const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    amber: "bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    red: "bg-red-50 text-red-600 dark:bg-red-950/50 dark:text-red-400",
    slate: "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400",
};

const StatCard = ({ label, value, icon: Icon, tone, to }) => {
    const inner = (
        <>
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
                <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
                    <Icon className="h-4 w-4" />
                </span>
            </div>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">{value}</p>
        </>
    );
    const cls = "rounded-sm border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900";
    return to ? (
        <Link to={to} className={`${cls} block transition hover:border-sky-300 dark:hover:border-sky-700`}>
            {inner}
        </Link>
    ) : (
        <div className={cls}>{inner}</div>
    );
};

export default Dashboard;
