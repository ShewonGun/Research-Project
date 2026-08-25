import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { FiGrid, FiPackage, FiCpu, FiCreditCard, FiFileText, FiAlertTriangle, FiUsers, FiLogOut, FiMenu, FiX, FiTrendingUp, FiChevronDown, FiServer, FiDollarSign, FiShield, FiSettings } from "react-icons/fi";
import ThemeToggle from "../SharedComponents/ThemeToggle.jsx";
import ConfirmationBox from "../SharedComponents/ConfirmationBox.jsx";
import Logo from "../SharedComponents/Logo.jsx";
import { PageFade } from "../SharedComponents/Motion.jsx";

const navSections = [
    {
        title: null,
        items: [{ to: "/dashboard", label: "Overview", end: true, icon: FiGrid }],
    },
    {
        title: "Network",
        icon: FiServer,
        items: [
            { to: "/dashboard/devices", label: "Connections", icon: FiCpu },
            { to: "/dashboard/packages", label: "Water Packages", icon: FiPackage },
        ],
    },
    {
        title: "Billing",
        icon: FiDollarSign,
        items: [
            { to: "/dashboard/subscriptions", label: "Subscriptions", icon: FiCreditCard },
            { to: "/dashboard/billing", label: "Billing", icon: FiFileText },
        ],
    },
    {
        title: "Leak Detection",
        icon: FiShield,
        items: [
            { to: "/dashboard/alerts", label: "Leak Alerts", icon: FiAlertTriangle },
            { to: "/dashboard/analytics", label: "Leak Analytics", icon: FiTrendingUp },
        ],
    },
    {
        title: "System",
        icon: FiSettings,
        items: [{ to: "/dashboard/users", label: "Users", icon: FiUsers }],
    },
];

const DashboardLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const user = JSON.parse(localStorage.getItem("user") || "null");
    const [confirmLogout, setConfirmLogout] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    // Is the current route inside this section?
    const sectionActive = (section) =>
        section.items.some((it) =>
            it.end ? location.pathname === it.to : location.pathname === it.to || location.pathname.startsWith(`${it.to}/`)
        );

    // Expandable groups — the section holding the active route starts open.
    const [openSections, setOpenSections] = useState(() => {
        const o = {};
        navSections.forEach((s) => {
            if (s.title) o[s.title] = sectionActive(s);
        });
        return o;
    });
    const toggleSection = (title) => setOpenSections((o) => ({ ...o, [title]: !o[title] }));

    // Close the mobile drawer on navigation; keep the active section revealed.
    useEffect(() => {
        setMenuOpen(false);
        setOpenSections((prev) => {
            const next = { ...prev };
            navSections.forEach((s) => {
                if (s.title && sectionActive(s)) next[s.title] = true;
            });
            return next;
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [location.pathname]);

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
    };

    const linkBase = "flex items-center gap-2.5 rounded-sm px-3 py-2 text-[13px] font-medium transition";
    const inactive = "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white";
    const linkClass = ({ isActive }) =>
        `${linkBase} ${isActive ? "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-400" : inactive}`;

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            {/* Mobile backdrop */}
            <div
                className={`fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm transition-opacity md:hidden ${
                    menuOpen ? "opacity-100" : "pointer-events-none opacity-0"
                }`}
                onClick={() => setMenuOpen(false)}
                aria-hidden="true"
            />

            {/* Sidebar — full height, owns the brand; drawer on mobile, fixed on desktop */}
            <aside
                className={`fixed inset-y-0 left-0 z-50 flex w-56 flex-col border-r border-slate-200 bg-white transition-transform dark:border-slate-800 dark:bg-slate-900 md:z-30 md:translate-x-0 ${
                    menuOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
                }`}
            >
                {/* Brand header */}
                <div className="flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                        <Logo className="h-7 w-7" />
                        <span className="text-md font-semibold text-slate-900 dark:text-white">AquaFlow</span>
                    </div>
                    {/* Close (mobile only) */}
                    <button
                        type="button"
                        onClick={() => setMenuOpen(false)}
                        aria-label="Close menu"
                        className="flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 md:hidden dark:text-slate-400 dark:hover:bg-slate-800"
                    >
                        <FiX className="h-5 w-5" />
                    </button>
                </div>

                {/* Nav */}
                <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
                    {navSections.map((section) => {
                        // Ungrouped items (Overview) render as plain links.
                        if (!section.title) {
                            return section.items.map(({ to, label, end, icon: Icon }) => (
                                <NavLink key={to} to={to} end={end} className={linkClass}>
                                    <Icon className="h-4 w-4" />
                                    {label}
                                </NavLink>
                            ));
                        }

                        const isOpen = openSections[section.title];
                        const active = sectionActive(section);
                        const SIcon = section.icon;
                        return (
                            <div key={section.title}>
                                {/* Parent — looks like a nav button, expands its children */}
                                <button
                                    type="button"
                                    onClick={() => toggleSection(section.title)}
                                    aria-expanded={isOpen}
                                    className={`${linkBase} w-full justify-between ${
                                        active && !isOpen
                                            ? "text-sky-700 dark:text-sky-400"
                                            : inactive
                                    }`}
                                >
                                    <span className="flex items-center gap-2.5">
                                        <SIcon className="h-4 w-4" />
                                        {section.title}
                                    </span>
                                    <FiChevronDown className={`h-4 w-4 shrink-0 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                                </button>

                                {/* Children */}
                                {isOpen && (
                                    <div className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-slate-200 pl-2 dark:border-slate-800">
                                        {section.items.map(({ to, label, end, icon: Icon }) => (
                                            <NavLink key={to} to={to} end={end} className={linkClass}>
                                                <Icon className="h-4 w-4" />
                                                {label}
                                            </NavLink>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </nav>

                {/* Log out (bottom of sidebar) */}
                <div className="shrink-0 border-t border-slate-200 p-3 dark:border-slate-800">
                    <button
                        type="button"
                        onClick={() => {
                            setMenuOpen(false);
                            setConfirmLogout(true);
                        }}
                        className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                    >
                        <FiLogOut className="h-4 w-4" />
                        Log out
                    </button>
                </div>
            </aside>

            {/* Top bar — spans the content area only (right of the sidebar on desktop) */}
            <header className="fixed inset-x-0 top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur-md md:left-56 dark:border-slate-800 dark:bg-slate-900/80">
                <div className="relative flex h-14 items-center gap-2 px-4">
                    {/* Hamburger (mobile) */}
                    <button
                        type="button"
                        onClick={() => setMenuOpen(true)}
                        aria-label="Open menu"
                        className="flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition hover:bg-slate-100 md:hidden dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        <FiMenu className="h-5 w-5" />
                    </button>

                    {/* Brand — centered on mobile only (sidebar owns it on desktop) */}
                    <div className="pointer-events-none absolute inset-x-0 flex items-center justify-center gap-2 md:hidden">
                        <Logo className="h-6 w-6" />
                        <span className="text-md font-semibold text-slate-900 dark:text-white">AquaFlow</span>
                    </div>

                    {/* Right actions */}
                    <div className="ml-auto flex items-center gap-2">
                        <ThemeToggle />
                        <NavLink
                            to="/dashboard/profile"
                            className={({ isActive }) =>
                                `flex items-center gap-2 rounded-md py-1 pl-1 pr-2 transition ${
                                    isActive
                                        ? "bg-sky-50 dark:bg-sky-950/50"
                                        : "hover:bg-slate-100 dark:hover:bg-slate-800"
                                }`
                            }
                            title="Profile"
                        >
                            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-600 text-[11px] font-semibold text-white">
                                {(user?.name?.trim()?.[0] || "A").toUpperCase()}
                            </span>
                            <span className="hidden text-sm text-slate-600 dark:text-slate-300 sm:block">{user?.name || "Admin"}</span>
                        </NavLink>
                    </div>
                </div>
            </header>

            {/* Page content */}
            <main className="p-6 pt-20 md:pl-62">
                <PageFade>
                    <Outlet />
                </PageFade>
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
