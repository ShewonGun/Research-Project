import { useNavigate } from "react-router-dom";
import ThemeToggle from "../components/ThemeToggle.jsx";

const Dashboard = () => {
    const navigate = useNavigate();
    const user = JSON.parse(localStorage.getItem("user") || "null");

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
            <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-900">
                <span className="text-lg font-semibold text-slate-900 dark:text-white">AquaFlow Admin</span>
                <div className="flex items-center gap-3">
                    <ThemeToggle />
                    <button
                        type="button"
                        onClick={handleLogout}
                        className="rounded-sm border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        Log out
                    </button>
                </div>
            </header>

            <main className="p-6">
                <h1 className="text-2xl font-semibold text-slate-900 dark:text-white">
                    Welcome{user?.name ? `, ${user.name}` : ""}.
                </h1>
                <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                    You are signed in as {user?.email || "admin"}.
                </p>
            </main>
        </div>
    );
};

export default Dashboard;
