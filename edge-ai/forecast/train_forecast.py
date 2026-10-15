"""
AquaFlow — daily water-usage forecast, 1-7 days ahead.

Data (either):
  * ../simdeum/out_forecast/H01..H30/1min.csv — 10 weeks of NORMAL use (no leaks), made with
      python ../simdeum/generate_simdeum_households.py --start 2026-07-01 --end 2026-09-09 \
             --micro-leaks 0 --bursts 0 --seed 7 --out out_forecast
    The simulator redraws each day independently: no weekly pattern, no day-to-day memory.
  * --daily-csv data/patterned_daily.csv — the same households with ASSUMED patterns added
    (weekend uplift, absence/guest spells, drift); see make_patterned_daily.py.

Task: at the end of day d, predict litres used on days d+1 ... d+7 from the household's own
past daily totals only (no house type / people count — a real device doesn't know them).
Features are relative to the household's recent median, so one model serves any household size.

Compared on households the model never saw (6-fold CV by household; test = each held-out
household's last 21 days of forecast origins):
  baseline_week   same weekday last week
  baseline_mean7  mean of the last 7 days
  gbm             gradient boosting on relative lag features, one model for all horizons
The 80 % range is gbm +/- the 80th percentile of |error| at that horizon, measured on the OTHER
folds (so the reported coverage is honest).

Usage:  python train_forecast.py                                   -> results/
        python train_forecast.py --daily-csv data/patterned_daily.csv  -> results_patterned/
"""
import argparse
import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor

HERE = Path(__file__).resolve().parent
LOCAL_TZ = "Asia/Colombo"
HORIZONS = range(1, 8)
LAGS = 14                 # days of history used
MIN_HISTORY = LAGS        # origins need this many past days
TEST_DAYS = 21


def load_daily(folder):
    """Household folder -> Series of litres per LOCAL calendar day (complete days only)."""
    df = pd.read_csv(Path(folder) / "1min.csv", usecols=["timestamp", "volume"], parse_dates=["timestamp"])
    s = df.set_index("timestamp")["volume"].tz_convert(LOCAL_TZ)
    d = s.resample("1D").sum()
    cnt = s.resample("1D").count()
    return d[cnt >= 1380].rename_axis("day")           # drop partial first/last days


def features_at(hist, target_day, h):
    """Features for predicting `target_day` (h days after the origin) from `hist`
    (hist[0] = origin day, hist[k] = k days earlier). Everything is relative to the recent median."""
    scale = max(float(np.median(hist)), 1.0)
    tdow = target_day.dayofweek
    r = hist / scale
    feat = {
        "h": h, "tdow_sin": np.sin(2 * np.pi * tdow / 7), "tdow_cos": np.cos(2 * np.pi * tdow / 7),
        "is_weekend": int(tdow >= 5),
        "mean7": r[:7].mean(), "std7": r[:7].std(), "mean14": r.mean(),
        "min3": r[:3].min(), "last_week_same_day": r[7 - h],   # the day 7 days before the target
        **{f"lag{k}": r[k] for k in range(len(hist))},
    }
    return feat, scale


def make_rows(daily):
    """One row per (origin day, horizon): features known at the origin + the target."""
    v = daily.values
    days = daily.index
    rows = []
    for i in range(MIN_HISTORY - 1, len(v)):
        hist = v[i - LAGS + 1:i + 1][::-1]
        for h in HORIZONS:
            if i + h >= len(v):
                continue
            feat, scale = features_at(hist, days[i + h], h)
            rows.append({"origin": days[i], "scale": scale, "target": v[i + h], "target_ratio": v[i + h] / scale,
                         "baseline_week": hist[7 - h], "baseline_mean7": hist[:7].mean(), **feat})
    return pd.DataFrame(rows)


def metrics(df, col):
    e = (df[col] - df["target"]).abs()
    return {"mae": e.mean(), "mape": (e / df["target"].clip(lower=1)).mean() * 100}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(HERE.parent / "simdeum" / "out_forecast"))
    ap.add_argument("--daily-csv", help="daily-litres CSV (home, day, litres, house_type) instead of the minute files")
    ap.add_argument("--out", default=None, help="default results/ (results_patterned/ with --daily-csv)")
    a = ap.parse_args()
    out = Path(a.out or HERE / ("results_patterned" if a.daily_csv else "results"))
    out.mkdir(exist_ok=True, parents=True)

    rows = []
    if a.daily_csv:
        dd = pd.read_csv(a.daily_csv, parse_dates=["day"])
        homes = sorted(dd["home"].unique())
        info = dd.drop_duplicates("home").set_index("home")[["house_type"]]
        for h in homes:
            r = make_rows(dd[dd.home == h].set_index("day")["litres"])
            r["home"] = h
            rows.append(r)
    else:
        homes = sorted(p.name for p in Path(a.data).iterdir() if (p / "1min.csv").exists())
        info = pd.read_csv(Path(a.data) / "households.csv").set_index("household_id").rename(columns={"house_type": "house_type"})
        for h in homes:
            r = make_rows(load_daily(Path(a.data) / h))
            r["home"] = h
            rows.append(r)
    R = pd.concat(rows, ignore_index=True)
    feats = [c for c in R.columns if c not in ("origin", "scale", "target", "target_ratio", "baseline_week", "baseline_mean7", "home")]
    print(f"{len(homes)} households, {len(R):,} (origin, horizon) rows, {len(feats)} features")

    # 6-fold CV by household; test = last TEST_DAYS days of origins of the held-out homes.
    folds = [homes[i::6] for i in range(6)]
    R["gbm"] = np.nan
    R["fold"] = -1
    cutoff = R.groupby("home")["origin"].transform("max") - pd.Timedelta(days=TEST_DAYS)
    for k, test_h in enumerate(folds):
        te = R["home"].isin(test_h) & (R["origin"] > cutoff)
        tr = ~R["home"].isin(test_h)
        m = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, random_state=0)
        m.fit(R.loc[tr, feats], R.loc[tr, "target_ratio"])
        R.loc[te, "gbm"] = m.predict(R.loc[te, feats]) * R.loc[te, "scale"]
        R.loc[te, "fold"] = k
    T = R.dropna(subset=["gbm"]).copy()

    T["lo"] = np.nan
    T["hi"] = np.nan
    for k in range(len(folds)):
        for h in HORIZONS:
            other = T[(T.fold != k) & (T.h == h)]
            q = (other["gbm"] - other["target"]).abs().quantile(0.8)
            sel = (T.fold == k) & (T.h == h)
            T.loc[sel, "lo"] = (T.loc[sel, "gbm"] - q).clip(lower=0)
            T.loc[sel, "hi"] = T.loc[sel, "gbm"] + q
    q_final = {int(h): float((T[T.h == h]["gbm"] - T[T.h == h]["target"]).abs().quantile(0.8)) for h in HORIZONS}

    table = []
    for name in ("baseline_week", "baseline_mean7", "gbm"):
        table.append({"model": name, **{f"h{h}_mae": metrics(T[T.h == h], name)["mae"] for h in HORIZONS}, **metrics(T, name)})
    res = pd.DataFrame(table).set_index("model").round(2)
    res.to_csv(out / "forecast_metrics.csv")
    cover = ((T["target"] >= T["lo"]) & (T["target"] <= T["hi"])).mean()
    print(res.to_string())
    print(f"\n80% range coverage: {cover:.0%}")

    # Totals over the next n days (what the run-out date and the bill estimate use).
    tot = []
    for n in (3, 7):
        sub = T[T.h <= n].groupby(["home", "origin"]).filter(lambda x, n=n: len(x) == n)
        agg = sub.groupby(["home", "origin"])[["target", "baseline_week", "baseline_mean7", "gbm"]].sum()
        for name in ("baseline_week", "baseline_mean7", "gbm"):
            err = (agg[name] - agg["target"]).abs()
            tot.append({"next_days": n, "model": name, "mae_litres": round(err.mean(), 1),
                        "mape_pct": round((err / agg["target"].clip(lower=1)).mean() * 100, 1)})
    tot = pd.DataFrame(tot)
    tot.to_csv(out / "forecast_totals.csv", index=False)
    print("\nTotals over the next n days:\n" + tot.to_string(index=False))

    T["type"] = T["home"].map(info["house_type"])
    by_type = pd.DataFrame({t: metrics(g, "gbm") for t, g in T.groupby("type")}).T.round(2)
    by_type["baseline_mean7_mae"] = [round(metrics(g, "baseline_mean7")["mae"], 2) for _, g in T.groupby("type")]
    print("\nBy house type (gbm):\n" + by_type.to_string())

    # Final model on all households
    final = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.05, max_leaf_nodes=15, random_state=0)
    final.fit(R[feats], R["target_ratio"])
    joblib.dump({"model": final, "features": feats, "lags": LAGS, "range_halfwidth_80": q_final}, out / "forecast_model.joblib")
    T[["home", "origin", "h", "target", "baseline_week", "baseline_mean7", "gbm", "lo", "hi"]].to_csv(out / "forecast_test_predictions.csv", index=False)
    (out / "summary.json").write_text(json.dumps({"households": len(homes), "test_rows": int(len(T)), "coverage_80": round(float(cover), 3),
                                                  "metrics": res.reset_index().to_dict("records"),
                                                  "totals": tot.to_dict("records")}, indent=2, default=float))
    print(f"\nSaved -> {out}")


if __name__ == "__main__":
    main()
