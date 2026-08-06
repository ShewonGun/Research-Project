import { useState } from "react";
import { FiDroplet, FiFileText, FiCheck, FiInfo, FiCreditCard } from "react-icons/fi";
import { useMyWater } from "../../Context/MyWaterContext.jsx";
import NoDevice from "../../Components/UserComponents/NoDevice.jsx";

const modes = [
    {
        key: "prepaid",
        icon: FiDroplet,
        title: "Prepaid",
        blurb: "Top up in advance. Water is drawn from your balance and pauses when it runs out.",
    },
    {
        key: "postpaid",
        icon: FiFileText,
        title: "Postpaid",
        blurb: "Use water freely and pay a monthly bill based on what you consumed.",
    },
];

const initials = (name) => (name?.trim()?.[0] || "U").toUpperCase();

const Account = () => {
    const { device, mode, loading, setMode } = useMyWater();
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const [switching, setSwitching] = useState(null);
    const [error, setError] = useState("");

    if (loading) return <p className="text-sm text-slate-500 dark:text-slate-400">Loading…</p>;

    const change = async (target) => {
        if (target === mode) return;
        setSwitching(target);
        setError("");
        try {
            await setMode(target);
        } catch (e) {
            setError(e.message);
        } finally {
            setSwitching(null);
        }
    };

    return (
        <div className="max-w-2xl">
            {/* Header */}
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white sm:text-xl">Account</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Your profile and billing preference.</p>

            {/* Profile */}
            <div className="mt-5 rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-600 text-lg font-semibold text-white">
                        {initials(user?.name)}
                    </span>
                    <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{user?.name || "Account"}</p>
                        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium capitalize text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {user?.role === "admin" ? "Admin" : "Household"}
                    </span>
                </div>

                {device && (
                    <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                        <div>
                            <dt className="text-xs text-slate-400 dark:text-slate-500">Water meter</dt>
                            <dd className="mt-0.5 truncate font-medium text-slate-900 dark:text-white">{device.name || "My Water Meter"}</dd>
                        </div>
                        <div>
                            <dt className="text-xs text-slate-400 dark:text-slate-500">Billing</dt>
                            <dd className="mt-0.5 font-medium capitalize text-slate-900 dark:text-white">{mode}</dd>
                        </div>
                    </dl>
                )}
            </div>

            {/* Billing mode */}
            <div className="mt-4 rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiCreditCard className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Billing mode</p>
                </div>
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    Choose how you pay for water. You can switch when you have no active plan or unpaid bill.
                </p>

                {!device ? (
                    <div className="mt-4">
                        <NoDevice />
                    </div>
                ) : (
                    <>
                        {error && (
                            <div className="mt-4 flex items-start gap-2 rounded-md bg-amber-50 px-3.5 py-2.5 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                                <FiInfo className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            {modes.map(({ key, icon: Icon, title, blurb }) => {
                                const selected = mode === key;
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        disabled={selected || switching !== null}
                                        onClick={() => change(key)}
                                        className={`flex flex-col rounded-sm border p-4 text-left transition disabled:cursor-default ${
                                            selected
                                                ? "border-sky-500 bg-sky-50/50 dark:border-sky-500 dark:bg-sky-950/30"
                                                : "border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700"
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span
                                                className={`flex h-8 w-8 items-center justify-center rounded-md ${
                                                    selected
                                                        ? "bg-sky-100 text-sky-600 dark:bg-sky-900/50 dark:text-sky-400"
                                                        : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                                                }`}
                                            >
                                                <Icon className="h-4 w-4" />
                                            </span>
                                            {selected ? (
                                                <span className="flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:bg-sky-900/50 dark:text-sky-400">
                                                    <FiCheck className="h-3 w-3" /> Current
                                                </span>
                                            ) : (
                                                <span className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                                                    {switching === key ? "Switching…" : "Switch"}
                                                </span>
                                            )}
                                        </div>
                                        <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{title}</p>
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{blurb}</p>
                                    </button>
                                );
                            })}
                        </div>

                        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
                            Switching to prepaid closes your water until you buy a plan. Switching to postpaid opens supply and starts a new billing cycle.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
};

export default Account;
