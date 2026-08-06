import { useState } from "react";
import { FiUser, FiLock, FiCheck, FiInfo, FiShield } from "react-icons/fi";
import { apiFetch } from "../../lib/api.js";

const initials = (name) => (name?.trim()?.[0] || "A").toUpperCase();

const inputCls =
    "w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-sky-400 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:disabled:bg-slate-800/50";

const Profile = () => {
    const stored = JSON.parse(localStorage.getItem("user") || "null");
    const [user, setUser] = useState(stored);

    // Profile form
    const [name, setName] = useState(stored?.name || "");
    const [phone, setPhone] = useState(stored?.phone || "");
    const [savingProfile, setSavingProfile] = useState(false);
    const [profileMsg, setProfileMsg] = useState("");
    const [profileErr, setProfileErr] = useState("");

    // Password form
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [savingPw, setSavingPw] = useState(false);
    const [pwMsg, setPwMsg] = useState("");
    const [pwErr, setPwErr] = useState("");

    const profileDirty = name.trim() !== (user?.name || "") || (phone || "") !== (user?.phone || "");

    const saveProfile = async (e) => {
        e.preventDefault();
        setProfileMsg("");
        setProfileErr("");
        if (!name.trim()) {
            setProfileErr("Name cannot be empty.");
            return;
        }
        setSavingProfile(true);
        try {
            const data = await apiFetch("/api/users/profile", { method: "PUT", body: { name: name.trim(), phone } });
            setUser(data.user);
            localStorage.setItem("user", JSON.stringify(data.user));
            setProfileMsg("Profile updated.");
        } catch (err) {
            setProfileErr(err.message);
        } finally {
            setSavingProfile(false);
        }
    };

    const savePassword = async (e) => {
        e.preventDefault();
        setPwMsg("");
        setPwErr("");
        if (password.length < 6) {
            setPwErr("Password must be at least 6 characters.");
            return;
        }
        if (password !== confirm) {
            setPwErr("Passwords do not match.");
            return;
        }
        setSavingPw(true);
        try {
            await apiFetch("/api/users/profile", { method: "PUT", body: { password } });
            setPassword("");
            setConfirm("");
            setPwMsg("Password changed.");
        } catch (err) {
            setPwErr(err.message);
        } finally {
            setSavingPw(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Profile</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">Manage your admin account and password.</p>

            <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {/* Identity card */}
            <div className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900 lg:sticky lg:top-20 lg:self-start">
                <div className="flex flex-col items-center text-center">
                    <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-cyan-500 to-blue-600 text-2xl font-semibold text-white">
                        {initials(user?.name)}
                    </span>
                    <p className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">{user?.name || "Admin"}</p>
                    <p className="mt-0.5 max-w-full truncate text-xs text-slate-500 dark:text-slate-400">{user?.email}</p>
                    <span className="mt-3 flex items-center gap-1 rounded-full bg-violet-50 px-2.5 py-1 text-[11px] font-medium text-violet-700 dark:bg-violet-950/50 dark:text-violet-400">
                        <FiShield className="h-3 w-3" /> Admin
                    </span>
                </div>

                <dl className="mt-5 space-y-3 border-t border-slate-100 pt-4 text-sm dark:border-slate-800">
                    <div className="flex items-center justify-between gap-2">
                        <dt className="text-xs text-slate-400 dark:text-slate-500">Phone</dt>
                        <dd className="truncate font-medium text-slate-900 dark:text-white">{user?.phone || "—"}</dd>
                    </div>
                    {user?.createdAt && (
                        <div className="flex items-center justify-between gap-2">
                            <dt className="text-xs text-slate-400 dark:text-slate-500">Member since</dt>
                            <dd className="font-medium text-slate-900 dark:text-white">
                                {new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                            </dd>
                        </div>
                    )}
                </dl>
            </div>

            {/* Right column: forms */}
            <div className="space-y-4 lg:col-span-2">
            {/* Profile details */}
            <form onSubmit={saveProfile} className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiUser className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Personal details</p>
                </div>

                {profileErr && (
                    <div className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
                        <FiInfo className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{profileErr}</span>
                    </div>
                )}
                {profileMsg && (
                    <div className="mt-4 flex items-start gap-2 rounded-md bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <FiCheck className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{profileMsg}</span>
                    </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Name</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Phone</span>
                        <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="—" className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5 sm:col-span-2">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Email</span>
                        <input value={user?.email || ""} disabled className={inputCls} />
                        <span className="text-[11px] text-slate-400 dark:text-slate-500">Email can't be changed.</span>
                    </label>
                </div>

                <div className="mt-5">
                    <button
                        type="submit"
                        disabled={savingProfile || !profileDirty}
                        className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                        {savingProfile ? "Saving…" : "Save changes"}
                    </button>
                </div>
            </form>

            {/* Password */}
            <form onSubmit={savePassword} className="rounded-sm border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded-md bg-sky-50 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400">
                        <FiLock className="h-4 w-4" />
                    </span>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Change password</p>
                </div>

                {pwErr && (
                    <div className="mt-4 flex items-start gap-2 rounded-md bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:bg-red-950/50 dark:text-red-400">
                        <FiInfo className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{pwErr}</span>
                    </div>
                )}
                {pwMsg && (
                    <div className="mt-4 flex items-start gap-2 rounded-md bg-emerald-50 px-3.5 py-2.5 text-sm text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                        <FiCheck className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{pwMsg}</span>
                    </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">New password</span>
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className={inputCls} />
                    </label>
                    <label className="flex flex-col gap-1.5">
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Confirm password</span>
                        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" className={inputCls} />
                    </label>
                </div>

                <div className="mt-5">
                    <button
                        type="submit"
                        disabled={savingPw || !password}
                        className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:opacity-50 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
                    >
                        {savingPw ? "Updating…" : "Update password"}
                    </button>
                </div>
            </form>
            </div>
            </div>
        </div>
    );
};

export default Profile;
