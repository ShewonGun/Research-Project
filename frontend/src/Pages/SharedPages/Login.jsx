import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FiDroplet, FiEye, FiEyeOff, FiLoader } from "react-icons/fi";
import ThemeToggle from "../../Components/SharedComponents/ThemeToggle.jsx";
import { useToast } from "../../Context/ToastContext.jsx";
import waterPhoto1 from "../../assets/Water-Photo-1.jpg";
import waterPhoto2 from "../../assets/Water-Photo-2.jpeg";
import waterPhoto3 from "../../assets/Water-Photo-3.jpg";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

const slides = [waterPhoto1, waterPhoto2, waterPhoto3];

const Login = () => {
    const navigate = useNavigate();
    const toast = useToast();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [slide, setSlide] = useState(0);

    // Auto-advance the background photo every 5 seconds.
    useEffect(() => {
        const id = setInterval(() => {
            setSlide((s) => (s + 1) % slides.length);
        }, 5000);
        return () => clearInterval(id);
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            const res = await fetch(`${API_URL}/api/users/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password }),
            });

            const data = await res.json();

            if (!res.ok) {
                toast.error(data.message || "Login failed");
                return;
            }

            localStorage.setItem("token", data.token);
            localStorage.setItem("user", JSON.stringify(data.user));
            toast.success(`Welcome back${data.user?.name ? `, ${data.user.name.split(" ")[0]}` : ""}!`);
            // Route by role: admins to the console, households to their app.
            navigate(data.user?.role === "admin" ? "/dashboard" : "/app", { replace: true });
        } catch {
            toast.error("Unable to reach the server. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex bg-white dark:bg-slate-950">
            {/* ── Left: image / brand panel (hidden on small screens) ── */}
            <div className="relative hidden lg:flex lg:w-[70%] overflow-hidden">
                {/* Background photo slideshow (crossfade) */}
                {slides.map((src, i) => (
                    <img
                        key={i}
                        src={src}
                        alt=""
                        aria-hidden="true"
                        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-1000 ease-in-out ${
                            i === slide ? "opacity-100" : "opacity-0"
                        }`}
                    />
                ))}
                {/* Dark gradient overlay for text readability */}
                <div className="absolute inset-0 bg-linear-to-t from-slate-950/85 via-slate-900/45 to-slate-900/25 dark:from-black/90 dark:via-black/55 dark:to-black/40" />

                {/* Content — brand title at top, tagline + indicators at the bottom */}
                <div className="relative z-10 flex w-full flex-col justify-between p-10 text-white">
                    <div className="flex items-center gap-3">
                        <div >
                            <FiDroplet className="h-6 w-6" />
                        </div>
                        <span className="text-xl font-semibold tracking-tight">AquaFlow</span>
                    </div>

                    <div className="max-w-md">
                        <h2 className="text-3xl font-semibold leading-snug">
                            Smart water management
                        </h2>
                        <p className="mt-3 text-white/75">
                            Monitor usage, manage prepaid plans, and stay in control from one place.
                        </p>
                    </div>
                </div>

                {/* Slideshow indicators — bottom-right corner */}
                <div className="absolute bottom-10 right-10 z-10 flex gap-2">
                    {slides.map((_, i) => (
                        <button
                            key={i}
                            type="button"
                            onClick={() => setSlide(i)}
                            aria-label={`Show image ${i + 1}`}
                            className={`h-1.5 rounded-full transition-all ${
                                i === slide ? "w-6 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                            }`}
                        />
                    ))}
                </div>
            </div>

            {/* ── Right: form panel ── */}
            <div className="relative flex flex-1 items-center justify-center p-6 sm:p-12">
                {/* Theme toggle */}
                <div className="absolute top-5 right-5">
                    <ThemeToggle />
                </div>

                <div className="w-full max-w-sm">
                    {/* Mobile logo (brand panel hidden on small screens) */}
                    <div className="mb-8 flex items-center gap-3 lg:hidden">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-600 text-white">
                            <FiDroplet className="h-5 w-5" />
                        </div>
                        <span className="text-lg font-semibold text-slate-800 dark:text-white">AquaFlow</span>
                    </div>

                    <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">Sign in</h2>
                    <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                        Sign in to your account.
                    </p>

                    <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                        <div>
                            <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@aquaflow.lk"
                                className="w-full rounded-sm border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-800"
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? "text" : "password"}
                                    autoComplete="current-password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    className="w-full rounded-sm border border-slate-200 bg-slate-50 px-3.5 py-2.5 pr-10 text-slate-900 placeholder-slate-400 outline-none transition focus:border-sky-500 focus:bg-white focus:ring-4 focus:ring-sky-500/10 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500 dark:focus:bg-slate-800"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((s) => !s)}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                >
                                    {showPassword ? <FiEyeOff className="h-5 w-5" /> : <FiEye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="flex w-full items-center justify-center gap-2 rounded-sm bg-linear-to-r from-cyan-500 to-blue-600 py-2.5 font-medium text-white shadow-lg shadow-blue-600/25 transition-all hover:from-cyan-600 hover:to-blue-700 hover:shadow-blue-600/40 focus:ring-4 focus:ring-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:shadow-blue-600/25"
                        >
                            {loading && <FiLoader className="h-5 w-5 animate-spin" />}
                            {loading ? "Signing in…" : "Sign in"}
                        </button>
                    </form>

                    <p className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
                        Don&apos;t have an account?{" "}
                        <Link to="/signup" className="font-medium text-sky-600 hover:text-sky-500 dark:text-sky-400">
                            Sign up
                        </Link>
                    </p>

                    <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
                        Smart Water Monitoring
                    </p>
                </div>
            </div>
        </div>
    );
};

export default Login;
