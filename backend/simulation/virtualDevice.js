/**
 * Virtual water device — posts flow telemetry to the backend so the whole
 * pipeline can be developed and demoed without real ESP32 hardware.
 *
 * Usage:
 *   node simulation/virtualDevice.js <deviceId> [intervalMs]
 *
 * The device must already be registered (POST /api/devices) so the backend
 * knows its deviceId. The simulator cycles through realistic patterns:
 *   idle → normal usage → tank refill → micro-leak → catastrophic burst
 * and honours the valve command the server returns (closed = no flow,
 * throttled = reduced flow), demonstrating remote shut-off / throttling.
 * 
 * RUN - node simulation/virtualDevice.js ESP32-A2 1000
 */
import dotenv from "dotenv";
dotenv.config();

const API_URL = process.env.API_URL || `http://localhost:${process.env.PORT || 5000}`;
const deviceId = process.argv[2];
const intervalMs = Number(process.argv[3]) || 3000;

if (!deviceId) {
    console.error("Usage: node simulation/virtualDevice.js <deviceId> [intervalMs]");
    process.exit(1);
}

// Flow profiles in litres/minute. Each tick picks behaviour, then we convert
// the flow rate over the interval into a volume for that sample.
const patterns = [
    { name: "idle", base: 0, jitter: 0, weight: 40 },
    { name: "normal-use", base: 8, jitter: 4, weight: 30 },
    { name: "tank-refill", base: 18, jitter: 3, weight: 12 },
    { name: "micro-leak", base: 0.6, jitter: 0.3, weight: 12 },
    { name: "burst", base: 45, jitter: 10, weight: 6 },
];

const pickPattern = () => {
    const total = patterns.reduce((s, p) => s + p.weight, 0);
    let r = Math.random() * total;
    for (const p of patterns) {
        if ((r -= p.weight) <= 0) return p;
    }
    return patterns[0];
};

const rand = (base, jitter) => Math.max(0, base + (Math.random() * 2 - 1) * jitter);

let valveState = "open";
let throttlePercent = 100;

const tick = async () => {
    const pattern = pickPattern();
    let flowRate = rand(pattern.base, pattern.jitter);

    // Apply the last valve command from the server.
    if (valveState === "closed") flowRate = 0;
    else if (valveState === "throttled") flowRate *= throttlePercent / 100;

    // Volume (litres) consumed during this interval.
    const volume = +(flowRate * (intervalMs / 60000)).toFixed(3);

    try {
        const res = await fetch(`${API_URL}/api/readings`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ deviceId, flowRate: +flowRate.toFixed(2), volume }),
        });
        const data = await res.json();

        if (!res.ok) {
            console.error(`✗ ${res.status}: ${data.message}`);
            return;
        }

        // Remember the valve command the server sent back.
        valveState = data.valveState ?? valveState;
        throttlePercent = data.throttlePercent ?? throttlePercent;

        console.log(
            `[${pattern.name.padEnd(12)}] flow ${flowRate.toFixed(1)} L/min  vol ${volume} L` +
                (valveState !== "open" ? `  · valve:${valveState}(${throttlePercent}%)` : "")
        );
    } catch (err) {
        console.error(`✗ cannot reach ${API_URL}: ${err.message}`);
    }
};

console.log(`Virtual device "${deviceId}" → ${API_URL}  (every ${intervalMs}ms). Ctrl+C to stop.`);
tick();
setInterval(tick, intervalMs);
