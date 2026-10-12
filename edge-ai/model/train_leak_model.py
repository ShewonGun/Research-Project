"""
AquaFlow — train and evaluate a leak / burst detector on the simulated households.

Data: ../simdeum/out/H01..H30/1min.csv  (generate with ../simdeum/generate_simdeum_households.py)
      ../dataset/out/*_1min.csv         (the original single-household generator — used as an
                                         extra test set from a DIFFERENT simulator)

Steps (each one is a section below):
  1. Load every household's per-minute data and fill short gaps.
  2. Features — computed only from the PAST (trailing windows), so the model could run
     live: at minute t it only sees minutes ≤ t. Leaks differ from normal use by
     duration and continuity, not flow rate, so most features measure exactly that.
  3. Split BY HOUSEHOLD: train H01–H20, validate H21–H25, test H26–H30 (never seen).
  4. Train a Random Forest (normal / micro_leak / burst).
  5. Alarm logic: raise an alarm when the anomaly probability stays above a threshold for
     a few consecutive minutes; threshold tuned on the VALIDATION households only.
  6. Evaluate per event: share of leaks / bursts caught, detection delay, false alarms per
     day (overall and per household). Compared with the current backend rules.

Usage:
  pip install -r requirements.txt
  python train_leak_model.py
  python train_leak_model.py --data ../simdeum/out --out results
"""
import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report

HERE = Path(__file__).resolve().parent
LABELS = ["normal", "micro_leak", "burst"]
IDLE_LPM = 0.1     # a minute averaging below this is "idle" (the loop's idle noise is ~0.03)
HIGH_LPM = 2.5     # pump-level flow (the loop's pump delivers ~3.5 L/min)
LOCAL_TZ = "Asia/Colombo"

# Current backend rules (backend/utils/leakDetection.js), for the baseline.
RULE_BURST_LPM = 30
RULE_MICRO = (0.15, 2.5)
RULE_MICRO_MIN_SAMPLES = 12   # readings required inside the 60 s window


# ── 1. Load ─────────────────────────────────────────────────────────────────
def load_minutes(path, household_id):
    """One household's per-minute series on a complete 1-minute grid."""
    df = pd.read_csv(path, parse_dates=["timestamp"])
    df = df.set_index("timestamp").sort_index()
    full = pd.date_range(df.index[0], df.index[-1], freq="1min")
    df = df.reindex(full)
    # A missed reading can leave a minute empty: carry the last value over short gaps
    # (≤ 2 min) so a burst isn't "interrupted" by a lost packet; longer gaps count as idle.
    for col in ["flowRateMean", "flowRateMax", "volume"]:
        df[col] = df[col].ffill(limit=2).fillna(0.0)
    df["label"] = df["label"].ffill(limit=2).fillna("normal")
    df["readings"] = df["readings"].fillna(0)
    df["household_id"] = household_id
    return df


# ── 2. Features (trailing windows only) ─────────────────────────────────────
def run_length(cond):
    """Minutes the condition has been continuously true, ending at each minute."""
    c = cond.astype(int)
    return c.groupby((c == 0).cumsum()).cumsum()


def make_features(df):
    f = df["flowRateMean"]
    flowing = f >= IDLE_LPM
    high = f >= HIGH_LPM
    X = pd.DataFrame(index=df.index)

    # Continuity — the key signals.
    X["run_flowing"] = run_length(flowing).clip(upper=600)     # minutes without any idle minute
    X["run_high"] = run_length(high).clip(upper=180)           # minutes at pump level non-stop
    for w in (10, 30, 60, 180):
        X[f"idle_frac_{w}"] = (~flowing).astype(float).rolling(w, min_periods=1).mean()
        X[f"min_{w}"] = f.rolling(w, min_periods=1).min()
    # Level and variability.
    for w in (10, 30, 60):
        X[f"mean_{w}"] = f.rolling(w, min_periods=1).mean()
        X[f"std_{w}"] = f.rolling(w, min_periods=1).std().fillna(0)
        X[f"high_frac_{w}"] = high.astype(float).rolling(w, min_periods=1).mean()
    X["max_10"] = df["flowRateMax"].rolling(10, min_periods=1).max()
    X["volume_60"] = df["volume"].rolling(60, min_periods=1).sum()
    X["flow_now"] = f
    # Time of day (local) — a trickle at 3 a.m. is more suspicious than at 7 a.m.
    hour = df.index.tz_convert(LOCAL_TZ).hour + df.index.tz_convert(LOCAL_TZ).minute / 60
    X["hour_sin"] = np.sin(2 * np.pi * hour / 24)
    X["hour_cos"] = np.cos(2 * np.pi * hour / 24)
    return X


# ── Baseline: the current backend rules, applied to the raw readings ────────
def rule_baseline(readings_path, minute_index):
    """Per-minute alarm flags from backend/utils/leakDetection.js applied to every reading."""
    r = pd.read_csv(readings_path, parse_dates=["timestamp"], usecols=["timestamp", "flowRate"])
    t = r["timestamp"].values.astype("datetime64[ms]").astype(np.int64)
    q = r["flowRate"].values
    burst = q >= RULE_BURST_LPM
    in_band = (q >= RULE_MICRO[0]) & (q <= RULE_MICRO[1])
    micro = np.zeros(len(q), dtype=bool)
    lo = 0
    for i in range(len(q)):           # same window logic as the backend: last 60 s of readings
        while t[lo] < t[i] - 60_000:
            lo += 1
        n = i - lo + 1
        if in_band[i] and n >= RULE_MICRO_MIN_SAMPLES and in_band[lo:i + 1].all() and t[i] - t[lo] >= 48_000:
            micro[i] = True
    flags = pd.Series(burst | micro, index=r["timestamp"].dt.floor("1min")).groupby(level=0).any()
    return flags.reindex(minute_index, fill_value=False)


# ── 5–6. Alarms and event-level evaluation ──────────────────────────────────
def alarms_from_scores(score, threshold, persist):
    """Alarm minutes: score ≥ threshold for `persist` consecutive minutes."""
    return run_length(score >= threshold) >= persist


def episodes(flags):
    """[(start, end)] of consecutive True runs (positional indices, end exclusive)."""
    a = np.r_[0, flags.astype(np.int8).values, 0]
    d = np.flatnonzero(np.diff(a))
    return list(zip(d[::2], d[1::2]))


def evaluate(df, alarm, grace_min=30):
    """Event-level metrics for one household.
    An anomaly is caught if an alarm is active at any point during it; delay = first alarm
    minute − anomaly start. An alarm episode that overlaps no anomaly (allowing `grace_min`
    after one ends) is a false alarm."""
    lab = df["label"].values
    anomalous = pd.Series(lab != "normal", index=df.index)
    near = anomalous.astype(int).rolling(grace_min + 1, min_periods=1).max().astype(bool).values
    out = {"events": [], "false_alarms": 0}
    al = alarm.values
    for s, e in episodes(anomalous):
        kind = pd.Series(lab[s:e]).mode()[0]
        hit = np.flatnonzero(al[s:e])
        out["events"].append({"type": kind, "minutes": int(e - s), "caught": bool(len(hit)),
                              "delay_min": int(hit[0]) if len(hit) else None})
    for s, e in episodes(alarm):
        if not near[s:e].any():
            out["false_alarms"] += 1
    out["days"] = len(df) / 1440
    return out


def summarise(results):
    ev = [e for r in results.values() for e in r["events"]]
    days = sum(r["days"] for r in results.values())
    fa = sum(r["false_alarms"] for r in results.values())
    row = {"false_alarms_per_day": round(fa / days, 3) if days else None}
    for kind in ("micro_leak", "burst"):
        k = [e for e in ev if e["type"] == kind]
        caught = [e for e in k if e["caught"]]
        row[f"{kind}_caught"] = f"{len(caught)}/{len(k)}"
        row[f"{kind}_median_delay_min"] = float(np.median([e["delay_min"] for e in caught])) if caught else None
    return row


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--data", default=str(HERE.parent / "simdeum" / "out"))
    ap.add_argument("--extra-test", default=str(HERE.parent / "dataset" / "out"),
                    help="folder with the original single-household *_1min.csv (optional)")
    ap.add_argument("--out", default=str(HERE / "results"))
    ap.add_argument("--seed", type=int, default=0)
    a = ap.parse_args()
    data, out = Path(a.data), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)

    # 1. Load
    homes = sorted(p.name for p in data.iterdir() if (p / "1min.csv").exists())
    frames = {h: load_minutes(data / h / "1min.csv", h) for h in homes}
    print(f"Loaded {len(frames)} households, {sum(len(f) for f in frames.values()):,} minutes")

    # 2. Features
    feats = {h: make_features(df) for h, df in frames.items()}
    cols = list(next(iter(feats.values())).columns)

    # 3. Split by household
    train_h, val_h, test_h = homes[:20], homes[20:25], homes[25:]
    print(f"Train {train_h[0]}–{train_h[-1]} | validate {val_h[0]}–{val_h[-1]} | test {test_h[0]}–{test_h[-1]}")
    Xtr = pd.concat([feats[h] for h in train_h])
    ytr = pd.concat([frames[h]["label"] for h in train_h])
    # Normal minutes vastly outnumber anomalies: keep every anomaly minute and a random
    # 25 % of normal minutes (class weights handle the rest of the imbalance).
    keep = (ytr != "normal") | (np.random.default_rng(a.seed).random(len(ytr)) < 0.25)
    Xtr, ytr = Xtr[keep.values], ytr[keep.values]
    print("Training minutes:", ytr.value_counts().to_dict())

    # 4. Train
    model = RandomForestClassifier(n_estimators=200, min_samples_leaf=20, class_weight="balanced_subsample",
                                   n_jobs=-1, random_state=a.seed)
    model.fit(Xtr, ytr)
    classes = list(model.classes_)

    def scores(h, X=None):
        p = model.predict_proba(feats[h] if X is None else X)
        return pd.Series(1 - p[:, classes.index("normal")], index=(feats[h] if X is None else X).index)

    # 5. Tune the alarm on VALIDATION households: fewest missed events, then fewest false alarms.
    val_scores = {h: scores(h) for h in val_h}
    best = None
    for thr in (0.5, 0.6, 0.7, 0.8, 0.9):
        for persist in (1, 3, 5, 10):
            res = {h: evaluate(frames[h], alarms_from_scores(val_scores[h], thr, persist)) for h in val_h}
            ev = [e for r in res.values() for e in r["events"]]
            missed = sum(not e["caught"] for e in ev)
            fa = sum(r["false_alarms"] for r in res.values()) / sum(r["days"] for r in res.values())
            delay = np.median([e["delay_min"] for e in ev if e["caught"]] or [0])
            key = (missed, round(fa, 2), delay)
            if best is None or key < best[0]:
                best = (key, thr, persist)
    _, thr, persist = best
    print(f"\nAlarm rule (tuned on validation): anomaly probability ≥ {thr} for {persist} consecutive minute(s)")

    # 6. Evaluate on the TEST households (never used for training or tuning)
    test_res = {h: evaluate(frames[h], alarms_from_scores(scores(h), thr, persist)) for h in test_h}
    print("\n=== Model on unseen test households ===")
    print(json.dumps(summarise(test_res), indent=2))

    print("\nPer-minute classification report (test households):")
    yte = pd.concat([frames[h]["label"] for h in test_h])
    pte = model.predict(pd.concat([feats[h] for h in test_h]))
    print(classification_report(yte, pte, digits=3, zero_division=0))

    per_home = []
    info = pd.read_csv(data / "households.csv").set_index("household_id") if (data / "households.csv").exists() else None
    for h, r in test_res.items():
        row = {"household": h, **summarise({h: r})}
        if info is not None:
            row.update(house_type=info.loc[h, "house_type"], people=int(info.loc[h, "people"]))
        per_home.append(row)
    per_home = pd.DataFrame(per_home)
    print("Per test household:\n" + per_home.to_string(index=False))

    # Baseline: the current backend rules on the same test households.
    base_res = {}
    for h in test_h:
        rp = data / h / "readings.csv.gz"
        if rp.exists():
            base_res[h] = evaluate(frames[h], rule_baseline(rp, frames[h].index))
    if base_res:
        print("\n=== Current backend rules (leakDetection.js) on the same test households ===")
        print(json.dumps(summarise(base_res), indent=2))

    # Extra test: the original single-household generator (a different simulator).
    extra = {}
    for p in sorted(Path(a.extra_test).glob("*_1min.csv")) if Path(a.extra_test).exists() else []:
        df = load_minutes(p, p.stem)
        X = make_features(df)
        frames[p.stem], feats[p.stem] = df, X
        extra[p.stem] = evaluate(df, alarms_from_scores(scores(p.stem), thr, persist))
    if extra:
        print("\n=== Model on the ORIGINAL single-household dataset (different simulator) ===")
        print(json.dumps(summarise(extra), indent=2))

    # Which features the model relies on.
    imp = pd.Series(model.feature_importances_, index=cols).sort_values(ascending=False)
    print("\nTop features:\n" + imp.head(10).round(3).to_string())

    # Save everything for the report.
    joblib.dump({"model": model, "features": cols, "threshold": thr, "persist": persist}, out / "leak_model.joblib")
    per_home.to_csv(out / "per_household_test.csv", index=False)
    imp.to_csv(out / "feature_importance.csv", header=["importance"])
    with open(out / "summary.json", "w") as f:
        json.dump({"alarm_threshold": thr, "alarm_persist_min": persist,
                   "test": summarise(test_res),
                   "baseline_rules": summarise(base_res) if base_res else None,
                   "original_dataset": summarise(extra) if extra else None}, f, indent=2)
    print(f"\nSaved model and results → {out}")


if __name__ == "__main__":
    main()
