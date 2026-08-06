import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { apiFetch } from "../lib/api.js";

const MyWaterContext = createContext(null);

// Provides the household's primary device + its billing state (prepaid
// subscription OR postpaid bill) + 7-day usage, polled live, plus helpers to
// control the valve and pay bills. Shared across consumer pages.
export const MyWaterProvider = ({ children }) => {
    const [device, setDevice] = useState(null);
    const [sub, setSub] = useState(null); // prepaid
    const [bill, setBill] = useState(null); // postpaid: current open cycle
    const [estimate, setEstimate] = useState(null); // postpaid: live charge so far
    const [bills, setBills] = useState([]); // postpaid: history
    const [usage, setUsage] = useState(null);
    const [alerts, setAlerts] = useState([]); // active/acknowledged leak alerts
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const refresh = useCallback(async (silent = false) => {
        if (!silent) setLoading(true);
        try {
            const devData = await apiFetch("/api/devices");
            const primary = (devData.devices || [])[0] || null;
            setDevice(primary);

            if (primary) {
                const postpaid = primary.billingMode === "postpaid";
                const [subData, usageData, currentData, billsData, alertsData] = await Promise.all([
                    postpaid
                        ? Promise.resolve({ subscriptions: [] })
                        : apiFetch(`/api/subscriptions?device=${primary._id}`).catch(() => ({ subscriptions: [] })),
                    apiFetch(`/api/readings/usage?device=${primary._id}&days=7`).catch(() => ({ daily: [], total: 0 })),
                    postpaid
                        ? apiFetch(`/api/bills/current?device=${primary._id}`).catch(() => ({ bill: null, estimate: null }))
                        : Promise.resolve({ bill: null, estimate: null }),
                    postpaid
                        ? apiFetch(`/api/bills?device=${primary._id}`).catch(() => ({ bills: [] }))
                        : Promise.resolve({ bills: [] }),
                    apiFetch(`/api/alerts?device=${primary._id}&status=active,acknowledged`).catch(() => ({ alerts: [] })),
                ]);
                setSub((subData.subscriptions || [])[0] || null);
                setUsage(usageData);
                setBill(currentData.bill || null);
                setEstimate(currentData.estimate || null);
                setBills(billsData.bills || []);
                setAlerts(alertsData.alerts || []);
            } else {
                setSub(null);
                setUsage(null);
                setBill(null);
                setEstimate(null);
                setBills([]);
                setAlerts([]);
            }
            setError("");
        } catch (err) {
            if (!silent) setError(err.message);
        } finally {
            if (!silent) setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
        const id = setInterval(() => refresh(true), 8000);
        return () => clearInterval(id);
    }, [refresh]);

    const setValve = useCallback(
        async (state) => {
            if (!device) return;
            const data = await apiFetch(`/api/devices/${device._id}/valve`, { method: "PUT", body: { state } });
            setDevice((d) => ({ ...d, ...data.device }));
        },
        [device]
    );

    const payBill = useCallback(async (id) => {
        await apiFetch(`/api/bills/${id}/pay`, { method: "PUT" });
        await refresh(true);
    }, [refresh]);

    // Switch prepaid ⇄ postpaid. Throws (with the server's guardrail message) if
    // the switch isn't allowed; on success the fresh device is refetched.
    const setMode = useCallback(async (billingMode) => {
        if (!device) return;
        await apiFetch(`/api/devices/${device._id}/billing-mode`, { method: "PUT", body: { billingMode } });
        await refresh();
    }, [device, refresh]);

    const acknowledgeAlert = useCallback(async (id) => {
        await apiFetch(`/api/alerts/${id}/acknowledge`, { method: "PUT" });
        await refresh(true);
    }, [refresh]);

    const mode = device?.billingMode === "postpaid" ? "postpaid" : "prepaid";

    const value = { device, mode, sub, bill, estimate, bills, usage, alerts, loading, error, refresh, setValve, payBill, setMode, acknowledgeAlert };
    return <MyWaterContext.Provider value={value}>{children}</MyWaterContext.Provider>;
};

export const useMyWater = () => {
    const ctx = useContext(MyWaterContext);
    if (!ctx) throw new Error("useMyWater must be used within a MyWaterProvider");
    return ctx;
};
