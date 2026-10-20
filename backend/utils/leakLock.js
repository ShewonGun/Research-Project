import Alert from "../models/Alert.js";

// A leak alert that closed or throttled the provider gate holds it until someone marks the leak
// fixed. While it is open, billing events (a plan bought, a bill paid, a switch to postpaid) must
// not reopen the gate — only an explicit restore after the fix does (setValve's safety lock).
export const VALVE_ACTIONS = ["valve-closed", "valve-throttled"];

export const valveLockQuery = (deviceId) => ({
    device: deviceId,
    status: { $in: ["active", "acknowledged"] },
    autoAction: { $in: VALVE_ACTIONS },
});

export const leakHoldsValve = async (deviceId) => !!(await Alert.exists(valveLockQuery(deviceId)));
