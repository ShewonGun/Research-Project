// Compute a postpaid bill from metered consumption and a rising-block tariff.
//
// Consumption (litres) is converted to units and charged MARGINALLY: each block
// only prices the portion of usage that falls inside it, then a service charge
// is added. Returns the total plus a per-block breakdown for the UI.
//
//   computeBill(12500, tariff)  // 12.5 units
//     → { units: 12.5, usageCharge, fixedCharge, vat, amount, breakdown: [...] }
//
// Optional tariff features (all off unless the tariff sets them, so older tariffs
// price exactly as before):
//   serviceTiers  [{ maxUnits, charge }] — service charge chosen by consumption
//                 (per proRataDays when pro-rating) instead of the flat fixedCharge
//   vatRate       e.g. 0.18 — VAT on (usage + service charge), included in `amount`
//   proRataDays   e.g. 30 — NWSDB-style pro-rating: blocks and charges are defined
//                 per proRataDays and scaled to the billing period's length
//                 (opts.periodDays). Consumption is converted to the 30-day
//                 equivalent, rounded to the nearest whole unit to decide which block
//                 the part above the last whole unit falls in and which service tier
//                 applies — the rule that reproduces real NWSDB bills.
export const computeBill = (liters, tariff, opts = {}) => {
    const unitLiters = tariff?.unitLiters || 1000;
    const units = Math.max(0, (liters || 0) / unitLiters);

    // Ascending by upper bound; null (open-ended) always sorts last.
    const tiers = [...(tariff?.tiers || [])].sort(
        (a, b) => (a.maxUnits ?? Infinity) - (b.maxUnits ?? Infinity)
    );
    const serviceTiers = [...(tariff?.serviceTiers || [])].sort(
        (a, b) => (a.maxUnits ?? Infinity) - (b.maxUnits ?? Infinity)
    );
    const vatRate = tariff?.vatRate || 0;
    const proRata = tariff?.proRataDays > 0 && opts.periodDays > 0;

    if (!proRata) {
        const { usageCharge, breakdown } = marginal(units, tiers);
        const fixedCharge = serviceTiers.length ? tierCharge(serviceTiers, units) : tariff?.fixedCharge || 0;
        return finish(units, usageCharge, fixedCharge, vatRate, breakdown);
    }

    // NWSDB-style pro-rating.
    const f = opts.periodDays / tariff.proRataDays;
    const u30 = units / f;
    const whole = Math.floor(u30 + 1e-9);
    const breakdown = [];
    let usage30 = 0;
    let lower = 0;
    for (const tier of tiers) {
        if (whole <= lower) break;
        const upper = tier.maxUnits ?? Infinity;
        const blockUnits = Math.min(whole, upper) - lower;
        if (blockUnits > 0) {
            usage30 += blockUnits * tier.rate;
            breakdown.push(block(lower * f, upper === Infinity ? null : upper * f, blockUnits * f, tier.rate));
        }
        lower = upper;
    }
    const frac = u30 - whole;
    const nearest = Math.max(Math.round(u30), 1); // NWSDB: the block of the nearest whole unit
    if (frac > 1e-9 && tiers.length) {
        const rate = rateOfUnit(tiers, nearest);
        usage30 += frac * rate;
        breakdown.push(block(whole * f, (whole + frac) * f, frac * f, rate));
    }
    const service30 = serviceTiers.length ? tierCharge(serviceTiers, Math.round(u30)) : tariff?.fixedCharge || 0;
    return { ...finish(units, usage30 * f, service30 * f, vatRate, breakdown), periodDays: opts.periodDays };
};

// Continuous marginal pricing across the blocks (the original behaviour).
const marginal = (units, tiers) => {
    const breakdown = [];
    let usageCharge = 0;
    let lower = 0; // lower bound of the current block, in units
    for (const tier of tiers) {
        if (units <= lower) break;
        const upper = tier.maxUnits ?? Infinity;
        const blockUnits = Math.min(units, upper) - lower;
        if (blockUnits > 0) {
            const cost = blockUnits * tier.rate;
            usageCharge += cost;
            breakdown.push({
                from: lower,
                to: upper === Infinity ? null : upper,
                units: round2(blockUnits),
                rate: tier.rate,
                cost: round2(cost),
            });
        }
        lower = upper;
    }
    return { usageCharge, breakdown };
};

const block = (from, to, units, rate) => ({
    from: round2(from),
    to: to === null ? null : round2(to),
    units: round2(units),
    rate,
    cost: round2(units * rate),
});

// Rate of the n-th whole unit (n ≥ 1): the block whose upper bound is the first ≥ n.
const rateOfUnit = (tiers, n) => (tiers.find((t) => t.maxUnits == null || n <= t.maxUnits) || tiers[tiers.length - 1]).rate;

// Service charge for a consumption level: the first tier whose upper bound is ≥ units.
const tierCharge = (serviceTiers, units) =>
    (serviceTiers.find((t) => t.maxUnits == null || units <= t.maxUnits) || serviceTiers[serviceTiers.length - 1]).charge;

// Totals are rounded from the unrounded parts (as the original version did), so a
// tariff without VAT / service tiers / pro-rating gives exactly the old numbers.
const finish = (units, usageCharge, fixedCharge, vatRate, breakdown) => {
    const vatRaw = (usageCharge + fixedCharge) * vatRate;
    return {
        units: round2(units),
        usageCharge: round2(usageCharge),
        fixedCharge: Number.isInteger(fixedCharge) ? fixedCharge : round2(fixedCharge),
        vat: round2(vatRaw),
        amount: round2(usageCharge + fixedCharge + vatRaw),
        breakdown,
    };
};

const round2 = (n) => Math.round(n * 100) / 100;

// Billing-period length in days (at least 1) — for tariffs that pro-rate.
export const periodDaysBetween = (start, end = new Date()) =>
    Math.max(1, (new Date(end) - new Date(start)) / (24 * 60 * 60 * 1000));

// For a cycle still in progress: price the usage so far as part of a full cycle (at least
// `cycleDays`), so a few days into a cycle the running charge isn't inflated by pro-rating.
export const runningPeriodDays = (start, cycleDays = 30, now = new Date()) =>
    Math.max(cycleDays, periodDaysBetween(start, now));

export default computeBill;
