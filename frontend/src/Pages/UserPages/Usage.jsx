import { FiTrendingUp, FiCalendar, FiBarChart2, FiActivity } from "react-icons/fi";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import UsageChart from "../../Components/SharedComponents/UsageChart.jsx";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";

const Usage = () => {
    const { device, sub, usage, loading } = useMyWater();

    if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;
    if (!device) return <NoDevice />;

    const daily = usage?.daily || [];
    const week = usage?.total || 0;
    const today = daily.find((d) => d.date === new Date().toISOString().slice(0, 10))?.volume || 0;
    const daysWithData = daily.length;
    const avgDaily = daysWithData ? week / daysWithData : 0;

    const active = sub && sub.status === "active";
    const daysLeft = active && avgDaily > 0 ? sub.volumeRemaining / avgDaily : null;
    const runOut = daysLeft != null ? new Date(Date.now() + daysLeft * 86400000) : null;

    return (
        <div>
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Usage</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Your water consumption over the last 7 days.</p>

            {/* Stats */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Stat label="Today" value={`${today.toFixed(0)} L`} icon={FiCalendar} tone="sky" />
                <Stat label="This week" value={`${week.toFixed(0)} L`} icon={FiBarChart2} tone="emerald" />
                <Stat label="Daily average" value={`${avgDaily.toFixed(0)} L`} icon={FiActivity} tone="violet" />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-2">
                {/* Chart */}
                <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Daily consumption</p>
                    <UsageChart daily={daily} total={week} />
                </div>

                {/* Forecast */}
                <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                            <FiTrendingUp className="h-4 w-4" />
                        </span>
                        <p className="text-sm font-medium text-slate-900 dark:text-white">Forecast</p>
                    </div>
                    <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
                        {!active ? (
                            "Buy a plan to see how long your water balance will last."
                        ) : daysLeft == null ? (
                            "Not enough usage yet to forecast. Check back after a day of activity."
                        ) : (
                            <>
                                At your current rate of about{" "}
                                <span className="font-semibold text-slate-900 dark:text-white">{avgDaily.toFixed(1)} L/day</span>,
                                your balance of{" "}
                                <span className="font-semibold text-slate-900 dark:text-white">{sub.volumeRemaining.toFixed(0)} L</span>{" "}
                                will last about{" "}
                                <span className="font-semibold text-sky-600 dark:text-sky-400">
                                    {Math.floor(daysLeft)} more {Math.floor(daysLeft) === 1 ? "day" : "days"}
                                </span>
                                {runOut && ` — until around ${runOut.toLocaleDateString()}`}.
                            </>
                        )}
                    </p>
                </div>
            </div>
        </div>
    );
};

const tones = {
    sky: "bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    emerald: "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400",
    violet: "bg-violet-50 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
};

const Stat = ({ label, value, icon: Icon, tone }) => (
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

export default Usage;
