import mongoose from "mongoose";

/**
 * A leak/anomaly alert raised by the detector from a device's flow stream.
 *   burst      → sudden high flow (pipe break); supply is auto-shut (critical).
 *   micro-leak → a continuous low trickle with no idle periods (warning).
 *
 * Lifecycle: active → acknowledged (seen) → resolved (fixed / cleared). The
 * detector also auto-resolves a micro-leak once genuine idle flow returns.
 */
const alertSchema = new mongoose.Schema(
    {
        device: { type: mongoose.Schema.Types.ObjectId, ref: "Device", required: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // owner at trigger time

        type: { type: String, enum: ["burst", "micro-leak"], required: true },
        severity: { type: String, enum: ["critical", "warning"], required: true },

        flowRate: { type: Number }, // L/min that triggered it
        message: { type: String },
        autoAction: { type: String, default: null }, // e.g. "valve-closed", "auto-resolved"

        // Which detector raised it: the rule-based one or the ML model service.
        source: { type: String, enum: ["rules", "model"], default: "rules" },

        status: { type: String, enum: ["active", "acknowledged", "resolved"], default: "active" },

        // The household's (or an admin's) answer to "was this a leak?" — real labels for the model.
        //   normal-use → "It was me": the alert is resolved and similar model alerts pause for a while.
        //   real-leak  → "Yes, a leak": the alert stays open (marked seen) until it is fixed.
        userFeedback: {
            label: { type: String, enum: ["normal-use", "real-leak"] },
            note: { type: String, trim: true, maxlength: 300 },
            at: { type: Date },
            by: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
            role: { type: String },
        },
        startedAt: { type: Date, default: Date.now },
        acknowledgedAt: { type: Date },
        resolvedAt: { type: Date },
    },
    { timestamps: true }
);

// Fast lookups during ingestion (is there already an open alert of this type?).
alertSchema.index({ device: 1, type: 1, status: 1 });
alertSchema.index({ device: 1, status: 1 });

const Alert = mongoose.model("Alert", alertSchema);

export default Alert;
