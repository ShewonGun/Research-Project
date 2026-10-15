"""
AquaFlow — daily water-usage forecast, 1–7 days ahead.

Data: ../simdeum/out_forecast/H01..H30/1min.csv (10 weeks, NORMAL use only — no leaks), made with
  python ../simdeum/generate_simdeum_households.py --start 2026-07-01 --end 2026-09-09 \
         --micro-leaks 0 --bursts 0 --seed 7 --out out_forecast

Task: at the end of day d, predict litres used on days d+1 … d+7, from the household's own past
daily totals only (no house type or people count — a real device doesn't know them).

Compared on households the model never saw (6-fold CV by household; test = each held-out
household's last 21 days of forecast origins):
  baseline_week   same weekday last week
  baseline_mean7  mean of the last 7 days
  gbm             gradient boosting on lag features, one model for all horizons, plus
                  10 % / 90 % quantile models for a prediction range

Usage:  python train_forecast.py          → results/ (CSV, REPORT.md, forecast_model.joblib)
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
    """Household folder → Series of litres per LOCAL calendar day (complete days only)."""
    df = pd.read_csv(Path(folder) / "1min.csv", usecols=["timestamp", "volume"], parse_dates=["timestamp"])
    s = df.set_index("timestamp")["volume"].tz_convert(LOCAL_TZ)
    d = s.resample("1D").sum()
    cnt = s.resample("1D").count()
    return d[cnt >= 1380].rename_axis("day")           # drop partial first/last days


def make_rows(daily):
    """One row per (origin day, horizon): features known at the origin + target litres."""
    v = daily.values
    days = daily.index
    rows = []
    for i in range(MIN_HISTORY - 1, len(v)):
        hist = v[i - LAGS + 1:i + 1][::-1]               # hist[0] = origin day (today), hist[k] = k days ago
        mean7, std7, mean14 = hist[:7].mean(), hist[:7].std(), hist.mean()
        for h in HORIZONS:
            if i + h >= len(v):
                continue
            tdow = days[i + h].dayofweek
            same_wd = hist[7 - h]                                  # the day 7 days before the target (known at the origin)
            rows.append({
                "origin": days[i], "h": h, "target": v[i + h],
                "tdow_sin": np.sin(2 * np.pi * tdow / 7), "tdow_cos": np.cos(2 * np.pi * tdow / 7),
                "is_weekend": int(tdow >= 5),
                "mean7": mean7, "std7": std7, "mean14": mean14, "last_week_same_day": same_wd,
                **{f"lag{k}": hist[k] for k in range(LAGS)},
            })
    return pd.DataFrame(rows)


FEATURES = None  # set after building rows


def metrics(df, col):
    e = (df[col] - df["target"]).abs()
    return {"mae": e.mean(), "mape": (e / df["target"].clip(lower=1)).mean() * 100}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default=str(HERE.parent / "simdeum" / "out_forecast"))
    ap.add_argument("--out", default=str(HERE / "results"))
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(exist_ok=True, parents=True)

    homes = sorted(p.name for p in Path(a.data).iterdir() if (p / "1min.csv").exists())
    info = pd.read_csv(Path(a.data) / "households.csv").set_index("household_id")
    rows = []
    for h in homes:
        r = make_rows(load_daily(Path(a.data) / h)); r["home"] = h; rows.append(r)
    R = pd.concat(rows, ignore_index=True)
    feats = [c for c in R.columns if c not in ("origin", "target", "home")]
    print(f"{len(homes)} households, {len(R):,} (origin, horizon) rows, {len(feats)} features")

    # Baselines
    R["baseline_week"] = R["last_week_same_day"]
    R["baseline_mean7"] = R["mean7"]

    # 6-fold CV by household; test = last TEST_DAYS days of origins of the held-out homes.
    folds = [homes[i::6] for i in range(6)]
    R["gbm"] = np.nan; R["lo"] = np.nan; R["hi"] = np.nan
    cutoff = R.groupby("home")["origin"].transform("max") - pd.Timedelta(days=TEST_DAYS)
    for test_h in folds:
        te = R["home"].isin(test_h) & (R["origin"] > cutoff)
        tr = ~R["home"].isin(test_h)
        m = HistGradientBoostingRegressor(max_iter=300, learning_rate=0.06, max_leaf_nodes=15, random_state=0).fit(R.loc[tr, feats], R.loc[tr, "target"])
        lo = HistGradientBoostingRegressor(loss="quantile", quantile=0.1, max_iter=200, learning_rate=0.06, max_leaf_nodes=15, random_state=0).fit(R.loc[tr, feats], R.loc[tr, "target"])
        hi = HistGradientBoostingRegressor(loss="quantile", quantile=0.9, max_iter=200, learning_rate=0.06, max_leaf_nodes=15, random_state=0).fit(R.loc[tr, feats], R.loc[tr, "target"])
        R.loc[te, "gbm"] = m.predict(R.loc[te, feats]); R.loc[te, "lo"] = lo.predict(R.loc[te, feats]); R.loc[te, "hi"] = hi.predict(R.loc[te, feats])
    T = R.dropna(subset=["gbm"]).copy()

    table = []
    for name in ("baseline_week", "baseline_mean7", "gbm"):
        row = {"model": name, **{f"h{h}_mae": metrics(T[T.h == h], name)["mae"] for h in HORIZONS}, **metrics(T, name)}
        table.append(row)
    res = pd.DataFrame(table).set_index("model").round(2)
    res.to_csv(out / "forecast_metrics.csv")
    cover = ((T["target"] >= T["lo"]) & (T["target"] <= T["hi"])).mean()
    T["type"] = T["home"].map(info["house_type"])
    by_type = pd.DataFrame({t: metrics(g, "gbm") for t, g in T.groupby("type")}).T.round(2)
    by_type["baseline_mae"] = [metrics(g, "baseline_week")["mae"] for _, g in T.groupby("type")]
    print(res.to_string()); print(f"\n80% range coverage: {cover:.0%}"); print(by_type.to_string())

    # Final model on all households
    final = {}
    for name, kw in (("mean", {}), ("lo", {"loss": "quantile", "quantile": 0.1}), ("hi", {"loss": "quantile", "quantile": 0.9})):
        final[name] = HistGradientBoostingRegressor(max_iter=300 if name == "mean" else 200, learning_rate=0.06,
                                                    max_leaf_nodes=15, random_state=0, **kw).fit(R[feats], R["target"])
    joblib.dump({"models": final, "features": feats, "lags": LAGS}, out / "forecast_model.joblib")
    T[["home", "origin", "h", "target", "baseline_week", "baseline_mean7", "gbm", "lo", "hi"]].to_csv(out / "forecast_test_predictions.csv", index=False)
    (out / "summary.json").write_text(json.dumps({"households": len(homes), "test_rows": int(len(T)), "coverage_80": round(float(cover), 3),
                                                  "metrics": res.reset_index().to_dict("records")}, indent=2, default=float))
    print(f"\nSaved → {out}")


if __name__ == "__main__":
    main()
