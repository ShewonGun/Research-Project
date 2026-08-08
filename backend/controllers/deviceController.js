import Device from "../models/Device.js";
import Subscription from "../models/Subscription.js";
import Bill from "../models/Bill.js";
import Alert from "../models/Alert.js";

// A user sees only their own devices; an admin sees all.
const ownershipFilter = (req) => (req.user.role === "admin" ? {} : { owner: req.user._id });

// Register a new device
// @route   POST /api/devices
// @access  Private
export const createDevice = async (req, res) => {
    try {
        const { deviceId, name, location, owner, billingMode } = req.body;

        const exists = await Device.findOne({ deviceId });
        if (exists) {
            return res.status(409).json({ message: "Device id already registered" });
        }

        const device = await Device.create({
            deviceId,
            name,
            location,
            // Admins may assign to any user; others own the device themselves.
            owner: req.user.role === "admin" && owner ? owner : req.user._id,
            billingMode: ["prepaid", "postpaid"].includes(billingMode) ? billingMode : undefined,
        });

        return res.status(201).json({ device });
    } catch (error) {
        if (error.name === "ValidationError") {
            return res.status(400).json({ message: error.message });
        }
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// List devices (own, or all for admin)
// @route   GET /api/devices
// @access  Private
export const getDevices = async (req, res) => {
    try {
        const devices = await Device.find(ownershipFilter(req))
            .populate("owner", "name email")
            .sort({ createdAt: -1 });
        return res.json({ count: devices.length, devices });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get one device
// @route   GET /api/devices/:id
// @access  Private
export const getDeviceById = async (req, res) => {
    try {
        const device = await Device.findOne({ _id: req.params.id, ...ownershipFilter(req) }).populate(
            "owner",
            "name email"
        );
        if (!device) return res.status(404).json({ message: "Device not found" });
        return res.json({ device });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update device details
// @route   PUT /api/devices/:id
// @access  Private
export const updateDevice = async (req, res) => {
    try {
        const device = await Device.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!device) return res.status(404).json({ message: "Device not found" });

        const { name, location, owner, billingMode } = req.body;
        if (name !== undefined) device.name = name;
        if (location !== undefined) device.location = location;
        // Only admins may (re)assign the device to a household.
        if (owner !== undefined && req.user.role === "admin") device.owner = owner || null;
        // Only admins switch a connection between prepaid and postpaid.
        if (billingMode !== undefined && req.user.role === "admin" && ["prepaid", "postpaid"].includes(billingMode)) {
            device.billingMode = billingMode;
        }

        await device.save();
        const updated = await device.populate("owner", "name email");
        return res.json({ device: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Control the valve. Admins set the provider gate (open/closed/throttled);
// households set their own tap (open/closed). Water flows only if both allow it.
// @route   PUT /api/devices/:id/valve
// @access  Private
export const setValve = async (req, res) => {
    try {
        const { state, throttlePercent } = req.body;

        const device = await Device.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!device) return res.status(404).json({ message: "Device not found" });

        // Safety lock: while a leak alert is unresolved, the supply can't be
        // reopened (admin gate → open/throttled, or household tap → open). The
        // alert must be resolved ("marked fixed") first, so damage is inspected
        // before water flows again.
        const opensFlow = req.user.role === "admin" ? state !== "closed" : state === "open";
        if (opensFlow) {
            const openLeak = await Alert.findOne({
                device: device._id,
                status: { $in: ["active", "acknowledged"] },
            });
            if (openLeak) {
                return res.status(409).json({
                    message:
                        "This connection has an unresolved leak alert. Mark the leak as fixed before restoring the supply.",
                });
            }
        }

        if (req.user.role === "admin") {
            // Provider gate — the authoritative supply valve.
            if (!["open", "closed", "throttled"].includes(state)) {
                return res.status(400).json({ message: "state must be open, closed, or throttled" });
            }
            device.adminValveState = state;
            if (state === "open") device.throttlePercent = 100;
            else if (state === "throttled") {
                const pct = Number(throttlePercent);
                if (Number.isNaN(pct) || pct < 1 || pct > 99) {
                    return res.status(400).json({ message: "throttlePercent must be between 1 and 99" });
                }
                device.throttlePercent = pct;
            }
        } else {
            // Household tap — on/off only.
            if (!["open", "closed"].includes(state)) {
                return res.status(400).json({ message: "state must be open or closed" });
            }
            device.userValveState = state;
        }

        const updated = await device.save();
        return res.json({ device: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Switch a connection between prepaid and postpaid (household self-service, or
// admin). Guardrails keep billing consistent across the transition:
//   → postpaid : blocked while a prepaid plan is still active.
//   → prepaid  : blocked while any bill is unpaid/overdue; the un-invoiced open
//                cycle is discarded, and the gate is closed until a plan is bought.
// @route   PUT /api/devices/:id/billing-mode
// @access  Private (owner or admin)
export const changeBillingMode = async (req, res) => {
    try {
        const { billingMode } = req.body;
        if (!["prepaid", "postpaid"].includes(billingMode)) {
            return res.status(400).json({ message: "billingMode must be prepaid or postpaid" });
        }

        const device = await Device.findOne({ _id: req.params.id, ...ownershipFilter(req) });
        if (!device) return res.status(404).json({ message: "Device not found" });
        if (device.billingMode === billingMode) {
            const same = await device.populate("owner", "name email");
            return res.json({ device: same });
        }

        if (billingMode === "postpaid") {
            const activeSub = await Subscription.findOne({ device: device._id, status: "active" });
            if (activeSub) {
                return res.status(409).json({
                    message: "You have an active prepaid plan. Use it up or cancel it before switching to postpaid.",
                });
            }
            device.billingMode = "postpaid";
            // Postpaid flows freely — restore the provider gate.
            device.adminValveState = "open";
            device.throttlePercent = 100;
        } else {
            const outstanding = await Bill.countDocuments({
                device: device._id,
                status: { $in: ["unpaid", "overdue"] },
            });
            if (outstanding > 0) {
                return res.status(409).json({
                    message: "Settle your outstanding bills before switching to prepaid.",
                });
            }
            // Drop the current (un-invoiced) postpaid cycle.
            await Bill.deleteMany({ device: device._id, status: "open" });
            device.billingMode = "prepaid";
            // No prepaid plan yet → no supply until one is purchased.
            device.adminValveState = "closed";
            device.throttlePercent = 0;
        }

        await device.save();
        const updated = await device.populate("owner", "name email");
        return res.json({ device: updated });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Delete a device
// @route   DELETE /api/devices/:id
// @access  Private
export const deleteDevice = async (req, res) => {
    try {
        const device = await Device.findOneAndDelete({ _id: req.params.id, ...ownershipFilter(req) });
        if (!device) return res.status(404).json({ message: "Device not found" });
        return res.json({ message: "Device deleted" });
    } catch (error) {
        return res.status(500).json({ message: "Server error", error: error.message });
    }
};
