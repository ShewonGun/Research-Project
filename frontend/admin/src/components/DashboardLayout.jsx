import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { FiDroplet, FiGrid, FiPackage, FiLogOut } from "react-icons/fi";
import ThemeToggle from "./ThemeToggle.jsx";
import ConfirmationBox from "./ConfirmationBox.jsx";

const navItems = [
    { to: "/dashboard", label: "Overview", end: true, icon: FiGrid },
    { to: "/dashboard/packages", label: "Water Packages", icon: FiPackage },
];

const DashboardLayout = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const [confirmLogout, setConfirmLogout] = useState(false);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Top navbar */}
            <header className="fixed inset-x-0 top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/80">
                <div className="flex h-14 items-center gap-2 px-4">
                    {/* Brand */}
                    <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-linear-to-br from-cyan-500 to-blue-600 text-white">
                            <FiDroplet className="h-4 w-4" />
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">AquaFlow</span>
                    </div>

                    {/* Right actions */}
                    <div className="ml-auto flex items-center gap-2">
                        <span className="hidden text-sm text-slate-500 dark:text-slate-400 sm:block">
                            {user?.name || "Admin"}
                        </span>
                        <ThemeToggle />
                        <button
                            type="button"
                            onClick={() => setConfirmLogout(true)}
                            aria-label="Log out"
                            title="Log out"
                            className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                        >
                            <FiLogOut className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </header>

            {/* Sidebar */}
            <aside className="fixed bottom-0 left-0 top-14 hidden w-52 border-r border-slate-200 bg-white p-3 md:block dark:border-slate-800 dark:bg-slate-900">
                <nav className="flex flex-col gap-1">
                    {navItems.map(({ to, label, end, icon: Icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={end}
                            className={({ isActive }) =>
                                `flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition ${
                                    isActive
                                        ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400"
                                        : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                                }`
                            }
                        >
                            <Icon className="h-4 w-4" />
                            {label}
                        </NavLink>
                    ))}
                </nav>
            </aside>

            {/* Page content (pt-20 clears the fixed navbar) */}
            <main className="p-6 pt-20 md:pl-58">
                <Outlet />
            </main>

            <ConfirmationBox
                open={confirmLogout}
                title="Log out"
                message="Are you sure you want to log out?"
                confirmText="Log out"
                tone="danger"
                onConfirm={handleLogout}
                onCancel={() => setConfirmLogout(false)}
            />
        </div>
    );
};

export default DashboardLayout;
